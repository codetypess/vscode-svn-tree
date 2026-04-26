import * as nodePath from "node:path";
import * as vscode from "vscode";
import {
    markIncomingHistoryEntries,
    normalizeHistoryFilters,
    toRevisionNumber,
} from "../history/history-utils";
import { HistoryPanel } from "../history/history-panel";
import { buildRevisionGraph } from "../revision-graph/revision-graph-utils";
import { RevisionGraphPanel } from "../revision-graph/revision-graph-panel";
import type { RevisionGraphData } from "../revision-graph/revision-graph-types";
import { SvnContentProvider } from "../svn/svn-content-provider";
import { SvnService } from "../svn/svn-service";
import type {
    SvnHistoryFilters,
    SvnLogEntry,
    SvnLogPage,
    SvnLogPathChange,
    SvnPropertyEntry,
    SvnStatusEntry,
    SvnWorkingCopyInfo,
} from "../svn/svn-types";
import type { MessageKey } from "../i18n";
import { getI18n } from "../vscode-i18n";
import { parseBlameLines } from "./svn-blame-utils";
import { isConflictArtifactStatus } from "./conflict-artifact";
import { isCommittableStatus } from "./commit-utils";
import {
    getCurrentReferenceSuggestion,
    getReferenceLocationPath,
    getReferenceNameSuggestionForRepositoryPath,
    getReferenceNameValidationError,
    getSwitchTargetValidationError,
    resolveDeleteReferenceTarget,
    resolveSwitchTarget,
} from "./svn-reference-targets";
import {
    buildRepositoryBrowserFileActionItems,
    buildRepositoryBrowserItems,
    getParentRepositoryPath,
    RepositoryBrowserQuickPickItem,
} from "./svn-repository-browser";
import {
    builtinPropertyNameDefinitions,
    decodePropertyValue,
    encodePropertyValue,
    formatPropertyEntries,
} from "./svn-property-utils";
import { ScmResource } from "./scm-resource";
import {
    buildHistoryFileExportName,
    buildReferenceDestinationPath,
    buildRepositoryUrl,
    getCommitTargetLabel,
    getReferenceLayoutRoot,
    getReferenceNameSuggestion,
    getRepositoryReferenceRoot,
    getRepositoryReferenceDisplay,
    getWorkingCopyPathForRepositoryPath,
    getWorkingCopyRelativePathForRepositoryPath,
    isUrlTarget,
    normalizeRepositoryPath,
    RepositoryReferenceKind,
    resolveRepositoryPathFromWorkingCopy,
} from "./svn-repository-paths";

interface RefreshOptions {
    forceRemote?: boolean;
    allowWhileBusy?: boolean;
}

interface CommitQuickPickItem extends vscode.QuickPickItem {
    readonly absolutePath: string;
}

interface PropertyNameQuickPickItem extends vscode.QuickPickItem {
    readonly propertyName: string;
    readonly custom?: boolean;
}

interface PropertyActionQuickPickItem extends vscode.QuickPickItem {
    readonly action: "set" | "delete";
}

type BlameDisplayMode = "text" | "output";
type ConflictResolutionMode =
    | "working"
    | "base"
    | "mine-conflict"
    | "theirs-conflict"
    | "mine-full"
    | "theirs-full"
    | "postpone";
type SelectableConflictResolutionMode = Exclude<ConflictResolutionMode, "working">;
type RepositoryUiOperation =
    | "refresh"
    | "update"
    | "cleanup"
    | "resolve"
    | "switch"
    | "rename"
    | "lock"
    | "unlock";
type RepositoryRevisionTransferOperation = "checkout" | "export";

const revisionGraphMinEntryCount = 300;
const revisionGraphMaxEntryCount = 1000;
const revisionGraphEntryMultiplier = 3;

const conflictResolutionMessages: Record<
    SelectableConflictResolutionMode,
    {
        readonly questionKey: MessageKey;
        readonly detailKey: MessageKey;
        readonly progressKey: MessageKey;
        readonly completedKey: MessageKey;
    }
> = {
    base: {
        questionKey: "acceptBaseQuestion",
        detailKey: "acceptBaseDetail",
        progressKey: "acceptBaseProgress",
        completedKey: "acceptedBaseInfo",
    },
    "mine-conflict": {
        questionKey: "acceptMineConflictQuestion",
        detailKey: "acceptMineConflictDetail",
        progressKey: "acceptMineConflictProgress",
        completedKey: "acceptedMineConflictInfo",
    },
    "theirs-conflict": {
        questionKey: "acceptTheirsConflictQuestion",
        detailKey: "acceptTheirsConflictDetail",
        progressKey: "acceptTheirsConflictProgress",
        completedKey: "acceptedTheirsConflictInfo",
    },
    "mine-full": {
        questionKey: "acceptMineQuestion",
        detailKey: "acceptMineDetail",
        progressKey: "acceptMineProgress",
        completedKey: "acceptedMineInfo",
    },
    "theirs-full": {
        questionKey: "acceptTheirsQuestion",
        detailKey: "acceptTheirsDetail",
        progressKey: "acceptTheirsProgress",
        completedKey: "acceptedTheirsInfo",
    },
    postpone: {
        questionKey: "postponeConflictQuestion",
        detailKey: "postponeConflictDetail",
        progressKey: "postponeConflictProgress",
        completedKey: "postponedConflictInfo",
    },
};

const repositoryUiOperationMessages: Record<
    RepositoryUiOperation,
    {
        readonly progressTooltipKey: MessageKey;
        readonly actionLabelKey: MessageKey;
    }
> = {
    refresh: {
        progressTooltipKey: "refreshStatusRunningTooltip",
        actionLabelKey: "refreshStatusActionLabel",
    },
    update: {
        progressTooltipKey: "updateWorkingCopyRunningTooltip",
        actionLabelKey: "updateWorkingCopyActionLabel",
    },
    cleanup: {
        progressTooltipKey: "cleanupWorkingCopyRunningTooltip",
        actionLabelKey: "cleanupWorkingCopyActionLabel",
    },
    resolve: {
        progressTooltipKey: "resolveConflictsRunningTooltip",
        actionLabelKey: "resolveConflictsActionLabel",
    },
    switch: {
        progressTooltipKey: "switchWorkingCopyRunningTooltip",
        actionLabelKey: "switchWorkingCopyActionLabel",
    },
    rename: {
        progressTooltipKey: "renamePathRunningTooltip",
        actionLabelKey: "renamePathActionLabel",
    },
    lock: {
        progressTooltipKey: "lockPathRunningTooltip",
        actionLabelKey: "lockPathActionLabel",
    },
    unlock: {
        progressTooltipKey: "unlockPathRunningTooltip",
        actionLabelKey: "unlockPathActionLabel",
    },
};

const repositoryRevisionTransferMessages: Record<
    RepositoryRevisionTransferOperation,
    {
        readonly progressKey: MessageKey;
        readonly completedKey: MessageKey;
    }
