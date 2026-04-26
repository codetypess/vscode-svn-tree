import * as nodePath from "node:path";
import * as vscode from "vscode";
import { markIncomingHistoryEntries, toRevisionNumber } from "../history/history-utils";
import { HistoryPanel } from "../history/history-panel";
import { SvnContentProvider } from "../svn/svn-content-provider";
import { SvnService } from "../svn/svn-service";
import type {
    SvnLogPage,
    SvnLogPathChange,
    SvnStatusEntry,
    SvnWorkingCopyInfo,
} from "../svn/svn-types";
import { getI18n } from "../vscode-i18n";
import { isConflictArtifactStatus } from "./conflict-artifact";
import { isCommittableStatus } from "./commit-utils";
import { ScmResource } from "./scm-resource";

interface RefreshOptions {
    forceRemote?: boolean;
    allowWhileBusy?: boolean;
}

interface CommitQuickPickItem extends vscode.QuickPickItem {
    readonly absolutePath: string;
}

type RepositoryReferenceKind = "branch" | "tag";
type RepositoryUiOperation =
    | "refresh"
    | "update"
    | "cleanup"
    | "resolve"
    | "switch"
    | "rename";

function posixJoin(left: string, right: string): string {
    return `${left.replace(/\/+$/, "")}/${right.replace(/\\/g, "/").replace(/^\/+/, "")}`;
}

function buildRepositoryUrl(repositoryRoot: string, repositoryPath: string): string {
    const url = new URL(repositoryRoot);
    url.pathname = posixJoin(url.pathname || "/", repositoryPath);
    return url.toString();
}

