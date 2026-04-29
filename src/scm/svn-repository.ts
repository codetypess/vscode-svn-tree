import * as nodePath from "node:path";
import * as vscode from "vscode";
import {
    markIncomingHistoryEntries,
    normalizeHistoryFilters,
    toRevisionNumber,
} from "../history/history-utils";
import { HistoryPanel } from "../history/history-panel";
import { RepositoryBrowserPanel } from "../repository-browser/repository-browser-panel";
import type { RepositoryBrowserDataPayload } from "../repository-browser/repository-browser-types";
import {
    buildRevisionGraph,
    buildRevisionGraphSummary,
    getRevisionGraphLayoutRoot,
    getRevisionGraphReferenceRoot,
    getRevisionGraphTargetLabel,
    hasInvalidRevisionGraphFilters,
    normalizeRevisionGraphFilters,
    normalizeRevisionGraphLayoutConfig,
    parseRevisionGraphMergeInfo,
    type RevisionGraphNodeMetadata,
} from "../revision-graph/revision-graph-utils";
import { RevisionGraphPanel } from "../revision-graph/revision-graph-panel";
import type {
    RevisionGraphData,
    RevisionGraphLayoutConfig,
    RevisionGraphQuery,
} from "../revision-graph/revision-graph-types";
import { SvnContentProvider } from "../svn/svn-content-provider";
import { SvnService } from "../svn/svn-service";
import type {
    SvnHistoryFilters,
    SvnLogEntry,
    SvnLogPage,
    SvnLogPathChange,
    SvnNodeKind,
    SvnNodeInfo,
    SvnPropertyEntry,
    SvnStatusEntry,
    SvnWorkingCopyInfo,
} from "../svn/svn-types";
import type { MessageKey } from "../i18n";
import { getI18n } from "../vscode-i18n";
import { appendOutputSection, buildErrorOutputLines } from "./output-channel-utils";
import { parseBlameLines } from "./svn-blame-utils";
import { isCommittableStatus } from "./commit-utils";
import {
    IgnoreEditorPanelState,
    SvnIgnoreEditorPanel,
} from "./svn-ignore-editor-panel";
import {
    getSuggestedIgnoreEntry,
    parseIgnoreEntries,
    normalizeIgnoreEditorValue,
} from "./svn-ignore-utils";
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
    buildRepositoryBrowserViewModel,
    getRepositoryBrowserMutationTargetValidationError,
    getRepositoryBrowserPathValidationError,
    getParentRepositoryPath,
    resolveRepositoryBrowserChildPath,
    resolveRepositoryBrowserSiblingOrAbsolutePath,
    type RepositoryBrowserAction,
    type RepositoryBrowserEntryAction,
    type RepositoryBrowserFileAction,
    type RepositoryBrowserPathInputMode,
} from "./svn-repository-browser";
import {
    buildRevisionGraphStatusMetadata,
    enrichRevisionGraphHoverState,
    formatRevisionGraphChangedPaths,
    mapRevisionGraphTargetPath,
} from "./svn-repository-revision-graph-state";
import {
    builtinPropertyNameDefinitions,
    decodePropertyValue,
    encodePropertyValue,
} from "./svn-property-utils";
import {
    buildBlameOutputLines,
    buildBlamePreviewContent,
    buildPropertyOutputLines,
} from "./svn-output-formatters";
import { partitionStatusEntries } from "./svn-repository-status-utils";
import { ScmResource } from "./scm-resource";
import { deriveCheckoutDestinationName } from "./svn-checkout-utils";
import {
    buildHistoryFileExportName,
    buildReferenceDestinationPath,
    buildRepositoryUrl,
    getCommitTargetLabel,
    getReferenceLayoutRoot,
    getReferenceNameSuggestion,
    getRepositoryReferenceDisplay,
    getWorkingCopyPathForRepositoryPath,
    getWorkingCopyRelativePathForRepositoryPath,
    isSameOrChildWorkingCopyPath,
    isUrlTarget,
    normalizeRepositoryPath,
    RepositoryReferenceKind,
    resolveRepositoryPathFromWorkingCopy,
} from "./svn-repository-paths";

interface RefreshOptions {
    forceRemote?: boolean;
    allowWhileBusy?: boolean;
}

interface RepositoryMutationFinalizationOptions {
    readonly invalidateRevisionGraphCaches?: boolean;
    readonly clearCommitInput?: boolean;
    readonly refresh?: boolean;
    readonly refreshOptions?: RefreshOptions;
    readonly refreshWorkingCopyInfo?: boolean;
    readonly refreshHistory?: boolean;
}