> = {
    checkout: {
        progressKey: "checkoutProgress",
        completedKey: "checkedOutMessage",
    },
    export: {
        progressKey: "exportProgress",
        completedKey: "exportedMessage",
    },
};

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

function getCommitInputPlaceholder(repositoryRelativePath: string): string {
    const submitShortcut = process.platform === "darwin" ? "⌘Enter" : "Ctrl+Enter";
    const targetLabel = getCommitTargetLabel(repositoryRelativePath);
    return getI18n().t("commitInputPlaceholder", {
        shortcut: submitShortcut,
        target: targetLabel,
    });
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
    private pendingRefreshOptions: RefreshOptions | undefined;

    public constructor(
        public readonly info: SvnWorkingCopyInfo,
        private readonly svnService: SvnService,
        private readonly historyPanel: HistoryPanel,
        private readonly revisionGraphPanel: RevisionGraphPanel,
        private readonly contentProvider: SvnContentProvider,
        private readonly outputChannel: vscode.OutputChannel
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
            this.queueRefresh(options);
            return;
        }

        if (
            !options.allowWhileBusy &&
            this.activeOperation !== undefined &&
            this.activeOperation !== "refresh"
        ) {
            this.queueRefresh(options);
            return;
        }

        this.isRefreshing = true;
        let refreshError: unknown;

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
        } catch (error) {
            refreshError = error;
        } finally {
            if (this.isRefreshingRemoteCount) {
                this.isRefreshingRemoteCount = false;
                this.updateStatusBarCommands(this.remoteChangeCount);
            }

            this.isRefreshing = false;
        }

        await this.runPendingRefresh();

        if (refreshError) {
            throw refreshError;
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

    public async lockWorkingCopyPaths(paths: string[]): Promise<void> {
        const lockablePaths = this.normalizeUniquePaths(paths);
        if (lockablePaths.length === 0) {
            return;
        }

        const itemLabel = this.i18n.formatItemCount(lockablePaths.length);
        await this.runRepositoryOperation(
            "lock",
            this.i18n.t("lockPathProgress", { items: itemLabel }),
            this.i18n.t("lockedPathCompleted", { items: itemLabel }),
            async () => {
                await this.svnService.lock(this.rootPath, lockablePaths);
                await this.refresh({ allowWhileBusy: true });
            }
        );
    }

    public async unlockWorkingCopyPaths(paths: string[]): Promise<void> {
        const lockablePaths = this.normalizeUniquePaths(paths);
        if (lockablePaths.length === 0) {
            return;
        }

        const itemLabel = this.i18n.formatItemCount(lockablePaths.length);
        await this.runRepositoryOperation(
            "unlock",
            this.i18n.t("unlockPathProgress", { items: itemLabel }),
            this.i18n.t("unlockedPathCompleted", { items: itemLabel }),
            async () => {
                await this.svnService.unlock(this.rootPath, lockablePaths);
                await this.refresh({ allowWhileBusy: true });
            }
        );
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
        await this.transferRepositoryRevision("checkout", revision);
    }

    public async exportRevision(revision: number): Promise<void> {
        await this.transferRepositoryRevision("export", revision);
    }

    public async exportFileRevision(
        revision: number,
        repositoryPath: string,
        action: SvnLogPathChange["action"]
    ): Promise<void> {
        const exportRevision = action === "D" ? revision - 1 : revision;
        if (exportRevision < 1) {
            void vscode.window.showWarningMessage(
                this.i18n.t("historyFileExportUnavailable", {
                    path: repositoryPath,
                    revision,
                })
            );
            return;
        }

        const destinationPath = await this.promptHistoryFileExportDestination(
            repositoryPath,
            exportRevision
        );
        if (!destinationPath) {
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: this.i18n.t("exportFileProgress", {
                    path: repositoryPath,
                    revision: exportRevision,
                }),
            },
            async () => {
                await this.svnService.export(
                    buildRepositoryUrl(this.info.repositoryRoot, repositoryPath),
                    String(exportRevision),
                    destinationPath
                );
            }
        );

        await this.revealCreatedPath(
            destinationPath,
            this.i18n.t("exportedFileMessage", {
                path: repositoryPath,
                revision: exportRevision,
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

    public async createBranchFromWorkingCopy(): Promise<void> {
        await this.createRepositoryReferenceFromWorkingCopy("branch");
    }

    public async createTagFromWorkingCopy(): Promise<void> {
        await this.createRepositoryReferenceFromWorkingCopy("tag");
    }

    public async createBranchFromWorkingCopyAt(repositoryPath: string): Promise<void> {
        await this.createRepositoryReferenceFromWorkingCopy("branch", undefined, repositoryPath);
    }

    public async createTagFromWorkingCopyAt(repositoryPath: string): Promise<void> {
        await this.createRepositoryReferenceFromWorkingCopy("tag", undefined, repositoryPath);
    }

    public async deleteRepositoryReference(): Promise<void> {
        const target = await this.promptDeleteReferenceTarget();
        if (!target) {
            return;
        }

        await this.deleteRepositoryReferenceTarget(target);
    }

    public async deleteRepositoryReferenceAt(repositoryPath: string): Promise<void> {
        const target = {
            display: repositoryPath,
            repositoryPath,
            url: buildRepositoryUrl(this.info.repositoryRoot, repositoryPath),
        };
        await this.deleteRepositoryReferenceTarget(target);
    }

    public async relocateWorkingCopy(): Promise<void> {
        const targetUrl = await this.promptRelocateTargetUrl();
        if (!targetUrl) {
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: this.i18n.t("relocateWorkingCopyProgress", {
                    label: this.label,
                }),
            },
            async () => {
                await this.svnService.relocate(this.rootPath, targetUrl);
            }
        );

        await this.refreshWorkingCopyInfo();
        await this.refresh({ forceRemote: true, allowWhileBusy: true });
        await this.historyPanel.refresh(this);
        void vscode.window.showInformationMessage(
            this.i18n.t("relocatedWorkingCopyInfo", {
                label: this.label,
            })
        );
    }

    private async deleteRepositoryReferenceTarget(target: {
        display: string;
        repositoryPath: string;
        url: string;
    }): Promise<void> {
        const confirmed = await this.confirmDeleteRepositoryReference(target.display);
        if (!confirmed) {
            return;
        }

        const message = this.i18n.t("deleteReferenceCommitMessage", {
            target: target.display,
        });

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: this.i18n.t("deleteReferenceProgress", {
                    target: target.display,
                }),
            },
            async () => {
                await this.svnService.deleteUrl(target.url, message);
            }
        );

        await this.historyPanel.refresh(this);
        void vscode.window.showInformationMessage(
            this.i18n.t("deletedReferenceInfo", {
                target: target.display,
            })
        );
    }

    public async showBlame(
        target: vscode.Uri | string,
        displayMode: BlameDisplayMode = "text"
    ): Promise<void> {
        const targetPath = typeof target === "string" ? target : target.fsPath;
        const targetInfo = await this.svnService.getNodeInfo(targetPath);
        const displayPath =
            nodePath.relative(this.rootPath, targetPath).replace(/\\/g, "/") ||
            nodePath.basename(targetPath);

        if (!targetInfo) {
            throw new Error(this.i18n.t("noSvnInfoForPathError", { path: displayPath }));
        }

        if (targetInfo.kind !== "file") {
            throw new Error(this.i18n.t("blameFileOnlyError"));
        }

        const blameOutput = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: this.i18n.t("showBlameProgress", { path: displayPath }),
            },
            async () => this.svnService.blame(this.rootPath, targetPath)
        );

        await this.presentBlameResult(
            {
                displayPath,
                repositoryPath: targetInfo.repositoryRelativePath,
                url: targetInfo.url,
                blameOutput,
                workingCopyPath: targetPath,
            },
            displayMode
        );
    }

    public async showPathProperties(target: vscode.Uri | string): Promise<void> {
        const targetPath = typeof target === "string" ? target : target.fsPath;
        const displayPath =
            nodePath.relative(this.rootPath, targetPath).replace(/\\/g, "/") ||
            nodePath.basename(targetPath);
        const targetInfo = await this.svnService.getNodeInfo(targetPath);
        if (!targetInfo) {
            throw new Error(this.i18n.t("noSvnInfoForPathError", { path: displayPath }));
        }

        const properties = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: this.i18n.t("showPropertiesProgress", {
                    path: displayPath,
                }),
            },
            async () => this.svnService.getProperties(targetPath)
        );

        this.writePropertiesToOutput({
            displayPath,
            repositoryPath: targetInfo.repositoryRelativePath,
            url: targetInfo.url,
            properties,
        });
    }

    public async editPathProperty(target: vscode.Uri | string): Promise<void> {
        const targetPath = typeof target === "string" ? target : target.fsPath;
        const displayPath =
            nodePath.relative(this.rootPath, targetPath).replace(/\\/g, "/") ||
            nodePath.basename(targetPath);
        const targetInfo = await this.svnService.getNodeInfo(targetPath);
        if (!targetInfo) {
            throw new Error(this.i18n.t("noSvnInfoForPathError", { path: displayPath }));
        }

        const propertyName = await this.promptPropertyName();
        if (!propertyName) {
            return;
        }

        const currentValue = await this.svnService.getProperty(targetPath, propertyName);
        const action = await this.promptPropertyAction(propertyName, currentValue);
        if (!action) {
            return;
        }

        if (action === "delete") {
            if (currentValue === undefined) {
                void vscode.window.showInformationMessage(
                    this.i18n.t("propertyNotSetInfo", {
                        name: propertyName,
                    })
                );
                return;
            }

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: this.i18n.t("deletePropertyProgress", {
                        name: propertyName,
                    }),
                },
                async () => {
                    await this.svnService.deleteProperty(targetPath, propertyName);
                }
            );

            await this.refresh({ allowWhileBusy: true });
            void vscode.window.showInformationMessage(
                this.i18n.t("deletedPropertyInfo", {
                    name: propertyName,
                    path: displayPath,
                })
            );
            return;
        }

        const nextValue = await this.promptPropertyValue(propertyName, currentValue);
        if (nextValue === undefined) {
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: this.i18n.t("setPropertyProgress", {
                    name: propertyName,
                }),
            },
            async () => {
                await this.svnService.setProperty(targetPath, propertyName, nextValue);
            }
        );

        await this.refresh({ allowWhileBusy: true });
        void vscode.window.showInformationMessage(
            this.i18n.t("updatedPropertyInfo", {
                name: propertyName,
                path: displayPath,
            })
        );
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

    public async showRevisionGraph(repositoryPath?: string): Promise<void> {
        await this.revisionGraphPanel.show(this, repositoryPath);
    }

    public async loadRevisionGraph(repositoryPath?: string): Promise<RevisionGraphData> {
        const selectedRepositoryPath = normalizeRepositoryPath(
            repositoryPath ?? this.info.repositoryRelativePath
        );
        const selectedReferencePath =
            getRepositoryReferenceRoot(selectedRepositoryPath) ?? selectedRepositoryPath;
        const graphRootPath = this.getRevisionGraphRootPath(selectedReferencePath);
        const { entries, truncated } = await this.loadRevisionGraphEntries(graphRootPath);
        const graph = buildRevisionGraph({
            entries,
            currentRepositoryPath: this.info.repositoryRelativePath,
            selectedRepositoryPath: selectedReferencePath,
        });

        return {
            scopeLabel: getCommitTargetLabel(selectedReferencePath),
            layoutRootPath: graphRootPath,
            selectedRepositoryPath,
            selectedReferencePath: graph.selectedReferencePath,
            currentReferencePath: graph.currentReferencePath,
            nodes: graph.nodes,
            edges: graph.edges,
            scannedEntryCount: entries.length,
            truncated,
        };
    }

    public getRepositoryUrlForPath(repositoryPath: string): string {
        return buildRepositoryUrl(this.info.repositoryRoot, repositoryPath);
    }

    public async switchToRepositoryPath(repositoryPath: string): Promise<void> {
        await this.switchWorkingCopyToRepositoryPath(repositoryPath);
    }

    public async openRepositoryBrowser(initialRepositoryPath?: string): Promise<void> {
        let currentRepositoryPath = normalizeRepositoryPath(
            initialRepositoryPath ?? this.info.repositoryRelativePath
        );

        while (true) {
            const currentUrl = buildRepositoryUrl(
                this.info.repositoryRoot,
                currentRepositoryPath
            );
            const entries = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: this.i18n.t("repositoryBrowserProgress", {
                        path: currentRepositoryPath,
                    }),
                },
                async () => this.svnService.list(currentUrl)
            );

            const selection = await vscode.window.showQuickPick<RepositoryBrowserQuickPickItem>(
                buildRepositoryBrowserItems({
                    currentRepositoryPath,
                    currentUrl,
                    repositoryRoot: this.info.repositoryRoot,
                    currentWorkingCopyRepositoryPath: this.info.repositoryRelativePath,
                    entries,
                    formatNodeKind: (kind) => this.i18n.formatNodeKind(kind),
                    separatorKind: vscode.QuickPickItemKind.Separator,
                    strings: {
                        actionsSeparator: this.i18n.t("repositoryBrowserActionsSeparator"),
                        openHistoryActionLabel: this.i18n.t("openHistoryActionLabel"),
                        showPropertiesActionLabel: this.i18n.t("showPropertiesActionLabel"),
                        createBranchFromWorkingCopyActionLabel: this.i18n.t(
                            "createBranchFromWorkingCopyActionLabel"
                        ),
                        createTagFromWorkingCopyActionLabel: this.i18n.t(
                            "createTagFromWorkingCopyActionLabel"
                        ),
                        copyRepositoryUrlActionLabel: this.i18n.t(
                            "copyRepositoryUrlActionLabel"
                        ),
                        copyRepositoryPathActionLabel: this.i18n.t(
                            "copyRepositoryPathActionLabel"
                        ),
                        switchHereLabel: this.i18n.t("repositoryBrowserSwitchHereLabel"),
                        deleteReferenceActionLabel: this.i18n.t("deleteReferenceActionLabel"),
                        entriesSeparator: this.i18n.t("repositoryBrowserEntriesSeparator"),
                        upLabel: this.i18n.t("repositoryBrowserUpLabel"),
                        emptyLabel: this.i18n.t("repositoryBrowserEmptyLabel"),
                    },
                }),
                {
                    title: this.i18n.t("repositoryBrowserActionLabel"),
                    placeHolder: this.i18n.t("repositoryBrowserPlaceholder", {
                        path: currentRepositoryPath,
                    }),
                }
            );

            if (!selection) {
                return;
            }

            if (selection.itemType === "up") {
                currentRepositoryPath = getParentRepositoryPath(currentRepositoryPath);
                continue;
            }

            if (selection.itemType === "directory" && selection.repositoryPath) {
                currentRepositoryPath = selection.repositoryPath;
                continue;
            }

            if (selection.itemType === "file" && selection.repositoryPath) {
                await this.openRepositoryBrowserFileActions(
                    selection.repositoryPath,
                    selection.url ??
                        buildRepositoryUrl(
                            this.info.repositoryRoot,
                            selection.repositoryPath
                        )
                );
                continue;
            }

            if (
                selection.itemType === "action" &&
                selection.action &&
                selection.repositoryPath &&
                selection.url
            ) {
                await this.runRepositoryBrowserAction(
                    selection.action,
                    selection.repositoryPath,
                    selection.url
                );
            }
        }
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
            getWorkingCopyRelativePathForRepositoryPath(
                this.rootPath,
                this.info.repositoryRelativePath,
                repositoryPath
            ) ??
            (repositoryPath.replace(/^\/+/, "") || "/");
        await this.historyPanel.show(this, {
            key: `${this.rootPath}::repository-file::${repositoryPath}`,
            label,
            targetPath: buildRepositoryUrl(this.info.repositoryRoot, repositoryPath),
        });
    }

    public async revealRepositoryPathInFileManager(repositoryPath: string): Promise<void> {
        const absolutePath = getWorkingCopyPathForRepositoryPath(
            this.rootPath,
            this.info.repositoryRelativePath,
            repositoryPath
        );
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
        targetPath?: string,
        filters?: SvnHistoryFilters
    ): Promise<SvnLogPage> {
        const pageSize = vscode.workspace
            .getConfiguration("svn-tree")
            .get<number>("max-log-entries", 200);
        const normalizedFilters = normalizeHistoryFilters(filters);
        const [logPage, currentRevision] = await Promise.all([
            this.svnService.getLog(
                this.rootPath,
                pageSize,
                beforeRevision,
                targetPath,
                normalizedFilters
            ),
            this.getHistoryCurrentRevision(targetPath),
        ]);
        const currentRevisionNumber = toRevisionNumber(currentRevision);

        return {
            entries: markIncomingHistoryEntries(logPage.entries, currentRevisionNumber),
            hasMore: logPage.hasMore,
            currentRevision: currentRevisionNumber,
            nextBeforeRevision: logPage.nextBeforeRevision,
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
        return buildRepositoryUrl(
            this.info.repositoryRoot,
            this.resolveRepositoryPath(absolutePath)
        );
    }

    public resolveRepositoryPath(absolutePath: string): string {
        return resolveRepositoryPathFromWorkingCopy(
            this.rootPath,
            this.info.repositoryRelativePath,
            absolutePath
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

    private async runRepositoryBrowserAction(
        action: NonNullable<RepositoryBrowserQuickPickItem["action"]>,
        repositoryPath: string,
        url: string
    ): Promise<void> {
        switch (action) {
            case "show-history":
                await this.showHistoryForRepositoryPath(repositoryPath);
                return;
            case "show-properties":
                await this.showRepositoryPathProperties(repositoryPath, url);
                return;
            case "copy-url":
                await this.copyValueToClipboard(url, this.i18n.t("copiedRepositoryUrlStatus"));
                return;
            case "copy-path":
                await this.copyValueToClipboard(
                    repositoryPath,
                    this.i18n.t("copiedRepositoryPathStatus")
                );
                return;
            case "switch-here":
                await this.switchWorkingCopyToRepositoryPath(repositoryPath);
                return;
            case "create-branch-from-working-copy":
                await this.createBranchFromWorkingCopyAt(repositoryPath);
                return;
            case "create-tag-from-working-copy":
                await this.createTagFromWorkingCopyAt(repositoryPath);
                return;
            case "delete-reference":
                await this.deleteRepositoryReferenceAt(repositoryPath);
                return;
        }
    }

    private async openRepositoryBrowserFileActions(
        repositoryPath: string,
        url: string
    ): Promise<void> {
        const selection = await vscode.window.showQuickPick(
            buildRepositoryBrowserFileActionItems({
                repositoryPath,
                url,
                strings: {
                    openHistoryActionLabel: this.i18n.t("openHistoryActionLabel"),
                    showPropertiesActionLabel: this.i18n.t("showPropertiesActionLabel"),
                    showBlameActionLabel: this.i18n.t("showBlameActionLabel"),
                    showBlameOutputActionLabel: this.i18n.t("showBlameOutputActionLabel"),
                    copyBlameLineActionLabel: this.i18n.t("copyBlameLineActionLabel"),
                    openFileLabel: this.i18n.t("openFile"),
                    copyRepositoryUrlActionLabel: this.i18n.t("copyRepositoryUrlActionLabel"),
                    copyRepositoryPathActionLabel: this.i18n.t("copyRepositoryPathActionLabel"),
                },
            }),
            {
                title: this.i18n.t("repositoryBrowserActionLabel"),
                placeHolder: this.i18n.t("repositoryBrowserFileActionsPlaceholder", {
                    path: repositoryPath,
                }),
            }
        );

        if (!selection) {
            return;
        }

        switch (selection.action) {
            case "show-history":
                await this.showHistoryForRepositoryPath(repositoryPath);
                return;
            case "show-properties":
                await this.showRepositoryPathProperties(repositoryPath, url);
                return;
            case "show-blame":
                await this.showBlameForRepositoryPath(repositoryPath, url);
                return;
            case "show-blame-output":
                await this.showBlameForRepositoryPath(repositoryPath, url, "output");
                return;
            case "copy-blame-line":
                await this.copyBlameLineMetadata(
                    repositoryPath,
                    url,
                    getWorkingCopyPathForRepositoryPath(
                        this.rootPath,
                        this.info.repositoryRelativePath,
                        repositoryPath
                    )
                );
                return;
            case "open-file":
                await this.openBlameWorkingCopyFile(
                    getWorkingCopyPathForRepositoryPath(
                        this.rootPath,
                        this.info.repositoryRelativePath,
                        repositoryPath
                    ),
                    repositoryPath
                );
                return;
            case "copy-url":
                await this.copyValueToClipboard(url, this.i18n.t("copiedRepositoryUrlStatus"));
                return;
            case "copy-path":
                await this.copyValueToClipboard(
                    repositoryPath,
                    this.i18n.t("copiedRepositoryPathStatus")
                );
                return;
        }
    }

    public async showRepositoryPathProperties(
        repositoryPath: string,
        url: string
    ): Promise<void> {
        const properties = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: this.i18n.t("showPropertiesProgress", {
                    path: repositoryPath,
                }),
            },
            async () => this.svnService.getProperties(url)
        );

        this.writePropertiesToOutput({
            displayPath: repositoryPath,
            repositoryPath,
            url,
            properties,
        });
    }

    public async showBlameForRepositoryPath(
        repositoryPath: string,
        url: string,
        displayMode: BlameDisplayMode = "text"
    ): Promise<void> {
        const blameOutput = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: this.i18n.t("showBlameProgress", { path: repositoryPath }),
            },
            async () => this.svnService.blameTarget(url)
        );

        await this.presentBlameResult(
            {
                displayPath: repositoryPath,
                repositoryPath,
                url,
                blameOutput,
                workingCopyPath: getWorkingCopyPathForRepositoryPath(
                    this.rootPath,
                    this.info.repositoryRelativePath,
                    repositoryPath
                ),
            },
            displayMode
        );
    }

    public async acceptBase(paths: string[]): Promise<void> {
        await this.acceptConflictVersion(paths, "base");
    }

    public async acceptMineConflict(paths: string[]): Promise<void> {
        await this.acceptConflictVersion(paths, "mine-conflict");
    }

    public async acceptTheirsConflict(paths: string[]): Promise<void> {
        await this.acceptConflictVersion(paths, "theirs-conflict");
    }

    public async postponeConflicts(paths: string[]): Promise<void> {
        await this.acceptConflictVersion(paths, "postpone");
    }

    private async switchWorkingCopyToRepositoryPath(repositoryPath: string): Promise<void> {
        const targetUrl = buildRepositoryUrl(this.info.repositoryRoot, repositoryPath);

        await this.runRepositoryOperation(
            "switch",
            this.i18n.t("switchWorkingCopyProgress", {
                label: this.label,
                target: repositoryPath,
            }),
            this.i18n.t("switchedWorkingCopyCompleted", {
                label: this.label,
                target: repositoryPath,
            }),
            async () => {
                await this.svnService.switch(this.rootPath, targetUrl);
                await this.refreshWorkingCopyInfo();
                await this.refresh({ forceRemote: true, allowWhileBusy: true });
                await this.historyPanel.refresh(this);
            }
        );
    }

    private async presentBlameResult(
        options: {
            displayPath: string;
            repositoryPath: string;
            url: string;
            blameOutput: string;
            workingCopyPath?: string;
        },
        displayMode: BlameDisplayMode
    ): Promise<void> {
        if (displayMode === "output") {
            this.writeBlameToOutput(options);
        } else {
            await this.openBlameDocument(options);
        }

        const actions = [this.i18n.t("copyBlameLineActionLabel")];
        if (displayMode === "output") {
            actions.unshift(this.i18n.t("showBlameTextActionLabel"));
        } else {
            actions.unshift(this.i18n.t("showBlameOutputActionLabel"));
        }

        if (options.workingCopyPath) {
            actions.push(this.i18n.t("openFile"));
        }

        const selection = await vscode.window.showInformationMessage(
            this.i18n.t("openedBlameStatus"),
            ...actions
        );

        if (!selection) {
            return;
        }

        if (selection === this.i18n.t("copyBlameLineActionLabel")) {
            await this.copyBlameLineMetadata(
                options.displayPath,
                options.url,
                options.workingCopyPath,
                options.blameOutput
            );
            return;
        }

        if (selection === this.i18n.t("openFile")) {
            await this.openBlameWorkingCopyFile(options.workingCopyPath, options.displayPath);
            return;
        }

        if (selection === this.i18n.t("showBlameOutputActionLabel")) {
            this.writeBlameToOutput(options);
            return;
        }

        if (selection === this.i18n.t("showBlameTextActionLabel")) {
            await this.openBlameDocument(options);
        }
    }

    private async openBlameDocument(options: {
        displayPath: string;
        repositoryPath: string;
        url: string;
        blameOutput: string;
        workingCopyPath?: string;
    }): Promise<void> {
        const document = await vscode.workspace.openTextDocument({
            language: "plaintext",
            content: [
                `${this.i18n.t("infoPathLabel")}: ${options.displayPath}`,
                `${this.i18n.t("infoRepositoryPathLabel")}: ${options.repositoryPath}`,
                `${this.i18n.t("infoUrlLabel")}: ${options.url}`,
                "",
                options.blameOutput,
            ].join("\n"),
        });
        await vscode.window.showTextDocument(document, {
            preview: true,
            viewColumn: vscode.ViewColumn.Active,
        });
        void vscode.window.setStatusBarMessage(this.i18n.t("openedBlameStatus"), 2000);
    }

    private writeBlameToOutput(options: {
        displayPath: string;
        repositoryPath: string;
        url: string;
        blameOutput: string;
    }): void {
        this.writeOutputSection(
            this.i18n.t("showBlameOutputHeader", { path: options.displayPath }),
            [
                `${this.i18n.t("infoPathLabel")}: ${options.displayPath}`,
                `${this.i18n.t("infoRepositoryPathLabel")}: ${options.repositoryPath}`,
                `${this.i18n.t("infoUrlLabel")}: ${options.url}`,
                "",
                options.blameOutput,
            ],
            this.i18n.t("openedBlameStatus")
        );
    }

    private writePropertiesToOutput(options: {
        displayPath: string;
        repositoryPath: string;
        url: string;
        properties: SvnPropertyEntry[];
    }): void {
        this.writeOutputSection(
            this.i18n.t("showPropertiesOutputHeader", {
                path: options.displayPath,
            }),
            [
                `${this.i18n.t("infoPathLabel")}: ${options.displayPath}`,
                `${this.i18n.t("infoRepositoryPathLabel")}: ${options.repositoryPath}`,
                `${this.i18n.t("infoUrlLabel")}: ${options.url}`,
                "",
                `${this.i18n.t("propertiesHeaderLabel")}:`,
                ...formatPropertyEntries(
                    options.properties,
                    this.i18n.t("noPropertiesFoundLabel")
                ),
            ],
            this.i18n.t("openedPropertiesStatus")
        );
    }

    private writeOutputSection(header: string, lines: string[], statusMessage: string): void {
        this.outputChannel.appendLine("");
        const headerLine = `=== ${header} ===`;
        this.outputChannel.appendLine(headerLine);
        for (const line of lines) {
            this.outputChannel.appendLine(line);
        }
        this.outputChannel.appendLine("=".repeat(headerLine.length));
        this.outputChannel.show(true);
        void vscode.window.setStatusBarMessage(statusMessage, 2000);
    }

    private async copyBlameLineMetadata(
        displayPath: string,
        url: string,
        workingCopyPath?: string,
        blameOutput?: string
    ): Promise<void> {
        const resolvedBlameOutput =
            blameOutput ??
            (await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: this.i18n.t("showBlameProgress", { path: displayPath }),
                },
                async () =>
                    workingCopyPath
                        ? this.svnService.blame(this.rootPath, workingCopyPath)
                        : this.svnService.blameTarget(url)
            ));
        const parsedLines = parseBlameLines(resolvedBlameOutput);
        if (parsedLines.length === 0) {
            return;
        }

        const selectedLine = await vscode.window.showQuickPick(
            parsedLines.map((line) => ({
                label: this.i18n.t("blameLineLabel", {
                    line: line.lineNumber,
                    revision: line.revision,
                    author: line.author,
                }),
                detail: line.content || line.raw,
                blameLine: line,
            })),
            {
                title: this.i18n.t("showBlameActionLabel"),
                placeHolder: this.i18n.t("blameLinePlaceholder", {
                    path: displayPath,
                }),
            }
        );

        if (!selectedLine) {
            return;
        }

        const metadataSelection = await vscode.window.showQuickPick(
            [
                {
                    label: this.i18n.t("copyBlameRevisionActionLabel"),
                    description: selectedLine.blameLine.revision,
                    value: "revision" as const,
                },
                {
                    label: this.i18n.t("copyBlameAuthorActionLabel"),
                    description: selectedLine.blameLine.author,
                    value: "author" as const,
                },
            ],
            {
                title: this.i18n.t("showBlameActionLabel"),
                placeHolder: this.i18n.t("copyBlameLineMetadataPlaceholder", {
                    line: selectedLine.blameLine.lineNumber,
                }),
            }
        );

        if (!metadataSelection) {
            return;
        }

        if (metadataSelection.value === "revision") {
            await this.copyValueToClipboard(
                selectedLine.blameLine.revision,
                this.i18n.t("copiedBlameRevisionStatus", {
                    line: selectedLine.blameLine.lineNumber,
                })
            );
            return;
        }

        await this.copyValueToClipboard(
            selectedLine.blameLine.author,
            this.i18n.t("copiedBlameAuthorStatus", {
                line: selectedLine.blameLine.lineNumber,
            })
        );
    }

    private async openBlameWorkingCopyFile(
        workingCopyPath: string | undefined,
        displayPath: string
    ): Promise<void> {
        if (!workingCopyPath || !(await this.pathExists(workingCopyPath))) {
            void vscode.window.showWarningMessage(
                this.i18n.t("cannotMapPathWarning", { path: displayPath })
            );
            return;
        }

        await vscode.window.showTextDocument(vscode.Uri.file(workingCopyPath), {
            preview: true,
        });
    }

    private async copyValueToClipboard(value: string, statusMessage: string): Promise<void> {
        await vscode.env.clipboard.writeText(value);
        void vscode.window.setStatusBarMessage(statusMessage, 2000);
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
        const absolutePath = getWorkingCopyPathForRepositoryPath(
            this.rootPath,
            this.info.repositoryRelativePath,
            change.path
        );
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

    private async transferRepositoryRevision(
        operation: RepositoryRevisionTransferOperation,
        revision: number
    ): Promise<void> {
        const destinationPath = await this.promptRevisionDestination(operation, revision);
        if (!destinationPath) {
            return;
        }

        const { progressKey, completedKey } = repositoryRevisionTransferMessages[operation];
        const repositoryUrl = this.resolveRepositoryUrl(this.rootPath);
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: this.i18n.t(progressKey, { revision }),
            },
            async () => {
                if (operation === "checkout") {
                    await this.svnService.checkout(
                        repositoryUrl,
                        String(revision),
                        destinationPath
                    );
                    return;
                }

                await this.svnService.export(
                    repositoryUrl,
                    String(revision),
                    destinationPath
                );
            }
        );

        await this.revealCreatedPath(
            destinationPath,
            this.i18n.t(completedKey, {
                revision,
                destination: destinationPath,
            })
        );
    }

    private describeHistoryChangeAction(action: SvnLogPathChange["action"]): string {
        return this.i18n.formatHistoryAction(action);
    }

    private getReferenceKindLabel(kind: RepositoryReferenceKind): string {
        return kind === "branch" ? this.i18n.t("branchKind") : this.i18n.t("tagKind");
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
        operation: RepositoryRevisionTransferOperation,
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

    private async promptHistoryFileExportDestination(
        repositoryPath: string,
        revision: number
    ): Promise<string | undefined> {
        const workingCopyPath = getWorkingCopyPathForRepositoryPath(
            this.rootPath,
            this.info.repositoryRelativePath,
            repositoryPath
        );
        const candidateParentPath = workingCopyPath
            ? nodePath.dirname(workingCopyPath)
            : this.rootPath;
        const defaultParentPath =
            (await this.getNearestExistingPath(candidateParentPath)) ?? this.rootPath;
        const destinationUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(
                nodePath.join(
                    defaultParentPath,
                    buildHistoryFileExportName(repositoryPath, revision)
                )
            ),
            saveLabel: this.i18n.t("exportFileSaveLabel"),
            title: this.i18n.t("selectFileExportTitle", {
                path: repositoryPath,
                revision,
            }),
        });
        if (!destinationUri) {
            return undefined;
        }

        const destinationPath = destinationUri.fsPath;
        if (await this.pathExists(destinationPath)) {
            void vscode.window.showWarningMessage(
                this.i18n.t("destinationExistsWarning", {
                    destination: destinationPath,
                })
            );
            return undefined;
        }

        return destinationPath;
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

    private getRevisionGraphRootPath(repositoryPath: string): string {
        const referencePath = getRepositoryReferenceRoot(repositoryPath);
        if (!referencePath) {
            return normalizeRepositoryPath(repositoryPath);
        }

        return getReferenceLayoutRoot(referencePath);
    }

    private getRevisionGraphEntryLimit(): number {
        const configuredPageSize = vscode.workspace
            .getConfiguration("svn-tree")
            .get<number>("max-log-entries", 200);
        return Math.min(
            revisionGraphMaxEntryCount,
            Math.max(
                revisionGraphMinEntryCount,
                Math.floor(configuredPageSize * revisionGraphEntryMultiplier)
            )
        );
    }

    private async loadRevisionGraphEntries(
        graphRootPath: string
    ): Promise<{ entries: SvnLogEntry[]; truncated: boolean }> {
        const target = buildRepositoryUrl(this.info.repositoryRoot, graphRootPath);
        const entries: SvnLogEntry[] = [];
        const entryLimit = this.getRevisionGraphEntryLimit();
        const pageSize = Math.min(
            entryLimit,
            vscode.workspace.getConfiguration("svn-tree").get<number>("max-log-entries", 200)
        );

        let beforeRevision: number | undefined;
        let hasMore = true;

        while (entries.length < entryLimit && hasMore) {
            const remaining = entryLimit - entries.length;
            const page = await this.svnService.getLog(
                this.rootPath,
                Math.min(pageSize, remaining),
                beforeRevision,
                target
            );

            if (page.entries.length === 0) {
                hasMore = false;
                break;
            }

            entries.push(...page.entries);
            hasMore = page.hasMore;
            beforeRevision = page.nextBeforeRevision;
        }

        return {
            entries,
            truncated: hasMore,
        };
    }

    private updateStatusBarCommands(remoteCount: number): void {
        const countSuffix = remoteCount > 0 ? ` ${remoteCount}` : "";
        const activeOperation = this.activeOperation;
        const hasActiveOperation = activeOperation !== undefined;
        const showSpinner = hasActiveOperation || this.isRefreshingRemoteCount;
        const updateIcon = showSpinner ? "loading~spin" : "cloud-download";
        const updateTitle = showSpinner ? "$(loading~spin)" : `$(${updateIcon})${countSuffix}`;
        const updateTooltip = hasActiveOperation
            ? this.i18n.t(repositoryUiOperationMessages[activeOperation].progressTooltipKey)
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

    private async runRepositoryOperation(
        operation: RepositoryUiOperation,
        progressTitle: string,
        completedMessage: string,
        action: () => Promise<void>
    ): Promise<void> {
        if (this.activeOperation) {
            void vscode.window.showInformationMessage(
                this.i18n.t("operationAlreadyRunning", {
                    action: this.i18n.t(
                        repositoryUiOperationMessages[this.activeOperation].actionLabelKey
                    ),
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
            await this.runPendingRefresh();
        }
    }

    private queueRefresh(options: RefreshOptions): void {
        this.pendingRefreshOptions = this.mergeRefreshOptions(this.pendingRefreshOptions, options);
    }

    private async runPendingRefresh(): Promise<void> {
        const pendingOptions = this.pendingRefreshOptions;
        if (!pendingOptions) {
            return;
        }

        if (
            !pendingOptions.allowWhileBusy &&
            this.activeOperation !== undefined &&
            this.activeOperation !== "refresh"
        ) {
            return;
        }

        this.pendingRefreshOptions = undefined;
        await this.refresh(pendingOptions);
    }

    private mergeRefreshOptions(
        currentOptions: RefreshOptions | undefined,
        nextOptions: RefreshOptions
    ): RefreshOptions {
        return {
            forceRemote:
                (currentOptions?.forceRemote ?? false) || (nextOptions.forceRemote ?? false),
            allowWhileBusy:
                (currentOptions?.allowWhileBusy ?? false) ||
                (nextOptions.allowWhileBusy ?? false),
        };
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

    private async createRepositoryReferenceFromWorkingCopy(
        kind: RepositoryReferenceKind,
        destinationPath?: string,
        suggestedRepositoryPath?: string
    ): Promise<void> {
        const resolvedDestinationPath =
            destinationPath ??
            (await this.promptReferenceDestinationFromWorkingCopy(
                kind,
                suggestedRepositoryPath
            ));
        if (!resolvedDestinationPath) {
            return;
        }

        const confirmed = await this.confirmCreateReferenceFromWorkingCopy(
            kind,
            resolvedDestinationPath
        );
        if (!confirmed) {
            return;
        }

        const kindLabel = this.getReferenceKindLabel(kind);
        const message = this.i18n.t("createReferenceFromWorkingCopyCommitMessage", {
            kind: kindLabel,
            destination: resolvedDestinationPath,
        });
        const destinationUrl = buildRepositoryUrl(
            this.info.repositoryRoot,
            resolvedDestinationPath
        );

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: this.i18n.t("createReferenceFromWorkingCopyProgress", {
                    kind: kindLabel,
                }),
            },
            async () => {
                await this.svnService.copy(this.rootPath, destinationUrl, message);
            }
        );

        await this.historyPanel.refresh(this);
        const selection = await vscode.window.showInformationMessage(
            this.i18n.t("createdReferenceFromWorkingCopyMessage", {
                kind: kindLabel,
                destination: resolvedDestinationPath,
            }),
            this.i18n.t("copyPathButton")
        );
        if (selection === this.i18n.t("copyPathButton")) {
            await vscode.env.clipboard.writeText(resolvedDestinationPath);
            void vscode.window.setStatusBarMessage(
                this.i18n.t("copiedReferencePathStatus", {
                    kind: kindLabel,
                    destination: resolvedDestinationPath,
                }),
                2000
            );
        }
    }

    private async confirmCreateReferenceFromWorkingCopy(
        kind: RepositoryReferenceKind,
        destinationPath: string
    ): Promise<boolean> {
        const kindLabel = this.getReferenceKindLabel(kind);
        const detailLines = [
            this.i18n.t("createReferenceFromWorkingCopyDetail", {
                kind: kindLabel,
                destination: destinationPath,
            }),
        ];

        if (this.hasLocalChanges()) {
            detailLines.push(this.i18n.t("createReferenceFromWorkingCopyWithLocalChangesDetail"));
        }

        const selection = await vscode.window.showWarningMessage(
            this.i18n.t("createReferenceFromWorkingCopyQuestion", {
                kind: kindLabel,
                destination: destinationPath,
            }),
            {
                modal: true,
                detail: detailLines.join("\n"),
            },
            this.i18n.t("continueButton")
        );

        return selection === this.i18n.t("continueButton");
    }

    private async promptReferenceDestination(
        kind: RepositoryReferenceKind,
        revision: number
    ): Promise<string | undefined> {
        const locationPath = getReferenceLocationPath(
            this.info.repositoryRelativePath,
            kind
        );
        const kindLabel = this.getReferenceKindLabel(kind);
        const referencePath = await vscode.window.showInputBox({
            prompt: this.i18n.t("newReferencePathPrompt", {
                kind: kindLabel,
                location: locationPath,
                revision,
            }),
            value: getReferenceNameSuggestion(this.info.repositoryRelativePath, revision),
            validateInput: (value) => this.validateReferenceNameInput(kind, locationPath, value),
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

    private async promptReferenceDestinationFromWorkingCopy(
        kind: RepositoryReferenceKind,
        suggestedRepositoryPath?: string
    ): Promise<string | undefined> {
        const locationPath = getReferenceLocationPath(
            this.info.repositoryRelativePath,
            kind
        );
        const kindLabel = this.getReferenceKindLabel(kind);
        const defaultValue =
            getReferenceNameSuggestionForRepositoryPath(
                this.info.repositoryRelativePath,
                kind,
                suggestedRepositoryPath
            ) ??
            getCommitTargetLabel(this.info.repositoryRelativePath).replace(/^trunk$/, this.label);
        const referencePath = await vscode.window.showInputBox({
            prompt: this.i18n.t("newReferencePathFromWorkingCopyPrompt", {
                kind: kindLabel,
                location: locationPath,
            }),
            value: defaultValue,
            validateInput: (value) => this.validateReferenceNameInput(kind, locationPath, value),
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

    private validateReferenceNameInput(
        kind: RepositoryReferenceKind,
        locationPath: string,
        value: string
    ): string | undefined {
        const validationError = getReferenceNameValidationError(value);
        switch (validationError) {
            case "required":
                return kind === "branch"
                    ? this.i18n.t("branchNameRequired")
                    : this.i18n.t("tagNameRequired");
            case "absolute-path":
                return this.i18n.t("relativePathRequired", {
                    location: locationPath,
                });
            case "empty-segment":
                return this.i18n.t("avoidEmptySegments");
            default:
                return undefined;
        }
    }

    private async promptDeleteReferenceTarget(): Promise<
        { display: string; url: string; repositoryPath: string } | undefined
    > {
        const switchTarget = await vscode.window.showInputBox({
            title: this.i18n.t("deleteReferenceActionLabel"),
            prompt: this.i18n.t("deleteReferencePrompt", {
                layoutRoot: getReferenceLayoutRoot(this.info.repositoryRelativePath),
            }),
            placeHolder: this.i18n.t("deleteReferencePlaceholder"),
            value: getCurrentReferenceSuggestion(this.info.repositoryRelativePath) ?? "",
            validateInput: (value) => this.validateDeleteReferenceTarget(value),
        });
        const trimmedTarget = switchTarget?.trim();
        if (!trimmedTarget) {
            return undefined;
        }

        return resolveDeleteReferenceTarget({
            target: trimmedTarget,
            repositoryRoot: this.info.repositoryRoot,
            repositoryRelativePath: this.info.repositoryRelativePath,
        });
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

        return resolveSwitchTarget({
            target: trimmedTarget,
            repositoryRoot: this.info.repositoryRoot,
            repositoryRelativePath: this.info.repositoryRelativePath,
        });
    }

    private async promptPropertyName(): Promise<string | undefined> {
        const selection = await vscode.window.showQuickPick<PropertyNameQuickPickItem>(
            [
                ...builtinPropertyNameDefinitions.map((definition) => ({
                    label: definition.name,
                    description: this.i18n.t(definition.descriptionKey),
                    propertyName: definition.name,
                })),
                {
                    label: this.i18n.t("customPropertyNameLabel"),
                    description: this.i18n.t("customPropertyNameDescription"),
                    propertyName: "",
                    custom: true,
                },
            ],
            {
                placeHolder: this.i18n.t("propertyNamePlaceholder"),
            }
        );

        if (!selection) {
            return undefined;
        }

        if (!selection.custom) {
            return selection.propertyName;
        }

        const customName = await vscode.window.showInputBox({
            title: this.i18n.t("editPropertyActionLabel"),
            prompt: this.i18n.t("propertyNamePrompt"),
            placeHolder: this.i18n.t("propertyNamePlaceholder"),
            validateInput: (value) =>
                value.trim() ? undefined : this.i18n.t("propertyNameRequired"),
        });

        return customName?.trim() || undefined;
    }

    private async promptPropertyAction(
        propertyName: string,
        currentValue: string | undefined
    ): Promise<"set" | "delete" | undefined> {
        const selection = await vscode.window.showQuickPick<PropertyActionQuickPickItem>(
            currentValue === undefined
                ? [
                      {
                          label: this.i18n.t("propertySetActionLabel"),
                          description: propertyName,
                          action: "set",
                      },
                  ]
                : [
                      {
                          label: this.i18n.t("propertySetActionLabel"),
                          description: propertyName,
                          detail: this.i18n.t("propertyCurrentValueDetail", {
                              value: encodePropertyValue(currentValue),
                          }),
                          action: "set",
                      },
                      {
                          label: this.i18n.t("propertyDeleteActionLabel"),
                          description: propertyName,
                          action: "delete",
                      },
                  ],
            {
                placeHolder: this.i18n.t("propertyActionPlaceholder", {
                    name: propertyName,
                }),
            }
        );

        return selection?.action;
    }

    private async promptPropertyValue(
        propertyName: string,
        currentValue: string | undefined
    ): Promise<string | undefined> {
        const value = await vscode.window.showInputBox({
            title: this.i18n.t("editPropertyActionLabel"),
            prompt: this.i18n.t("propertyValuePrompt", {
                name: propertyName,
            }),
            placeHolder: this.i18n.t("propertyValuePlaceholder"),
            value: encodePropertyValue(currentValue ?? ""),
            validateInput: (input) =>
                input.trim() ? undefined : this.i18n.t("propertyValueRequired"),
        });

        if (value === undefined) {
            return undefined;
        }

        return decodePropertyValue(value.trim());
    }

    private async confirmDeleteRepositoryReference(displayTarget: string): Promise<boolean> {
        const selection = await vscode.window.showWarningMessage(
            this.i18n.t("deleteReferenceQuestion", { target: displayTarget }),
            {
                modal: true,
                detail: this.i18n.t("deleteReferenceDetail", { target: displayTarget }),
            },
            this.i18n.t("continueButton")
        );

        return selection === this.i18n.t("continueButton");
    }

    private validateDeleteReferenceTarget(value: string): string | undefined {
        const trimmedValue = value.trim();
        if (!trimmedValue) {
            return this.i18n.t("deleteReferenceRequired");
        }

        if (
            !resolveDeleteReferenceTarget({
                target: trimmedValue,
                repositoryRoot: this.info.repositoryRoot,
                repositoryRelativePath: this.info.repositoryRelativePath,
            })
        ) {
            return this.i18n.t("deleteReferenceInvalid");
        }

        return undefined;
    }

    private async promptRelocateTargetUrl(): Promise<string | undefined> {
        const targetUrl = await vscode.window.showInputBox({
            title: this.i18n.t("relocateWorkingCopyActionLabel"),
            prompt: this.i18n.t("relocateWorkingCopyPrompt", {
                label: this.label,
            }),
            placeHolder: this.i18n.t("relocateWorkingCopyPlaceholder"),
            value: this.info.url,
            validateInput: (value) => {
                const trimmedValue = value.trim();
                if (!trimmedValue) {
                    return this.i18n.t("relocateWorkingCopyRequired");
                }

                try {
                    new URL(trimmedValue);
                    return undefined;
                } catch {
                    return this.i18n.t("relocateWorkingCopyInvalid");
                }
            },
        });

        return targetUrl?.trim() || undefined;
    }

    private validateSwitchTarget(value: string): string | undefined {
        const validationError = getSwitchTargetValidationError(value);
        switch (validationError) {
            case "required":
                return this.i18n.t("switchTargetRequired");
            case "invalid-path":
                return this.i18n.t("switchTargetInvalid");
            default:
                return undefined;
        }
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
        accept: SelectableConflictResolutionMode
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

        const { progressKey, completedKey } = conflictResolutionMessages[accept];

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
        mode: ConflictResolutionMode,
        itemLabel: string
    ): Promise<boolean> {
        const messageKey =
            mode === "working"
                ? "markResolvedQuestion"
                : conflictResolutionMessages[mode].questionKey;
        const detailLines = [
            mode === "working"
                ? this.i18n.t("markResolvedDetail")
                : this.i18n.t(conflictResolutionMessages[mode].detailKey),
            this.i18n.t("workingCopyOnlyDetail"),
        ];

        const selection = await vscode.window.showWarningMessage(
            this.i18n.t(messageKey, { items: itemLabel }),
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