function isUrlTarget(value: string): boolean {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
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

function isConflictedChange(status: SvnStatusEntry): boolean {
    return status.wcStatus === "conflicted";
}

function isRemoteChange(status: SvnStatusEntry): boolean {
    return !!status.reposStatus && status.reposStatus !== "none";
}

function getRepositoryReferenceDisplay(repositoryRelativePath: string): {
    icon: string;
    label: string;
} {
    const segments = splitRepositoryPath(repositoryRelativePath);
    if (segments.length === 0) {
        return {
            icon: "repo",
            label: "/",
        };
    }

    const trunkIndex = segments.indexOf("trunk");
    if (trunkIndex !== -1) {
        return {
            icon: "git-branch",
            label: "trunk",
        };
    }

    const branchesIndex = segments.indexOf("branches");
    if (branchesIndex !== -1 && branchesIndex + 1 < segments.length) {
        return {
            icon: "git-branch",
            label: segments.slice(branchesIndex, branchesIndex + 2).join("/"),
        };
    }

    const tagsIndex = segments.indexOf("tags");
    if (tagsIndex !== -1 && tagsIndex + 1 < segments.length) {
        return {
            icon: "tag",
            label: segments.slice(tagsIndex, tagsIndex + 2).join("/"),
        };
    }

    return {
        icon: "repo",
        label: segments.at(-1) ?? "/",
    };
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
    return getI18n().t("commitInputPlaceholder", {
        shortcut: submitShortcut,
        target: targetLabel,
    });
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
    private readonly conflictArtifactsGroup: vscode.SourceControlResourceGroup;
    private readonly unversionedGroup: vscode.SourceControlResourceGroup;
    private readonly remoteChangesGroup: vscode.SourceControlResourceGroup;
    private repositoryReference: ReturnType<typeof getRepositoryReferenceDisplay>;
    private readonly sourceControl: vscode.SourceControl;
    private remoteChangeCount = 0;
    private lastRemoteRefreshAt = 0;
    private isRefreshing = false;
    private isRefreshingRemoteCount = false;
    private activeOperation: RepositoryUiOperation | undefined;

    public constructor(
        public readonly info: SvnWorkingCopyInfo,
        private readonly svnService: SvnService,
        private readonly historyPanel: HistoryPanel,
        private readonly contentProvider: SvnContentProvider
    ) {
        const i18n = getI18n();
        this.sourceControl = vscode.scm.createSourceControl(
            "svn-tree",
            `SVN: ${nodePath.basename(info.workingCopyRoot)}`,
            vscode.Uri.file(info.workingCopyRoot)
        );
        this.sourceControl.quickDiffProvider = {
            provideOriginalResource: (uri) => this.provideOriginalResource(uri),
        };
        this.repositoryReference = getRepositoryReferenceDisplay(info.repositoryRelativePath);

        this.changesGroup = this.sourceControl.createResourceGroup(
            "svn-tree.changes",
            i18n.t("changesGroupLabel")
        );
        this.conflictArtifactsGroup = this.sourceControl.createResourceGroup(
            "svn-tree.conflict-artifacts",
            i18n.t("conflictArtifactsGroupLabel")
        );
        this.unversionedGroup = this.sourceControl.createResourceGroup(
            "svn-tree.unversioned",
            i18n.t("unversionedGroupLabel")
        );
        this.remoteChangesGroup = this.sourceControl.createResourceGroup(
            "svn-tree.remote-changes",
            i18n.t("remoteChangesGroupLabel")
        );
        this.changesGroup.hideWhenEmpty = false;
        this.changesGroup.contextValue = "svn-changes-group";
        this.changesGroup.resourceStates = [];
        this.unversionedGroup.hideWhenEmpty = true;
        this.unversionedGroup.contextValue = "svn-unversioned-group";
        this.unversionedGroup.resourceStates = [];
        this.conflictArtifactsGroup.hideWhenEmpty = true;
        this.conflictArtifactsGroup.contextValue = "svn-conflict-artifacts-group";
        this.conflictArtifactsGroup.resourceStates = [];
        this.remoteChangesGroup.hideWhenEmpty = false;
        this.remoteChangesGroup.contextValue = "svn-remote-changes-group";
        this.remoteChangesGroup.resourceStates = [];
        this.sourceControl.count = 0;
        this.refreshLocalization();
    }

    public get rootPath(): string {
        return this.info.workingCopyRoot;
    }

    public get label(): string {
        return nodePath.basename(this.rootPath);
    }

    private get i18n() {
        return getI18n();
    }

    public dispose(): void {
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
        this.sourceControl.dispose();
    }

    public refreshLocalization(): void {
        this.repositoryReference = getRepositoryReferenceDisplay(this.info.repositoryRelativePath);
        this.sourceControl.acceptInputCommand = {
            command: "svn-tree.commit",
            title: this.i18n.t("commitAcceptTitle"),
            arguments: [this],
        };
        this.sourceControl.inputBox.placeholder = getCommitInputPlaceholder(
            this.info.repositoryRelativePath
        );
        this.changesGroup.label = this.i18n.t("changesGroupLabel");
        this.conflictArtifactsGroup.label = this.i18n.t("conflictArtifactsGroupLabel");
        this.unversionedGroup.label = this.i18n.t("unversionedGroupLabel");
        this.remoteChangesGroup.label = this.i18n.t("remoteChangesGroupLabel");
        this.updateStatusBarCommands(this.remoteChangeCount);
    }

    public async refresh(options: RefreshOptions = {}): Promise<void> {
        if (this.isRefreshing) {
            return;
        }

        if (
            !options.allowWhileBusy &&
            this.activeOperation !== undefined &&
            this.activeOperation !== "refresh"
        ) {
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
            const conflictedPaths = new Set(
                statuses
                    .filter(isConflictedChange)
                    .map((status) => status.absolutePath)
            );
            const changeResources = statuses
                .filter(isLocalChange)
                .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
                .map((status) => new ScmResource(this, status, "change"));
            const conflictArtifactResources = statuses
                .filter((status) => isConflictArtifactStatus(status, conflictedPaths))
                .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
                .map(
                    (status) =>
                        new ScmResource(
                            this,
                            {
                                ...status,
                                conflictArtifact: true,
                            },
                            "change"
                        )
                );
            const unversionedResources = statuses
                .filter(
                    (status) =>
                        isUnversionedChange(status) &&
                        !isConflictArtifactStatus(status, conflictedPaths)
                )
                .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
                .map((status) => new ScmResource(this, status, "change"));
            const remoteResources = includeRemote
                ? statuses
                      .filter(isRemoteChange)
                      .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
                      .map((status) => new ScmResource(this, status, "remote-change"))
                : this.remoteChangesGroup.resourceStates;

            this.changesGroup.resourceStates = changeResources;
            this.conflictArtifactsGroup.resourceStates = conflictArtifactResources;
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

    public async refreshWithProgress(options: RefreshOptions = {}): Promise<void> {
        await this.runRepositoryOperation(
            "refresh",
            this.i18n.t("refreshStatusProgress", { label: this.label }),
            this.i18n.t("refreshStatusCompleted", { label: this.label }),
            () => this.refresh(options)
        );
    }

    public async commit(paths?: string[]): Promise<void> {
        const message = this.sourceControl.inputBox.value.trim();

        if (!message) {
            throw new Error(this.i18n.t("emptyCommitMessageError"));
        }

        const commitPaths = paths ?? (await this.pickPathsToCommit());
        if (!commitPaths) {
            return;
        }

        if (commitPaths.length === 0) {
            throw new Error(this.i18n.t("emptyCommitSelectionError"));
        }

        await this.svnService.commit(this.rootPath, message, commitPaths);
        this.sourceControl.inputBox.value = "";
        await this.refresh({ forceRemote: true });
        await this.historyPanel.refresh(this);
    }

    public async update(paths?: string[]): Promise<void> {
        await this.runRepositoryOperation(
            "update",
            this.i18n.t("updateWorkingCopyProgress", { label: this.label }),
            this.i18n.t("updateWorkingCopyCompleted", { label: this.label }),
            async () => {
                await this.svnService.update(this.rootPath, paths);
                await this.refresh({ forceRemote: true, allowWhileBusy: true });
                await this.historyPanel.refresh(this);
            }
        );
    }

    public getChangedPaths(): string[] {
        return this.getResourcePaths(this.changesGroup.resourceStates);
    }

    public getConflictedPaths(): string[] {
        return this.getResources(this.changesGroup.resourceStates)
            .filter((resource) => resource.status.wcStatus === "conflicted")
            .map((resource) => resource.status.absolutePath);
    }

    public getUnversionedPaths(): string[] {
        return this.getResourcePaths(this.unversionedGroup.resourceStates);
    }

    public async ignoreWorkingCopyPath(targetPath: string): Promise<void> {
        if (nodePath.resolve(targetPath) === nodePath.resolve(this.rootPath)) {
            throw new Error(this.i18n.t("cannotIgnoreWorkingCopyRootError"));
        }

        await this.updateIgnoredName(nodePath.dirname(targetPath), nodePath.basename(targetPath), true);
        await this.refresh({ allowWhileBusy: true });
    }

    public async unignoreWorkingCopyPath(targetPath: string): Promise<void> {
        if (nodePath.resolve(targetPath) === nodePath.resolve(this.rootPath)) {
            throw new Error(this.i18n.t("cannotIgnoreWorkingCopyRootError"));
        }

        await this.updateIgnoredName(nodePath.dirname(targetPath), nodePath.basename(targetPath), false);
        await this.refresh({ allowWhileBusy: true });
    }

    public async renameWorkingCopyPath(targetPath: string, newName: string): Promise<string> {
        const resolvedTargetPath = nodePath.resolve(targetPath);
        const trimmedName = newName.trim();
        const currentName = nodePath.basename(resolvedTargetPath);
        const relativePath =
            nodePath.relative(this.rootPath, resolvedTargetPath).replace(/\\/g, "/") ||
            currentName;

        if (resolvedTargetPath === nodePath.resolve(this.rootPath)) {
            throw new Error(this.i18n.t("cannotRenameWorkingCopyRootError"));
        }

        if (!trimmedName) {
            throw new Error(this.i18n.t("renamePathRequired"));
        }

        if (trimmedName.includes("/") || trimmedName.includes("\\")) {
            throw new Error(this.i18n.t("renamePathPathSeparatorError"));
        }

        if (trimmedName === "." || trimmedName === "..") {
            throw new Error(this.i18n.t("renamePathInvalidNameError"));
        }

        if (trimmedName === currentName) {
            throw new Error(this.i18n.t("renamePathSameNameError"));
        }

        const destinationPath = nodePath.join(nodePath.dirname(resolvedTargetPath), trimmedName);
        if (await this.pathExists(destinationPath)) {
            throw new Error(
                this.i18n.t("renamePathExistsError", {
                    name: trimmedName,
                })
            );
        }

        await this.runRepositoryOperation(
            "rename",
            this.i18n.t("renamePathProgress", { path: relativePath }),
            this.i18n.t("renamedPathCompleted", {
                from: currentName,
                to: trimmedName,
            }),
            async () => {
                const trackedInfo = await this.svnService.getWorkingCopyInfo(resolvedTargetPath);
                if (trackedInfo) {
                    await this.svnService.move(
                        this.rootPath,
                        resolvedTargetPath,
                        destinationPath
                    );
                } else {
                    await vscode.workspace.fs.rename(
                        vscode.Uri.file(resolvedTargetPath),
                        vscode.Uri.file(destinationPath),
                        { overwrite: false }
                    );
                }

                await this.refresh({ allowWhileBusy: true });
            }
        );

        return destinationPath;
    }

    public async addToChangelist(paths: string[], name: string): Promise<void> {
        const changelistName = name.trim();
        const selectedPaths = this.normalizeUniquePaths(paths);
        if (!changelistName || selectedPaths.length === 0) {
            return;
        }

        await this.svnService.addToChangelist(this.rootPath, selectedPaths, changelistName);
        await this.refresh({ allowWhileBusy: true });
    }

    public async removeFromChangelist(paths: string[]): Promise<void> {
        const selectedPaths = this.normalizeUniquePaths(paths);
        if (selectedPaths.length === 0) {
            return;
        }

        await this.svnService.removeFromChangelist(this.rootPath, selectedPaths);
        await this.refresh({ allowWhileBusy: true });
    }

    public async commitChangelist(name: string): Promise<void> {
        const changelistName = name.trim();
        const message = this.sourceControl.inputBox.value.trim();

        if (!message) {
            throw new Error(this.i18n.t("emptyCommitMessageError"));
        }

        if (!changelistName) {
            throw new Error(this.i18n.t("changelistNameRequired"));
        }

        await this.svnService.commitChangelist(this.rootPath, message, changelistName);
        this.sourceControl.inputBox.value = "";
        await this.refresh({ forceRemote: true });
        await this.historyPanel.refresh(this);
    }

    private getCommittableResources(): ScmResource[] {
        return this.changesGroup.resourceStates.filter(
            (resource): resource is ScmResource =>
                resource instanceof ScmResource &&
                isCommittableStatus(resource.status.wcStatus)
        );
    }

    private async pickPathsToCommit(): Promise<string[] | undefined> {
        const resources = this.getCommittableResources();
        if (resources.length === 0) {
            throw new Error(this.i18n.t("noCommittableChangesError"));
        }

        const pickedResources = await vscode.window.showQuickPick<CommitQuickPickItem>(
            resources.map((resource) => ({
                label: resource.status.relativePath,
                description: this.i18n.formatSvnStatus(resource.status.wcStatus),
                detail: this.i18n.formatNodeKind(resource.status.kind),
                picked: true,
                absolutePath: resource.status.absolutePath,
            })),
            {
                canPickMany: true,
                title: this.i18n.t("commitSelectFilesTitle"),
                placeHolder: this.i18n.t("commitSelectFilesPlaceholder"),
            }
        );

        return pickedResources?.map((resource) => resource.absolutePath);
    }

    public async updateSelectedToRevisionPaths(
        paths: string[],
        revision: number
    ): Promise<void> {
        const selectedPaths = this.normalizeUniquePaths(paths);
        if (selectedPaths.length === 0) {
            return;
        }

        await this.runRepositoryOperation(
            "update",
            this.i18n.t("updateSelectedToRevisionProgress", {
                label: this.label,
                revision,
            }),
            this.i18n.t("updatedSelectedToRevisionInfo", {
                label: this.label,
                revision,
            }),
            async () => {
                await this.svnService.update(
                    this.rootPath,
                    selectedPaths,
                    String(revision)
                );
                await this.refresh({ forceRemote: true, allowWhileBusy: true });
                await this.historyPanel.refresh(this);
            }
        );
    }

    public async switchRepositoryReference(): Promise<void> {
        const target = await this.promptSwitchTarget();
        if (!target) {
            return;
        }

        await this.runRepositoryOperation(
            "switch",
            this.i18n.t("switchWorkingCopyProgress", {
                label: this.label,
                target: target.display,
            }),
            this.i18n.t("switchedWorkingCopyCompleted", {
                label: this.label,
                target: target.display,
            }),
            async () => {
                await this.svnService.switch(this.rootPath, target.url);
                await this.refreshWorkingCopyInfo();
                await this.refresh({ forceRemote: true, allowWhileBusy: true });
                await this.historyPanel.refresh(this);
            }
        );
    }

    private getResourcePaths(
        resourceStates: readonly vscode.SourceControlResourceState[]
    ): string[] {
        return this.getResources(resourceStates).map((resource) => resource.status.absolutePath);
    }

    private getResources(
        resourceStates: readonly vscode.SourceControlResourceState[]
    ): ScmResource[] {
        return resourceStates.filter(
            (resource): resource is ScmResource => resource instanceof ScmResource
        );
    }

    private async updateIgnoredName(
        parentPath: string,
        name: string,
        ignored: boolean
    ): Promise<void> {
        const currentValue = await this.svnService.getProperty(parentPath, "svn:ignore");
        const entries = new Set(
            (currentValue ?? "")
                .split(/\r?\n/)
                .map((entry) => entry.trim())
                .filter(Boolean)
        );

        if (ignored) {
            entries.add(name);
        } else {
            entries.delete(name);
        }

        const nextValue = [...entries].sort((left, right) => left.localeCompare(right)).join("\n");
        if (!nextValue) {
            if (currentValue !== undefined) {
                await this.svnService.deleteProperty(parentPath, "svn:ignore");
            }
            return;
        }

        if (nextValue !== currentValue) {
            await this.svnService.setProperty(parentPath, "svn:ignore", nextValue);
        }
    }

    public async updateToRevision(revision: number): Promise<void> {
        const confirmed = await this.confirmUpdateToRevision(revision);
        if (!confirmed) {
            return;
        }

        await this.runRepositoryOperation(
            "update",
            this.i18n.t("updateToRevisionProgress", {
                label: this.label,
                revision,
            }),
            this.i18n.t("updatedToRevisionInfo", {
                label: this.label,
                revision,
            }),
            async () => {
                await this.svnService.update(this.rootPath, undefined, String(revision));
                await this.refresh({ forceRemote: true, allowWhileBusy: true });
                await this.historyPanel.refresh(this);
            }
        );
    }

    public async checkoutRevision(revision: number): Promise<void> {
        const destinationPath = await this.promptRevisionDestination("checkout", revision);
        if (!destinationPath) {
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: this.i18n.t("checkoutProgress", { revision }),
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
            this.i18n.t("checkedOutMessage", {
                revision,
                destination: destinationPath,
            })
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
                title: this.i18n.t("exportProgress", { revision }),
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
            this.i18n.t("exportedMessage", {
                revision,
                destination: destinationPath,
            })
        );
    }

    public async compareRevisionWithWorkingCopy(
        revision: number,
        changes: SvnLogPathChange[]
    ): Promise<void> {
        const change = await this.pickHistoryFileChange(
            revision,
            changes,
            this.i18n.t("compareWithWorkingCopyActionLower")
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
            this.i18n.t("compareWithPreviousRevisionActionLower")
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
                title: this.i18n.t("revertWorkingCopyProgress", { revision }),
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
            this.i18n.t("revertedWorkingCopyInfo", { revision })
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
                title: this.i18n.t("revertChangesProgress", { revision }),
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
            this.i18n.t("revertedChangesInfo", { revision })
        );
    }

    public async cleanup(): Promise<void> {
        await this.runRepositoryOperation(
            "cleanup",
            this.i18n.t("cleanupWorkingCopyProgress", { label: this.label }),
            this.i18n.t("cleanupWorkingCopyCompleted", { label: this.label }),
            async () => {
                await this.svnService.cleanup(this.rootPath);
                await this.refresh({ allowWhileBusy: true });
            }
        );
    }

    public async revert(paths: string[]): Promise<void> {
        await this.svnService.revert(this.rootPath, paths);
        await this.refresh();
    }

    public async markResolved(paths: string[]): Promise<void> {
        const conflictPaths = this.normalizeUniquePaths(paths);
        if (conflictPaths.length === 0) {
            return;
        }

        const itemLabel = this.i18n.formatItemCount(conflictPaths.length);
        const confirmed = await this.confirmConflictResolution("working", itemLabel);
        if (!confirmed) {
            return;
        }

        await this.runRepositoryOperation(
            "resolve",
            this.i18n.t("markResolvedProgress", { items: itemLabel }),
            this.i18n.t("markedResolvedInfo", { items: itemLabel }),
            async () => {
                await this.svnService.resolve(this.rootPath, conflictPaths, "working");
                await this.refresh({ allowWhileBusy: true });
            }
        );
    }

    public async acceptMine(paths: string[]): Promise<void> {
        await this.acceptConflictVersion(paths, "mine-full");
    }

    public async acceptTheirs(paths: string[]): Promise<void> {
        await this.acceptConflictVersion(paths, "theirs-full");
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

    public async showFileHistory(target: vscode.Uri | string): Promise<void> {
        const relativePath = this.getHistoryTargetRelativePath(target);
        await this.historyPanel.show(this, {
            key: `${this.rootPath}::file::${relativePath}`,
            label: relativePath,
            targetPath: relativePath,
        });
    }

    public async showHistoryForRepositoryPath(repositoryPath: string): Promise<void> {
        const label =
            this.getWorkingCopyRelativePathForRepositoryPath(repositoryPath) ??
            repositoryPath.replace(/^\/+/, "");
        await this.historyPanel.show(this, {
            key: `${this.rootPath}::repository-file::${repositoryPath}`,
            label,
            targetPath: buildRepositoryUrl(this.info.repositoryRoot, repositoryPath),
        });
    }

    public async revealRepositoryPathInFileManager(repositoryPath: string): Promise<void> {
        const absolutePath = this.getWorkingCopyPathForRepositoryPath(repositoryPath);
        if (!absolutePath) {
            void vscode.window.showWarningMessage(
                this.i18n.t("cannotMapPathWarning", { path: repositoryPath })
            );
            return;
        }

        const revealPath = await this.getNearestExistingPath(absolutePath);
        if (!revealPath) {
            void vscode.window.showWarningMessage(
                this.i18n.t("cannotMapPathWarning", { path: repositoryPath })
            );
            return;
        }

        await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(revealPath));
    }

    public async revealWorkingCopyPathInFileManager(target: vscode.Uri | string): Promise<void> {
        const targetPath = typeof target === "string" ? target : target.fsPath;
        const revealPath = await this.getNearestExistingPath(targetPath);
        if (!revealPath) {
            void vscode.window.showWarningMessage(
                this.i18n.t("cannotMapPathWarning", { path: targetPath })
            );
            return;
        }

        await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(revealPath));
    }

    public async loadHistoryPage(
        beforeRevision?: number,
        targetPath?: string
    ): Promise<SvnLogPage> {
        const pageSize = vscode.workspace
            .getConfiguration("svn-tree")
            .get<number>("max-log-entries", 200);
        const [entries, currentRevision] = await Promise.all([
            this.svnService.getLog(this.rootPath, pageSize, beforeRevision, targetPath),
            this.getHistoryCurrentRevision(targetPath),
        ]);
        const oldestRevision = entries.at(-1)?.revision;
        const currentRevisionNumber = toRevisionNumber(currentRevision);

        return {
            entries: markIncomingHistoryEntries(entries, currentRevisionNumber),
            hasMore: entries.length === pageSize && oldestRevision !== undefined && oldestRevision > 1,
            currentRevision: currentRevisionNumber,
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
                      label: `${resource.status.relativePath} (${this.i18n.t("labelWorkingTreeMissing")})`,
                      source: "empty",
                  })
                : resource.resourceUri;

        const leftUri =
            resource.status.wcStatus === "added"
                ? this.contentProvider.createUri({
                      label: `${resource.status.relativePath} (${this.i18n.t("labelEmpty")})`,
                      source: "empty",
                  })
                : this.contentProvider.createUri({
                      label: `${resource.status.relativePath} (${this.i18n.t("labelBase")})`,
                      source: "svn",
                      target: resource.status.absolutePath,
                      revision: "BASE",
                  });

        await vscode.commands.executeCommand(
            "vscode.diff",
            leftUri,
            rightUri,
            `${resource.status.relativePath} (${this.i18n.formatSvnStatus(resource.status.wcStatus)})`
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
                      label: `${repositoryPath} (${this.i18n.t("labelEmpty")})`,
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
                      label: `${repositoryPath} (${this.i18n.t("labelDeleted")})`,
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
                      label: `${status.relativePath} (${this.i18n.t("labelDeletedInHead")})`,
                      source: "empty",
                  })
                : this.contentProvider.createUri({
                      label: `${status.relativePath} (${this.i18n.t("labelHead")})`,
                      source: "svn",
                      target: repositoryUrl,
                      revision: "HEAD",
                  });

        const leftUri =
            status.reposStatus === "added"
                ? this.contentProvider.createUri({
                      label: `${status.relativePath} (${this.i18n.t("labelEmpty")})`,
                      source: "empty",
                  })
                : this.contentProvider.createUri({
                      label: `${status.relativePath} (${this.i18n.t("labelBase")})`,
                      source: "svn",
                      target: status.absolutePath,
                      revision: "BASE",
                  });

        await vscode.commands.executeCommand(
            "vscode.diff",
            leftUri,
            rightUri,
            `${status.relativePath} (${this.i18n.formatSvnStatus(
                status.reposStatus ?? this.i18n.t("incomingStatusLabel")
            )})`
        );
    }

    private shouldIncludeRemote(forceRemote: boolean): boolean {
        const enabled = vscode.workspace
            .getConfiguration("svn-tree")
            .get<boolean>("enable-remote-status", true);
        if (!enabled) {
            return false;
        }

        if (forceRemote) {
            return true;
        }

        const intervalSeconds = vscode.workspace
            .getConfiguration("svn-tree")
            .get<number>("remote-status-interval-seconds", 60);
        return Date.now() - this.lastRemoteRefreshAt >= intervalSeconds * 1000;
    }

    private provideOriginalResource(uri: vscode.Uri): vscode.ProviderResult<vscode.Uri> {
        if (!uri.fsPath.startsWith(this.rootPath)) {
            return undefined;
        }

        return this.contentProvider.createUri({
            label: `${nodePath.relative(this.rootPath, uri.fsPath)} (${this.i18n.t("labelBase")})`,
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

    private getHistoryTargetRelativePath(target: vscode.Uri | string): string {
        const targetPath = typeof target === "string" ? target : target.fsPath;
        const relativePath = nodePath.relative(this.rootPath, targetPath).replace(/\\/g, "/");

        if (!relativePath || relativePath.startsWith("../") || relativePath === "..") {
            throw new Error(this.i18n.t("cannotMapPathWarning", { path: targetPath }));
        }

        return relativePath;
    }

    private async getHistoryCurrentRevision(targetPath?: string): Promise<string | undefined> {
        if (!targetPath) {
            return this.getCurrentWorkingCopyRevision();
        }

        if (isUrlTarget(targetPath)) {
            return this.getCurrentWorkingCopyRevision();
        }

        const candidatePath = nodePath.isAbsolute(targetPath)
            ? targetPath
            : nodePath.join(this.rootPath, targetPath);
        const info = await this.svnService.getWorkingCopyInfo(candidatePath);
        return info?.revision;
    }

    private async getCurrentWorkingCopyRevision(): Promise<string | undefined> {
        const info = await this.svnService.getWorkingCopyInfo(this.rootPath);
        if (info?.revision) {
            this.info.revision = info.revision;
        }

        return info?.revision ?? this.info.revision;
    }

    private async refreshWorkingCopyInfo(): Promise<void> {
        const info = await this.svnService.getWorkingCopyInfo(this.rootPath);
        if (!info) {
            return;
        }

        this.info.rootPath = info.rootPath;
        this.info.workingCopyRoot = info.workingCopyRoot;
        this.info.url = info.url;
        this.info.repositoryRoot = info.repositoryRoot;
        this.info.repositoryRelativePath = info.repositoryRelativePath;
        this.info.revision = info.revision;
        this.refreshLocalization();
    }

    private async pickHistoryFileChange(
        revision: number,
        changes: SvnLogPathChange[],
        actionLabel: string
    ): Promise<SvnLogPathChange | undefined> {
        const fileChanges = changes.filter((change) => change.kind === "file");
        if (fileChanges.length === 0) {
            void vscode.window.showInformationMessage(
                this.i18n.t("historyNoFileChanges", { revision, action: actionLabel })
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
                detail: this.i18n.t("historyActionInRevision", {
                    action: this.describeHistoryChangeAction(change.action),
                    revision,
                }),
                change,
            })),
            {
                placeHolder: this.i18n.t("selectFilePlaceholder", { action: actionLabel }),
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
                this.i18n.t("cannotMapPathWarning", { path: change.path })
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
                      label: `${relativeLabel} (r${revision}, ${this.i18n.t("labelDeleted")})`,
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
                  label: `${relativeLabel} (${this.i18n.t("labelWorkingCopyMissing")})`,
                  source: "empty",
              });

        await vscode.commands.executeCommand(
            "vscode.diff",
            leftUri,
            rightUri,
            this.i18n.t("revisionVsWorkingCopy", {
                label: relativeLabel,
                revision,
            })
        );
    }

    private describeHistoryChangeAction(action: SvnLogPathChange["action"]): string {
        return this.i18n.formatHistoryAction(action);
    }

    private getReferenceKindLabel(kind: RepositoryReferenceKind): string {
        return kind === "branch" ? this.i18n.t("branchKind") : this.i18n.t("tagKind");
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

    private getWorkingCopyRelativePathForRepositoryPath(
        repositoryPath: string
    ): string | undefined {
        const absolutePath = this.getWorkingCopyPathForRepositoryPath(repositoryPath);
        if (!absolutePath) {
            return undefined;
        }

        const relativePath = nodePath.relative(this.rootPath, absolutePath).replace(/\\/g, "/");
        return relativePath.length > 0 ? relativePath : undefined;
    }

    private async pathExists(targetPath: string): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(targetPath));
            return true;
        } catch {
            return false;
        }
    }

    private async getNearestExistingPath(targetPath: string): Promise<string | undefined> {
        let candidatePath = targetPath;

        while (true) {
            if (await this.pathExists(candidatePath)) {
                return candidatePath;
            }

            const parentPath = nodePath.dirname(candidatePath);
            if (parentPath === candidatePath) {
                return undefined;
            }

            candidatePath = parentPath;
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
            openLabel: this.i18n.t("selectParentFolderLabel"),
            title:
                operation === "checkout"
                    ? this.i18n.t("selectParentFolderCheckoutTitle", { revision })
                    : this.i18n.t("selectParentFolderExportTitle", { revision }),
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
                    ? this.i18n.t("folderNameCheckoutPrompt", { revision })
                    : this.i18n.t("folderNameExportPrompt", { revision }),
            value: defaultName,
            validateInput: (value) => {
                const trimmed = value.trim();
                if (!trimmed) {
                    return this.i18n.t("folderNameRequired");
                }

                if (trimmed.includes("/") || trimmed.includes("\\")) {
                    return this.i18n.t("folderNamePathWarning");
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
                this.i18n.t("destinationExistsWarning", {
                    destination: destinationPath,
                })
            );
            return undefined;
        } catch {
            return destinationPath;
        }
    }

    private async revealCreatedPath(destinationPath: string, successMessage: string): Promise<void> {
        const selection = await vscode.window.showInformationMessage(
            successMessage,
            this.i18n.t("revealButton")
        );
        if (selection !== this.i18n.t("revealButton")) {
            return;
        }

        await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(destinationPath));
    }

    private updateStatusBarCommands(remoteCount: number): void {
        const countSuffix = remoteCount > 0 ? ` ${remoteCount}` : "";
        const activeOperation = this.activeOperation;
        const hasActiveOperation = activeOperation !== undefined;
        const showSpinner = hasActiveOperation || this.isRefreshingRemoteCount;
        const updateIcon = showSpinner ? "loading~spin" : "cloud-download";
        const updateTitle = showSpinner ? "$(loading~spin)" : `$(${updateIcon})${countSuffix}`;
        const updateTooltip = hasActiveOperation
            ? this.getOperationProgressTooltip(activeOperation)
            : this.isRefreshingRemoteCount
              ? this.i18n.t("checkingIncomingTooltip")
              : remoteCount > 0
                ? this.i18n.formatIncomingChangeCount(remoteCount)
                : this.i18n.t("updateTooltipNoIncoming");

        this.sourceControl.statusBarCommands = [
            {
                command: "svn-tree.open-history",
                title: `$(${this.repositoryReference.icon}) ${this.repositoryReference.label}`,
                arguments: [this],
            },
            {
                command: "svn-tree.update",
                title: updateTitle,
                tooltip: updateTooltip,
                arguments: [this],
            },
        ];
    }

    private getOperationProgressTooltip(operation: RepositoryUiOperation): string {
        switch (operation) {
            case "refresh":
                return this.i18n.t("refreshStatusRunningTooltip");
            case "update":
                return this.i18n.t("updateWorkingCopyRunningTooltip");
            case "cleanup":
                return this.i18n.t("cleanupWorkingCopyRunningTooltip");
            case "resolve":
                return this.i18n.t("resolveConflictsRunningTooltip");
            case "switch":
                return this.i18n.t("switchWorkingCopyRunningTooltip");
            case "rename":
                return this.i18n.t("renamePathRunningTooltip");
        }
    }

    private getOperationLabel(operation: RepositoryUiOperation): string {
        switch (operation) {
            case "refresh":
                return this.i18n.t("refreshStatusActionLabel");
            case "update":
                return this.i18n.t("updateWorkingCopyActionLabel");
            case "cleanup":
                return this.i18n.t("cleanupWorkingCopyActionLabel");
            case "resolve":
                return this.i18n.t("resolveConflictsActionLabel");
            case "switch":
                return this.i18n.t("switchWorkingCopyActionLabel");
            case "rename":
                return this.i18n.t("renamePathActionLabel");
        }
    }

    private async runRepositoryOperation(
        operation: RepositoryUiOperation,
        progressTitle: string,
        completedMessage: string,
        action: () => Promise<void>
    ): Promise<void> {
        if (this.activeOperation) {
            void vscode.window.showInformationMessage(
                this.i18n.t("operationAlreadyRunning", {
                    action: this.getOperationLabel(this.activeOperation),
                    label: this.label,
                })
            );
            return;
        }

        this.activeOperation = operation;
        this.updateStatusBarCommands(this.remoteChangeCount);

        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: progressTitle,
                },
                async () => {
                    await action();
                }
            );

            void vscode.window.showInformationMessage(completedMessage);
        } finally {
            this.activeOperation = undefined;
            this.updateStatusBarCommands(this.remoteChangeCount);
        }
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
        const kindLabel = this.getReferenceKindLabel(kind);
        const message = this.i18n.t("createReferenceCommitMessage", {
            kind: kindLabel,
            destination: destinationPath,
            revision,
        });

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: this.i18n.t("createReferenceProgress", {
                    kind: kindLabel,
                    revision,
                }),
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
            this.i18n.t("createdReferenceMessage", {
                kind: kindLabel,
                revision,
                destination: destinationPath,
            }),
            this.i18n.t("copyPathButton")
        );
        if (selection === this.i18n.t("copyPathButton")) {
            await vscode.env.clipboard.writeText(destinationPath);
            void vscode.window.setStatusBarMessage(
                this.i18n.t("copiedReferencePathStatus", {
                    kind: kindLabel,
                    destination: destinationPath,
                }),
                2000
            );
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
        const kindLabel = this.getReferenceKindLabel(kind);
        const referencePath = await vscode.window.showInputBox({
            prompt: this.i18n.t("newReferencePathPrompt", {
                kind: kindLabel,
                location: locationPath,
                revision,
            }),
            value: getReferenceNameSuggestion(this.info.repositoryRelativePath, revision),
            validateInput: (value) => {
                const normalizedValue = value.trim().replace(/\\/g, "/");
                if (!normalizedValue) {
                    return kind === "branch"
                        ? this.i18n.t("branchNameRequired")
                        : this.i18n.t("tagNameRequired");
                }

                if (normalizedValue.startsWith("/")) {
                    return this.i18n.t("relativePathRequired", {
                        location: locationPath,
                    });
                }

                if (normalizedValue.split("/").some((segment) => segment.trim().length === 0)) {
                    return this.i18n.t("avoidEmptySegments");
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

    private async promptSwitchTarget(): Promise<{ display: string; url: string } | undefined> {
        const switchTarget = await vscode.window.showInputBox({
            title: this.i18n.t("switchWorkingCopyActionLabel"),
            prompt: this.i18n.t("switchTargetPrompt", {
                layoutRoot: getReferenceLayoutRoot(this.info.repositoryRelativePath),
            }),
            placeHolder: this.i18n.t("switchTargetPlaceholder"),
            value: getCommitTargetLabel(this.info.repositoryRelativePath),
            validateInput: (value) => this.validateSwitchTarget(value),
        });
        const trimmedTarget = switchTarget?.trim();
        if (!trimmedTarget) {
            return undefined;
        }

        return this.resolveSwitchTarget(trimmedTarget);
    }

    private validateSwitchTarget(value: string): string | undefined {
        const trimmedValue = value.trim();
        if (!trimmedValue) {
            return this.i18n.t("switchTargetRequired");
        }

        if (isUrlTarget(trimmedValue)) {
            return undefined;
        }

        const segments = trimmedValue.replace(/\\/g, "/").split("/").filter(Boolean);
        if (segments.some((segment) => segment === "." || segment === "..")) {
            return this.i18n.t("switchTargetInvalid");
        }

        return undefined;
    }

    private resolveSwitchTarget(target: string): { display: string; url: string } {
        if (isUrlTarget(target)) {
            return {
                display: target,
                url: target,
            };
        }

        const layoutRoot = getReferenceLayoutRoot(this.info.repositoryRelativePath);
        const repositoryPath = target.startsWith("/")
            ? normalizeRepositoryPath(target)
            : normalizeRepositoryPath(
                  [layoutRoot, target].filter((segment) => segment !== "/").join("/")
              );

        return {
            display: repositoryPath,
            url: buildRepositoryUrl(this.info.repositoryRoot, repositoryPath),
        };
    }

    private async confirmReverseMerge(
        mode: "revert-to-revision" | "revert-changes-from-revision",
        revision: number
    ): Promise<boolean> {
        const hasLocalChanges = this.hasLocalChanges();
        const message =
            mode === "revert-to-revision"
                ? this.i18n.t("revertWorkingCopyQuestion", { revision })
                : this.i18n.t("revertChangesQuestion", { revision });
        const detailLines = [
            mode === "revert-to-revision"
                ? this.i18n.t("revertWorkingCopyDetail", { revision })
                : this.i18n.t("revertChangesDetail", { revision }),
            this.i18n.t("cleanWorkingCopyRecommended"),
            this.i18n.t("workingCopyOnlyDetail"),
        ];

        if (hasLocalChanges) {
            detailLines.push(this.i18n.t("localChangesConflictWarning"));
        }

        const selection = await vscode.window.showWarningMessage(
            message,
            {
                modal: true,
                detail: detailLines.join("\n"),
            },
            this.i18n.t("continueButton")
        );

        return selection === this.i18n.t("continueButton");
    }

    private async confirmUpdateToRevision(revision: number): Promise<boolean> {
        const detailLines = [
            this.i18n.t("updateToRevisionDetail", { revision }),
            this.i18n.t("updateToRevisionRecoveryDetail"),
            this.i18n.t("cleanWorkingCopyRecommended"),
            this.i18n.t("workingCopyOnlyDetail"),
        ];

        if (this.hasLocalChanges()) {
            detailLines.push(this.i18n.t("localChangesConflictWarning"));
        }

        const selection = await vscode.window.showWarningMessage(
            this.i18n.t("updateToRevisionQuestion", { revision }),
            {
                modal: true,
                detail: detailLines.join("\n"),
            },
            this.i18n.t("continueButton")
        );

        return selection === this.i18n.t("continueButton");
    }

    private async acceptConflictVersion(
        paths: string[],
        accept: "mine-full" | "theirs-full"
    ): Promise<void> {
        const conflictPaths = this.normalizeUniquePaths(paths);
        if (conflictPaths.length === 0) {
            return;
        }

        const itemLabel = this.i18n.formatItemCount(conflictPaths.length);
        const confirmed = await this.confirmConflictResolution(accept, itemLabel);
        if (!confirmed) {
            return;
        }

        const progressKey =
            accept === "mine-full" ? "acceptMineProgress" : "acceptTheirsProgress";
        const completedKey =
            accept === "mine-full" ? "acceptedMineInfo" : "acceptedTheirsInfo";

        await this.runRepositoryOperation(
            "resolve",
            this.i18n.t(progressKey, { items: itemLabel }),
            this.i18n.t(completedKey, { items: itemLabel }),
            async () => {
                await this.svnService.resolve(this.rootPath, conflictPaths, accept);
                await this.refresh({ allowWhileBusy: true });
            }
        );
    }

    private normalizeUniquePaths(paths: readonly string[]): string[] {
        const uniquePaths = new Set<string>();

        for (const targetPath of paths) {
            if (targetPath) {
                uniquePaths.add(targetPath);
            }
        }

        return [...uniquePaths];
    }

    private async confirmConflictResolution(
        mode: "working" | "mine-full" | "theirs-full",
        itemLabel: string
    ): Promise<boolean> {
        const message =
            mode === "working"
                ? this.i18n.t("markResolvedQuestion", { items: itemLabel })
                : mode === "mine-full"
                  ? this.i18n.t("acceptMineQuestion", { items: itemLabel })
                  : this.i18n.t("acceptTheirsQuestion", { items: itemLabel });
        const detailLines = [
            mode === "working"
                ? this.i18n.t("markResolvedDetail")
                : mode === "mine-full"
                  ? this.i18n.t("acceptMineDetail")
                  : this.i18n.t("acceptTheirsDetail"),
            this.i18n.t("workingCopyOnlyDetail"),
        ];

        const selection = await vscode.window.showWarningMessage(
            message,
            {
                modal: true,
                detail: detailLines.join("\n"),
            },
            this.i18n.t("continueButton")
        );

        return selection === this.i18n.t("continueButton");
    }

    private hasLocalChanges(): boolean {
        return (
            this.changesGroup.resourceStates.length > 0 ||
            this.unversionedGroup.resourceStates.length > 0
        );
    }
}