interface ResolvedWorkingCopyNodeTarget {
    readonly targetPath: string;
    readonly displayPath: string;
    readonly targetInfo: SvnNodeInfo;
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

type MergeWizardMode =
    | "merge-revision"
    | "merge-range"
    | "reverse-merge-revision"
    | "reverse-merge-to-revision";

interface MergeModeQuickPickItem extends vscode.QuickPickItem {
    readonly mode: MergeWizardMode;
}

interface MergeExecutionQuickPickItem extends vscode.QuickPickItem {
    readonly dryRun: boolean;
}

interface MergeWizardRequest {
    readonly mode: MergeWizardMode;
    readonly sourceDisplay: string;
    readonly sourceUrl: string;
    readonly dryRun: boolean;
    readonly revision?: number;
    readonly fromRevision?: number;
    readonly toRevision?: number;
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
    | "merge"
    | "cleanup"
    | "resolve"
    | "switch"
    | "rename"
    | "lock"
    | "unlock";
type RepositoryRevisionTransferOperation = "checkout" | "export";

const revisionGraphMinEntryCount = 300;
const revisionGraphMaxEntryCount = 5000;
const revisionGraphEntryMultiplier = 3;

interface RevisionGraphEntryCache {
    readonly key: string;
    readonly target: string;
    readonly historyFilters: SvnHistoryFilters;
    entries: SvnLogEntry[];
    nextBeforeRevision?: number;
    exhausted: boolean;
}

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
    merge: {
        progressTooltipKey: "mergeWorkingCopyRunningTooltip",
        actionLabelKey: "mergeWorkingCopyActionLabel",
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
    private readonly revisionGraphEntryCaches = new Map<string, RevisionGraphEntryCache>();
    private readonly revisionGraphNodeMetadataCache = new Map<
        string,
        RevisionGraphNodeMetadata
    >();
    private readonly ignoreEditorPanel = new SvnIgnoreEditorPanel();

    public constructor(
        public readonly info: SvnWorkingCopyInfo,
        private readonly svnService: SvnService,
        private readonly historyPanel: HistoryPanel,
        private readonly repositoryBrowserPanel: RepositoryBrowserPanel,
        private readonly revisionGraphPanel: RevisionGraphPanel,
        private readonly contentProvider: SvnContentProvider,
        private readonly outputChannel: vscode.OutputChannel
    ) {
        const i18n = getI18n();
        this.sourceControl = vscode.scm.createSourceControl(
            "svn-tree",
            `SVN: ${nodePath.basename(info.rootPath)}`,
            vscode.Uri.file(info.rootPath)
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
        return this.info.rootPath;
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
        this.ignoreEditorPanel.dispose();
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
            const partitionedStatuses = partitionStatusEntries(statuses, includeRemote);
            const changeResources = partitionedStatuses.changeStatuses.map(
                (status) => new ScmResource(this, status, "change")
            );
            const conflictArtifactResources =
                partitionedStatuses.conflictArtifactStatuses.map(
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
            const unversionedResources = partitionedStatuses.unversionedStatuses.map(
                (status) => new ScmResource(this, status, "change")
            );
            const remoteResources = includeRemote
                ? partitionedStatuses.remoteStatuses.map(
                      (status) => new ScmResource(this, status, "remote-change")
                  )
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
            await this.revisionGraphPanel.refresh(this);
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

    private clearCommitInput(): void {
        this.sourceControl.inputBox.value = "";
    }

    private async finalizeRepositoryMutation(
        options: RepositoryMutationFinalizationOptions = {}
    ): Promise<void> {
        if (options.invalidateRevisionGraphCaches) {
            this.invalidateRevisionGraphCaches();
        }

        if (options.clearCommitInput) {
            this.clearCommitInput();
        }

        if (options.refreshWorkingCopyInfo) {
            await this.refreshWorkingCopyInfo();
        }

        if (options.refresh || options.refreshOptions) {
            await this.refresh(options.refreshOptions);
        }

        if (options.refreshHistory) {
            await this.historyPanel.refresh(this);
        }
    }

    private async runNotificationProgress<T>(
        title: string,
        action: () => Promise<T>
    ): Promise<T> {
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title,
            },
            action
        );
    }

    private async offerReferencePathCopy(
        kindLabel: string,
        destinationPath: string,
        message: string
    ): Promise<void> {
        const copyPathButton = this.i18n.t("copyPathButton");
        const selection = await vscode.window.showInformationMessage(message, copyPathButton);
        if (selection !== copyPathButton) {
            return;
        }

        await vscode.env.clipboard.writeText(destinationPath);
        void vscode.window.setStatusBarMessage(
            this.i18n.t("copiedReferencePathStatus", {
                kind: kindLabel,
                destination: destinationPath,
            }),
            2000
        );
    }

    private async resolveWorkingCopyNodeTarget(
        target: vscode.Uri | string
    ): Promise<ResolvedWorkingCopyNodeTarget> {
        const targetPath = typeof target === "string" ? target : target.fsPath;
        const displayPath =
            nodePath.relative(this.rootPath, targetPath).replace(/\\/g, "/") ||
            nodePath.basename(targetPath);
        const targetInfo = await this.svnService.getNodeInfo(targetPath);
        if (!targetInfo) {
            throw new Error(this.i18n.t("noSvnInfoForPathError", { path: displayPath }));
        }

        return {
            targetPath,
            displayPath,
            targetInfo,
        };
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
        await this.finalizeRepositoryMutation({
            invalidateRevisionGraphCaches: true,
            clearCommitInput: true,
            refreshOptions: { forceRemote: true },
            refreshHistory: true,
        });
    }

    public async update(paths?: string[]): Promise<void> {
        await this.runRepositoryOperation(
            "update",
            this.i18n.t("updateWorkingCopyProgress", { label: this.label }),
            this.i18n.t("updateWorkingCopyCompleted", { label: this.label }),
            async () => {
                await this.svnService.update(this.rootPath, paths);
                await this.finalizeRepositoryMutation({
                    refreshOptions: { forceRemote: true, allowWhileBusy: true },
                    refreshHistory: true,
                });
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
        await this.finalizeRepositoryMutation({
            refreshOptions: { allowWhileBusy: true },
        });
    }

    public async unignoreWorkingCopyPath(targetPath: string): Promise<void> {
        if (nodePath.resolve(targetPath) === nodePath.resolve(this.rootPath)) {
            throw new Error(this.i18n.t("cannotIgnoreWorkingCopyRootError"));
        }

        await this.updateIgnoredName(nodePath.dirname(targetPath), nodePath.basename(targetPath), false);
        await this.finalizeRepositoryMutation({
            refreshOptions: { allowWhileBusy: true },
        });
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

                await this.finalizeRepositoryMutation({
                    refreshOptions: { allowWhileBusy: true },
                });
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
                await this.finalizeRepositoryMutation({
                    refreshOptions: { allowWhileBusy: true },
                });
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
                await this.finalizeRepositoryMutation({
                    refreshOptions: { allowWhileBusy: true },
                });
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
        await this.finalizeRepositoryMutation({
            refreshOptions: { allowWhileBusy: true },
        });
    }

    public async removeFromChangelist(paths: string[]): Promise<void> {
        const selectedPaths = this.normalizeUniquePaths(paths);
        if (selectedPaths.length === 0) {
            return;
        }

        await this.svnService.removeFromChangelist(this.rootPath, selectedPaths);
        await this.finalizeRepositoryMutation({
            refreshOptions: { allowWhileBusy: true },
        });
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
        await this.finalizeRepositoryMutation({
            clearCommitInput: true,
            refreshOptions: { forceRemote: true },
            refreshHistory: true,
        });
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
                await this.finalizeRepositoryMutation({
                    refreshOptions: { forceRemote: true, allowWhileBusy: true },
                    refreshHistory: true,
                });
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
                await this.finalizeRepositoryMutation({
                    refreshWorkingCopyInfo: true,
                    refreshOptions: { forceRemote: true, allowWhileBusy: true },
                    refreshHistory: true,
                });
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
        const entries = new Set(parseIgnoreEntries(currentValue));

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
                await this.finalizeRepositoryMutation({
                    refreshOptions: { forceRemote: true, allowWhileBusy: true },
                    refreshHistory: true,
                });
            }
        );
    }

    public async mergeIntoWorkingCopy(): Promise<void> {
        const request = await this.promptMergeRequest();
        if (!request) {
            return;
        }

        const summary = this.describeMergeRequest(request);
        const confirmed = await this.confirmMergeRequest(request, summary);
        if (!confirmed) {
            return;
        }

        const progressTitle = request.dryRun
            ? this.i18n.t("mergeWorkingCopyDryRunProgress", {
                  summary,
                  label: this.label,
              })
            : this.i18n.t("mergeWorkingCopyProgress", {
                  summary,
                  label: this.label,
              });
        const completedMessage = request.dryRun
            ? this.i18n.t("mergeWorkingCopyDryRunInfo", { summary })
            : this.i18n.t("mergedWorkingCopyInfo", {
                  summary,
                  label: this.label,
              });

        await this.runRepositoryOperation("merge", progressTitle, completedMessage, async () => {
            switch (request.mode) {
                case "merge-revision":
                    await this.svnService.mergeRevision(
                        this.rootPath,
                        request.sourceUrl,
                        request.revision ?? 0,
                        { dryRun: request.dryRun }
                    );
                    break;
                case "merge-range":
                    await this.svnService.mergeRevisionRange(
                        this.rootPath,
                        request.sourceUrl,
                        request.fromRevision ?? 0,
                        request.toRevision ?? 0,
                        { dryRun: request.dryRun }
                    );
                    break;
                case "reverse-merge-revision":
                    await this.svnService.reverseMergeRevision(
                        this.rootPath,
                        request.sourceUrl,
                        request.revision ?? 0,
                        { dryRun: request.dryRun }
                    );
                    break;
                case "reverse-merge-to-revision":
                    await this.svnService.reverseMergeToRevision(
                        this.rootPath,
                        request.sourceUrl,
                        request.revision ?? 0,
                        { dryRun: request.dryRun }
                    );
                    break;
            }

            if (!request.dryRun) {
                await this.finalizeRepositoryMutation({ refresh: true });
            }
        });
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

        await this.runNotificationProgress(
            this.i18n.t("exportFileProgress", {
                path: repositoryPath,
                revision: exportRevision,
            }),
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

        await this.runNotificationProgress(
            this.i18n.t("relocateWorkingCopyProgress", {
                label: this.label,
            }),
            async () => {
                await this.svnService.relocate(this.rootPath, targetUrl);
            }
        );

        await this.finalizeRepositoryMutation({
            invalidateRevisionGraphCaches: true,
            refreshWorkingCopyInfo: true,
            refreshOptions: { forceRemote: true, allowWhileBusy: true },
            refreshHistory: true,
        });
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

        await this.runNotificationProgress(
            this.i18n.t("deleteReferenceProgress", {
                target: target.display,
            }),
            async () => {
                await this.svnService.deleteUrl(target.url, message);
            }
        );

        await this.finalizeRepositoryMutation({
            invalidateRevisionGraphCaches: true,
            refreshHistory: true,
        });
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
        const { targetPath, displayPath, targetInfo } =
            await this.resolveWorkingCopyNodeTarget(target);

        if (targetInfo.kind !== "file") {
            throw new Error(this.i18n.t("blameFileOnlyError"));
        }

        const blameOutput = await this.runNotificationProgress(
            this.i18n.t("showBlameProgress", { path: displayPath }),
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
        const { targetPath, displayPath, targetInfo } =
            await this.resolveWorkingCopyNodeTarget(target);

        const properties = await this.runNotificationProgress(
            this.i18n.t("showPropertiesProgress", {
                path: displayPath,
            }),
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
        const { targetPath, displayPath } = await this.resolveWorkingCopyNodeTarget(target);

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

            await this.runNotificationProgress(
                this.i18n.t("deletePropertyProgress", {
                    name: propertyName,
                }),
                async () => {
                    await this.svnService.deleteProperty(targetPath, propertyName);
                }
            );

            await this.finalizeRepositoryMutation({
                refreshOptions: { allowWhileBusy: true },
            });
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

        await this.runNotificationProgress(
            this.i18n.t("setPropertyProgress", {
                name: propertyName,
            }),
            async () => {
                await this.svnService.setProperty(targetPath, propertyName, nextValue);
            }
        );

        await this.finalizeRepositoryMutation({
            refreshOptions: { allowWhileBusy: true },
        });
        void vscode.window.showInformationMessage(
            this.i18n.t("updatedPropertyInfo", {
                name: propertyName,
                path: displayPath,
            })
        );
    }

    public async editIgnoreRules(
        target: vscode.Uri | string,
        targetKind?: SvnNodeKind
    ): Promise<void> {
        const targetPath = typeof target === "string" ? target : target.fsPath;
        const ignoreTarget = await this.resolveIgnoreEditorTarget(targetPath, targetKind);
        const currentValue = await this.runNotificationProgress(
            this.i18n.t("editIgnoreProgress", {
                path: ignoreTarget.directoryDisplayPath,
            }),
            async () => this.loadIgnoreEditorValue(ignoreTarget.propertyDirectoryPath)
        );

        this.ignoreEditorPanel.show({
            targetKey: ignoreTarget.propertyDirectoryPath,
            title: this.i18n.t("ignoreEditorTitle", {
                path: ignoreTarget.directoryDisplayPath,
            }),
            strings: {
                heading: this.i18n.t("ignoreEditorHeading"),
                directoryLabel: this.i18n.t("ignoreEditorDirectoryLabel"),
                rulesHint: this.i18n.t("ignoreEditorRulesHint"),
                placeholder: this.i18n.t("ignoreEditorPlaceholder"),
                saveButton: this.i18n.t("ignoreEditorSaveButton"),
                reloadButton: this.i18n.t("ignoreEditorReloadButton"),
                savingStatus: this.i18n.t("ignoreEditorSavingStatus"),
                reloadingStatus: this.i18n.t("ignoreEditorReloadingStatus"),
                suggestedEntryLabel: this.i18n.t("ignoreEditorSuggestedEntryLabel", {
                    entry: "{entry}",
                }),
                addSuggestedEntryButton: this.i18n.t("ignoreEditorAddSuggestedEntryButton"),
            },
            initialState: {
                directoryDisplayPath: ignoreTarget.directoryDisplayPath,
                suggestedEntry: ignoreTarget.suggestedEntry,
                value: currentValue,
            },
            save: async (value) =>
                this.saveIgnoreEditorState(
                    ignoreTarget.propertyDirectoryPath,
                    ignoreTarget.directoryDisplayPath,
                    ignoreTarget.suggestedEntry,
                    value
                ),
            reload: async () => ({
                directoryDisplayPath: ignoreTarget.directoryDisplayPath,
                suggestedEntry: ignoreTarget.suggestedEntry,
                value: await this.loadIgnoreEditorValue(ignoreTarget.propertyDirectoryPath),
            }),
            handleError: (error) => this.showError(error),
        });
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

        await this.runNotificationProgress(
            this.i18n.t("revertWorkingCopyProgress", { revision }),
            async () => {
                await this.svnService.reverseMergeToRevision(
                    this.rootPath,
                    sourceUrl,
                    revision
                );
            }
        );

        await this.finalizeRepositoryMutation({ refresh: true });
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

        await this.runNotificationProgress(
            this.i18n.t("revertChangesProgress", { revision }),
            async () => {
                await this.svnService.reverseMergeRevision(
                    this.rootPath,
                    sourceUrl,
                    revision
                );
            }
        );

        await this.finalizeRepositoryMutation({ refresh: true });
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
                await this.finalizeRepositoryMutation({
                    refreshOptions: { allowWhileBusy: true },
                });
            }
        );
    }

    public async revert(paths?: string[]): Promise<void> {
        await this.svnService.revert(this.rootPath, paths);
        await this.finalizeRepositoryMutation({ refresh: true });
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
                await this.finalizeRepositoryMutation({
                    refreshOptions: { allowWhileBusy: true },
                });
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
        await this.finalizeRepositoryMutation({ refresh: true });
    }

    public async delete(paths: string[]): Promise<void> {
        await this.svnService.delete(this.rootPath, paths);
        await this.finalizeRepositoryMutation({ refresh: true });
    }

    public async showHistory(): Promise<void> {
        await this.historyPanel.show(this);
    }

    public async showRevisionGraph(repositoryPath?: string): Promise<void> {
        await this.revisionGraphPanel.show(this, repositoryPath);
    }

    public async loadRevisionGraph(
        repositoryPath?: string,
        query?: RevisionGraphQuery
    ): Promise<RevisionGraphData> {
        const layout = this.getRevisionGraphLayoutConfig();
        const selectedRepositoryPath = normalizeRepositoryPath(
            repositoryPath ?? this.info.repositoryRelativePath
        );
        const selectedReferencePath =
            getRevisionGraphReferenceRoot(selectedRepositoryPath, layout) ??
            selectedRepositoryPath;
        const normalizedFilters = normalizeRevisionGraphFilters(query?.filters);
        if (hasInvalidRevisionGraphFilters(normalizedFilters)) {
            throw new Error(this.i18n.t("revisionGraphInvalidFilters"));
        }

        const graphRootPath = this.getRevisionGraphRootPath(selectedReferencePath, layout);
        const entryBudget = this.getRevisionGraphRequestedEntryBudget(query?.entryBudget);
        const { entries, canLoadMore, truncated } = await this.loadRevisionGraphEntries(
            graphRootPath,
            entryBudget
        );

        const initialGraph = buildRevisionGraph({
            entries,
            repositoryRoot: this.info.repositoryRoot,
            currentRepositoryPath: this.info.repositoryRelativePath,
            selectedRepositoryPath,
            layout,
            query: {
                entryBudget,
                filters: normalizedFilters,
            },
            canLoadMore,
            scannedEntryCount: entries.length,
            truncated,
        });
        const nodeMetadata = await this.loadRevisionGraphNodeMetadata(
            initialGraph.nodes.map((node) => node.repositoryPath),
            layout
        );
        const graph = buildRevisionGraph({
            entries,
            repositoryRoot: this.info.repositoryRoot,
            currentRepositoryPath: this.info.repositoryRelativePath,
            selectedRepositoryPath,
            layout,
            nodeMetadata,
            query: {
                entryBudget,
                filters: normalizedFilters,
            },
            canLoadMore,
            scannedEntryCount: entries.length,
            truncated,
        });

        return enrichRevisionGraphHoverState(graph);
    }

    public getRepositoryUrlForPath(repositoryPath: string): string {
        return buildRepositoryUrl(this.info.repositoryRoot, repositoryPath);
    }

    public async openRepositoryPathAtHead(
        referenceRepositoryPath: string,
        selectedRepositoryPath: string,
        selectedReferencePath: string
    ): Promise<void> {
        const targetRepositoryPath = mapRevisionGraphTargetPath(
            referenceRepositoryPath,
            selectedRepositoryPath,
            selectedReferencePath
        );
        const targetUrl = this.getRepositoryUrlForPath(targetRepositoryPath);
        const info = await this.svnService.getNodeInfo(targetUrl);
        if (info?.kind === "file") {
            const document = this.contentProvider.createUri({
                label: `${targetRepositoryPath} (HEAD)`,
                source: "svn",
                target: targetUrl,
                revision: "HEAD",
            });
            await vscode.window.showTextDocument(document, {
                preview: true,
                viewColumn: vscode.ViewColumn.Active,
            });
            return;
        }

        await this.openRepositoryBrowser(targetRepositoryPath);
    }

    public async openRevisionGraphRevisionDetails(
        revision: number,
        repositoryPath: string
    ): Promise<void> {
        const targetUrl = this.getRepositoryUrlForPath(repositoryPath);
        const entry = await this.svnService.getLogEntryAtRevision(
            this.rootPath,
            revision,
            targetUrl
        );
        if (!entry) {
            void vscode.window.showWarningMessage(
                this.i18n.t("revisionGraphRevisionNotFound", { revision })
            );
            return;
        }

        await this.openTextPreview(
            "plaintext",
            [
                `${this.i18n.t("revisionLabel")}: r${entry.revision}`,
                `${this.i18n.t("authorDetailLabel")}: ${entry.author}`,
                `${this.i18n.t("dateLabel")}: ${entry.date}`,
                `${this.i18n.t("infoRepositoryPathLabel")}: ${repositoryPath}`,
                "",
                `${this.i18n.t("descriptionLabel")}:`,
                entry.message || this.i18n.t("noCommitMessage"),
                "",
                `${this.i18n.t("changedFilesLabel")}:`,
                ...formatRevisionGraphChangedPaths(entry, {
                    noChangedPathsReportedLabel: this.i18n.t("noChangedPathsReported"),
                    formatCopiedFrom: (path) =>
                        this.i18n.t("historyCopiedFrom", { path }),
                }),
            ].join("\n")
        );
    }

    public async compareRepositoryReferences(
        sourceRepositoryPath: string,
        targetRepositoryPath: string,
        selectedRepositoryPath: string,
        selectedReferencePath: string
    ): Promise<void> {
        await this.openRevisionGraphReferenceDiff(
            sourceRepositoryPath,
            targetRepositoryPath,
            selectedRepositoryPath,
            selectedReferencePath,
            true
        );
    }

    public async diffRepositoryReferences(
        sourceRepositoryPath: string,
        targetRepositoryPath: string,
        selectedRepositoryPath: string,
        selectedReferencePath: string
    ): Promise<void> {
        await this.openRevisionGraphReferenceDiff(
            sourceRepositoryPath,
            targetRepositoryPath,
            selectedRepositoryPath,
            selectedReferencePath,
            false
        );
    }

    public async switchToRepositoryPath(repositoryPath: string): Promise<void> {
        await this.switchWorkingCopyToRepositoryPath(repositoryPath);
    }

    public async openRepositoryBrowser(initialRepositoryPath?: string): Promise<void> {
        await this.repositoryBrowserPanel.show(this, initialRepositoryPath);
    }

    public logRepositoryBrowser(message: string): void {
        this.outputChannel.appendLine(`[Repository Browser] ${message}`);
    }

    public async loadRepositoryBrowserData(
        repositoryPath: string
    ): Promise<RepositoryBrowserDataPayload> {
        const currentRepositoryPath = normalizeRepositoryPath(
            repositoryPath || this.info.repositoryRelativePath
        );
        const currentUrl = buildRepositoryUrl(
            this.info.repositoryRoot,
            currentRepositoryPath
        );
        this.logRepositoryBrowser(`Loading ${currentRepositoryPath} from ${currentUrl}.`);
        const entries = await this.svnService.list(currentUrl);
        this.logRepositoryBrowser(
            `Loaded ${currentRepositoryPath} with ${entries.length} entr${
                entries.length === 1 ? "y" : "ies"
            }.`
        );

        return {
            repositoryLabel: this.label,
            rootPath: this.rootPath,
            ...buildRepositoryBrowserViewModel({
                currentRepositoryPath,
                currentUrl,
                repositoryRoot: this.info.repositoryRoot,
                currentWorkingCopyRepositoryPath: this.info.repositoryRelativePath,
                entries,
                formatNodeKind: (kind) => this.i18n.formatNodeKind(kind),
                strings: this.getRepositoryBrowserViewStrings(),
            }),
        };
    }

    public async runRepositoryBrowserCurrentAction(
        action: RepositoryBrowserAction,
        repositoryPath: string
    ): Promise<string | undefined> {
        const normalizedRepositoryPath = normalizeRepositoryPath(repositoryPath);
        return this.runRepositoryBrowserAction(
            action,
            normalizedRepositoryPath,
            buildRepositoryUrl(this.info.repositoryRoot, normalizedRepositoryPath)
        );
    }

    public async runRepositoryBrowserEntryAction(
        action: RepositoryBrowserEntryAction,
        repositoryPath: string,
        kind: SvnNodeKind
    ): Promise<string | undefined> {
        const normalizedRepositoryPath = normalizeRepositoryPath(repositoryPath);
        const url = buildRepositoryUrl(this.info.repositoryRoot, normalizedRepositoryPath);
        if (action === "open-directory") {
            return kind === "dir" ? normalizedRepositoryPath : undefined;
        }

        if (kind === "dir") {
            return this.runRepositoryBrowserDirectoryEntryAction(
                action,
                normalizedRepositoryPath,
                url
            );
        }

        if (action === "checkout-directory") {
            return undefined;
        }

        if (action === "export-directory") {
            return undefined;
        }

        await this.runRepositoryBrowserFileAction(action, normalizedRepositoryPath, url);
        return undefined;
    }

    public async showFileHistory(target: vscode.Uri | string): Promise<void> {
        const targetPath = typeof target === "string" ? target : target.fsPath;
        const relativePath = this.getHistoryTargetRelativePath(target);
        await this.historyPanel.show(this, {
            key: `${this.rootPath}::file::${relativePath}`,
            label: relativePath,
            targetPath: relativePath,
            focusedRepositoryPath: this.resolveRepositoryPath(targetPath),
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
            focusedRepositoryPath: normalizeRepositoryPath(repositoryPath),
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
        if (!isSameOrChildWorkingCopyPath(this.rootPath, uri.fsPath)) {
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
        action: RepositoryBrowserAction,
        repositoryPath: string,
        url: string
    ): Promise<string | undefined> {
        switch (action) {
            case "show-history":
                await this.showHistoryForRepositoryPath(repositoryPath);
                return;
            case "show-properties":
                await this.showRepositoryPathProperties(repositoryPath, url);
                return;
            case "checkout-directory":
                await this.checkoutRepositoryDirectoryAt(repositoryPath);
                return;
            case "export-directory":
                await this.exportRepositoryDirectoryAt(repositoryPath);
                return;
            case "create-directory":
                await this.createRepositoryDirectoryAt(repositoryPath);
                return;
            case "copy-directory":
                await this.copyRepositoryDirectoryAt(repositoryPath);
                return;
            case "move-directory":
                return this.moveRepositoryDirectoryAt(repositoryPath);
            case "delete-directory":
                return this.deleteRepositoryDirectoryAt(repositoryPath);
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

        await this.runRepositoryBrowserFileAction(selection.action, repositoryPath, url);
    }

    private getRepositoryBrowserViewStrings() {
        return {
            rootBreadcrumbLabel: this.label,
            openDirectoryActionLabel: this.i18n.t(
                "repositoryBrowserOpenDirectoryActionLabel"
            ),
            openHistoryActionLabel: this.i18n.t("openHistoryActionLabel"),
            showPropertiesActionLabel: this.i18n.t("showPropertiesActionLabel"),
            checkoutDirectoryActionLabel: this.i18n.t(
                "repositoryBrowserCheckoutDirectoryActionLabel"
            ),
            exportDirectoryActionLabel: this.i18n.t(
                "repositoryBrowserExportDirectoryActionLabel"
            ),
            showBlameActionLabel: this.i18n.t("showBlameActionLabel"),
            showBlameOutputActionLabel: this.i18n.t("showBlameOutputActionLabel"),
            copyBlameLineActionLabel: this.i18n.t("copyBlameLineActionLabel"),
            openFileLabel: this.i18n.t("openFile"),
            createDirectoryActionLabel: this.i18n.t(
                "repositoryBrowserCreateDirectoryActionLabel"
            ),
            copyDirectoryActionLabel: this.i18n.t(
                "repositoryBrowserCopyDirectoryActionLabel"
            ),
            moveDirectoryActionLabel: this.i18n.t(
                "repositoryBrowserMoveDirectoryActionLabel"
            ),
            deleteDirectoryActionLabel: this.i18n.t(
                "repositoryBrowserDeleteDirectoryActionLabel"
            ),
            createBranchFromWorkingCopyActionLabel: this.i18n.t(
                "createBranchFromWorkingCopyActionLabel"
            ),
            createTagFromWorkingCopyActionLabel: this.i18n.t(
                "createTagFromWorkingCopyActionLabel"
            ),
            copyRepositoryUrlActionLabel: this.i18n.t("copyRepositoryUrlActionLabel"),
            copyRepositoryPathActionLabel: this.i18n.t("copyRepositoryPathActionLabel"),
            switchHereLabel: this.i18n.t("repositoryBrowserSwitchHereLabel"),
            deleteReferenceActionLabel: this.i18n.t("deleteReferenceActionLabel"),
        };
    }

    private async createRepositoryDirectoryAt(repositoryPath: string): Promise<void> {
        const destinationPath =
            await this.promptRepositoryBrowserChildDirectoryPath(repositoryPath);
        if (!destinationPath) {
            return;
        }

        const destinationUrl = buildRepositoryUrl(this.info.repositoryRoot, destinationPath);
        const message = this.i18n.t("repositoryBrowserCreateDirectoryCommitMessage", {
            path: destinationPath,
        });

        await this.runNotificationProgress(
            this.i18n.t("repositoryBrowserCreateDirectoryProgress", {
                path: destinationPath,
            }),
            async () => {
                await this.svnService.mkdir(destinationUrl, message);
            }
        );

        await this.finalizeRemoteRepositoryMutation();
        void vscode.window.showInformationMessage(
            this.i18n.t("repositoryBrowserCreatedDirectoryInfo", {
                path: destinationPath,
            })
        );
    }

    private async checkoutRepositoryDirectoryAt(repositoryPath: string): Promise<void> {
        const targetUrl = buildRepositoryUrl(this.info.repositoryRoot, repositoryPath);
        const destinationPath = await this.promptRepositoryBrowserTransferDestination(
            "checkout",
            repositoryPath,
            targetUrl
        );
        if (!destinationPath) {
            return;
        }

        await this.runNotificationProgress(
            this.i18n.t("repositoryBrowserCheckoutDirectoryProgress", {
                path: repositoryPath,
            }),
            async () => {
                await this.svnService.checkout(targetUrl, "HEAD", destinationPath);
            }
        );

        await this.revealCreatedPath(
            destinationPath,
            this.i18n.t("repositoryBrowserCheckedOutDirectoryInfo", {
                path: repositoryPath,
                destination: destinationPath,
            })
        );
    }

    private async exportRepositoryDirectoryAt(repositoryPath: string): Promise<void> {
        const targetUrl = buildRepositoryUrl(this.info.repositoryRoot, repositoryPath);
        const destinationPath = await this.promptRepositoryBrowserTransferDestination(
            "export",
            repositoryPath,
            targetUrl
        );
        if (!destinationPath) {
            return;
        }

        await this.runNotificationProgress(
            this.i18n.t("repositoryBrowserExportDirectoryProgress", {
                path: repositoryPath,
            }),
            async () => {
                await this.svnService.export(targetUrl, "HEAD", destinationPath);
            }
        );

        await this.revealCreatedPath(
            destinationPath,
            this.i18n.t("repositoryBrowserExportedDirectoryInfo", {
                path: repositoryPath,
                destination: destinationPath,
            })
        );
    }

    private async copyRepositoryDirectoryAt(repositoryPath: string): Promise<void> {
        const destinationPath = await this.promptRepositoryBrowserDirectoryDestination(
            repositoryPath,
            "copy"
        );
        if (!destinationPath) {
            return;
        }

        const sourceUrl = buildRepositoryUrl(this.info.repositoryRoot, repositoryPath);
        const destinationUrl = buildRepositoryUrl(this.info.repositoryRoot, destinationPath);
        const message = this.i18n.t("repositoryBrowserCopyDirectoryCommitMessage", {
            source: repositoryPath,
            destination: destinationPath,
        });

        await this.runNotificationProgress(
            this.i18n.t("repositoryBrowserCopyDirectoryProgress", {
                source: repositoryPath,
                destination: destinationPath,
            }),
            async () => {
                await this.svnService.copy(sourceUrl, destinationUrl, message);
            }
        );

        await this.finalizeRemoteRepositoryMutation();
        void vscode.window.showInformationMessage(
            this.i18n.t("repositoryBrowserCopiedDirectoryInfo", {
                source: repositoryPath,
                destination: destinationPath,
            })
        );
    }

    private async moveRepositoryDirectoryAt(
        repositoryPath: string
    ): Promise<string | undefined> {
        const destinationPath = await this.promptRepositoryBrowserDirectoryDestination(
            repositoryPath,
            "move"
        );
        if (!destinationPath) {
            return undefined;
        }

        const sourceUrl = buildRepositoryUrl(this.info.repositoryRoot, repositoryPath);
        const destinationUrl = buildRepositoryUrl(this.info.repositoryRoot, destinationPath);
        const message = this.i18n.t("repositoryBrowserMoveDirectoryCommitMessage", {
            source: repositoryPath,
            destination: destinationPath,
        });

        await this.runNotificationProgress(
            this.i18n.t("repositoryBrowserMoveDirectoryProgress", {
                source: repositoryPath,
                destination: destinationPath,
            }),
            async () => {
                await this.svnService.moveUrl(sourceUrl, destinationUrl, message);
            }
        );

        await this.finalizeRemoteRepositoryMutation();
        void vscode.window.showInformationMessage(
            this.i18n.t("repositoryBrowserMovedDirectoryInfo", {
                source: repositoryPath,
                destination: destinationPath,
            })
        );

        return destinationPath;
    }

    private async deleteRepositoryDirectoryAt(
        repositoryPath: string
    ): Promise<string | undefined> {
        const confirmed = await this.confirmDeleteRepositoryDirectory(repositoryPath);
        if (!confirmed) {
            return undefined;
        }

        const targetUrl = buildRepositoryUrl(this.info.repositoryRoot, repositoryPath);
        const message = this.i18n.t("repositoryBrowserDeleteDirectoryCommitMessage", {
            target: repositoryPath,
        });

        await this.runNotificationProgress(
            this.i18n.t("repositoryBrowserDeleteDirectoryProgress", {
                target: repositoryPath,
            }),
            async () => {
                await this.svnService.deleteUrl(targetUrl, message);
            }
        );

        await this.finalizeRemoteRepositoryMutation();
        void vscode.window.showInformationMessage(
            this.i18n.t("repositoryBrowserDeletedDirectoryInfo", {
                target: repositoryPath,
            })
        );

        return getParentRepositoryPath(repositoryPath);
    }

    private async runRepositoryBrowserDirectoryEntryAction(
        action: Exclude<RepositoryBrowserEntryAction, "open-directory">,
        repositoryPath: string,
        url: string
    ): Promise<string | undefined> {
        switch (action) {
            case "checkout-directory":
                await this.checkoutRepositoryDirectoryAt(repositoryPath);
                return undefined;
            case "export-directory":
                await this.exportRepositoryDirectoryAt(repositoryPath);
                return undefined;
            case "show-history":
                await this.showHistoryForRepositoryPath(repositoryPath);
                return undefined;
            case "show-properties":
                await this.showRepositoryPathProperties(repositoryPath, url);
                return undefined;
            case "copy-url":
                await this.copyValueToClipboard(url, this.i18n.t("copiedRepositoryUrlStatus"));
                return undefined;
            case "copy-path":
                await this.copyValueToClipboard(
                    repositoryPath,
                    this.i18n.t("copiedRepositoryPathStatus")
                );
                return undefined;
            default:
                return undefined;
        }
    }

    public async showRepositoryPathProperties(
        repositoryPath: string,
        url: string
    ): Promise<void> {
        const properties = await this.runNotificationProgress(
            this.i18n.t("showPropertiesProgress", {
                path: repositoryPath,
            }),
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
        const blameOutput = await this.runNotificationProgress(
            this.i18n.t("showBlameProgress", { path: repositoryPath }),
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
                await this.finalizeRepositoryMutation({
                    refreshWorkingCopyInfo: true,
                    refreshOptions: { forceRemote: true, allowWhileBusy: true },
                    refreshHistory: true,
                });
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
            content: buildBlamePreviewContent(
                {
                    infoPathLabel: this.i18n.t("infoPathLabel"),
                    infoRepositoryPathLabel: this.i18n.t("infoRepositoryPathLabel"),
                    infoUrlLabel: this.i18n.t("infoUrlLabel"),
                },
                options
            ),
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
            buildBlameOutputLines(
                {
                    infoPathLabel: this.i18n.t("infoPathLabel"),
                    infoRepositoryPathLabel: this.i18n.t("infoRepositoryPathLabel"),
                    infoUrlLabel: this.i18n.t("infoUrlLabel"),
                },
                options
            ),
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
            buildPropertyOutputLines(
                {
                    infoPathLabel: this.i18n.t("infoPathLabel"),
                    infoRepositoryPathLabel: this.i18n.t("infoRepositoryPathLabel"),
                    infoUrlLabel: this.i18n.t("infoUrlLabel"),
                    propertiesHeaderLabel: this.i18n.t("propertiesHeaderLabel"),
                    noPropertiesFoundLabel: this.i18n.t("noPropertiesFoundLabel"),
                },
                options
            ),
            this.i18n.t("openedPropertiesStatus")
        );
    }

    private writeOutputSection(header: string, lines: string[], statusMessage: string): void {
        appendOutputSection(this.outputChannel, header, lines);
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
            (await this.runNotificationProgress(
                this.i18n.t("showBlameProgress", { path: displayPath }),
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

    private async runRepositoryBrowserFileAction(
        action: RepositoryBrowserFileAction,
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
        await this.runNotificationProgress(
            this.i18n.t(progressKey, { revision }),
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

    private async resolveIgnoreEditorTarget(
        targetPath: string,
        targetKind?: SvnNodeKind
    ): Promise<{
        propertyDirectoryPath: string;
        directoryDisplayPath: string;
        suggestedEntry?: string;
    }> {
        const resolvedTargetPath = nodePath.resolve(targetPath);
        const directoryCandidate = await this.resolveIgnoreDirectoryCandidate(
            resolvedTargetPath,
            targetKind
        );
        const propertyDirectoryPath =
            (await this.findNearestVersionedDirectory(directoryCandidate)) ?? this.rootPath;

        return {
            propertyDirectoryPath,
            directoryDisplayPath:
                nodePath.relative(this.rootPath, propertyDirectoryPath).replace(/\\/g, "/") ||
                nodePath.basename(this.rootPath),
            suggestedEntry: getSuggestedIgnoreEntry(propertyDirectoryPath, resolvedTargetPath),
        };
    }

    private async resolveIgnoreDirectoryCandidate(
        targetPath: string,
        targetKind?: SvnNodeKind
    ): Promise<string> {
        if (targetKind === "dir") {
            return targetPath;
        }

        if (targetKind === "file") {
            return nodePath.dirname(targetPath);
        }

        try {
            const stats = await vscode.workspace.fs.stat(vscode.Uri.file(targetPath));
            return stats.type & vscode.FileType.Directory ? targetPath : nodePath.dirname(targetPath);
        } catch {
            return nodePath.dirname(targetPath);
        }
    }

    private async findNearestVersionedDirectory(targetPath: string): Promise<string | undefined> {
        let candidatePath = (await this.getNearestExistingPath(targetPath)) ?? targetPath;

        while (true) {
            if (!isSameOrChildWorkingCopyPath(this.rootPath, candidatePath)) {
                return undefined;
            }

            const nodeInfo = await this.svnService.getNodeInfo(candidatePath);
            if (nodeInfo?.kind === "dir") {
                return candidatePath;
            }

            const parentPath = nodePath.dirname(candidatePath);
            if (parentPath === candidatePath) {
                return undefined;
            }

            candidatePath = parentPath;
        }
    }

    private async loadIgnoreEditorValue(propertyDirectoryPath: string): Promise<string> {
        const currentValue = await this.svnService.getProperty(propertyDirectoryPath, "svn:ignore");
        return parseIgnoreEntries(currentValue).join("\n");
    }

    private async saveIgnoreEditorState(
        propertyDirectoryPath: string,
        directoryDisplayPath: string,
        suggestedEntry: string | undefined,
        value: string
    ): Promise<IgnoreEditorPanelState> {
        const nextValue = normalizeIgnoreEditorValue(value);

        await this.runNotificationProgress(
            this.i18n.t("updateIgnoreProgress", {
                path: directoryDisplayPath,
            }),
            async () => {
                if (!nextValue) {
                    if (
                        (await this.svnService.getProperty(propertyDirectoryPath, "svn:ignore")) !==
                        undefined
                    ) {
                        await this.svnService.deleteProperty(propertyDirectoryPath, "svn:ignore");
                    }
                    return;
                }

                await this.svnService.setProperty(propertyDirectoryPath, "svn:ignore", nextValue);
            }
        );

        await this.finalizeRepositoryMutation({
            refreshOptions: { allowWhileBusy: true },
        });
        void vscode.window.setStatusBarMessage(
            this.i18n.t("updatedIgnoreInfo", {
                path: directoryDisplayPath,
            }),
            2000
        );

        return {
            directoryDisplayPath,
            suggestedEntry,
            statusMessage: this.i18n.t("updatedIgnoreInfo", {
                path: directoryDisplayPath,
            }),
            value: nextValue ?? "",
        };
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

    private getRevisionGraphRootPath(
        repositoryPath: string,
        layout?: Partial<RevisionGraphLayoutConfig>
    ): string {
        const normalizedPath = normalizeRepositoryPath(repositoryPath);
        const referencePath =
            getRevisionGraphReferenceRoot(normalizedPath, layout) ?? normalizedPath;
        return getRevisionGraphLayoutRoot(referencePath, layout);
    }

    private getRevisionGraphLayoutConfig(): RevisionGraphLayoutConfig {
        const config = vscode.workspace.getConfiguration("svn-tree");
        return normalizeRevisionGraphLayoutConfig({
            trunkNames: config.get<string[]>("revision-graph-trunk-names", ["trunk"]),
            branchContainerNames: config.get<string[]>("revision-graph-branch-container-names", [
                "branches",
            ]),
            tagContainerNames: config.get<string[]>("revision-graph-tag-container-names", [
                "tags",
            ]),
        });
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

    private getRevisionGraphRequestedEntryBudget(requestedEntryBudget?: number): number {
        const defaultEntryBudget = this.getRevisionGraphEntryLimit();
        const normalizedRequestedEntryBudget =
            Number.isFinite(requestedEntryBudget) && (requestedEntryBudget ?? 0) > 0
                ? Math.floor(requestedEntryBudget ?? 0)
                : defaultEntryBudget;
        return Math.min(
            revisionGraphMaxEntryCount,
            Math.max(defaultEntryBudget, normalizedRequestedEntryBudget)
        );
    }

    private async loadRevisionGraphEntries(
        graphRootPath: string,
        requestedEntryCount: number
    ): Promise<{ entries: SvnLogEntry[]; canLoadMore: boolean; truncated: boolean }> {
        const target = buildRepositoryUrl(this.info.repositoryRoot, graphRootPath);
        const cacheKey = graphRootPath;
        const entryLimit = this.getRevisionGraphRequestedEntryBudget(requestedEntryCount);
        const pageSize = Math.min(
            entryLimit,
            vscode.workspace.getConfiguration("svn-tree").get<number>("max-log-entries", 200)
        );
        const cache =
            this.revisionGraphEntryCaches.get(cacheKey) ??
            ({
                key: cacheKey,
                target,
                historyFilters: normalizeHistoryFilters(),
                entries: [],
                exhausted: false,
            } satisfies RevisionGraphEntryCache);
        if (!this.revisionGraphEntryCaches.has(cacheKey)) {
            this.revisionGraphEntryCaches.set(cacheKey, cache);
        }

        while (cache.entries.length < entryLimit && !cache.exhausted) {
            const remaining = entryLimit - cache.entries.length;
            const page = await this.svnService.getLog(
                this.rootPath,
                Math.min(pageSize, remaining),
                cache.nextBeforeRevision,
                target
            );

            if (page.entries.length === 0) {
                cache.exhausted = true;
                break;
            }

            cache.entries.push(...page.entries);
            cache.exhausted = !page.hasMore;
            cache.nextBeforeRevision = page.nextBeforeRevision;
        }

        return {
            entries: cache.entries.slice(0, entryLimit),
            canLoadMore: !cache.exhausted,
            truncated: !cache.exhausted,
        };
    }

    private async loadRevisionGraphNodeMetadata(
        repositoryPaths: readonly string[],
        layout: RevisionGraphLayoutConfig
    ): Promise<Record<string, RevisionGraphNodeMetadata>> {
        const uniquePaths = [
            ...new Set(repositoryPaths.map((value) => normalizeRepositoryPath(value))),
        ];
        const statusMetadata = buildRevisionGraphStatusMetadata({
            repositoryPaths: uniquePaths,
            localStatuses: [
                ...this.getResources(this.changesGroup.resourceStates).map(
                    (resource) => resource.status
                ),
                ...this.getResources(this.unversionedGroup.resourceStates).map(
                    (resource) => resource.status
                ),
            ],
            remoteStatuses: this.getResources(this.remoteChangesGroup.resourceStates).map(
                (resource) => resource.status
            ),
            resolveRepositoryPath: (absolutePath) => this.resolveRepositoryPath(absolutePath),
        });
        const metadataEntries = await Promise.all(
            uniquePaths.map(async (repositoryPath) => {
                const cachedMetadata = this.revisionGraphNodeMetadataCache.get(repositoryPath);
                if (cachedMetadata) {
                    return [
                        repositoryPath,
                        {
                            ...cachedMetadata,
                            ...statusMetadata[repositoryPath],
                        },
                    ] as const;
                }

                const url = buildRepositoryUrl(this.info.repositoryRoot, repositoryPath);
                const [nodeInfo, mergeInfo] = await Promise.all([
                    this.svnService.getNodeInfo(url).catch(() => undefined),
                    this.svnService.getProperty(url, "svn:mergeinfo").catch(() => undefined),
                ]);
                const metadata: RevisionGraphNodeMetadata = {
                    lockOwner: nodeInfo?.lockOwner,
                    mergeSources: parseRevisionGraphMergeInfo(mergeInfo, layout),
                };
                this.revisionGraphNodeMetadataCache.set(repositoryPath, metadata);

                return [
                    repositoryPath,
                    {
                        ...metadata,
                        ...statusMetadata[repositoryPath],
                    },
                ] as const;
            })
        );

        return Object.fromEntries(metadataEntries);
    }

    private async openRevisionGraphReferenceDiff(
        sourceRepositoryPath: string,
        targetRepositoryPath: string,
        selectedRepositoryPath: string,
        selectedReferencePath: string,
        summarize: boolean
    ): Promise<void> {
        const sourceTargetPath = mapRevisionGraphTargetPath(
            sourceRepositoryPath,
            selectedRepositoryPath,
            selectedReferencePath
        );
        const targetTargetPath = mapRevisionGraphTargetPath(
            targetRepositoryPath,
            selectedRepositoryPath,
            selectedReferencePath
        );
        const sourceUrl = this.getRepositoryUrlForPath(sourceTargetPath);
        const targetUrl = this.getRepositoryUrlForPath(targetTargetPath);
        const diffText = await this.svnService.diff(sourceUrl, targetUrl, {
            summarize,
            sourceRevision: "HEAD",
            targetRevision: "HEAD",
        });
        const content = [
            `${this.i18n.t("revisionGraphCompareTitle")}: ${sourceTargetPath} -> ${targetTargetPath}`,
            `${this.i18n.t("infoUrlLabel")}: ${sourceUrl}`,
            `${this.i18n.t("infoPathLabel")}: ${targetTargetPath}`,
            "",
            diffText.trim() || this.i18n.t("revisionGraphNoDifferences"),
        ].join("\n");

        await this.openTextPreview(summarize ? "plaintext" : "diff", content);
    }

    private async openTextPreview(language: string, content: string): Promise<void> {
        const document = await vscode.workspace.openTextDocument({
            language,
            content,
        });
        await vscode.window.showTextDocument(document, {
            preview: true,
            viewColumn: vscode.ViewColumn.Active,
        });
    }

    private invalidateRevisionGraphCaches(): void {
        this.revisionGraphEntryCaches.clear();
        this.revisionGraphNodeMetadataCache.clear();
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
            await this.runNotificationProgress(progressTitle, async () => {
                await action();
            });

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

        await this.runNotificationProgress(
            this.i18n.t("createReferenceProgress", {
                kind: kindLabel,
                revision,
            }),
            async () => {
                await this.svnService.copy(
                    sourceUrl,
                    destinationUrl,
                    message,
                    String(revision)
                );
            }
        );

        await this.finalizeRepositoryMutation({
            invalidateRevisionGraphCaches: true,
        });
        await this.offerReferencePathCopy(
            kindLabel,
            destinationPath,
            this.i18n.t("createdReferenceMessage", {
                kind: kindLabel,
                revision,
                destination: destinationPath,
            })
        );
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

        await this.runNotificationProgress(
            this.i18n.t("createReferenceFromWorkingCopyProgress", {
                kind: kindLabel,
            }),
            async () => {
                await this.svnService.copy(this.rootPath, destinationUrl, message);
            }
        );

        await this.finalizeRepositoryMutation({
            invalidateRevisionGraphCaches: true,
            refreshHistory: true,
        });
        await this.offerReferencePathCopy(
            kindLabel,
            resolvedDestinationPath,
            this.i18n.t("createdReferenceFromWorkingCopyMessage", {
                kind: kindLabel,
                destination: resolvedDestinationPath,
            })
        );
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

    private async promptRepositoryBrowserChildDirectoryPath(
        repositoryPath: string
    ): Promise<string | undefined> {
        const value = await vscode.window.showInputBox({
            title: this.i18n.t("repositoryBrowserCreateDirectoryActionLabel"),
            prompt: this.i18n.t("repositoryBrowserCreateDirectoryPrompt", {
                path: repositoryPath,
            }),
            placeHolder: this.i18n.t("repositoryBrowserCreateDirectoryPlaceholder"),
            validateInput: (input) =>
                this.validateRepositoryBrowserPathInput(
                    input,
                    "child-relative",
                    repositoryPath
                ),
        });
        const trimmedValue = value?.trim();
        if (!trimmedValue) {
            return undefined;
        }

        return resolveRepositoryBrowserChildPath(repositoryPath, trimmedValue);
    }

    private async promptRepositoryBrowserTransferDestination(
        operation: "checkout" | "export",
        repositoryPath: string,
        targetUrl: string
    ): Promise<string | undefined> {
        const selectParentTitleKey =
            operation === "checkout"
                ? "repositoryBrowserSelectCheckoutParentFolderTitle"
                : "repositoryBrowserSelectExportParentFolderTitle";
        const folderNamePromptKey =
            operation === "checkout"
                ? "repositoryBrowserCheckoutFolderNamePrompt"
                : "repositoryBrowserExportFolderNamePrompt";
        const titleKey =
            operation === "checkout"
                ? "repositoryBrowserCheckoutDirectoryActionLabel"
                : "repositoryBrowserExportDirectoryActionLabel";
        const defaultName =
            operation === "checkout"
                ? deriveCheckoutDestinationName(targetUrl, "HEAD")
                : `${deriveCheckoutDestinationName(targetUrl, "HEAD")}-export`;
        const selectedFolders = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: this.i18n.t("selectParentFolderLabel"),
            title: this.i18n.t(selectParentTitleKey, {
                path: repositoryPath,
            }),
        });
        const parentFolder = selectedFolders?.[0];
        if (!parentFolder) {
            return undefined;
        }

        const folderName = await vscode.window.showInputBox({
            title: this.i18n.t(titleKey),
            prompt: this.i18n.t(folderNamePromptKey, {
                path: repositoryPath,
            }),
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

    private async promptRepositoryBrowserDirectoryDestination(
        repositoryPath: string,
        operation: "copy" | "move"
    ): Promise<string | undefined> {
        const titleKey =
            operation === "copy"
                ? "repositoryBrowserCopyDirectoryActionLabel"
                : "repositoryBrowserMoveDirectoryActionLabel";
        const promptKey =
            operation === "copy"
                ? "repositoryBrowserCopyDirectoryPrompt"
                : "repositoryBrowserMoveDirectoryPrompt";
        const defaultValue =
            operation === "copy"
                ? `${this.getRepositoryPathLeafName(repositoryPath)}-copy`
                : `${this.getRepositoryPathLeafName(repositoryPath)}-renamed`;
        const destinationValue = await vscode.window.showInputBox({
            title: this.i18n.t(titleKey),
            prompt: this.i18n.t(promptKey, {
                path: repositoryPath,
                parent: getParentRepositoryPath(repositoryPath),
            }),
            placeHolder: this.i18n.t("repositoryBrowserDirectoryDestinationPlaceholder"),
            value: defaultValue,
            validateInput: (input) =>
                this.validateRepositoryBrowserPathInput(
                    input,
                    "sibling-or-absolute",
                    repositoryPath,
                    repositoryPath
                ),
        });
        const trimmedValue = destinationValue?.trim();
        if (!trimmedValue) {
            return undefined;
        }

        return resolveRepositoryBrowserSiblingOrAbsolutePath(repositoryPath, trimmedValue);
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

    private validateRepositoryBrowserPathInput(
        value: string,
        mode: RepositoryBrowserPathInputMode,
        currentRepositoryPath: string,
        sourceRepositoryPath?: string
    ): string | undefined {
        const validationError = getRepositoryBrowserPathValidationError(value, mode);
        switch (validationError) {
            case "required":
                return this.i18n.t("repositoryBrowserDirectoryPathRequired");
            case "absolute-path":
                return this.i18n.t("relativePathRequired", {
                    location: currentRepositoryPath,
                });
            case "empty-segment":
                return this.i18n.t("avoidEmptySegments");
            case "relative-navigation":
                return this.i18n.t("repositoryBrowserPathTraversalNotAllowed");
            default:
                break;
        }

        if (!sourceRepositoryPath) {
            return undefined;
        }

        const destinationRepositoryPath =
            mode === "child-relative"
                ? resolveRepositoryBrowserChildPath(currentRepositoryPath, value)
                : resolveRepositoryBrowserSiblingOrAbsolutePath(currentRepositoryPath, value);
        const destinationValidationError = getRepositoryBrowserMutationTargetValidationError(
            sourceRepositoryPath,
            destinationRepositoryPath
        );

        switch (destinationValidationError) {
            case "same-path":
                return this.i18n.t("repositoryBrowserSamePathError");
            case "nested-target":
                return this.i18n.t("repositoryBrowserNestedTargetError", {
                    path: sourceRepositoryPath,
                });
            default:
                return undefined;
        }
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

    private showError(error: unknown): void {
        appendOutputSection(
            this.outputChannel,
            this.i18n.t("errorOutputHeader"),
            buildErrorOutputLines(error, {
                timeLabel: this.i18n.t("errorOutputTimeLabel"),
                messageLabel: this.i18n.t("errorOutputMessageLabel"),
                stackLabel: this.i18n.t("errorOutputStackLabel"),
                causeLabel: this.i18n.t("errorOutputCauseLabel"),
                valueLabel: this.i18n.t("errorOutputValueLabel"),
            })
        );

        const message = error instanceof Error ? error.message : String(error);
        const showOutputAction = this.i18n.t("showOutputActionLabel");
        void vscode.window.showErrorMessage(message, showOutputAction).then((selection) => {
            if (selection === showOutputAction) {
                this.outputChannel.show(true);
            }
        });
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

    private async confirmDeleteRepositoryDirectory(displayTarget: string): Promise<boolean> {
        const selection = await vscode.window.showWarningMessage(
            this.i18n.t("repositoryBrowserDeleteDirectoryQuestion", { target: displayTarget }),
            {
                modal: true,
                detail: this.i18n.t("repositoryBrowserDeleteDirectoryDetail", {
                    target: displayTarget,
                }),
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

    private getRepositoryPathLeafName(repositoryPath: string): string {
        const segments = repositoryPath.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
        return segments.at(-1) ?? "directory";
    }

    private async finalizeRemoteRepositoryMutation(): Promise<void> {
        await this.finalizeRepositoryMutation({
            invalidateRevisionGraphCaches: true,
            refreshHistory: true,
            refreshOptions: { forceRemote: true, allowWhileBusy: true },
        });
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

    private async promptMergeRequest(): Promise<MergeWizardRequest | undefined> {
        const mode = await this.promptMergeMode();
        if (!mode) {
            return undefined;
        }

        const source = this.isForwardMergeMode(mode)
            ? await this.promptMergeSourceTarget()
            : this.getCurrentWorkingCopyMergeSource();
        if (!source) {
            return undefined;
        }

        let revision: number | undefined;
        let fromRevision: number | undefined;
        let toRevision: number | undefined;

        switch (mode) {
            case "merge-revision":
                revision = await this.promptPositiveRevisionInput(
                    this.i18n.t("mergeRevisionPrompt", { source: source.display })
                );
                break;
            case "merge-range": {
                const range = await this.promptMergeRange(source.display);
                fromRevision = range?.fromRevision;
                toRevision = range?.toRevision;
                break;
            }
            case "reverse-merge-revision":
                revision = await this.promptPositiveRevisionInput(
                    this.i18n.t("reverseMergeRevisionPrompt", { source: source.display })
                );
                break;
            case "reverse-merge-to-revision":
                revision = await this.promptPositiveRevisionInput(
                    this.i18n.t("reverseMergeToRevisionPrompt", { source: source.display })
                );
                break;
        }

        if (
            (mode === "merge-revision" ||
                mode === "reverse-merge-revision" ||
                mode === "reverse-merge-to-revision") &&
            revision === undefined
        ) {
            return undefined;
        }

        if (mode === "merge-range" && (fromRevision === undefined || toRevision === undefined)) {
            return undefined;
        }

        const dryRun = await this.promptMergeExecutionMode();
        if (dryRun === undefined) {
            return undefined;
        }

        return {
            mode,
            sourceDisplay: source.display,
            sourceUrl: source.url,
            dryRun,
            revision,
            fromRevision,
            toRevision,
        };
    }

    private async promptMergeMode(): Promise<MergeWizardMode | undefined> {
        const selection = await vscode.window.showQuickPick<MergeModeQuickPickItem>(
            [
                {
                    label: this.i18n.t("mergeRevisionModeLabel"),
                    description: this.i18n.t("mergeRevisionModeDescription"),
                    mode: "merge-revision",
                },
                {
                    label: this.i18n.t("mergeRangeModeLabel"),
                    description: this.i18n.t("mergeRangeModeDescription"),
                    mode: "merge-range",
                },
                {
                    label: this.i18n.t("reverseMergeRevisionModeLabel"),
                    description: this.i18n.t("reverseMergeRevisionModeDescription"),
                    mode: "reverse-merge-revision",
                },
                {
                    label: this.i18n.t("reverseMergeToRevisionModeLabel"),
                    description: this.i18n.t("reverseMergeToRevisionModeDescription"),
                    mode: "reverse-merge-to-revision",
                },
            ],
            {
                title: this.i18n.t("mergeWorkingCopyActionLabel"),
                placeHolder: this.i18n.t("mergeModePlaceholder", {
                    label: this.label,
                }),
            }
        );

        return selection?.mode;
    }

    private async promptMergeSourceTarget(): Promise<
        | {
              display: string;
              url: string;
          }
        | undefined
    > {
        const layoutRoot = getReferenceLayoutRoot(this.info.repositoryRelativePath);
        const value = await vscode.window.showInputBox({
            title: this.i18n.t("mergeWorkingCopyActionLabel"),
            prompt: this.i18n.t("mergeSourcePrompt", {
                layoutRoot,
            }),
            placeHolder: this.i18n.t("mergeSourcePlaceholder"),
            validateInput: (input) => this.validateMergeSourceTarget(input),
        });
        const trimmedValue = value?.trim();
        if (!trimmedValue) {
            return undefined;
        }

        return resolveSwitchTarget({
            target: trimmedValue,
            repositoryRoot: this.info.repositoryRoot,
            repositoryRelativePath: this.info.repositoryRelativePath,
        });
    }

    private getCurrentWorkingCopyMergeSource(): { display: string; url: string } {
        const repositoryPath = normalizeRepositoryPath(this.info.repositoryRelativePath);
        return {
            display: repositoryPath,
            url: buildRepositoryUrl(this.info.repositoryRoot, repositoryPath),
        };
    }

    private async promptPositiveRevisionInput(prompt: string): Promise<number | undefined> {
        const value = await vscode.window.showInputBox({
            title: this.i18n.t("mergeWorkingCopyActionLabel"),
            prompt,
            placeHolder: this.i18n.t("updateToRevisionInputPlaceholder"),
            validateInput: (input) => {
                return toRevisionNumber(input.trim()) === undefined
                    ? this.i18n.t("invalidRevisionError")
                    : undefined;
            },
        });
        return toRevisionNumber(value?.trim());
    }

    private async promptMergeRange(
        sourceDisplay: string
    ): Promise<{ fromRevision: number; toRevision: number } | undefined> {
        const fromRevision = await this.promptPositiveRevisionInput(
            this.i18n.t("mergeRangeStartPrompt", { source: sourceDisplay })
        );
        if (fromRevision === undefined) {
            return undefined;
        }

        const toValue = await vscode.window.showInputBox({
            title: this.i18n.t("mergeWorkingCopyActionLabel"),
            prompt: this.i18n.t("mergeRangeEndPrompt", { source: sourceDisplay }),
            placeHolder: this.i18n.t("updateToRevisionInputPlaceholder"),
            validateInput: (input) => {
                const parsed = toRevisionNumber(input.trim());
                if (parsed === undefined) {
                    return this.i18n.t("invalidRevisionError");
                }

                return parsed > fromRevision
                    ? undefined
                    : this.i18n.t("mergeRangeOrderInvalid", {
                          revision: fromRevision,
                      });
            },
        });
        const toRevision = toRevisionNumber(toValue?.trim());
        if (toRevision === undefined || toRevision <= fromRevision) {
            return undefined;
        }

        return {
            fromRevision,
            toRevision,
        };
    }

    private async promptMergeExecutionMode(): Promise<boolean | undefined> {
        const selection = await vscode.window.showQuickPick<MergeExecutionQuickPickItem>(
            [
                {
                    label: this.i18n.t("mergeDryRunLabel"),
                    description: this.i18n.t("mergeDryRunDescription"),
                    dryRun: true,
                },
                {
                    label: this.i18n.t("mergeApplyLabel"),
                    description: this.i18n.t("mergeApplyDescription"),
                    dryRun: false,
                },
            ],
            {
                title: this.i18n.t("mergeWorkingCopyActionLabel"),
                placeHolder: this.i18n.t("mergeExecutionModePlaceholder"),
            }
        );

        return selection?.dryRun;
    }

    private validateMergeSourceTarget(value: string): string | undefined {
        const validationError = getSwitchTargetValidationError(value);
        switch (validationError) {
            case "required":
                return this.i18n.t("mergeSourceRequired");
            case "invalid-path":
                return this.i18n.t("mergeSourceInvalid");
            default:
                return undefined;
        }
    }

    private isForwardMergeMode(mode: MergeWizardMode): boolean {
        return mode === "merge-revision" || mode === "merge-range";
    }

    private describeMergeRequest(request: MergeWizardRequest): string {
        switch (request.mode) {
            case "merge-revision":
                return this.i18n.t("mergeRevisionSummary", {
                    revision: request.revision ?? 0,
                    source: request.sourceDisplay,
                });
            case "merge-range":
                return this.i18n.t("mergeRangeSummary", {
                    fromRevision: request.fromRevision ?? 0,
                    toRevision: request.toRevision ?? 0,
                    source: request.sourceDisplay,
                });
            case "reverse-merge-revision":
                return this.i18n.t("reverseMergeRevisionSummary", {
                    revision: request.revision ?? 0,
                    source: request.sourceDisplay,
                });
            case "reverse-merge-to-revision":
                return this.i18n.t("reverseMergeToRevisionSummary", {
                    revision: request.revision ?? 0,
                    source: request.sourceDisplay,
                });
        }
    }

    private async confirmMergeRequest(
        request: MergeWizardRequest,
        summary: string
    ): Promise<boolean> {
        const detailLines = [
            this.i18n.t("mergeWorkingCopyDetail", {
                summary,
            }),
            this.i18n.t("cleanWorkingCopyRecommended"),
        ];

        if (request.dryRun) {
            detailLines.push(this.i18n.t("mergeDryRunDetail"));
        } else {
            detailLines.push(this.i18n.t("workingCopyOnlyDetail"));
        }

        if (this.hasLocalChanges()) {
            detailLines.push(this.i18n.t("localChangesConflictWarning"));
        }

        const selection = await vscode.window.showWarningMessage(
            this.i18n.t("mergeWorkingCopyQuestion", {
                summary,
                label: this.label,
            }),
            {
                modal: true,
                detail: detailLines.join("\n"),
            },
            this.i18n.t("continueButton")
        );

        return selection === this.i18n.t("continueButton");
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
                await this.finalizeRepositoryMutation({
                    refreshOptions: { allowWhileBusy: true },
                });
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
