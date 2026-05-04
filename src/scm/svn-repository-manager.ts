import * as nodePath from "node:path";
import * as vscode from "vscode";
import { HistoryPanel } from "../history/history-panel";
import { RepositoryBrowserPanel } from "../repository-browser/repository-browser-panel";
import { RevisionGraphPanel } from "../revision-graph/revision-graph-panel";
import { normalizeFileManagerPlatform, type MessageKey } from "../i18n";
import type { SvnNodeInfo, SvnWorkingCopyInfo } from "../svn/svn-types";
import { getI18n } from "../vscode-i18n";
import { appendOutputSection, buildErrorOutputLines } from "./output-channel-utils";
import {
    buildQuickPickActionCategories,
    type QuickPickActionCategoryDefinition,
    type QuickPickActionCategoryItem,
    type QuickPickActionItem,
} from "./quick-pick-action-utils";
import { SvnContentProvider } from "../svn/svn-content-provider";
import { SvnService } from "../svn/svn-service";
import { ScmResource } from "./scm-resource";
import { SvnConflictInspectorPanel } from "./svn-conflict-inspector-panel";
import { SvnInlineBlameController } from "./svn-inline-blame-controller";
import { SvnInspectorPanel } from "./svn-inspector-panel";
import { getCheckoutDepthOptions } from "./svn-depth-utils";
import {
    deriveCheckoutDestinationName,
    deriveImportSourceFolderName,
    normalizeCheckoutRepositoryUrl,
    normalizeCheckoutRevision,
} from "./svn-checkout-utils";
import { partitionDeleteTargets } from "./svn-delete-utils";
import { SvnRepository } from "./svn-repository";
import { isSameOrChildWorkingCopyPath } from "./svn-repository-paths";
import type { SvnCheckoutDepth } from "../svn/svn-types";

interface RepositoryActionDefinition {
    readonly labelKey: MessageKey;
    readonly descriptionKey: MessageKey;
    readonly run: (repository: SvnRepository) => Promise<void>;
}

interface RepositoryActionCategoryDefinition {
    readonly labelKey: MessageKey;
    readonly descriptionKey: MessageKey;
    readonly actions: readonly RepositoryActionDefinition[];
}

type RepositoryCommandHandler = (repository: SvnRepository) => Promise<void>;
type ConflictCommandHandler = (repository: SvnRepository, paths: string[]) => Promise<void>;
type RepositoryActionItem = QuickPickActionItem<SvnRepository>;
type RepositoryActionCategoryItem = QuickPickActionCategoryItem<SvnRepository>;

interface RepositoryCommandRegistration {
    readonly command: string;
    readonly run: RepositoryCommandHandler;
}

interface CommandRegistration {
    readonly command: string;
    readonly run: (arg?: unknown) => Promise<void>;
}

interface ConflictActionDefinition {
    readonly selectedCommand: string;
    readonly allCommand: string;
    readonly labelKey: MessageKey;
    readonly descriptionKey: MessageKey;
    readonly run: ConflictCommandHandler;
}

interface SvnDepthQuickPickItem<TDepth extends string> extends vscode.QuickPickItem {
    readonly depth: TDepth;
}

interface ResolvedPathTarget {
    readonly repository: SvnRepository;
    readonly uri: vscode.Uri;
    readonly resource?: ScmResource;
}

interface ResolvedRepositoryPaths {
    readonly repository: SvnRepository;
    readonly paths: string[];
}

interface ResolvedNodeInfoTarget {
    readonly target: ResolvedPathTarget;
    readonly nodeInfo: SvnNodeInfo;
    readonly displayPath: string;
}

interface SerializedUriLike {
    readonly scheme: string;
    readonly path: string;
    readonly authority?: string;
    readonly query?: string;
    readonly fragment?: string;
}

const conflictActionDefinitions: readonly ConflictActionDefinition[] = [
    {
        selectedCommand: "svn-tree.resolve-conflict",
        allCommand: "svn-tree.resolve-all-conflicts",
        labelKey: "resolveAllConflictsActionLabel",
        descriptionKey: "resolveAllConflictsActionDescription",
        run: (repository, paths) => repository.markResolved(paths),
    },
    {
        selectedCommand: "svn-tree.accept-mine",
        allCommand: "svn-tree.accept-mine-all",
        labelKey: "acceptMineAllActionLabel",
        descriptionKey: "acceptMineAllActionDescription",
        run: (repository, paths) => repository.acceptMine(paths),
    },
    {
        selectedCommand: "svn-tree.accept-base",
        allCommand: "svn-tree.accept-base-all",
        labelKey: "acceptBaseAllActionLabel",
        descriptionKey: "acceptBaseAllActionDescription",
        run: (repository, paths) => repository.acceptBase(paths),
    },
    {
        selectedCommand: "svn-tree.accept-mine-conflict",
        allCommand: "svn-tree.accept-mine-conflict-all",
        labelKey: "acceptMineConflictAllActionLabel",
        descriptionKey: "acceptMineConflictAllActionDescription",
        run: (repository, paths) => repository.acceptMineConflict(paths),
    },
    {
        selectedCommand: "svn-tree.accept-theirs-conflict",
        allCommand: "svn-tree.accept-theirs-conflict-all",
        labelKey: "acceptTheirsConflictAllActionLabel",
        descriptionKey: "acceptTheirsConflictAllActionDescription",
        run: (repository, paths) => repository.acceptTheirsConflict(paths),
    },
    {
        selectedCommand: "svn-tree.accept-theirs",
        allCommand: "svn-tree.accept-theirs-all",
        labelKey: "acceptTheirsAllActionLabel",
        descriptionKey: "acceptTheirsAllActionDescription",
        run: (repository, paths) => repository.acceptTheirs(paths),
    },
    {
        selectedCommand: "svn-tree.postpone-conflict",
        allCommand: "svn-tree.postpone-all-conflicts",
        labelKey: "postponeAllConflictsActionLabel",
        descriptionKey: "postponeAllConflictsActionDescription",
        run: (repository, paths) => repository.postponeConflicts(paths),
    },
] as const;

