import * as nodePath from "node:path";
import * as vscode from "vscode";
import { HistoryPanel } from "../history/history-panel";
import { SvnContentProvider } from "../svn/svn-content-provider";
import { SvnService } from "../svn/svn-service";
import type {
    SvnLogPage,
    SvnLogPathChange,
    SvnStatusEntry,
    SvnWorkingCopyInfo,
} from "../svn/svn-types";
import { ScmResource } from "./scm-resource";

interface RefreshOptions {
    forceRemote?: boolean;
}

type RepositoryReferenceKind = "branch" | "tag";

function posixJoin(left: string, right: string): string {
    return `${left.replace(/\/+$/, "")}/${right.replace(/\\/g, "/").replace(/^\/+/, "")}`;
}

function buildRepositoryUrl(repositoryRoot: string, repositoryPath: string): string {
    const url = new URL(repositoryRoot);
    url.pathname = posixJoin(url.pathname || "/", repositoryPath);
    return url.toString();
}

function isLocalChange(status: SvnStatusEntry): boolean {
    return (
        status.wcStatus !== "normal" &&
        status.wcStatus !== "none" &&
        status.wcStatus !== "unversioned"
    );
}

function isUnversionedChange(status: SvnStatusEntry): boolean {
    return status.wcStatus === "unversioned";
}

function isRemoteChange(status: SvnStatusEntry): boolean {
    return !!status.reposStatus && status.reposStatus !== "none";
}

function normalizeRepositoryPath(value: string): string {
    const normalized = value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    return normalized ? `/${normalized}` : "/";
}

function splitRepositoryPath(value: string): string[] {
    const normalized = normalizeRepositoryPath(value);
    return normalized === "/" ? [] : normalized.slice(1).split("/");
}

function getCommitTargetLabel(repositoryRelativePath: string): string {
    const segments = splitRepositoryPath(repositoryRelativePath);
    if (segments.length === 0) {
        return "/";
    }

    const trunkIndex = segments.indexOf("trunk");
    if (trunkIndex !== -1) {
        return "trunk";
    }

    const branchesIndex = segments.indexOf("branches");
    if (branchesIndex !== -1 && branchesIndex + 1 < segments.length) {
        return segments.slice(branchesIndex, branchesIndex + 2).join("/");
    }

    const tagsIndex = segments.indexOf("tags");
    if (tagsIndex !== -1 && tagsIndex + 1 < segments.length) {
        return segments.slice(tagsIndex, tagsIndex + 2).join("/");
    }

    return segments.at(-1) ?? "/";
}

function getCommitInputPlaceholder(repositoryRelativePath: string): string {
    const submitShortcut = process.platform === "darwin" ? "⌘Enter" : "Ctrl+Enter";
    const targetLabel = getCommitTargetLabel(repositoryRelativePath);
    return `Message (${submitShortcut} to commit on "${targetLabel}")`;
}

function getReferenceLayoutRoot(repositoryRelativePath: string): string {
    const segments = splitRepositoryPath(repositoryRelativePath);
    const trunkIndex = segments.indexOf("trunk");
    if (trunkIndex !== -1) {
        return normalizeRepositoryPath(segments.slice(0, trunkIndex).join("/"));
    }

    const branchesIndex = segments.indexOf("branches");
    if (branchesIndex !== -1) {
        return normalizeRepositoryPath(segments.slice(0, branchesIndex).join("/"));
    }

    const tagsIndex = segments.indexOf("tags");
    if (tagsIndex !== -1) {
        return normalizeRepositoryPath(segments.slice(0, tagsIndex).join("/"));
    }

    return "/";
}

function getReferenceLocationLabel(kind: RepositoryReferenceKind): string {
    return kind === "branch" ? "branches" : "tags";
}

