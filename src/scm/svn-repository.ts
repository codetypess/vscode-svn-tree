import * as nodePath from "node:path";
import * as vscode from "vscode";
import { HistoryPanel } from "../history/history-panel";
import { SvnContentProvider } from "../svn/svn-content-provider";
import { SvnService } from "../svn/svn-service";
import type {
    SvnLogPage,
    SvnStatusEntry,
    SvnWorkingCopyInfo,
} from "../svn/svn-types";
import { ScmResource } from "./scm-resource";

interface RefreshOptions {
    forceRemote?: boolean;
}

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

function getRepositoryReferenceDisplay(repositoryRelativePath: string): {
    icon: string;
    label: string;
    fullPath: string;
} {
    const normalizedPath = repositoryRelativePath.replace(/^\/+|\/+$/g, "");
    if (!normalizedPath) {
        return {
            icon: "repo",
            label: "/",
            fullPath: "/",
        };
    }

    const segments = normalizedPath.split("/");
    const trunkIndex = segments.indexOf("trunk");
    if (trunkIndex !== -1) {
        return {
            icon: "git-branch",
            label: "trunk",
            fullPath: `/${normalizedPath}`,
        };
    }

    const branchesIndex = segments.indexOf("branches");
    if (branchesIndex !== -1 && branchesIndex + 1 < segments.length) {
        return {
            icon: "git-branch",
            label: segments.slice(branchesIndex, branchesIndex + 2).join("/"),
            fullPath: `/${normalizedPath}`,
        };
    }

    const tagsIndex = segments.indexOf("tags");
    if (tagsIndex !== -1 && tagsIndex + 1 < segments.length) {
        return {
            icon: "tag",
            label: segments.slice(tagsIndex, tagsIndex + 2).join("/"),
            fullPath: `/${normalizedPath}`,
        };
    }

    return {
        icon: "repo",
        label: segments.at(-1) ?? normalizedPath,
        fullPath: `/${normalizedPath}`,
    };
}

export class SvnRepository implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private readonly changesGroup: vscode.SourceControlResourceGroup;
    private readonly unversionedGroup: vscode.SourceControlResourceGroup;
    private readonly remoteChangesGroup: vscode.SourceControlResourceGroup;
    private readonly repositoryReference: ReturnType<typeof getRepositoryReferenceDisplay>;
    private readonly sourceControl: vscode.SourceControl;
    private remoteChangeCount = 0;
    private lastRemoteRefreshAt = 0;
    private isRefreshing = false;
    private isRefreshingRemoteCount = false;

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
        this.sourceControl.quickDiffProvider = {
            provideOriginalResource: (uri) => this.provideOriginalResource(uri),
        };
        this.repositoryReference = getRepositoryReferenceDisplay(info.repositoryRelativePath);

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
        this.updateStatusBarCommands(0);
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
            if (includeRemote) {
                this.isRefreshingRemoteCount = true;
                this.updateStatusBarCommands(this.remoteChangeCount);
            }

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
                this.remoteChangeCount = remoteResources.length;
                this.isRefreshingRemoteCount = false;
                this.lastRemoteRefreshAt = Date.now();
            }

            this.updateStatusBarCommands(this.remoteChangeCount);
        } finally {
            if (this.isRefreshingRemoteCount) {
                this.isRefreshingRemoteCount = false;
                this.updateStatusBarCommands(this.remoteChangeCount);
            }

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

    private updateStatusBarCommands(remoteCount: number): void {
        const countSuffix = remoteCount > 0 ? ` ${remoteCount}` : "";
        const changeLabel = remoteCount === 1 ? "change" : "changes";
        const updateIcon = this.isRefreshingRemoteCount ? "loading~spin" : "cloud-download";
        const updateTitle = this.isRefreshingRemoteCount
            ? "$(loading~spin)"
            : `$(${updateIcon})${countSuffix}`;
        const updateTooltip = this.isRefreshingRemoteCount
            ? "Checking for incoming changes..."
            : remoteCount > 0
              ? `Update (${remoteCount} incoming ${changeLabel})`
              : "Update";

        this.sourceControl.statusBarCommands = [
            {
                command: "svn-graph.open-history",
                title: `$(${this.repositoryReference.icon}) ${this.repositoryReference.label}`,
                tooltip: `Repository path: ${this.repositoryReference.fullPath}\nOpen SVN History`,
                arguments: [this],
            },
            {
                command: "svn-graph.update",
                title: updateTitle,
                tooltip: updateTooltip,
                arguments: [this],
            },
            {
                command: "svn-graph.open-repository-actions",
                title: "$(ellipsis)",
                tooltip: "More SVN Actions",
                arguments: [this],
            },
        ];
    }
}