export class SvnRepositoryManager implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private readonly repositories = new Map<string, SvnRepository>();
    private readonly repositoryWatchers = new Map<string, vscode.FileSystemWatcher>();
    private readonly saveRefreshTimers = new Map<string, NodeJS.Timeout>();
    private readonly outputChannel = vscode.window.createOutputChannel("SVN Tree");
    private readonly historyStatusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    private readonly svnService = new SvnService(this.outputChannel);
    private readonly contentProvider = new SvnContentProvider(this.svnService);
    private readonly historyPanel: HistoryPanel;
    private readonly inspectorPanel: SvnInspectorPanel;
    private readonly conflictInspectorPanel: SvnConflictInspectorPanel;
    private readonly repositoryBrowserPanel: RepositoryBrowserPanel;
    private readonly revisionGraphPanel: RevisionGraphPanel;
    private readonly inlineBlameController: SvnInlineBlameController;
    private remoteRefreshTimer: NodeJS.Timeout | undefined;

    public constructor(context: vscode.ExtensionContext) {
        this.historyPanel = new HistoryPanel(context.extensionUri);
        this.inspectorPanel = new SvnInspectorPanel(context.extensionUri);
        this.conflictInspectorPanel = new SvnConflictInspectorPanel(context.extensionUri, (error) =>
            this.showError(error)
        );
        this.repositoryBrowserPanel = new RepositoryBrowserPanel(context.extensionUri);
        this.revisionGraphPanel = new RevisionGraphPanel(context.extensionUri);
        this.inlineBlameController = new SvnInlineBlameController((uri) =>
            this.getRepositoryForUri(uri)
        );
        this.historyStatusBarItem.text = "$(history)";
        this.historyStatusBarItem.tooltip = getI18n().t("historyStatusTooltip");
        this.historyStatusBarItem.command = "svn-tree.open-history";
        this.historyStatusBarItem.hide();

        this.disposables.push(
            this.historyStatusBarItem,
            this.outputChannel,
            this.historyPanel,
            this.inspectorPanel,
            this.conflictInspectorPanel,
            this.repositoryBrowserPanel,
            this.revisionGraphPanel,
            this.inlineBlameController,
            vscode.workspace.registerTextDocumentContentProvider(
                SvnContentProvider.scheme,
                this.contentProvider
            ),
            ...this.registerCommands(),
            ...this.registerWorkspaceListeners()
        );

        this.restartRemoteRefreshTimer();
        void this.initialize();
    }

    private registerCommands(): vscode.Disposable[] {
        return [
            ...this.createRepositoryCommandRegistrations().map(({ command, run }) =>
                this.registerRepositoryCommand(command, run)
            ),
            ...this.createCommandRegistrations().map(({ command, run }) =>
                this.registerCommand(command, run)
            ),
        ];
    }

    private createRepositoryCommandRegistrations(): RepositoryCommandRegistration[] {
        return [
            {
                command: "svn-tree.refresh",
                run: (repository) => repository.refreshWithProgress({ forceRemote: true }),
            },
            {
                command: "svn-tree.commit",
                run: (repository) => repository.commit(),
            },
            {
                command: "svn-tree.update",
                run: (repository) => repository.update(),
            },
            {
                command: "svn-tree.update-to-revision",
                run: (repository) => this.promptUpdateToRevision(repository),
            },
            {
                command: "svn-tree.cleanup",
                run: (repository) => repository.cleanup(),
            },
            {
                command: "svn-tree.open-history",
                run: (repository) => repository.showHistory(),
            },
            {
                command: "svn-tree.switch-reference",
                run: (repository) => repository.switchRepositoryReference(),
            },
            {
                command: "svn-tree.merge-into-working-copy",
                run: (repository) => repository.mergeIntoWorkingCopy(),
            },
            {
                command: "svn-tree.create-branch-from-working-copy",
                run: (repository) => repository.createBranchFromWorkingCopy(),
            },
            {
                command: "svn-tree.create-tag-from-working-copy",
                run: (repository) => repository.createTagFromWorkingCopy(),
            },
            {
                command: "svn-tree.delete-reference",
                run: (repository) => repository.deleteRepositoryReference(),
            },
            {
                command: "svn-tree.relocate-working-copy",
                run: (repository) => repository.relocateWorkingCopy(),
            },
        ];
    }

    private createCommandRegistrations(): CommandRegistration[] {
        return [
            {
                command: "svn-tree.commit-selected",
                run: (arg) => this.commitSelected(arg),
            },
            {
                command: "svn-tree.commit-changelist",
                run: (arg) => this.commitChangelist(arg),
            },
            {
                command: "svn-tree.update-selected",
                run: (arg) => this.updateSelected(arg),
            },
            {
                command: "svn-tree.update-selected-to-revision",
                run: (arg) => this.updateSelectedToRevision(arg),
            },
            {
                command: "svn-tree.show-blame",
                run: (arg) => this.showBlame(arg),
            },
            {
                command: "svn-tree.show-blame-text",
                run: (arg) => this.showBlameText(arg),
            },
            {
                command: "svn-tree.toggle-inline-blame",
                run: () => this.inlineBlameController.toggle(),
            },
            {
                command: "svn-tree.show-properties",
                run: (arg) => this.showProperties(arg),
            },
            {
                command: "svn-tree.edit-property",
                run: (arg) => this.editProperty(arg),
            },
            {
                command: "svn-tree.edit-ignore",
                run: (arg) => this.editIgnore(arg),
            },
            {
                command: "svn-tree.edit-externals",
                run: (arg) => this.editExternals(arg),
            },
            {
                command: "svn-tree.set-depth",
                run: (arg) => this.setDepth(arg),
            },
            {
                command: "svn-tree.open-repository-browser",
                run: (arg) => this.openRepositoryBrowser(arg),
            },
            {
                command: "svn-tree.open-revision-graph",
                run: (arg) => this.openRevisionGraph(arg),
            },
            {
                command: "svn-tree.open-repository-actions",
                run: (arg) => this.openRepositoryActions(arg),
            },
            {
                command: "svn-tree.checkout-from-url",
                run: async () => this.checkoutFromUrl(),
            },
            {
                command: "svn-tree.import-local-folder",
                run: async () => this.importLocalFolder(),
            },
            {
                command: "svn-tree.show-output",
                run: async () => {
                    this.outputChannel.show(true);
                },
            },
            {
                command: "svn-tree.export-patch",
                run: (arg) => this.exportPatch(arg),
            },
            {
                command: "svn-tree.apply-patch",
                run: (arg) => this.applyPatch(arg),
            },
            {
                command: "svn-tree.open-diff",
                run: (arg) => this.openDiff(arg),
            },
            {
                command: "svn-tree.open-file",
                run: (arg) => this.openFile(arg),
            },
            {
                command: "svn-tree.revert-resource",
                run: (arg) => this.revertResource(arg),
            },
            {
                command: "svn-tree.revert-group",
                run: (arg) => this.revertGroup(arg),
            },
            {
                command: "svn-tree.add-resource",
                run: (arg) => this.addResource(arg),
            },
            {
                command: "svn-tree.ignore-resource",
                run: (arg) => this.ignoreResource(arg),
            },
            {
                command: "svn-tree.add-group",
                run: (arg) => this.addGroup(arg),
            },
            {
                command: "svn-tree.delete-resource",
                run: (arg) => this.deleteResource(arg),
            },
            {
                command: "svn-tree.rename-path",
                run: (arg) => this.renamePath(arg),
            },
            {
                command: "svn-tree.lock-path",
                run: (arg) => this.lockPath(arg),
            },
            {
                command: "svn-tree.unlock-path",
                run: (arg) => this.unlockPath(arg),
            },
            {
                command: "svn-tree.ignore-path",
                run: (arg) => this.ignorePath(arg),
            },
            {
                command: "svn-tree.unignore-path",
                run: (arg) => this.unignorePath(arg),
            },
            {
                command: "svn-tree.show-path-info",
                run: (arg) => this.showPathInfo(arg),
            },
            {
                command: "svn-tree.copy-repository-url",
                run: (arg) => this.copyRepositoryUrl(arg),
            },
            {
                command: "svn-tree.copy-repository-path",
                run: (arg) => this.copyRepositoryPath(arg),
            },
            {
                command: "svn-tree.delete-group",
                run: (arg) => this.deleteGroup(arg),
            },
            {
                command: "svn-tree.open-history-diff",
                run: (arg) => this.openDiff(arg),
            },
            {
                command: "svn-tree.open-file-history",
                run: (arg) => this.openFileHistory(arg),
            },
            {
                command: "svn-tree.open-conflict-inspector",
                run: (arg) => this.openConflictInspector(arg),
            },
            ...this.createConflictCommandRegistrations(),
            {
                command: "svn-tree.add-to-changelist",
                run: (arg) => this.addToChangelist(arg),
            },
            {
                command: "svn-tree.remove-from-changelist",
                run: (arg) => this.removeFromChangelist(arg),
            },
            ...[
                "svn-tree.reveal-in-finder",
                "svn-tree.reveal-in-explorer",
                "svn-tree.reveal-in-system-file-manager",
                "svn-tree.reveal-in-file-manager",
            ].map((command) => ({
                command,
                run: (arg: unknown) => this.revealInFileManager(arg),
            })),
        ];
    }

    private createConflictCommandRegistrations(): CommandRegistration[] {
        return [
            ...conflictActionDefinitions.map(({ selectedCommand, run }) => ({
                command: selectedCommand,
                run: (arg?: unknown) => this.runSelectedConflictAction(arg, run),
            })),
            ...conflictActionDefinitions.map(({ allCommand, run }) => ({
                command: allCommand,
                run: (arg?: unknown) => this.runAllConflictAction(arg, run),
            })),
        ];
    }

    private registerWorkspaceListeners(): vscode.Disposable[] {
        return [
            vscode.workspace.onDidSaveTextDocument((document) => {
                this.scheduleRefreshRepositoryForUri(document.uri, false);
            }),
            vscode.workspace.onDidCreateFiles((event) => {
                for (const file of event.files) {
                    void this.refreshRepositoryForUri(file, false);
                }
            }),
            vscode.workspace.onDidDeleteFiles((event) => {
                for (const file of event.files) {
                    void this.refreshRepositoryForUri(file, false);
                }
            }),
            vscode.workspace.onDidRenameFiles((event) => {
                for (const file of event.files) {
                    void this.refreshRepositoryForUri(file.oldUri, false);
                    void this.refreshRepositoryForUri(file.newUri, false);
                }
            }),
            vscode.window.onDidChangeWindowState((state) => {
                if (state.focused) {
                    void this.refreshAll(true);
                }
            }),
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                void this.initialize();
            }),
            vscode.workspace.onDidChangeConfiguration((event) => {
                const languageChanged = event.affectsConfiguration("svn-tree.displayLanguage");
                const remoteChanged =
                    event.affectsConfiguration("svn-tree.enable-remote-status") ||
                    event.affectsConfiguration("svn-tree.remote-status-interval-seconds");

                if (languageChanged) {
                    this.refreshLocalization();
                }

                if (remoteChanged) {
                    this.restartRemoteRefreshTimer();
                }

                if (languageChanged || remoteChanged) {
                    void this.refreshAll(false);
                }
            }),
        ];
    }

    private registerRepositoryCommand(
        command: string,
        action: RepositoryCommandHandler
    ): vscode.Disposable {
        return vscode.commands.registerCommand(command, async (arg?: unknown) =>
            this.runForRepository(arg, action)
        );
    }

    private registerCommand(
        command: string,
        action: (arg?: unknown) => Promise<void>
    ): vscode.Disposable {
        return vscode.commands.registerCommand(command, async (arg?: unknown) => action(arg));
    }

    public dispose(): void {
        for (const repository of this.repositories.values()) {
            repository.dispose();
        }

        this.repositories.clear();
        for (const watcher of this.repositoryWatchers.values()) {
            watcher.dispose();
        }
        this.repositoryWatchers.clear();
        for (const timer of this.saveRefreshTimers.values()) {
            clearTimeout(timer);
        }
        this.saveRefreshTimers.clear();
        if (this.remoteRefreshTimer) {
            clearInterval(this.remoteRefreshTimer);
            this.remoteRefreshTimer = undefined;
        }

        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }

    private async initialize(): Promise<void> {
        if (!(await this.ensureSvnAvailable())) {
            return;
        }

        const discoveredRoots = new Set<string>();

        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            const info = await this.svnService.getWorkingCopyInfo(folder.uri.fsPath);
            if (!info) {
                continue;
            }

            discoveredRoots.add(info.rootPath);
            this.registerRepository(info);
        }

        for (const [rootPath, repository] of this.repositories.entries()) {
            if (!discoveredRoots.has(rootPath)) {
                repository.dispose();
                this.repositories.delete(rootPath);
            }
        }

        this.syncRepositoryWatchers();
        this.refreshLocalization();
        this.updateHistoryStatusBarVisibility();
        await this.refreshAll(true);
        this.inlineBlameController.refresh();
    }

    private async ensureSvnAvailable(): Promise<boolean> {
        const isAvailable = await this.svnService.checkAvailability();
        if (!isAvailable) {
            void vscode.window.showWarningMessage(getI18n().t("noSvnExecutableWarning"));
            return false;
        }

        return true;
    }

    private registerRepository(info: SvnWorkingCopyInfo): SvnRepository {
        const existingRepository = this.repositories.get(info.rootPath);
        if (existingRepository) {
            return existingRepository;
        }

        const repository = new SvnRepository(
            info,
            this.svnService,
            this.historyPanel,
            this.inspectorPanel,
            this.conflictInspectorPanel,
            this.repositoryBrowserPanel,
            this.revisionGraphPanel,
            this.contentProvider,
            this.outputChannel
        );

        this.repositories.set(info.rootPath, repository);
        return repository;
    }

    private async registerRepositoryForPath(
        candidatePath: string,
        forceRemote: boolean
    ): Promise<void> {
        const info = await this.svnService.getWorkingCopyInfo(candidatePath);
        if (!info) {
            return;
        }

        const repository = this.registerRepository(info);
        this.syncRepositoryWatchers();
        this.refreshLocalization();
        this.updateHistoryStatusBarVisibility();
        await repository.refresh({ forceRemote });
    }

    private async refreshAll(forceRemote: boolean): Promise<void> {
        for (const repository of this.repositories.values()) {
            try {
                await repository.refresh({ forceRemote });
            } catch (error) {
                this.showError(error);
            }
        }
    }

    private async refreshRepositoryForUri(uri: vscode.Uri, forceRemote: boolean): Promise<void> {
        const repository = this.getRepositoryForUri(uri);
        if (!repository) {
            return;
        }

        try {
            await repository.refresh({ forceRemote });
        } catch (error) {
            this.showError(error);
        }
    }

    private scheduleRefreshRepositoryForUri(
        uri: vscode.Uri,
        forceRemote: boolean,
        delayMs = 150
    ): void {
        const repository = this.getRepositoryForUri(uri);
        if (!repository) {
            return;
        }

        const timerKey = repository.rootPath;
        const existingTimer = this.saveRefreshTimers.get(timerKey);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        const timer = setTimeout(() => {
            this.saveRefreshTimers.delete(timerKey);
            void this.refreshRepositoryForUri(uri, forceRemote);
        }, delayMs);

        this.saveRefreshTimers.set(timerKey, timer);
    }

    private syncRepositoryWatchers(): void {
        for (const [rootPath, watcher] of this.repositoryWatchers.entries()) {
            if (!this.repositories.has(rootPath)) {
                watcher.dispose();
                this.repositoryWatchers.delete(rootPath);
            }
        }

        for (const rootPath of this.repositories.keys()) {
            if (this.repositoryWatchers.has(rootPath)) {
                continue;
            }

            const watcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(rootPath, "**/*")
            );
            const onChange = (uri: vscode.Uri) => {
                if (this.isInternalSvnPath(uri.fsPath)) {
                    return;
                }

                this.scheduleRefreshRepositoryForUri(uri, false, 250);
            };

            watcher.onDidChange(onChange);
            watcher.onDidCreate(onChange);
            watcher.onDidDelete(onChange);
            this.repositoryWatchers.set(rootPath, watcher);
        }
    }

    private isInternalSvnPath(targetPath: string): boolean {
        return targetPath.split(nodePath.sep).includes(".svn");
    }

    private getRepositoryForUri(uri: vscode.Uri): SvnRepository | undefined {
        const candidates = [...this.repositories.values()].filter((repository) =>
            isSameOrChildWorkingCopyPath(repository.rootPath, uri.fsPath)
        );

        if (candidates.length === 0) {
            return undefined;
        }

        return candidates.sort((left, right) => right.rootPath.length - left.rootPath.length)[0];
    }

    private async runForRepository(
        arg: unknown,
        action: (repository: SvnRepository) => Promise<void>
    ): Promise<void> {
        try {
            const repository = await this.resolveRepository(arg);
            if (!repository) {
                return;
            }

            await action(repository);
        } catch (error) {
            this.showError(error);
        }
    }

    private async resolveRepository(arg: unknown): Promise<SvnRepository | undefined> {
        const i18n = getI18n();

        if (Array.isArray(arg) && arg.length > 0) {
            for (const item of arg) {
                if (item instanceof SvnRepository) {
                    return item;
                }

                if (item instanceof ScmResource) {
                    return item.repository;
                }

                if (item instanceof vscode.Uri) {
                    const repository = this.getRepositoryForUri(item);
                    if (repository) {
                        return repository;
                    }
                }

                if (this.hasRootUri(item) && item.rootUri instanceof vscode.Uri) {
                    const repository = this.getRepositoryForUri(item.rootUri);
                    if (repository) {
                        return repository;
                    }
                }
            }

            return this.resolveRepository(arg[0]);
        }

        if (arg instanceof SvnRepository) {
            return arg;
        }

        if (arg instanceof ScmResource) {
            return arg.repository;
        }

        if (arg instanceof vscode.Uri) {
            return this.getRepositoryForUri(arg);
        }

        if (this.hasRootUri(arg) && arg.rootUri instanceof vscode.Uri) {
            return this.getRepositoryForUri(arg.rootUri);
        }

        const activeUri = vscode.window.activeTextEditor?.document.uri;
        if (activeUri) {
            const repository = this.getRepositoryForUri(activeUri);
            if (repository) {
                return repository;
            }
        }

        if (this.repositories.size === 1) {
            return [...this.repositories.values()][0];
        }

        if (this.repositories.size === 0) {
            void vscode.window.showInformationMessage(i18n.t("noWorkingCopyInfo"));
            return undefined;
        }

        const selection = await vscode.window.showQuickPick(
            [...this.repositories.values()].map((repository) => ({
                label: repository.label,
                description: repository.rootPath,
                repository,
            })),
            {
                placeHolder: i18n.t("selectWorkingCopyPlaceholder"),
            }
        );

        return selection?.repository;
    }

    private hasRootUri(arg: unknown): arg is { rootUri?: vscode.Uri } {
        return typeof arg === "object" && arg !== null && "rootUri" in arg;
    }

    private updateHistoryStatusBarVisibility(): void {
        if (this.repositories.size > 0) {
            this.historyStatusBarItem.show();
            return;
        }

        this.historyStatusBarItem.hide();
    }

    private getRepositoryActionCategoryDefinitions(): RepositoryActionCategoryDefinition[] {
        return [
            {
                labelKey: "browseActionsCategoryLabel",
                descriptionKey: "browseActionsCategoryDescription",
                actions: [
                    {
                        labelKey: "refreshStatusActionLabel",
                        descriptionKey: "refreshStatusActionDescription",
                        run: (repository) => repository.refreshWithProgress({ forceRemote: true }),
                    },
                    {
                        labelKey: "openHistoryActionLabel",
                        descriptionKey: "openHistoryActionDescription",
                        run: (repository) => repository.showHistory(),
                    },
                    {
                        labelKey: "revisionGraphActionLabel",
                        descriptionKey: "revisionGraphActionDescription",
                        run: (repository) => repository.showHistory(),
                    },
                    {
                        labelKey: "repositoryBrowserActionLabel",
                        descriptionKey: "repositoryBrowserActionDescription",
                        run: (repository) => repository.openRepositoryBrowser(),
                    },
                    {
                        labelKey: "showPropertiesActionLabel",
                        descriptionKey: "showPropertiesActionDescription",
                        run: (repository) => repository.showPathProperties(repository.rootPath),
                    },
                ],
            },
            {
                labelKey: "workingCopyActionsCategoryLabel",
                descriptionKey: "workingCopyActionsCategoryDescription",
                actions: [
                    {
                        labelKey: "updateWorkingCopyActionLabel",
                        descriptionKey: "updateWorkingCopyActionDescription",
                        run: (repository) => repository.update(),
                    },
                    {
                        labelKey: "updateToRevisionActionLabel",
                        descriptionKey: "updateToRevisionActionDescription",
                        run: (repository) => this.promptUpdateToRevision(repository),
                    },
                    {
                        labelKey: "switchWorkingCopyActionLabel",
                        descriptionKey: "switchWorkingCopyActionDescription",
                        run: (repository) => repository.switchRepositoryReference(),
                    },
                    {
                        labelKey: "mergeWorkingCopyActionLabel",
                        descriptionKey: "mergeWorkingCopyActionDescription",
                        run: (repository) => repository.mergeIntoWorkingCopy(),
                    },
                    {
                        labelKey: "createBranchFromWorkingCopyActionLabel",
                        descriptionKey: "createBranchFromWorkingCopyActionDescription",
                        run: (repository) => repository.createBranchFromWorkingCopy(),
                    },
                    {
                        labelKey: "createTagFromWorkingCopyActionLabel",
                        descriptionKey: "createTagFromWorkingCopyActionDescription",
                        run: (repository) => repository.createTagFromWorkingCopy(),
                    },
                    {
                        labelKey: "deleteReferenceActionLabel",
                        descriptionKey: "deleteReferenceActionDescription",
                        run: (repository) => repository.deleteRepositoryReference(),
                    },
                    {
                        labelKey: "relocateWorkingCopyActionLabel",
                        descriptionKey: "relocateWorkingCopyActionDescription",
                        run: (repository) => repository.relocateWorkingCopy(),
                    },
                    {
                        labelKey: "editIgnoreActionLabel",
                        descriptionKey: "editIgnoreActionDescription",
                        run: (repository) => repository.editIgnoreRules(repository.rootPath, "dir"),
                    },
                    {
                        labelKey: "editExternalsActionLabel",
                        descriptionKey: "editExternalsActionDescription",
                        run: (repository) =>
                            repository.editExternalsDefinitions(repository.rootPath, "dir"),
                    },
                    {
                        labelKey: "setDepthActionLabel",
                        descriptionKey: "setDepthActionDescription",
                        run: async (repository) => {
                            const depth = await repository.promptWorkingCopyDepth(false);
                            if (!depth) {
                                return;
                            }

                            await repository.setWorkingCopyDepth(depth);
                        },
                    },
                ],
            },
            {
                labelKey: "changeActionsCategoryLabel",
                descriptionKey: "changeActionsCategoryDescription",
                actions: [
                    {
                        labelKey: "commitActionLabel",
                        descriptionKey: "commitActionDescription",
                        run: (repository) => repository.commit(),
                    },
                    {
                        labelKey: "commitChangelistActionLabel",
                        descriptionKey: "commitChangelistActionDescription",
                        run: async (repository) => {
                            const changelistName = await this.promptChangelistName();
                            if (!changelistName) {
                                return;
                            }

                            await repository.commitChangelist(changelistName);
                        },
                    },
                    {
                        labelKey: "addAllUnversionedActionLabel",
                        descriptionKey: "addAllUnversionedActionDescription",
                        run: (repository) => this.addGroup(repository),
                    },
                    {
                        labelKey: "deleteAllUnversionedActionLabel",
                        descriptionKey: "deleteAllUnversionedActionDescription",
                        run: (repository) => this.deleteGroup(repository),
                    },
                    {
                        labelKey: "revertAllChangesActionLabel",
                        descriptionKey: "revertAllChangesActionDescription",
                        run: (repository) => this.revertGroup(repository),
                    },
                    {
                        labelKey: "exportPatchActionLabel",
                        descriptionKey: "exportPatchActionDescription",
                        run: (repository) => repository.exportWorkingCopyPatch(),
                    },
                    {
                        labelKey: "applyPatchActionLabel",
                        descriptionKey: "applyPatchActionDescription",
                        run: (repository) => repository.applyPatchToWorkingCopy(),
                    },
                ],
            },
            {
                labelKey: "conflictActionsCategoryLabel",
                descriptionKey: "conflictActionsCategoryDescription",
                actions: conflictActionDefinitions.map((definition) => ({
                    labelKey: definition.labelKey,
                    descriptionKey: definition.descriptionKey,
                    run: (repository) => this.runAllConflictAction(repository, definition.run),
                })),
            },
            {
                labelKey: "toolActionsCategoryLabel",
                descriptionKey: "toolActionsCategoryDescription",
                actions: [
                    {
                        labelKey: "cleanupWorkingCopyActionLabel",
                        descriptionKey: "cleanupWorkingCopyActionDescription",
                        run: (repository) => repository.cleanup(),
                    },
                    {
                        labelKey: "showOutputActionLabel",
                        descriptionKey: "showOutputActionDescription",
                        run: async () => {
                            this.outputChannel.show(true);
                        },
                    },
                ],
            },
        ];
    }

    private localizeRepositoryActionCategories(): RepositoryActionCategoryItem[] {
        const i18n = getI18n();
        const definitions: QuickPickActionCategoryDefinition<SvnRepository>[] =
            this.getRepositoryActionCategoryDefinitions().map((category) => ({
                label: i18n.t(category.labelKey),
                description: i18n.t(category.descriptionKey),
                actions: category.actions.map((action) => ({
                    label: i18n.t(action.labelKey),
                    description: i18n.t(action.descriptionKey),
                    run: action.run,
                })),
            }));

        return buildQuickPickActionCategories(definitions);
    }

    private async openRepositoryActions(arg: unknown): Promise<void> {
        const repository = await this.resolveRepository(arg);
        if (!repository) {
            return;
        }
        const i18n = getI18n();
        const categories = this.localizeRepositoryActionCategories();

        while (true) {
            const category = await vscode.window.showQuickPick<RepositoryActionCategoryItem>(
                categories,
                {
                    placeHolder: i18n.t("actionCategoriesPlaceholder", {
                        label: repository.label,
                    }),
                }
            );

            if (!category) {
                return;
            }

            const selection = await vscode.window.showQuickPick<RepositoryActionItem>(
                category.actions,
                {
                    placeHolder: i18n.t("actionCategoryPlaceholder", {
                        category: category.label,
                        label: repository.label,
                    }),
                }
            );

            if (!selection) {
                continue;
            }

            try {
                await selection.run(repository);
            } catch (error) {
                this.showError(error);
            }
            return;
        }
    }

    private async openDiff(arg: unknown): Promise<void> {
        if (
            typeof arg === "object" &&
            arg !== null &&
            "rootPath" in arg &&
            "revision" in arg &&
            "path" in arg &&
            "action" in arg
        ) {
            const payload = arg as {
                rootPath?: unknown;
                revision?: unknown;
                path?: unknown;
                action?: unknown;
            };

            if (
                typeof payload.rootPath !== "string" ||
                typeof payload.revision !== "number" ||
                typeof payload.path !== "string" ||
                typeof payload.action !== "string"
            ) {
                return;
            }

            const repository = this.repositories.get(payload.rootPath);
            if (!repository) {
                return;
            }

            try {
                await repository.openHistoryDiff(payload.revision, payload.path, payload.action);
            } catch (error) {
                this.showError(error);
            }

            return;
        }

        if (arg instanceof ScmResource) {
            try {
                await arg.repository.openResourceDiff(arg);
            } catch (error) {
                this.showError(error);
            }
            return;
        }

        if (arg instanceof vscode.Uri) {
            const repository = this.getRepositoryForUri(arg);
            if (!repository) {
                return;
            }

            const status = {
                absolutePath: arg.fsPath,
                relativePath: nodePath.relative(repository.rootPath, arg.fsPath),
                kind: "file" as const,
                wcStatus: "modified" as const,
            };

            try {
                await repository.openResourceDiff(new ScmResource(repository, status, "change"));
            } catch (error) {
                this.showError(error);
            }
        }
    }

    private async updateSelectedToRevision(arg: unknown): Promise<void> {
        const resources = this.getSelectedResources(arg, ["svn-change"]);
        if (resources.length === 0) {
            return;
        }

        try {
            const revision = await this.promptRevisionNumber({
                title: getI18n().t("updateSelectedToRevisionActionLabel"),
                prompt: getI18n().t("updateSelectedToRevisionInputPrompt"),
                placeHolder: getI18n().t("updateSelectedToRevisionInputPlaceholder"),
            });
            if (revision === undefined) {
                return;
            }

            await resources[0].repository.updateSelectedToRevisionPaths(
                resources.map((resource) => resource.status.absolutePath),
                revision
            );
        } catch (error) {
            this.showError(error);
        }
    }

    private async promptUpdateToRevision(repository: SvnRepository): Promise<void> {
        const revision = await this.promptRevisionNumber({
            title: getI18n().t("updateToRevisionActionLabel"),
            prompt: getI18n().t("updateToRevisionInputPrompt"),
            placeHolder: getI18n().t("updateToRevisionInputPlaceholder"),
        });
        if (revision === undefined) {
            return;
        }

        await repository.updateToRevision(revision);
    }

    private async promptRevisionNumber(options: {
        title: string;
        prompt: string;
        placeHolder: string;
    }): Promise<number | undefined> {
        const i18n = getI18n();
        const selection = await vscode.window.showInputBox({
            title: options.title,
            prompt: options.prompt,
            placeHolder: options.placeHolder,
            validateInput: (value) => this.validateRevisionInput(value),
        });

        if (selection === undefined) {
            return undefined;
        }

        const revision = this.parseRevisionInput(selection);
        if (!revision) {
            throw new Error(i18n.t("invalidRevisionError"));
        }

        return revision;
    }

    private parseRevisionInput(value: string): number | undefined {
        const trimmed = value.trim();
        if (!/^[1-9]\d*$/.test(trimmed)) {
            return undefined;
        }

        return Number(trimmed);
    }

    private validateRevisionInput(value: string): string | undefined {
        return this.parseRevisionInput(value) ? undefined : getI18n().t("invalidRevisionError");
    }

    private async openFile(arg: unknown): Promise<void> {
        const i18n = getI18n();
        const resource = arg instanceof ScmResource ? arg : undefined;
        const uri = resource?.resourceUri ?? (arg instanceof vscode.Uri ? arg : undefined);
        if (!uri) {
            return;
        }

        try {
            if (resource?.status.kind === "dir") {
                await vscode.commands.executeCommand("revealInExplorer", uri);
                return;
            }

            if (
                resource &&
                (resource.status.wcStatus === "deleted" || resource.status.wcStatus === "missing")
            ) {
                void vscode.window.showWarningMessage(
                    i18n.t("cannotOpenResourceWarning", {
                        path: resource.status.relativePath,
                        status: i18n.formatSvnStatus(resource.status.wcStatus),
                    })
                );
                return;
            }

            await vscode.window.showTextDocument(uri, { preview: true });
        } catch (error) {
            this.showError(error);
        }
    }

    private async openFileHistory(arg: unknown): Promise<void> {
        await this.runForUriRepository(arg, async (repository, uri) => {
            await repository.showFileHistory(uri);
        });
    }

    private async openConflictInspector(arg: unknown): Promise<void> {
        const target = this.resolvePathTargetOrShowInfo(arg);
        if (!target) {
            return;
        }

        if (!target.repository.canInspectConflict(target.uri.fsPath)) {
            this.showInformationStatus("noConflictsInfo");
            return;
        }

        try {
            await this.conflictInspectorPanel.show(target.repository, target.uri.fsPath);
        } catch (error) {
            this.showError(error);
        }
    }

    private async showPathInfo(arg: unknown): Promise<void> {
        await this.runForResolvedNodeInfoTarget(arg, async ({ nodeInfo, displayPath }) => {
            await this.inspectorPanel.showPathInfo({
                kind: "path-info",
                rootPath: nodeInfo.workingCopyRoot ?? nodeInfo.absolutePath,
                displayPath,
                nodeInfo,
            });
            void vscode.window.setStatusBarMessage(getI18n().t("openedPathInfoStatus"), 2000);
        });
    }

    private async checkoutFromUrl(prefilledRepositoryUrl?: string): Promise<void> {
        try {
            if (!(await this.ensureSvnAvailable())) {
                return;
            }

            const repositoryUrl = prefilledRepositoryUrl
                ? normalizeCheckoutRepositoryUrl(prefilledRepositoryUrl)
                : await this.promptCheckoutRepositoryUrl();
            if (!repositoryUrl) {
                return;
            }

            const revision = await this.promptCheckoutRevision(repositoryUrl);
            if (!revision) {
                return;
            }

            const checkoutDepth = await this.promptCheckoutDepth();
            if (!checkoutDepth) {
                return;
            }

            const destinationPath = await this.promptCheckoutDestination(repositoryUrl, revision);
            if (!destinationPath) {
                return;
            }

            const i18n = getI18n();
            const revisionLabel = this.formatCheckoutRevisionLabel(revision);
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: i18n.t("checkoutFromUrlProgress", {
                        url: repositoryUrl,
                        revision: revisionLabel,
                    }),
                },
                async () => {
                    await this.svnService.checkout(repositoryUrl, revision, destinationPath, {
                        depth: checkoutDepth,
                    });
                }
            );

            if (this.isPathWithinWorkspaceFolders(destinationPath)) {
                await this.registerRepositoryForPath(destinationPath, false);
            }

            await this.showCheckoutSuccessActions(repositoryUrl, revision, destinationPath);
        } catch (error) {
            this.showError(error);
        }
    }

    private async importLocalFolder(): Promise<void> {
        try {
            if (!(await this.ensureSvnAvailable())) {
                return;
            }

            const sourceFolderPath = await this.promptImportSourceFolder();
            if (!sourceFolderPath) {
                return;
            }

            const containingWorkingCopy =
                await this.findContainingWorkingCopyInfo(sourceFolderPath);
            if (containingWorkingCopy) {
                void vscode.window.showWarningMessage(
                    getI18n().t("importSourceFolderInWorkingCopyWarning", {
                        source: sourceFolderPath,
                        workingCopyRoot: containingWorkingCopy.workingCopyRoot,
                    })
                );
                return;
            }

            const repositoryUrl = await this.promptImportRepositoryUrl();
            if (!repositoryUrl) {
                return;
            }

            const commitMessage = await this.promptImportCommitMessage(sourceFolderPath);
            if (!commitMessage) {
                return;
            }

            const i18n = getI18n();
            const confirmed = await this.confirmModalAction({
                message: i18n.t("importLocalFolderQuestion"),
                buttonLabel: i18n.t("importLocalFolderButton"),
                detail: i18n.t("importLocalFolderDetail", {
                    source: sourceFolderPath,
                    url: repositoryUrl,
                    message: commitMessage,
                }),
            });
            if (!confirmed) {
                return;
            }

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: i18n.t("importLocalFolderProgress", {
                        source: this.getImportSourceDisplayLabel(sourceFolderPath),
                        url: repositoryUrl,
                    }),
                },
                async () => {
                    await this.svnService.importToUrl(
                        sourceFolderPath,
                        repositoryUrl,
                        commitMessage
                    );
                }
            );

            await this.showImportSuccessActions(sourceFolderPath, repositoryUrl);
        } catch (error) {
            this.showError(error);
        }
    }

    private async copyRepositoryUrl(arg: unknown): Promise<void> {
        await this.runForResolvedNodeInfoTarget(arg, async ({ nodeInfo }) => {
            await vscode.env.clipboard.writeText(nodeInfo.url);
            void vscode.window.setStatusBarMessage(getI18n().t("copiedRepositoryUrlStatus"), 2000);
        });
    }

    private async copyRepositoryPath(arg: unknown): Promise<void> {
        await this.runForResolvedNodeInfoTarget(arg, async ({ nodeInfo }) => {
            await vscode.env.clipboard.writeText(nodeInfo.repositoryRelativePath);
            void vscode.window.setStatusBarMessage(getI18n().t("copiedRepositoryPathStatus"), 2000);
        });
    }

    private async showBlame(arg: unknown): Promise<void> {
        await this.runForPathTarget(arg, async (target) => {
            if (this.shouldUseRepositoryPathTarget(target)) {
                const repositoryPath = target.repository.resolveRepositoryPath(target.uri.fsPath);
                await target.repository.showBlameForRepositoryPath(
                    repositoryPath,
                    target.repository.resolveRepositoryUrl(target.uri.fsPath)
                );
                return;
            }

            await this.inlineBlameController.toggleFileBlame(target.uri);
        });
    }

    private async showBlameText(arg: unknown): Promise<void> {
        await this.runForPathTarget(arg, async (target) => {
            if (this.shouldUseRepositoryPathTarget(target)) {
                const repositoryPath = target.repository.resolveRepositoryPath(target.uri.fsPath);
                await target.repository.showBlameForRepositoryPath(
                    repositoryPath,
                    target.repository.resolveRepositoryUrl(target.uri.fsPath)
                );
                return;
            }

            await target.repository.showBlame(target.uri);
        });
    }

    private async showProperties(arg: unknown): Promise<void> {
        await this.runForOptionalPathTargetOrRepository(
            arg,
            async (target) => {
                if (this.shouldUseRepositoryPathTarget(target)) {
                    const repositoryPath = target.repository.resolveRepositoryPath(
                        target.uri.fsPath
                    );
                    await target.repository.showRepositoryPathProperties(
                        repositoryPath,
                        target.repository.resolveRepositoryUrl(target.uri.fsPath)
                    );
                    return;
                }

                await target.repository.showPathProperties(target.uri);
            },
            (repository) => repository.showPathProperties(repository.rootPath)
        );
    }

    private async editProperty(arg: unknown): Promise<void> {
        await this.runForPathTarget(arg, async (target) => {
            await target.repository.editPathProperty(target.uri);
        });
    }

    private async editIgnore(arg: unknown): Promise<void> {
        await this.runForOptionalPathTargetOrRepository(
            arg,
            async (target) => {
                await target.repository.editIgnoreRules(target.uri, target.resource?.status.kind);
            },
            (repository) => repository.editIgnoreRules(repository.rootPath, "dir")
        );
    }

    private async editExternals(arg: unknown): Promise<void> {
        await this.runForOptionalPathTargetOrRepository(
            arg,
            async (target) => {
                await target.repository.editExternalsDefinitions(
                    target.uri,
                    target.resource?.status.kind
                );
            },
            (repository) => repository.editExternalsDefinitions(repository.rootPath, "dir")
        );
    }

    private async setDepth(arg: unknown): Promise<void> {
        const handledSelection = await this.runSelectedResourceAction(
            arg,
            ["svn-change", "svn-conflict", "svn-remote-change"],
            async (repository, paths) => {
                const depth = await repository.promptWorkingCopyDepth(true);
                if (!depth) {
                    return;
                }

                await repository.setWorkingCopyDepth(depth, paths);
            }
        );
        if (handledSelection) {
            return;
        }

        await this.runForOptionalPathTargetOrRepository(
            arg,
            async (target) => {
                const targetPath = nodePath.resolve(target.uri.fsPath);
                const isRootTarget = targetPath === nodePath.resolve(target.repository.rootPath);
                const depth = await target.repository.promptWorkingCopyDepth(!isRootTarget);
                if (!depth) {
                    return;
                }

                await target.repository.setWorkingCopyDepth(
                    depth,
                    isRootTarget ? undefined : [target.uri.fsPath]
                );
            },
            async (repository) => {
                const depth = await repository.promptWorkingCopyDepth(false);
                if (!depth) {
                    return;
                }

                await repository.setWorkingCopyDepth(depth);
            }
        );
    }

    private async openRepositoryBrowser(arg: unknown): Promise<void> {
        await this.runForOptionalPathTargetOrRepository(
            arg,
            async (target) => {
                const nodeInfo = await this.resolveNodeInfo(target);
                const repositoryPath = target.repository.resolveRepositoryPath(target.uri.fsPath);
                await target.repository.openRepositoryBrowser(
                    nodeInfo?.kind === "file"
                        ? nodePath.posix.dirname(repositoryPath).replace(/^$/, "/")
                        : repositoryPath
                );
            },
            (repository) => repository.openRepositoryBrowser()
        );
    }

    private async openRevisionGraph(arg: unknown): Promise<void> {
        await this.runForOptionalPathTargetOrRepository(
            arg,
            async (target) => {
                await target.repository.showRevisionGraph(
                    target.repository.resolveRepositoryPath(target.uri.fsPath)
                );
            },
            (repository) => repository.showRevisionGraph()
        );
    }

    private async renamePath(arg: unknown): Promise<void> {
        const target = this.resolvePathTargetOrShowInfo(arg);
        if (!target) {
            return;
        }

        const newName = await this.promptRenamePathName(target.repository, target.uri.fsPath);
        if (!newName) {
            return;
        }

        try {
            const renamedPath = await target.repository.renameWorkingCopyPath(
                target.uri.fsPath,
                newName
            );
            await vscode.commands.executeCommand("revealInExplorer", vscode.Uri.file(renamedPath));
        } catch (error) {
            this.showError(error);
        }
    }

    private async lockPath(arg: unknown): Promise<void> {
        await this.runLockablePathAction(arg, (repository, paths) =>
            repository.lockWorkingCopyPaths(paths)
        );
    }

    private async unlockPath(arg: unknown): Promise<void> {
        await this.runLockablePathAction(arg, (repository, paths) =>
            repository.unlockWorkingCopyPaths(paths)
        );
    }

    private async revertResource(arg: unknown): Promise<void> {
        const i18n = getI18n();
        await this.runForSingleResource(arg, async (resource) => {
            const confirmed = await this.confirmModalAction({
                message: i18n.t("revertResourceWarning", { path: resource.status.relativePath }),
                buttonLabel: i18n.t("revertButton"),
            });
            if (!confirmed) {
                return;
            }

            await resource.repository.revert([resource.status.absolutePath]);
        });
    }

    private async commitSelected(arg: unknown): Promise<void> {
        await this.runSelectedResourceAction(arg, ["svn-change"], (repository, paths) =>
            repository.commit(paths)
        );
    }

    private async commitChangelist(arg: unknown): Promise<void> {
        const repository = await this.resolveRepository(arg);
        if (!repository) {
            return;
        }

        const changelistName = await this.promptSelectedChangelistName(arg, [
            "svn-change",
            "svn-conflict",
        ]);
        if (!changelistName) {
            return;
        }

        try {
            await repository.commitChangelist(changelistName);
        } catch (error) {
            this.showError(error);
        }
    }

    private async updateSelected(arg: unknown): Promise<void> {
        await this.runSelectedResourceAction(arg, ["svn-change"], (repository, paths) =>
            repository.update(paths)
        );
    }

    private async runAllConflictAction(
        arg: unknown,
        action: ConflictCommandHandler
    ): Promise<void> {
        await this.runForRepository(arg, async (repository) => {
            const conflictedPaths = repository.getConflictedPaths();
            if (conflictedPaths.length === 0) {
                this.showInformationStatus("noConflictsInfo");
                return;
            }

            await action(repository, conflictedPaths);
        });
    }

    private async runSelectedConflictAction(
        arg: unknown,
        action: ConflictCommandHandler
    ): Promise<void> {
        await this.runSelectedResourceAction(arg, ["svn-conflict"], (repository, paths) =>
            action(repository, paths)
        );
    }

    private async revertGroup(arg: unknown): Promise<void> {
        const i18n = getI18n();
        await this.runGroupPathsAction(
            arg,
            {
                contextValue: "svn-changes-group",
                getFallbackPaths: (repository) => repository.getChangedPaths(),
                emptyMessageKey: "noLocalChangesInfo",
                confirm: (paths) =>
                    this.confirmModalAction({
                        message: i18n.t("revertGroupWarning", {
                            label: i18n.formatItemCount(paths.length),
                        }),
                        buttonLabel: i18n.t("revertAllButton"),
                    }),
            },
            async ({ repository, paths }) => {
                await repository.revert();
            }
        );
    }

    private async addResource(arg: unknown): Promise<void> {
        await this.runForSingleResource(arg, async (resource) => {
            await resource.repository.add([resource.status.absolutePath]);
        });
    }

    private async ignoreResource(arg: unknown): Promise<void> {
        await this.runForEachSelectedResource(arg, ["svn-unversioned"], async (resource) => {
            await resource.repository.ignoreWorkingCopyPath(resource.status.absolutePath);
        });
    }

    private async ignorePath(arg: unknown): Promise<void> {
        await this.runForUriRepository(arg, async (repository, uri) => {
            await repository.ignoreWorkingCopyPath(uri.fsPath);
        });
    }

    private async unignorePath(arg: unknown): Promise<void> {
        await this.runForUriRepository(arg, async (repository, uri) => {
            await repository.unignoreWorkingCopyPath(uri.fsPath);
        });
    }

    private async addGroup(arg: unknown): Promise<void> {
        await this.runGroupPathsAction(
            arg,
            {
                contextValue: "svn-unversioned-group",
                getFallbackPaths: (repository) => repository.getUnversionedPaths(),
                emptyMessageKey: "noUnversionedChangesInfo",
            },
            async ({ repository, paths }) => {
                await repository.add(paths);
            }
        );
    }

    private async addToChangelist(arg: unknown): Promise<void> {
        const changelistName = await this.promptSelectedChangelistName(arg, [
            "svn-change",
            "svn-conflict",
        ]);
        if (!changelistName) {
            return;
        }

        await this.runSelectedResourceAction(
            arg,
            ["svn-change", "svn-conflict"],
            (repository, paths) => repository.addToChangelist(paths, changelistName)
        );
    }

    private async removeFromChangelist(arg: unknown): Promise<void> {
        await this.runSelectedResourceAction(
            arg,
            ["svn-change", "svn-conflict"],
            (repository, paths) => repository.removeFromChangelist(paths)
        );
    }

    private async deleteGroup(arg: unknown): Promise<void> {
        const i18n = getI18n();
        await this.runGroupPathsAction(
            arg,
            {
                contextValue: "svn-unversioned-group",
                getFallbackPaths: (repository) => repository.getUnversionedPaths(),
                emptyMessageKey: "noUnversionedChangesInfo",
                confirm: (paths) =>
                    this.confirmModalAction({
                        message: i18n.t("deleteGroupWarning", {
                            label: i18n.formatItemCount(paths.length),
                        }),
                        buttonLabel: i18n.t("deleteAllButton"),
                    }),
            },
            async ({ repository, paths }) => {
                for (const targetPath of this.getUniqueDescendingPaths(paths)) {
                    await vscode.workspace.fs.delete(vscode.Uri.file(targetPath), {
                        recursive: true,
                        useTrash: true,
                    });
                }
                await repository.refresh();
            }
        );
    }

    private async revealInFileManager(arg: unknown): Promise<void> {
        await this.runForUriRepository(arg, async (repository, uri) => {
            await repository.revealWorkingCopyPathInFileManager(uri);
        });
    }

    private async exportPatch(arg: unknown): Promise<void> {
        const handledSelection = await this.runSelectedResourceAction(
            arg,
            ["svn-change", "svn-conflict"],
            (repository, paths) => repository.exportWorkingCopyPatch(paths)
        );
        if (handledSelection) {
            return;
        }

        await this.runForRepository(arg, (repository) => repository.exportWorkingCopyPatch());
    }

    private async applyPatch(arg: unknown): Promise<void> {
        await this.runForRepository(arg, (repository) => repository.applyPatchToWorkingCopy());
    }

    private async deleteResource(arg: unknown): Promise<void> {
        const resources = this.getSelectedResources(arg, ["svn-change", "svn-unversioned"]);
        if (resources.length === 0) {
            return;
        }

        const i18n = getI18n();
        const label =
            resources.length === 1
                ? resources[0].status.relativePath
                : i18n.formatItemCount(resources.length);
        const hasVersionedResources = resources.some(
            (resource) => resource.contextValue === "svn-change"
        );
        const hasUnversionedResources = resources.some(
            (resource) => resource.contextValue === "svn-unversioned"
        );
        const detail = hasVersionedResources
            ? hasUnversionedResources
                ? i18n.t("deleteMixedResourcesDetail")
                : i18n.t("deleteTrackedResourceDetail")
            : i18n.t("deleteUnversionedResourceDetail");
        const confirmed = await this.confirmModalAction({
            message: i18n.t("deleteResourceWarning", { path: label }),
            buttonLabel: i18n.t("deleteButton"),
            detail,
        });
        if (!confirmed) {
            return;
        }

        try {
            await this.deleteSelectedResources(resources);
        } catch (error) {
            this.showError(error);
        }
    }

    private showError(error: unknown): void {
        const i18n = getI18n();
        appendOutputSection(
            this.outputChannel,
            i18n.t("errorOutputHeader"),
            buildErrorOutputLines(error, {
                timeLabel: i18n.t("errorOutputTimeLabel"),
                messageLabel: i18n.t("errorOutputMessageLabel"),
                stackLabel: i18n.t("errorOutputStackLabel"),
                causeLabel: i18n.t("errorOutputCauseLabel"),
                valueLabel: i18n.t("errorOutputValueLabel"),
            })
        );

        const message = error instanceof Error ? error.message : String(error);
        const showOutputAction = i18n.t("showOutputActionLabel");
        void vscode.window.showErrorMessage(message, showOutputAction).then((selection) => {
            if (selection === showOutputAction) {
                this.outputChannel.show(true);
            }
        });
    }

    private showInformationStatus(messageKey: MessageKey): void {
        void vscode.window.showInformationMessage(getI18n().t(messageKey));
    }

    private refreshLocalization(): void {
        this.historyStatusBarItem.tooltip = getI18n().t("historyStatusTooltip");
        this.inspectorPanel.refreshLocalization();
        this.conflictInspectorPanel.refreshLocalization();

        for (const repository of this.repositories.values()) {
            repository.refreshLocalization();
            this.historyPanel.refreshLocalization(repository);
            this.repositoryBrowserPanel.refreshLocalization(repository);
            this.revisionGraphPanel.refreshLocalization(repository);
        }
    }

    private getGroupResources(arg: unknown, contextValue: string): ScmResource[] {
        if (
            typeof arg !== "object" ||
            arg === null ||
            !("contextValue" in arg) ||
            !("resourceStates" in arg)
        ) {
            return [];
        }

        const group = arg as {
            contextValue?: unknown;
            resourceStates?: unknown;
        };
        if (group.contextValue !== contextValue || !Array.isArray(group.resourceStates)) {
            return [];
        }

        return group.resourceStates.filter(
            (resource): resource is ScmResource => resource instanceof ScmResource
        );
    }

    private getSelectedResources(
        arg: unknown,
        contextValues: readonly string[] = []
    ): ScmResource[] {
        const resources = Array.isArray(arg)
            ? arg.filter((item): item is ScmResource => item instanceof ScmResource)
            : arg instanceof ScmResource
              ? [arg]
              : [];
        if (resources.length === 0 || contextValues.length === 0) {
            return resources;
        }

        return resources.filter((resource) => contextValues.includes(resource.contextValue));
    }

    private getCommonChangelistName(resources: readonly ScmResource[]): string | undefined {
        const names = [
            ...new Set(resources.map((resource) => resource.status.changelist).filter(Boolean)),
        ];
        return names.length === 1 ? names[0] : undefined;
    }

    private async promptSelectedChangelistName(
        arg: unknown,
        contextValues: readonly string[]
    ): Promise<string | undefined> {
        const resources = this.getSelectedResources(arg, contextValues);
        if (Array.isArray(arg) && resources.length === 0) {
            return undefined;
        }

        return this.promptChangelistName(this.getCommonChangelistName(resources));
    }

    private async promptChangelistName(value?: string): Promise<string | undefined> {
        const i18n = getI18n();
        const selection = await vscode.window.showInputBox({
            prompt: i18n.t("changelistNamePrompt"),
            placeHolder: i18n.t("changelistNamePlaceholder"),
            value,
            validateInput: (input) => (input.trim() ? undefined : i18n.t("changelistNameRequired")),
        });
        const trimmedSelection = selection?.trim();
        return trimmedSelection ? trimmedSelection : undefined;
    }

    private async promptImportSourceFolder(): Promise<string | undefined> {
        const i18n = getI18n();
        const selectedFolders = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: i18n.t("selectImportSourceFolderLabel"),
            title: i18n.t("selectImportSourceFolderTitle"),
        });
        const sourceFolder = selectedFolders?.[0];
        if (!sourceFolder) {
            return undefined;
        }

        if (!(await this.isDirectoryPath(sourceFolder.fsPath))) {
            void vscode.window.showWarningMessage(
                i18n.t("importSourceFolderUnavailableWarning", {
                    source: sourceFolder.fsPath,
                })
            );
            return undefined;
        }

        return sourceFolder.fsPath;
    }

    private async promptImportRepositoryUrl(): Promise<string | undefined> {
        const i18n = getI18n();
        const selection = await vscode.window.showInputBox({
            title: i18n.t("importLocalFolderActionLabel"),
            prompt: i18n.t("importRepositoryUrlPrompt"),
            placeHolder: i18n.t("checkoutRepositoryUrlPlaceholder"),
            validateInput: (value) => {
                const normalizedValue = normalizeCheckoutRepositoryUrl(value);
                if (normalizedValue) {
                    return undefined;
                }

                return value.trim()
                    ? i18n.t("importRepositoryUrlInvalid")
                    : i18n.t("importRepositoryUrlRequired");
            },
        });

        return normalizeCheckoutRepositoryUrl(selection);
    }

    private async promptImportCommitMessage(sourceFolderPath: string): Promise<string | undefined> {
        const i18n = getI18n();
        const selection = await vscode.window.showInputBox({
            title: i18n.t("importLocalFolderActionLabel"),
            prompt: i18n.t("importCommitMessagePrompt"),
            placeHolder: i18n.t("importCommitMessagePlaceholder"),
            value: this.getDefaultImportCommitMessage(sourceFolderPath),
            validateInput: (value) =>
                value.trim() ? undefined : i18n.t("importCommitMessageRequired"),
        });
        const trimmedSelection = selection?.trim();
        return trimmedSelection ? trimmedSelection : undefined;
    }

    private async promptCheckoutRepositoryUrl(): Promise<string | undefined> {
        const i18n = getI18n();
        const selection = await vscode.window.showInputBox({
            title: i18n.t("checkoutFromUrlActionLabel"),
            prompt: i18n.t("checkoutRepositoryUrlPrompt"),
            placeHolder: i18n.t("checkoutRepositoryUrlPlaceholder"),
            validateInput: (value) => {
                const normalizedValue = normalizeCheckoutRepositoryUrl(value);
                if (normalizedValue) {
                    return undefined;
                }

                return value.trim()
                    ? i18n.t("checkoutRepositoryUrlInvalid")
                    : i18n.t("checkoutRepositoryUrlRequired");
            },
        });

        return normalizeCheckoutRepositoryUrl(selection);
    }

    private async promptCheckoutRevision(repositoryUrl: string): Promise<string | undefined> {
        const i18n = getI18n();
        const selection = await vscode.window.showInputBox({
            title: i18n.t("checkoutFromUrlActionLabel"),
            prompt: i18n.t("checkoutRevisionPrompt", { url: repositoryUrl }),
            placeHolder: i18n.t("checkoutRevisionPlaceholder"),
            value: "HEAD",
            validateInput: (value) =>
                normalizeCheckoutRevision(value) ? undefined : i18n.t("checkoutRevisionInvalid"),
        });

        return normalizeCheckoutRevision(selection);
    }

    private async promptCheckoutDepth(): Promise<SvnCheckoutDepth | undefined> {
        const i18n = getI18n();
        const selection = await vscode.window.showQuickPick<
            SvnDepthQuickPickItem<SvnCheckoutDepth>
        >(
            getCheckoutDepthOptions().map((option) => ({
                label: i18n.t(option.labelKey),
                description: i18n.t(option.descriptionKey),
                depth: option.depth,
            })),
            {
                title: i18n.t("checkoutDepthTitle"),
                placeHolder: i18n.t("checkoutDepthPlaceholder"),
            }
        );

        return selection?.depth;
    }

    private async promptCheckoutDestination(
        repositoryUrl: string,
        revision: string
    ): Promise<string | undefined> {
        const i18n = getI18n();
        const selectedFolders = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: i18n.t("selectParentFolderLabel"),
            title: i18n.t("selectParentFolderCheckoutFromUrlTitle"),
        });
        const parentFolder = selectedFolders?.[0];
        if (!parentFolder) {
            return undefined;
        }

        const defaultFolderName = deriveCheckoutDestinationName(repositoryUrl, revision);
        const folderName = await vscode.window.showInputBox({
            title: i18n.t("checkoutFromUrlActionLabel"),
            prompt: i18n.t("checkoutFolderNamePrompt"),
            placeHolder: i18n.t("checkoutFolderNamePlaceholder"),
            value: defaultFolderName,
            validateInput: async (value) =>
                this.validateCheckoutFolderName(parentFolder.fsPath, value),
        });
        const trimmedFolderName = folderName?.trim();
        if (!trimmedFolderName) {
            return undefined;
        }

        const destinationPath = nodePath.join(parentFolder.fsPath, trimmedFolderName);
        if (await this.pathExists(destinationPath)) {
            void vscode.window.showWarningMessage(
                i18n.t("destinationExistsWarning", {
                    destination: destinationPath,
                })
            );
            return undefined;
        }

        return destinationPath;
    }

    private async validateCheckoutFolderName(
        parentFolderPath: string,
        value: string
    ): Promise<string | undefined> {
        const i18n = getI18n();
        const trimmedValue = value.trim();
        if (!trimmedValue) {
            return i18n.t("folderNameRequired");
        }

        if (trimmedValue.includes("/") || trimmedValue.includes("\\")) {
            return i18n.t("folderNamePathWarning");
        }

        if (trimmedValue === "." || trimmedValue === "..") {
            return i18n.t("renamePathInvalidNameError");
        }

        const destinationPath = nodePath.join(parentFolderPath, trimmedValue);
        if (await this.pathExists(destinationPath)) {
            return i18n.t("destinationExistsWarning", {
                destination: destinationPath,
            });
        }

        return undefined;
    }

    private async pathExists(targetPath: string): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(targetPath));
            return true;
        } catch {
            return false;
        }
    }

    private async isDirectoryPath(targetPath: string): Promise<boolean> {
        try {
            const stat = await vscode.workspace.fs.stat(vscode.Uri.file(targetPath));
            return (stat.type & vscode.FileType.Directory) !== 0;
        } catch {
            return false;
        }
    }

    private async findContainingWorkingCopyInfo(
        targetPath: string
    ): Promise<SvnWorkingCopyInfo | undefined> {
        let currentPath = nodePath.resolve(targetPath);
        let previousPath = "";

        while (currentPath !== previousPath) {
            const info = await this.svnService.getWorkingCopyInfo(currentPath);
            if (info) {
                return info;
            }

            previousPath = currentPath;
            currentPath = nodePath.dirname(currentPath);
        }

        return undefined;
    }

    private formatCheckoutRevisionLabel(revision: string): string {
        return revision === "HEAD" ? "HEAD" : `r${revision}`;
    }

    private getDefaultImportCommitMessage(sourceFolderPath: string): string {
        const sourceFolderName = deriveImportSourceFolderName(sourceFolderPath);
        const i18n = getI18n();

        if (sourceFolderName) {
            return i18n.t("importCommitMessageDefault", {
                folderName: sourceFolderName,
            });
        }

        return i18n.t("importCommitMessageFallback");
    }

    private getImportSourceDisplayLabel(sourceFolderPath: string): string {
        return deriveImportSourceFolderName(sourceFolderPath) ?? sourceFolderPath;
    }

    private isPathWithinWorkspaceFolders(targetPath: string): boolean {
        return (vscode.workspace.workspaceFolders ?? []).some((folder) =>
            isSameOrChildWorkingCopyPath(folder.uri.fsPath, targetPath)
        );
    }

    private async showCheckoutSuccessActions(
        repositoryUrl: string,
        revision: string,
        destinationPath: string
    ): Promise<void> {
        const i18n = getI18n();
        const openFolderAction = i18n.t("openFolder");
        const revealAction = i18n.formatRevealInFileManager(
            normalizeFileManagerPlatform(process.platform)
        );
        const selection = await vscode.window.showInformationMessage(
            i18n.t("checkedOutFromUrlMessage", {
                url: repositoryUrl,
                revision: this.formatCheckoutRevisionLabel(revision),
                destination: destinationPath,
            }),
            openFolderAction,
            revealAction
        );

        if (selection === openFolderAction) {
            await vscode.commands.executeCommand(
                "vscode.openFolder",
                vscode.Uri.file(destinationPath),
                {
                    forceNewWindow: true,
                }
            );
            return;
        }

        if (selection === revealAction) {
            await vscode.commands.executeCommand(
                "revealFileInOS",
                vscode.Uri.file(destinationPath)
            );
        }
    }

    private async showImportSuccessActions(
        sourceFolderPath: string,
        repositoryUrl: string
    ): Promise<void> {
        const i18n = getI18n();
        const checkoutAction = i18n.t("checkoutImportedRepositoryActionLabel");
        const copyUrlAction = i18n.t("copyRepositoryUrlActionLabel");
        const selection = await vscode.window.showInformationMessage(
            i18n.t("importedLocalFolderMessage", {
                source: sourceFolderPath,
                url: repositoryUrl,
            }),
            checkoutAction,
            copyUrlAction
        );

        if (selection === checkoutAction) {
            await this.checkoutFromUrl(repositoryUrl);
            return;
        }

        if (selection === copyUrlAction) {
            await vscode.env.clipboard.writeText(repositoryUrl);
            void vscode.window.setStatusBarMessage(i18n.t("copiedRepositoryUrlStatus"), 2000);
        }
    }

    private async promptRenamePathName(
        repository: SvnRepository,
        targetPath: string
    ): Promise<string | undefined> {
        const i18n = getI18n();
        const currentName = nodePath.basename(targetPath);
        const relativePath =
            nodePath.relative(repository.rootPath, targetPath).replace(/\\/g, "/") || currentName;
        const parentPath = nodePath.dirname(targetPath);
        const selection = await vscode.window.showInputBox({
            title: i18n.t("renamePathActionLabel"),
            prompt: i18n.t("renamePathPrompt", { path: relativePath }),
            placeHolder: i18n.t("renamePathPlaceholder"),
            value: currentName,
            validateInput: (value) => this.validateRenamePathName(parentPath, currentName, value),
        });
        const trimmedSelection = selection?.trim();
        return trimmedSelection ? trimmedSelection : undefined;
    }

    private async validateRenamePathName(
        parentPath: string,
        currentName: string,
        value: string
    ): Promise<string | undefined> {
        const i18n = getI18n();
        const trimmedValue = value.trim();
        if (!trimmedValue) {
            return i18n.t("renamePathRequired");
        }

        if (trimmedValue.includes("/") || trimmedValue.includes("\\")) {
            return i18n.t("renamePathPathSeparatorError");
        }

        if (trimmedValue === "." || trimmedValue === "..") {
            return i18n.t("renamePathInvalidNameError");
        }

        if (trimmedValue === currentName) {
            return i18n.t("renamePathSameNameError");
        }

        try {
            await vscode.workspace.fs.stat(
                vscode.Uri.file(nodePath.join(parentPath, trimmedValue))
            );
            return i18n.t("renamePathExistsError", { name: trimmedValue });
        } catch {
            return undefined;
        }
    }

    private getUriFromArg(arg: unknown): vscode.Uri | undefined {
        if (arg instanceof vscode.Uri) {
            return arg;
        }

        if (this.isSerializedUriLike(arg)) {
            return vscode.Uri.from(arg);
        }

        if (this.isScmResource(arg)) {
            return arg.resourceUri;
        }

        if (Array.isArray(arg)) {
            for (const item of arg) {
                const uri = this.getUriFromArg(item);
                if (uri) {
                    return uri;
                }
            }
        }

        return undefined;
    }

    private isSerializedUriLike(arg: unknown): arg is SerializedUriLike {
        return (
            typeof arg === "object" &&
            arg !== null &&
            "scheme" in arg &&
            typeof arg.scheme === "string" &&
            "path" in arg &&
            typeof arg.path === "string"
        );
    }

    private isScmResource(arg: unknown): arg is ScmResource {
        return (
            typeof arg === "object" &&
            arg !== null &&
            "resourceUri" in arg &&
            arg.resourceUri instanceof vscode.Uri
        );
    }

    private getUriFromArgOrActiveEditor(arg: unknown): vscode.Uri | undefined {
        return this.getUriFromArg(arg) ?? vscode.window.activeTextEditor?.document.uri;
    }

    private getResourceFromArg(arg: unknown): ScmResource | undefined {
        if (arg instanceof ScmResource) {
            return arg;
        }

        if (Array.isArray(arg)) {
            return arg.find((item): item is ScmResource => item instanceof ScmResource);
        }

        return undefined;
    }

    private resolvePathTarget(arg: unknown): ResolvedPathTarget | undefined {
        const resource = this.getResourceFromArg(arg);
        if (resource) {
            return {
                repository: resource.repository,
                uri: resource.resourceUri,
                resource,
            };
        }

        const uri = this.getUriFromArg(arg) ?? vscode.window.activeTextEditor?.document.uri;
        if (!uri) {
            return undefined;
        }

        const repository = this.getRepositoryForUri(uri);
        if (!repository) {
            return undefined;
        }

        return { repository, uri };
    }

    private resolvePathTargetOrShowInfo(arg: unknown): ResolvedPathTarget | undefined {
        const target = this.resolvePathTarget(arg);
        if (!target) {
            this.showInformationStatus("noWorkingCopyInfo");
            return undefined;
        }

        return target;
    }

    private getRepositoryForUriOrShowInfo(uri: vscode.Uri): SvnRepository | undefined {
        const repository = this.getRepositoryForUri(uri);
        if (!repository) {
            this.showInformationStatus("noWorkingCopyInfo");
            return undefined;
        }

        return repository;
    }

    private async runForUriRepository(
        arg: unknown,
        action: (repository: SvnRepository, uri: vscode.Uri) => Promise<void>
    ): Promise<void> {
        const uri = this.getUriFromArgOrActiveEditor(arg);
        if (!uri) {
            return;
        }

        const repository = this.getRepositoryForUriOrShowInfo(uri);
        if (!repository) {
            return;
        }

        try {
            await action(repository, uri);
        } catch (error) {
            this.showError(error);
        }
    }

    private async runForPathTarget(
        arg: unknown,
        action: (target: ResolvedPathTarget) => Promise<void>
    ): Promise<void> {
        const target = this.resolvePathTargetOrShowInfo(arg);
        if (!target) {
            return;
        }

        try {
            await action(target);
        } catch (error) {
            this.showError(error);
        }
    }

    private async runForOptionalPathTargetOrRepository(
        arg: unknown,
        targetAction: (target: ResolvedPathTarget) => Promise<void>,
        repositoryAction: RepositoryCommandHandler
    ): Promise<void> {
        const target = this.resolvePathTarget(arg);
        if (target) {
            try {
                await targetAction(target);
            } catch (error) {
                this.showError(error);
            }
            return;
        }

        await this.runForRepository(arg, repositoryAction);
    }

    private async runForResolvedNodeInfoTarget(
        arg: unknown,
        action: (resolved: ResolvedNodeInfoTarget) => Promise<void>
    ): Promise<void> {
        await this.runForPathTarget(arg, async (target) => {
            await action({
                target,
                nodeInfo: await this.resolveNodeInfoOrThrow(target),
                displayPath: this.getTargetDisplayPath(target.repository, target.uri),
            });
        });
    }

    private async runSelectedResourceAction(
        arg: unknown,
        contextValues: readonly string[],
        action: (
            repository: SvnRepository,
            paths: string[],
            resources: ScmResource[]
        ) => Promise<void>,
        filter?: (resource: ScmResource) => boolean
    ): Promise<boolean> {
        const resources = this.getSelectedResources(arg, contextValues).filter(
            (resource) => !filter || filter(resource)
        );
        if (resources.length === 0) {
            return false;
        }

        try {
            await action(
                resources[0].repository,
                resources.map((resource) => resource.status.absolutePath),
                resources
            );
            return true;
        } catch (error) {
            this.showError(error);
            return true;
        }
    }

    private async runForSingleResource(
        arg: unknown,
        action: (resource: ScmResource) => Promise<void>
    ): Promise<void> {
        if (!(arg instanceof ScmResource)) {
            return;
        }

        try {
            await action(arg);
        } catch (error) {
            this.showError(error);
        }
    }

    private async runForEachSelectedResource(
        arg: unknown,
        contextValues: readonly string[],
        action: (resource: ScmResource) => Promise<void>
    ): Promise<void> {
        const resources = this.getSelectedResources(arg, contextValues);
        if (resources.length === 0) {
            return;
        }

        try {
            for (const resource of resources) {
                await action(resource);
            }
        } catch (error) {
            this.showError(error);
        }
    }

    private async runLockablePathAction(
        arg: unknown,
        action: (repository: SvnRepository, paths: string[]) => Promise<void>
    ): Promise<void> {
        const handledSelection = await this.runSelectedResourceAction(
            arg,
            ["svn-change", "svn-conflict"],
            (repository, paths) => action(repository, paths),
            (resource) => resource.status.kind === "file"
        );
        if (handledSelection) {
            return;
        }

        const target = this.resolvePathTargetOrShowInfo(arg);
        if (!target) {
            return;
        }

        if (target.resource?.status.kind && target.resource.status.kind !== "file") {
            this.showInformationStatus("noLockablePathsInfo");
            return;
        }

        try {
            await action(target.repository, [target.uri.fsPath]);
        } catch (error) {
            this.showError(error);
        }
    }

    private shouldUseRepositoryPathTarget(target: ResolvedPathTarget): boolean {
        return (
            target.resource?.kind === "remote-change" ||
            target.resource?.status.wcStatus === "deleted" ||
            target.resource?.status.wcStatus === "missing"
        );
    }

    private async confirmModalAction(options: {
        readonly message: string;
        readonly buttonLabel: string;
        readonly detail?: string;
    }): Promise<boolean> {
        const selection = await vscode.window.showWarningMessage(
            options.message,
            {
                modal: true,
                detail: options.detail,
            },
            options.buttonLabel
        );

        return selection === options.buttonLabel;
    }

    private getUniqueDescendingPaths(paths: readonly string[]): string[] {
        return [...new Set(paths)].sort((left, right) => right.length - left.length);
    }

    private async deleteSelectedResources(resources: readonly ScmResource[]): Promise<void> {
        const resourcesByRepository = new Map<SvnRepository, ScmResource[]>();

        for (const resource of resources) {
            const repositoryResources = resourcesByRepository.get(resource.repository);
            if (repositoryResources) {
                repositoryResources.push(resource);
            } else {
                resourcesByRepository.set(resource.repository, [resource]);
            }
        }

        for (const [repository, repositoryResources] of resourcesByRepository) {
            const partitioned = partitionDeleteTargets(
                repositoryResources.map((resource) => ({
                    absolutePath: resource.status.absolutePath,
                    kind: resource.contextValue === "svn-unversioned" ? "unversioned" : "versioned",
                }))
            );

            if (partitioned.versionedPaths.length > 0) {
                await repository.delete(partitioned.versionedPaths);
            }

            if (partitioned.unversionedPaths.length === 0) {
                continue;
            }

            for (const targetPath of partitioned.unversionedPaths) {
                await vscode.workspace.fs.delete(vscode.Uri.file(targetPath), {
                    recursive: true,
                    useTrash: true,
                });
            }

            await repository.refresh();
        }
    }

    private async resolveGroupPaths(
        arg: unknown,
        options: {
            readonly contextValue: string;
            readonly getFallbackPaths: (repository: SvnRepository) => string[];
            readonly emptyMessageKey: MessageKey;
        }
    ): Promise<ResolvedRepositoryPaths | undefined> {
        const resources = this.getGroupResources(arg, options.contextValue);
        const repository = resources[0]?.repository ?? (await this.resolveRepository(arg));
        if (!repository) {
            return undefined;
        }

        const paths =
            resources.length > 0
                ? resources.map((resource) => resource.status.absolutePath)
                : options.getFallbackPaths(repository);
        if (paths.length === 0) {
            this.showInformationStatus(options.emptyMessageKey);
            return undefined;
        }

        return { repository, paths };
    }

    private async runGroupPathsAction(
        arg: unknown,
        options: {
            readonly contextValue: string;
            readonly getFallbackPaths: (repository: SvnRepository) => string[];
            readonly emptyMessageKey: MessageKey;
            readonly confirm?: (paths: string[], repository: SvnRepository) => Promise<boolean>;
        },
        action: (resolved: ResolvedRepositoryPaths) => Promise<void>
    ): Promise<void> {
        const resolved = await this.resolveGroupPaths(arg, options);
        if (!resolved) {
            return;
        }

        if (options.confirm && !(await options.confirm(resolved.paths, resolved.repository))) {
            return;
        }

        try {
            await action(resolved);
        } catch (error) {
            this.showError(error);
        }
    }

    private async resolveNodeInfo(target: ResolvedPathTarget): Promise<SvnNodeInfo | undefined> {
        const nodeInfo = await this.svnService.getNodeInfo(target.uri.fsPath);
        if (nodeInfo) {
            return nodeInfo;
        }

        if (target.resource && target.resource.contextValue !== "svn-unversioned") {
            return {
                absolutePath: target.resource.status.absolutePath,
                kind: target.resource.status.kind,
                url: target.repository.resolveRepositoryUrl(target.resource.status.absolutePath),
                repositoryRoot: target.repository.info.repositoryRoot,
                repositoryRelativePath: target.repository.resolveRepositoryPath(
                    target.resource.status.absolutePath
                ),
                workingCopyRoot: target.repository.rootPath,
                revision: target.resource.status.revision,
                committedRevision: target.resource.status.committedRevision,
                author: target.resource.status.author,
                date: target.resource.status.date,
            };
        }

        return undefined;
    }

    private async resolveNodeInfoOrThrow(target: ResolvedPathTarget): Promise<SvnNodeInfo> {
        const nodeInfo = await this.resolveNodeInfo(target);
        if (nodeInfo) {
            return nodeInfo;
        }

        throw new Error(
            getI18n().t("noSvnInfoForPathError", {
                path: this.getTargetDisplayPath(target.repository, target.uri),
            })
        );
    }

    private getTargetDisplayPath(repository: SvnRepository, uri: vscode.Uri): string {
        const relativePath = nodePath.relative(repository.rootPath, uri.fsPath).replace(/\\/g, "/");

        return relativePath.length > 0 ? relativePath : nodePath.basename(repository.rootPath);
    }

    private restartRemoteRefreshTimer(): void {
        if (this.remoteRefreshTimer) {
            clearInterval(this.remoteRefreshTimer);
            this.remoteRefreshTimer = undefined;
        }

        const enabled = vscode.workspace
            .getConfiguration("svn-tree")
            .get<boolean>("enable-remote-status", true);
        if (!enabled) {
            return;
        }

        const intervalSeconds = vscode.workspace
            .getConfiguration("svn-tree")
            .get<number>("remote-status-interval-seconds", 60);
        this.remoteRefreshTimer = setInterval(
            () => {
                void this.refreshAll(false);
            },
            Math.max(intervalSeconds, 10) * 1000
        );
    }
}