function buildReferenceDestinationPath(
    repositoryRelativePath: string,
    kind: RepositoryReferenceKind,
    name: string
): string {
    const rootSegments = splitRepositoryPath(getReferenceLayoutRoot(repositoryRelativePath));
    const nameSegments = name
        .replace(/\\/g, "/")
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean);

    return normalizeRepositoryPath(
        [...rootSegments, getReferenceLocationLabel(kind), ...nameSegments].join("/")
    );
}

function getReferenceNameSuggestion(repositoryRelativePath: string, revision: number): string {
    const baseLabel = getCommitTargetLabel(repositoryRelativePath)
        .replace(/[\\/]+/g, "-")
        .replace(/\s+/g, "-");
    const normalizedBase = baseLabel && baseLabel !== "/" ? baseLabel : "revision";
    return `${normalizedBase}-r${revision}`;
}

export class SvnRepository implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private readonly changesGroup: vscode.SourceControlResourceGroup;
    private readonly unversionedGroup: vscode.SourceControlResourceGroup;
    private readonly remoteChangesGroup: vscode.SourceControlResourceGroup;
    private readonly sourceControl: vscode.SourceControl;
    private lastRemoteRefreshAt = 0;
    private isRefreshing = false;

    public constructor(
        public readonly info: SvnWorkingCopyInfo,
        private readonly svnService: SvnService,
        private readonly historyPanel: HistoryPanel,
        private readonly contentProvider: SvnContentProvider
    ) {
        this.sourceControl = vscode.scm.createSourceControl(
            "svn-graph",
            `SVN: ${nodePath.basename(info.workingCopyRoot)}`,
            vscode.Uri.file(info.workingCopyRoot)
        );
        this.sourceControl.acceptInputCommand = {
            command: "svn-graph.commit",
            title: "Commit",
            arguments: [this],
        };
        this.sourceControl.inputBox.placeholder = getCommitInputPlaceholder(
            info.repositoryRelativePath
        );
        this.sourceControl.quickDiffProvider = {
            provideOriginalResource: (uri) => this.provideOriginalResource(uri),
        };
        this.sourceControl.statusBarCommands = [];

        this.changesGroup = this.sourceControl.createResourceGroup("svn-graph.changes", "Changes");
        this.unversionedGroup = this.sourceControl.createResourceGroup(
            "svn-graph.unversioned",
            "Unversioned"
        );
        this.remoteChangesGroup = this.sourceControl.createResourceGroup(
            "svn-graph.remote-changes",
            "Remote Changes"
        );
        this.changesGroup.hideWhenEmpty = false;
        this.changesGroup.contextValue = "svn-changes-group";
        this.changesGroup.resourceStates = [];
        this.unversionedGroup.hideWhenEmpty = true;
        this.unversionedGroup.contextValue = "svn-unversioned-group";
        this.unversionedGroup.resourceStates = [];
        this.remoteChangesGroup.hideWhenEmpty = false;
        this.remoteChangesGroup.contextValue = "svn-remote-changes-group";
        this.remoteChangesGroup.resourceStates = [];
        this.sourceControl.count = 0;
    }

    public get rootPath(): string {
        return this.info.workingCopyRoot;
    }

    public get label(): string {
        return nodePath.basename(this.rootPath);
    }

    public dispose(): void {
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
        this.sourceControl.dispose();
    }

    public async refresh(options: RefreshOptions = {}): Promise<void> {
        if (this.isRefreshing) {
            return;
        }

        this.isRefreshing = true;

        try {
            const includeRemote = this.shouldIncludeRemote(options.forceRemote === true);
            const statuses = await this.svnService.getStatus(this.rootPath, includeRemote);
            const changeResources = statuses
                .filter(isLocalChange)
                .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
                .map((status) => new ScmResource(this, status, "change"));
            const unversionedResources = statuses
                .filter(isUnversionedChange)
                .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
                .map((status) => new ScmResource(this, status, "change"));
            const remoteResources = includeRemote
                ? statuses
                      .filter(isRemoteChange)
                      .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
                      .map((status) => new ScmResource(this, status, "remote-change"))
                : this.remoteChangesGroup.resourceStates;

            this.changesGroup.resourceStates = changeResources;
            this.unversionedGroup.resourceStates = unversionedResources;
            this.remoteChangesGroup.resourceStates = remoteResources;
            this.sourceControl.count = changeResources.length + unversionedResources.length;

            if (includeRemote) {
                this.lastRemoteRefreshAt = Date.now();
            }
        } finally {
            this.isRefreshing = false;
        }
    }

    public async commit(paths?: string[]): Promise<void> {
        const message = this.sourceControl.inputBox.value.trim();

        if (!message) {
            throw new Error("Enter a commit message before committing.");
        }

        await this.svnService.commit(this.rootPath, message, paths);
        this.sourceControl.inputBox.value = "";
        await this.refresh({ forceRemote: true });
    }

    public async update(paths?: string[]): Promise<void> {
        await this.svnService.update(this.rootPath, paths);
        await this.refresh({ forceRemote: true });
    }

    public async checkoutRevision(revision: number): Promise<void> {
        const destinationPath = await this.promptRevisionDestination("checkout", revision);
        if (!destinationPath) {
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Checking out r${revision}...`,
            },
            async () => {
                await this.svnService.checkout(
                    this.resolveRepositoryUrl(this.rootPath),
                    String(revision),
                    destinationPath
                );
            }
        );

        await this.revealCreatedPath(
            destinationPath,
            `Checked out r${revision} to ${destinationPath}.`
        );
    }

    public async exportRevision(revision: number): Promise<void> {
        const destinationPath = await this.promptRevisionDestination("export", revision);
        if (!destinationPath) {
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Exporting r${revision}...`,
            },
            async () => {
                await this.svnService.export(
                    this.resolveRepositoryUrl(this.rootPath),
                    String(revision),
                    destinationPath
                );
            }
        );

        await this.revealCreatedPath(
            destinationPath,
            `Exported r${revision} to ${destinationPath}.`
        );
    }

    public async compareRevisionWithWorkingCopy(
        revision: number,
        changes: SvnLogPathChange[]
    ): Promise<void> {
        const change = await this.pickHistoryFileChange(
            revision,
            changes,
            "compare with the working copy"
        );
        if (!change) {
            return;
        }

        await this.compareRevisionFileWithWorkingCopy(revision, change);
    }

    public async compareFileRevisionWithWorkingCopy(
        revision: number,
        repositoryPath: string,
        action: SvnLogPathChange["action"]
    ): Promise<void> {
        const change: SvnLogPathChange = {
            action,
            kind: "file",
            path: repositoryPath,
        };

        await this.compareRevisionFileWithWorkingCopy(revision, change);
    }

    public async compareRevisionWithPreviousRevision(
        revision: number,
        changes: SvnLogPathChange[]
    ): Promise<void> {
        const change = await this.pickHistoryFileChange(
            revision,
            changes,
            "compare with the previous revision"
        );
        if (!change) {
            return;
        }

        await this.openHistoryDiff(revision, change.path, change.action);
    }

    public async compareFileRevisionWithPreviousRevision(
        revision: number,
        repositoryPath: string,
        action: SvnLogPathChange["action"]
    ): Promise<void> {
        await this.openHistoryDiff(revision, repositoryPath, action);
    }

    public async createBranchFromRevision(revision: number): Promise<void> {
        await this.createRepositoryReferenceFromRevision("branch", revision);
    }

    public async createTagFromRevision(revision: number): Promise<void> {
        await this.createRepositoryReferenceFromRevision("tag", revision);
    }

    public async revertToRevision(revision: number): Promise<void> {
        const confirmed = await this.confirmReverseMerge(
            "revert-to-revision",
            revision
        );
        if (!confirmed) {
            return;
        }

        const sourceUrl = buildRepositoryUrl(
            this.info.repositoryRoot,
            this.info.repositoryRelativePath
        );

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Reverting working copy to r${revision}...`,
            },
            async () => {
                await this.svnService.reverseMergeToRevision(
                    this.rootPath,
                    sourceUrl,
                    revision
                );
            }
        );

        await this.refresh();
        void vscode.window.showInformationMessage(
            `Reverted working copy to r${revision}. Review the changes and commit when ready.`
        );
    }

    public async revertChangesFromRevision(revision: number): Promise<void> {
        const confirmed = await this.confirmReverseMerge(
            "revert-changes-from-revision",
            revision
        );
        if (!confirmed) {
            return;
        }

        const sourceUrl = buildRepositoryUrl(
            this.info.repositoryRoot,
            this.info.repositoryRelativePath
        );

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Reverting changes from r${revision}...`,
            },
            async () => {
                await this.svnService.reverseMergeRevision(
                    this.rootPath,
                    sourceUrl,
                    revision
                );
            }
        );

        await this.refresh();
        void vscode.window.showInformationMessage(
            `Reverted changes from r${revision}. Review the changes and commit when ready.`
        );
    }

    public async cleanup(): Promise<void> {
        await this.svnService.cleanup(this.rootPath);
        await this.refresh();
    }

    public async revert(paths: string[]): Promise<void> {
        await this.svnService.revert(this.rootPath, paths);
        await this.refresh();
    }

    public async add(paths: string[]): Promise<void> {
        await this.svnService.add(this.rootPath, paths);
        await this.refresh();
    }

    public async delete(paths: string[]): Promise<void> {
        await this.svnService.delete(this.rootPath, paths);
        await this.refresh();
    }

    public async showHistory(): Promise<void> {
        await this.historyPanel.show(this);
    }

    public async loadHistoryPage(beforeRevision?: number): Promise<SvnLogPage> {
        const pageSize = vscode.workspace
            .getConfiguration("svn-graph")
            .get<number>("max-log-entries", 200);
        const entries = await this.svnService.getLog(this.rootPath, pageSize, beforeRevision);
        const oldestRevision = entries.at(-1)?.revision;

        return {
            entries,
            hasMore: entries.length === pageSize && oldestRevision !== undefined && oldestRevision > 1,
        };
    }

    public async openResourceDiff(resource: ScmResource): Promise<void> {
        if (resource.kind === "remote-change") {
            await this.openRemoteDiff(resource.status);
            return;
        }

        if (resource.status.wcStatus === "unversioned") {
            await vscode.window.showTextDocument(resource.resourceUri, { preview: true });
            return;
        }

        const rightUri =
            resource.status.wcStatus === "deleted" || resource.status.wcStatus === "missing"
                ? this.contentProvider.createUri({
                      label: `${resource.status.relativePath} (working tree missing)`,
                      source: "empty",
                  })
                : resource.resourceUri;

        const leftUri =
            resource.status.wcStatus === "added"
                ? this.contentProvider.createUri({
                      label: `${resource.status.relativePath} (empty)`,
                      source: "empty",
                  })
                : this.contentProvider.createUri({
                      label: `${resource.status.relativePath} (BASE)`,
                      source: "svn",
                      target: resource.status.absolutePath,
                      revision: "BASE",
                  });

        await vscode.commands.executeCommand(
            "vscode.diff",
            leftUri,
            rightUri,
            `${resource.status.relativePath} (${resource.status.wcStatus})`
        );
    }

    public async openHistoryDiff(
        revision: number,
        repositoryPath: string,
        action: string
    ): Promise<void> {
        const targetUrl = buildRepositoryUrl(this.info.repositoryRoot, repositoryPath);
        const rightRevision = String(revision);
        const leftRevision = String(Math.max(revision - 1, 0));

        const leftUri =
            action === "A" || revision <= 1
                ? this.contentProvider.createUri({
                      label: `${repositoryPath} (empty)`,
                      source: "empty",
                  })
                : this.contentProvider.createUri({
                      label: `${repositoryPath} (r${leftRevision})`,
                      source: "svn",
                      target: targetUrl,
                      revision: leftRevision,
                  });

        const rightUri =
            action === "D"
                ? this.contentProvider.createUri({
                      label: `${repositoryPath} (deleted)`,
                      source: "empty",
                  })
                : this.contentProvider.createUri({
                      label: `${repositoryPath} (r${rightRevision})`,
                      source: "svn",
                      target: targetUrl,
                      revision: rightRevision,
                  });

        await vscode.commands.executeCommand(
            "vscode.diff",
            leftUri,
            rightUri,
            `${repositoryPath} (r${revision})`
        );
    }

    private async openRemoteDiff(status: SvnStatusEntry): Promise<void> {
        const repositoryUrl = this.resolveRepositoryUrl(status.absolutePath);
        const rightUri =
            status.reposStatus === "deleted"
                ? this.contentProvider.createUri({
                      label: `${status.relativePath} (deleted in HEAD)`,
                      source: "empty",
                  })
                : this.contentProvider.createUri({
                      label: `${status.relativePath} (HEAD)`,
                      source: "svn",
                      target: repositoryUrl,
                      revision: "HEAD",
                  });

        const leftUri =
            status.reposStatus === "added"
                ? this.contentProvider.createUri({
                      label: `${status.relativePath} (empty)`,
                      source: "empty",
                  })
                : this.contentProvider.createUri({
                      label: `${status.relativePath} (BASE)`,
                      source: "svn",
                      target: status.absolutePath,
                      revision: "BASE",
                  });

        await vscode.commands.executeCommand(
            "vscode.diff",
            leftUri,
            rightUri,
            `${status.relativePath} (${status.reposStatus ?? "incoming"})`
        );
    }

    private shouldIncludeRemote(forceRemote: boolean): boolean {
        const enabled = vscode.workspace
            .getConfiguration("svn-graph")
            .get<boolean>("enable-remote-status", true);
        if (!enabled) {
            return false;
        }

        if (forceRemote) {
            return true;
        }

        const intervalSeconds = vscode.workspace
            .getConfiguration("svn-graph")
            .get<number>("remote-status-interval-seconds", 60);
        return Date.now() - this.lastRemoteRefreshAt >= intervalSeconds * 1000;
    }

    private provideOriginalResource(uri: vscode.Uri): vscode.ProviderResult<vscode.Uri> {
        if (!uri.fsPath.startsWith(this.rootPath)) {
            return undefined;
        }

        return this.contentProvider.createUri({
            label: `${nodePath.relative(this.rootPath, uri.fsPath)} (BASE)`,
            source: "svn",
            target: uri.fsPath,
            revision: "BASE",
        });
    }

    public resolveRepositoryUrl(absolutePath: string): string {
        const relativePath = nodePath.relative(this.rootPath, absolutePath);
        return buildRepositoryUrl(
            this.info.repositoryRoot,
            posixJoin(this.info.repositoryRelativePath, relativePath)
        );
    }

    private async pickHistoryFileChange(
        revision: number,
        changes: SvnLogPathChange[],
        actionLabel: string
    ): Promise<SvnLogPathChange | undefined> {
        const fileChanges = changes.filter((change) => change.kind === "file");
        if (fileChanges.length === 0) {
            void vscode.window.showInformationMessage(
                `Revision r${revision} has no file changes to ${actionLabel}.`
            );
            return undefined;
        }

        if (fileChanges.length === 1) {
            return fileChanges[0];
        }

        const selection = await vscode.window.showQuickPick(
            fileChanges.map((change) => ({
                label: nodePath.posix.basename(change.path),
                description: change.path,
                detail: `${this.describeHistoryChangeAction(change.action)} in r${revision}`,
                change,
            })),
            {
                placeHolder: `Select a file to ${actionLabel}`,
            }
        );

        return selection?.change;
    }

    private async compareRevisionFileWithWorkingCopy(
        revision: number,
        change: SvnLogPathChange
    ): Promise<void> {
        const absolutePath = this.getWorkingCopyPathForRepositoryPath(change.path);
        if (!absolutePath) {
            void vscode.window.showWarningMessage(
                `Cannot map ${change.path} into the current working copy.`
            );
            return;
        }

        const repositoryUrl = buildRepositoryUrl(this.info.repositoryRoot, change.path);
        const workingCopyExists = await this.pathExists(absolutePath);
        const relativeLabel =
            nodePath.relative(this.rootPath, absolutePath) || nodePath.basename(absolutePath);
        const leftUri =
            change.action === "D"
                ? this.contentProvider.createUri({
                      label: `${relativeLabel} (r${revision}, deleted)`,
                      source: "empty",
                  })
                : this.contentProvider.createUri({
                      label: `${relativeLabel} (r${revision})`,
                      source: "svn",
                      target: repositoryUrl,
                      revision: String(revision),
                  });
        const rightUri = workingCopyExists
            ? vscode.Uri.file(absolutePath)
            : this.contentProvider.createUri({
                  label: `${relativeLabel} (working copy missing)`,
                  source: "empty",
              });

        await vscode.commands.executeCommand(
            "vscode.diff",
            leftUri,
            rightUri,
            `${relativeLabel} (r${revision} vs working copy)`
        );
    }

    private describeHistoryChangeAction(action: SvnLogPathChange["action"]): string {
        if (action === "A") {
            return "Added";
        }

        if (action === "D") {
            return "Deleted";
        }

        if (action === "R") {
            return "Replaced";
        }

        return "Modified";
    }

    private getWorkingCopyPathForRepositoryPath(repositoryPath: string): string | undefined {
        const workingCopyRepositoryPath = normalizeRepositoryPath(this.info.repositoryRelativePath);
        const targetRepositoryPath = normalizeRepositoryPath(repositoryPath);

        if (workingCopyRepositoryPath === "/") {
            const relativeSegments = splitRepositoryPath(targetRepositoryPath);
            return relativeSegments.length === 0
                ? this.rootPath
                : nodePath.join(this.rootPath, ...relativeSegments);
        }

        if (targetRepositoryPath === workingCopyRepositoryPath) {
            return this.rootPath;
        }

        if (!targetRepositoryPath.startsWith(`${workingCopyRepositoryPath}/`)) {
            return undefined;
        }

        const relativePath = targetRepositoryPath.slice(workingCopyRepositoryPath.length + 1);
        return nodePath.join(this.rootPath, ...relativePath.split("/"));
    }

    private async pathExists(targetPath: string): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(targetPath));
            return true;
        } catch {
            return false;
        }
    }

    private async promptRevisionDestination(
        operation: "checkout" | "export",
        revision: number
    ): Promise<string | undefined> {
        const selectedFolders = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: "Select Parent Folder",
            title:
                operation === "checkout"
                    ? `Select parent folder for checkout of r${revision}`
                    : `Select parent folder for export of r${revision}`,
        });
        const parentFolder = selectedFolders?.[0];
        if (!parentFolder) {
            return undefined;
        }

        const defaultName =
            operation === "checkout"
                ? `${this.label}-r${revision}`
                : `${this.label}-export-r${revision}`;
        const folderName = await vscode.window.showInputBox({
            prompt:
                operation === "checkout"
                    ? `Folder name for checkout of r${revision}`
                    : `Folder name for export of r${revision}`,
            value: defaultName,
            validateInput: (value) => {
                const trimmed = value.trim();
                if (!trimmed) {
                    return "Folder name is required.";
                }

                if (trimmed.includes("/") || trimmed.includes("\\")) {
                    return "Use a folder name, not a path.";
                }

                return undefined;
            },
        });
        const trimmedFolderName = folderName?.trim();
        if (!trimmedFolderName) {
            return undefined;
        }

        const destinationPath = nodePath.join(parentFolder.fsPath, trimmedFolderName);
        const destinationUri = vscode.Uri.file(destinationPath);
        try {
            await vscode.workspace.fs.stat(destinationUri);
            void vscode.window.showWarningMessage(
                `Destination already exists: ${destinationPath}`
            );
            return undefined;
        } catch {
            return destinationPath;
        }
    }

    private async revealCreatedPath(destinationPath: string, successMessage: string): Promise<void> {
        const selection = await vscode.window.showInformationMessage(
            successMessage,
            "Reveal"
        );
        if (selection !== "Reveal") {
            return;
        }

        await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(destinationPath));
    }

    private async createRepositoryReferenceFromRevision(
        kind: RepositoryReferenceKind,
        revision: number
    ): Promise<void> {
        const destinationPath = await this.promptReferenceDestination(kind, revision);
        if (!destinationPath) {
            return;
        }

        const sourceUrl = this.resolveRepositoryUrl(this.rootPath);
        const destinationUrl = buildRepositoryUrl(this.info.repositoryRoot, destinationPath);
        const message = `Create ${kind} ${destinationPath} from r${revision}`;

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Creating ${kind} from r${revision}...`,
            },
            async () => {
                await this.svnService.copy(
                    sourceUrl,
                    destinationUrl,
                    message,
                    String(revision)
                );
            }
        );

        const selection = await vscode.window.showInformationMessage(
            `Created ${kind} from r${revision}: ${destinationPath}`,
            "Copy Path"
        );
        if (selection === "Copy Path") {
            await vscode.env.clipboard.writeText(destinationPath);
            void vscode.window.setStatusBarMessage(`Copied ${kind} path ${destinationPath}`, 2000);
        }
    }

    private async promptReferenceDestination(
        kind: RepositoryReferenceKind,
        revision: number
    ): Promise<string | undefined> {
        const locationLabel = getReferenceLocationLabel(kind);
        const layoutRoot = getReferenceLayoutRoot(this.info.repositoryRelativePath);
        const locationPath = normalizeRepositoryPath(
            [layoutRoot, locationLabel].filter((segment) => segment !== "/").join("/")
        );
        const referencePath = await vscode.window.showInputBox({
            prompt: `New ${kind} path under ${locationPath} for r${revision}`,
            value: getReferenceNameSuggestion(this.info.repositoryRelativePath, revision),
            validateInput: (value) => {
                const normalizedValue = value.trim().replace(/\\/g, "/");
                if (!normalizedValue) {
                    return `${kind === "branch" ? "Branch" : "Tag"} name is required.`;
                }

                if (normalizedValue.startsWith("/")) {
                    return `Use a path relative to ${locationPath}.`;
                }

                if (normalizedValue.split("/").some((segment) => segment.trim().length === 0)) {
                    return "Avoid empty path segments.";
                }

                return undefined;
            },
        });
        const trimmedReferencePath = referencePath?.trim();
        if (!trimmedReferencePath) {
            return undefined;
        }

        return buildReferenceDestinationPath(
            this.info.repositoryRelativePath,
            kind,
            trimmedReferencePath
        );
    }

    private async confirmReverseMerge(
        mode: "revert-to-revision" | "revert-changes-from-revision",
        revision: number
    ): Promise<boolean> {
        const hasLocalChanges =
            this.changesGroup.resourceStates.length > 0 ||
            this.unversionedGroup.resourceStates.length > 0;
        const message =
            mode === "revert-to-revision"
                ? `Revert working copy to r${revision}?`
                : `Revert changes from r${revision}?`;
        const detailLines = [
            mode === "revert-to-revision"
                ? `This will reverse-merge all revisions newer than r${revision} into the current working copy.`
                : `This will reverse-merge only revision r${revision} into the current working copy.`,
            "A clean, up-to-date working copy is recommended.",
            "The operation only changes your working copy. You still need to commit the result.",
        ];

        if (hasLocalChanges) {
            detailLines.push(
                "This working copy already has local changes, so conflicts are more likely."
            );
        }

        const selection = await vscode.window.showWarningMessage(
            message,
            {
                modal: true,
                detail: detailLines.join("\n"),
            },
            "Continue"
        );

        return selection === "Continue";
    }
}
