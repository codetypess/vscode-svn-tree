import * as nodePath from "node:path";
import * as vscode from "vscode";
import { HistoryPanel } from "../history/history-panel";
import { RevisionGraphPanel } from "../revision-graph/revision-graph-panel";
import type { SvnNodeInfo } from "../svn/svn-types";
import { getI18n } from "../vscode-i18n";
import { SvnContentProvider } from "../svn/svn-content-provider";
import { SvnService } from "../svn/svn-service";
import { ScmResource } from "./scm-resource";
import { SvnRepository } from "./svn-repository";

interface RepositoryActionItem extends vscode.QuickPickItem {
    readonly run: (repository: SvnRepository) => Promise<void>;
}

interface RepositoryActionCategoryItem extends vscode.QuickPickItem {
    readonly actions: RepositoryActionItem[];
}

type RepositoryCommandHandler = (repository: SvnRepository) => Promise<void>;
type ConflictCommandHandler = (
    repository: SvnRepository,
    paths: string[]
) => Promise<void>;

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
    private readonly revisionGraphPanel: RevisionGraphPanel;
    private remoteRefreshTimer: NodeJS.Timeout | undefined;

    public constructor(context: vscode.ExtensionContext) {
        this.historyPanel = new HistoryPanel(context.extensionUri);
        this.revisionGraphPanel = new RevisionGraphPanel(context.extensionUri);
        this.historyStatusBarItem.text = "$(history)";
        this.historyStatusBarItem.tooltip = getI18n().t("historyStatusTooltip");
        this.historyStatusBarItem.command = "svn-tree.open-history";
        this.historyStatusBarItem.hide();

        this.disposables.push(
            this.historyStatusBarItem,
            this.outputChannel,
            this.historyPanel,
            this.revisionGraphPanel,
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
            this.registerRepositoryCommand("svn-tree.refresh", (repository) =>
                repository.refreshWithProgress({ forceRemote: true })
            ),
            this.registerRepositoryCommand("svn-tree.commit", (repository) =>
                repository.commit()
            ),
            this.registerCommand("svn-tree.commit-selected", (arg) => this.commitSelected(arg)),
            this.registerCommand("svn-tree.commit-changelist", (arg) =>
                this.commitChangelist(arg)
            ),
            this.registerRepositoryCommand("svn-tree.update", (repository) =>
                repository.update()
            ),
            this.registerCommand("svn-tree.update-selected", (arg) => this.updateSelected(arg)),
            this.registerCommand("svn-tree.update-selected-to-revision", (arg) =>
                this.updateSelectedToRevision(arg)
            ),
            this.registerCommand("svn-tree.switch-reference", (arg) => this.switchReference(arg)),
            this.registerCommand("svn-tree.show-blame", (arg) => this.showBlame(arg)),
            this.registerCommand("svn-tree.show-properties", (arg) => this.showProperties(arg)),
            this.registerCommand("svn-tree.edit-property", (arg) => this.editProperty(arg)),
            this.registerCommand("svn-tree.open-repository-browser", (arg) =>
                this.openRepositoryBrowser(arg)
            ),
            this.registerCommand("svn-tree.open-revision-graph", (arg) =>
                this.openRevisionGraph(arg)
            ),
            this.registerCommand("svn-tree.create-branch-from-working-copy", (arg) =>
                this.createBranchFromWorkingCopy(arg)
            ),
            this.registerCommand("svn-tree.create-tag-from-working-copy", (arg) =>
                this.createTagFromWorkingCopy(arg)
            ),
            this.registerCommand("svn-tree.delete-reference", (arg) =>
                this.deleteReference(arg)
            ),
            this.registerCommand("svn-tree.relocate-working-copy", (arg) =>
                this.relocateWorkingCopy(arg)
            ),
            this.registerCommand("svn-tree.update-to-revision", (arg) =>
                this.updateToRevision(arg)
            ),
            this.registerRepositoryCommand("svn-tree.cleanup", (repository) =>
                repository.cleanup()
            ),
            this.registerRepositoryCommand("svn-tree.open-history", (repository) =>
                repository.showHistory()
            ),
            this.registerCommand("svn-tree.open-repository-actions", (arg) =>
                this.openRepositoryActions(arg)
            ),
            this.registerCommand("svn-tree.show-output", async () => {
                this.outputChannel.show(true);
            }),
            this.registerCommand("svn-tree.open-diff", (arg) => this.openDiff(arg)),
            this.registerCommand("svn-tree.open-file", (arg) => this.openFile(arg)),
            this.registerCommand("svn-tree.revert-resource", (arg) =>
                this.revertResource(arg)
            ),
            this.registerCommand("svn-tree.resolve-conflict", (arg) =>
                this.resolveConflict(arg)
            ),
            this.registerCommand("svn-tree.accept-mine", (arg) => this.acceptMine(arg)),
            this.registerCommand("svn-tree.accept-base", (arg) => this.acceptBase(arg)),
            this.registerCommand("svn-tree.accept-mine-conflict", (arg) =>
                this.acceptMineConflict(arg)
            ),
            this.registerCommand("svn-tree.accept-theirs-conflict", (arg) =>
                this.acceptTheirsConflict(arg)
            ),
            this.registerCommand("svn-tree.accept-theirs", (arg) => this.acceptTheirs(arg)),
            this.registerCommand("svn-tree.postpone-conflict", (arg) =>
                this.postponeConflict(arg)
            ),
            this.registerCommand("svn-tree.revert-group", (arg) => this.revertGroup(arg)),
            this.registerCommand("svn-tree.add-resource", (arg) => this.addResource(arg)),
            this.registerCommand("svn-tree.ignore-resource", (arg) =>
                this.ignoreResource(arg)
            ),
            this.registerCommand("svn-tree.add-group", (arg) => this.addGroup(arg)),
            this.registerCommand("svn-tree.delete-resource", (arg) =>
                this.deleteResource(arg)
            ),
            this.registerCommand("svn-tree.rename-path", (arg) => this.renamePath(arg)),
            this.registerCommand("svn-tree.lock-path", (arg) => this.lockPath(arg)),
            this.registerCommand("svn-tree.unlock-path", (arg) => this.unlockPath(arg)),
            this.registerCommand("svn-tree.ignore-path", (arg) => this.ignorePath(arg)),
            this.registerCommand("svn-tree.unignore-path", (arg) => this.unignorePath(arg)),
            this.registerCommand("svn-tree.show-path-info", (arg) => this.showPathInfo(arg)),
            this.registerCommand("svn-tree.copy-repository-url", (arg) =>
                this.copyRepositoryUrl(arg)
            ),
            this.registerCommand("svn-tree.copy-repository-path", (arg) =>
                this.copyRepositoryPath(arg)
            ),
            this.registerCommand("svn-tree.delete-group", (arg) => this.deleteGroup(arg)),
            this.registerCommand("svn-tree.open-history-diff", (arg) => this.openDiff(arg)),
            this.registerCommand("svn-tree.open-file-history", (arg) =>
                this.openFileHistory(arg)
            ),
            this.registerCommand("svn-tree.resolve-all-conflicts", (arg) =>
                this.resolveAllConflicts(arg)
            ),
            this.registerCommand("svn-tree.accept-mine-all", (arg) =>
                this.acceptMineAll(arg)
            ),
            this.registerCommand("svn-tree.accept-base-all", (arg) =>
                this.acceptBaseAll(arg)
            ),
            this.registerCommand("svn-tree.accept-mine-conflict-all", (arg) =>
                this.acceptMineConflictAll(arg)
            ),
            this.registerCommand("svn-tree.accept-theirs-conflict-all", (arg) =>
                this.acceptTheirsConflictAll(arg)
            ),
            this.registerCommand("svn-tree.accept-theirs-all", (arg) =>
                this.acceptTheirsAll(arg)
            ),
            this.registerCommand("svn-tree.postpone-all-conflicts", (arg) =>
                this.postponeAllConflicts(arg)
            ),
            this.registerCommand("svn-tree.add-to-changelist", (arg) =>
                this.addToChangelist(arg)
            ),
            this.registerCommand("svn-tree.remove-from-changelist", (arg) =>
                this.removeFromChangelist(arg)
            ),
            this.registerCommand("svn-tree.reveal-in-file-manager", (arg) =>
                this.revealInFileManager(arg)
            ),
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
        const i18n = getI18n();
        const isAvailable = await this.svnService.checkAvailability();
        if (!isAvailable) {
            void vscode.window.showWarningMessage(i18n.t("noSvnExecutableWarning"));
            return;
        }

        const discoveredRoots = new Set<string>();

        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            const info = await this.svnService.getWorkingCopyInfo(folder.uri.fsPath);
            if (!info) {
                continue;
            }

            discoveredRoots.add(info.workingCopyRoot);

            if (!this.repositories.has(info.workingCopyRoot)) {
                const repository = new SvnRepository(
                    {
                        ...info,
                        rootPath: info.workingCopyRoot,
                    },
                    this.svnService,
                    this.historyPanel,
                    this.revisionGraphPanel,
                    this.contentProvider,
                    this.outputChannel
                );

                this.repositories.set(info.workingCopyRoot, repository);
            }
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
            uri.fsPath.startsWith(repository.rootPath)
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

    private async openRepositoryActions(arg: unknown): Promise<void> {
        const i18n = getI18n();
        const repository = await this.resolveRepository(arg);
        if (!repository) {
            return;
        }

        const browseActions: RepositoryActionItem[] = [
            {
                label: i18n.t("refreshStatusActionLabel"),
                description: i18n.t("refreshStatusActionDescription"),
                run: async (targetRepository) =>
                    targetRepository.refreshWithProgress({ forceRemote: true }),
            },
            {
                label: i18n.t("openHistoryActionLabel"),
                description: i18n.t("openHistoryActionDescription"),
                run: async (targetRepository) => targetRepository.showHistory(),
            },
            {
                label: i18n.t("revisionGraphActionLabel"),
                description: i18n.t("revisionGraphActionDescription"),
                run: async (targetRepository) => targetRepository.showHistory(),
            },
            {
                label: i18n.t("repositoryBrowserActionLabel"),
                description: i18n.t("repositoryBrowserActionDescription"),
                run: async (targetRepository) => targetRepository.openRepositoryBrowser(),
            },
            {
                label: i18n.t("showPropertiesActionLabel"),
                description: i18n.t("showPropertiesActionDescription"),
                run: async (targetRepository) =>
                    targetRepository.showPathProperties(targetRepository.rootPath),
            },
        ];
        const workingCopyActions: RepositoryActionItem[] = [
            {
                label: i18n.t("updateWorkingCopyActionLabel"),
                description: i18n.t("updateWorkingCopyActionDescription"),
                run: async (targetRepository) => targetRepository.update(),
            },
            {
                label: i18n.t("updateToRevisionActionLabel"),
                description: i18n.t("updateToRevisionActionDescription"),
                run: async (targetRepository) =>
                    this.promptUpdateToRevision(targetRepository),
            },
            {
                label: i18n.t("switchWorkingCopyActionLabel"),
                description: i18n.t("switchWorkingCopyActionDescription"),
                run: async (targetRepository) =>
                    targetRepository.switchRepositoryReference(),
            },
            {
                label: i18n.t("createBranchFromWorkingCopyActionLabel"),
                description: i18n.t("createBranchFromWorkingCopyActionDescription"),
                run: async (targetRepository) =>
                    targetRepository.createBranchFromWorkingCopy(),
            },
            {
                label: i18n.t("createTagFromWorkingCopyActionLabel"),
                description: i18n.t("createTagFromWorkingCopyActionDescription"),
                run: async (targetRepository) =>
                    targetRepository.createTagFromWorkingCopy(),
            },
            {
                label: i18n.t("deleteReferenceActionLabel"),
                description: i18n.t("deleteReferenceActionDescription"),
                run: async (targetRepository) =>
                    targetRepository.deleteRepositoryReference(),
            },
            {
                label: i18n.t("relocateWorkingCopyActionLabel"),
                description: i18n.t("relocateWorkingCopyActionDescription"),
                run: async (targetRepository) =>
                    targetRepository.relocateWorkingCopy(),
            },
        ];
        const changeActions: RepositoryActionItem[] = [
            {
                label: i18n.t("commitActionLabel"),
                description: i18n.t("commitActionDescription"),
                run: async (targetRepository) => targetRepository.commit(),
            },
            {
                label: i18n.t("commitChangelistActionLabel"),
                description: i18n.t("commitChangelistActionDescription"),
                run: async (targetRepository) => {
                    const changelistName = await this.promptChangelistName();
                    if (!changelistName) {
                        return;
                    }

                    await targetRepository.commitChangelist(changelistName);
                },
            },
            {
                label: i18n.t("addAllUnversionedActionLabel"),
                description: i18n.t("addAllUnversionedActionDescription"),
                run: async (targetRepository) => this.addGroup(targetRepository),
            },
            {
                label: i18n.t("deleteAllUnversionedActionLabel"),
                description: i18n.t("deleteAllUnversionedActionDescription"),
                run: async (targetRepository) => this.deleteGroup(targetRepository),
            },
            {
                label: i18n.t("revertAllChangesActionLabel"),
                description: i18n.t("revertAllChangesActionDescription"),
                run: async (targetRepository) => this.revertGroup(targetRepository),
            },
        ];
        const conflictActions: RepositoryActionItem[] = [
            {
                label: i18n.t("resolveAllConflictsActionLabel"),
                description: i18n.t("resolveAllConflictsActionDescription"),
                run: async (targetRepository) => this.resolveAllConflicts(targetRepository),
            },
            {
                label: i18n.t("acceptMineAllActionLabel"),
                description: i18n.t("acceptMineAllActionDescription"),
                run: async (targetRepository) => this.acceptMineAll(targetRepository),
            },
            {
                label: i18n.t("acceptBaseAllActionLabel"),
                description: i18n.t("acceptBaseAllActionDescription"),
                run: async (targetRepository) => this.acceptBaseAll(targetRepository),
            },
            {
                label: i18n.t("acceptMineConflictAllActionLabel"),
                description: i18n.t("acceptMineConflictAllActionDescription"),
                run: async (targetRepository) =>
                    this.acceptMineConflictAll(targetRepository),
            },
            {
                label: i18n.t("acceptTheirsConflictAllActionLabel"),
                description: i18n.t("acceptTheirsConflictAllActionDescription"),
                run: async (targetRepository) =>
                    this.acceptTheirsConflictAll(targetRepository),
            },
            {
                label: i18n.t("acceptTheirsAllActionLabel"),
                description: i18n.t("acceptTheirsAllActionDescription"),
                run: async (targetRepository) => this.acceptTheirsAll(targetRepository),
            },
            {
                label: i18n.t("postponeAllConflictsActionLabel"),
                description: i18n.t("postponeAllConflictsActionDescription"),
                run: async (targetRepository) => this.postponeAllConflicts(targetRepository),
            },
        ];
        const toolActions: RepositoryActionItem[] = [
            {
                label: i18n.t("cleanupWorkingCopyActionLabel"),
                description: i18n.t("cleanupWorkingCopyActionDescription"),
                run: async (targetRepository) => targetRepository.cleanup(),
            },
            {
                label: i18n.t("showOutputActionLabel"),
                description: i18n.t("showOutputActionDescription"),
                run: async () => {
                    this.outputChannel.show(true);
                },
            },
        ];

        const categories: RepositoryActionCategoryItem[] = [
            {
                label: i18n.t("browseActionsCategoryLabel"),
                description: i18n.t("browseActionsCategoryDescription"),
                actions: browseActions,
            },
            {
                label: i18n.t("workingCopyActionsCategoryLabel"),
                description: i18n.t("workingCopyActionsCategoryDescription"),
                actions: workingCopyActions,
            },
            {
                label: i18n.t("changeActionsCategoryLabel"),
                description: i18n.t("changeActionsCategoryDescription"),
                actions: changeActions,
            },
            {
                label: i18n.t("conflictActionsCategoryLabel"),
                description: i18n.t("conflictActionsCategoryDescription"),
                actions: conflictActions,
            },
            {
                label: i18n.t("toolActionsCategoryLabel"),
                description: i18n.t("toolActionsCategoryDescription"),
                actions: toolActions,
            },
        ];

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
                await repository.openHistoryDiff(
                    payload.revision,
                    payload.path,
                    payload.action
                );
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

    private async updateToRevision(arg: unknown): Promise<void> {
        try {
            const repository = await this.resolveRepository(arg);
            if (!repository) {
                return;
            }

            await this.promptUpdateToRevision(repository);
        } catch (error) {
            this.showError(error);
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
        const uri = this.getUriFromArg(arg) ?? vscode.window.activeTextEditor?.document.uri;
        if (!uri) {
            return;
        }

        const repository = this.getRepositoryForUri(uri);
        if (!repository) {
            void vscode.window.showInformationMessage(getI18n().t("noWorkingCopyInfo"));
            return;
        }

        try {
            await repository.showFileHistory(uri);
        } catch (error) {
            this.showError(error);
        }
    }

    private async showPathInfo(arg: unknown): Promise<void> {
        const target = this.resolvePathTarget(arg);
        if (!target) {
            void vscode.window.showInformationMessage(getI18n().t("noWorkingCopyInfo"));
            return;
        }

        try {
            const nodeInfo = await this.resolveNodeInfo(target);
            const displayPath = this.getTargetDisplayPath(target.repository, target.uri);
            if (!nodeInfo) {
                throw new Error(getI18n().t("noSvnInfoForPathError", { path: displayPath }));
            }

            const i18n = getI18n();
            const lines = [
                `${i18n.t("infoPathLabel")}: ${nodeInfo.absolutePath}`,
                `${i18n.t("infoKindLabel")}: ${i18n.formatNodeKind(nodeInfo.kind)}`,
                `${i18n.t("infoRepositoryPathLabel")}: ${nodeInfo.repositoryRelativePath}`,
                `${i18n.t("infoUrlLabel")}: ${nodeInfo.url}`,
                `${i18n.t("infoRepositoryRootLabel")}: ${nodeInfo.repositoryRoot}`,
            ];

            if (nodeInfo.workingCopyRoot) {
                lines.push(
                    `${i18n.t("infoWorkingCopyRootLabel")}: ${nodeInfo.workingCopyRoot}`
                );
            }

            if (nodeInfo.revision) {
                lines.push(`${i18n.t("infoRevisionLabel")}: r${nodeInfo.revision}`);
            }

            if (nodeInfo.committedRevision) {
                lines.push(
                    `${i18n.t("infoLastChangedRevisionLabel")}: r${nodeInfo.committedRevision}`
                );
            }

            if (nodeInfo.author) {
                lines.push(`${i18n.t("infoLastChangedAuthorLabel")}: ${nodeInfo.author}`);
            }

            if (nodeInfo.date) {
                lines.push(`${i18n.t("infoLastChangedDateLabel")}: ${nodeInfo.date}`);
            }

            if (nodeInfo.lockOwner) {
                lines.push(`${i18n.t("infoLockOwnerLabel")}: ${nodeInfo.lockOwner}`);
            }

            if (nodeInfo.lockCreated) {
                lines.push(`${i18n.t("infoLockCreatedLabel")}: ${nodeInfo.lockCreated}`);
            }

            if (nodeInfo.lockComment) {
                lines.push(`${i18n.t("infoLockCommentLabel")}: ${nodeInfo.lockComment}`);
            }

            this.outputChannel.appendLine("");
            const headerLine = `=== ${i18n.t("showPathInfoOutputHeader", { path: displayPath })} ===`;
            this.outputChannel.appendLine(headerLine);
            for (const line of lines) {
                this.outputChannel.appendLine(line);
            }
            this.outputChannel.appendLine("=".repeat(headerLine.length));
            this.outputChannel.show(true);
            void vscode.window.setStatusBarMessage(i18n.t("openedPathInfoStatus"), 2000);
        } catch (error) {
            this.showError(error);
        }
    }

    private async copyRepositoryUrl(arg: unknown): Promise<void> {
        const target = this.resolvePathTarget(arg);
        if (!target) {
            void vscode.window.showInformationMessage(getI18n().t("noWorkingCopyInfo"));
            return;
        }

        try {
            const nodeInfo = await this.resolveNodeInfo(target);
            if (!nodeInfo) {
                throw new Error(
                    getI18n().t("noSvnInfoForPathError", {
                        path: this.getTargetDisplayPath(target.repository, target.uri),
                    })
                );
            }

            await vscode.env.clipboard.writeText(nodeInfo.url);
            void vscode.window.setStatusBarMessage(
                getI18n().t("copiedRepositoryUrlStatus"),
                2000
            );
        } catch (error) {
            this.showError(error);
        }
    }

    private async copyRepositoryPath(arg: unknown): Promise<void> {
        const target = this.resolvePathTarget(arg);
        if (!target) {
            void vscode.window.showInformationMessage(getI18n().t("noWorkingCopyInfo"));
            return;
        }

        try {
            const nodeInfo = await this.resolveNodeInfo(target);
            if (!nodeInfo) {
                throw new Error(
                    getI18n().t("noSvnInfoForPathError", {
                        path: this.getTargetDisplayPath(target.repository, target.uri),
                    })
                );
            }

            await vscode.env.clipboard.writeText(nodeInfo.repositoryRelativePath);
            void vscode.window.setStatusBarMessage(
                getI18n().t("copiedRepositoryPathStatus"),
                2000
            );
        } catch (error) {
            this.showError(error);
        }
    }

    private async showBlame(arg: unknown): Promise<void> {
        const target = this.resolvePathTarget(arg);
        if (!target) {
            void vscode.window.showInformationMessage(getI18n().t("noWorkingCopyInfo"));
            return;
        }

        try {
            if (
                target.resource &&
                (target.resource.kind === "remote-change" ||
                    target.resource.status.wcStatus === "deleted" ||
                    target.resource.status.wcStatus === "missing")
            ) {
                const repositoryPath = target.repository.resolveRepositoryPath(target.uri.fsPath);
                await target.repository.showBlameForRepositoryPath(
                    repositoryPath,
                    target.repository.resolveRepositoryUrl(target.uri.fsPath)
                );
                return;
            }

            await target.repository.showBlame(target.uri);
        } catch (error) {
            this.showError(error);
        }
    }

    private async showProperties(arg: unknown): Promise<void> {
        const target = this.resolvePathTarget(arg);
        if (target) {
            try {
                if (
                    target.resource &&
                    (target.resource.kind === "remote-change" ||
                        target.resource.status.wcStatus === "deleted" ||
                        target.resource.status.wcStatus === "missing")
                ) {
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
            } catch (error) {
                this.showError(error);
            }
            return;
        }

        await this.runForRepository(arg, (repository) =>
            repository.showPathProperties(repository.rootPath)
        );
    }

    private async editProperty(arg: unknown): Promise<void> {
        const target = this.resolvePathTarget(arg);
        if (!target) {
            void vscode.window.showInformationMessage(getI18n().t("noWorkingCopyInfo"));
            return;
        }

        try {
            await target.repository.editPathProperty(target.uri);
        } catch (error) {
            this.showError(error);
        }
    }

    private async openRepositoryBrowser(arg: unknown): Promise<void> {
        const target = this.resolvePathTarget(arg);
        if (target) {
            try {
                const nodeInfo = await this.resolveNodeInfo(target);
                const repositoryPath = target.repository.resolveRepositoryPath(target.uri.fsPath);
                await target.repository.openRepositoryBrowser(
                    nodeInfo?.kind === "file"
                        ? nodePath.posix.dirname(repositoryPath).replace(/^$/, "/")
                        : repositoryPath
                );
            } catch (error) {
                this.showError(error);
            }
            return;
        }

        await this.runForRepository(arg, (repository) => repository.openRepositoryBrowser());
    }

    private async openRevisionGraph(arg: unknown): Promise<void> {
        const target = this.resolvePathTarget(arg);
        if (target) {
            try {
                await target.repository.showRevisionGraph(
                    target.repository.resolveRepositoryPath(target.uri.fsPath)
                );
            } catch (error) {
                this.showError(error);
            }
            return;
        }

        await this.runForRepository(arg, (repository) => repository.showRevisionGraph());
    }

    private async renamePath(arg: unknown): Promise<void> {
        const target = this.resolvePathTarget(arg);
        if (!target) {
            void vscode.window.showInformationMessage(getI18n().t("noWorkingCopyInfo"));
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
            await vscode.commands.executeCommand(
                "revealInExplorer",
                vscode.Uri.file(renamedPath)
            );
        } catch (error) {
            this.showError(error);
        }
    }

    private async lockPath(arg: unknown): Promise<void> {
        const resources = this.getSelectedResources(arg, ["svn-change", "svn-conflict"]).filter(
            (resource) => resource.status.kind === "file"
        );
        if (resources.length > 0) {
            try {
                await resources[0].repository.lockWorkingCopyPaths(
                    resources.map((resource) => resource.status.absolutePath)
                );
            } catch (error) {
                this.showError(error);
            }
            return;
        }

        const target = this.resolvePathTarget(arg);
        if (!target) {
            void vscode.window.showInformationMessage(getI18n().t("noWorkingCopyInfo"));
            return;
        }

        if (target.resource?.status.kind && target.resource.status.kind !== "file") {
            void vscode.window.showInformationMessage(getI18n().t("noLockablePathsInfo"));
            return;
        }

        try {
            await target.repository.lockWorkingCopyPaths([target.uri.fsPath]);
        } catch (error) {
            this.showError(error);
        }
    }

    private async unlockPath(arg: unknown): Promise<void> {
        const resources = this.getSelectedResources(arg, ["svn-change", "svn-conflict"]).filter(
            (resource) => resource.status.kind === "file"
        );
        if (resources.length > 0) {
            try {
                await resources[0].repository.unlockWorkingCopyPaths(
                    resources.map((resource) => resource.status.absolutePath)
                );
            } catch (error) {
                this.showError(error);
            }
            return;
        }

        const target = this.resolvePathTarget(arg);
        if (!target) {
            void vscode.window.showInformationMessage(getI18n().t("noWorkingCopyInfo"));
            return;
        }

        if (target.resource?.status.kind && target.resource.status.kind !== "file") {
            void vscode.window.showInformationMessage(getI18n().t("noLockablePathsInfo"));
            return;
        }

        try {
            await target.repository.unlockWorkingCopyPaths([target.uri.fsPath]);
        } catch (error) {
            this.showError(error);
        }
    }

    private async revertResource(arg: unknown): Promise<void> {
        const i18n = getI18n();
        if (!(arg instanceof ScmResource)) {
            return;
        }

        const confirmation = await vscode.window.showWarningMessage(
            i18n.t("revertResourceWarning", { path: arg.status.relativePath }),
            { modal: true },
            i18n.t("revertButton")
        );

        if (confirmation !== i18n.t("revertButton")) {
            return;
        }

        try {
            await arg.repository.revert([arg.status.absolutePath]);
        } catch (error) {
            this.showError(error);
        }
    }

    private async commitSelected(arg: unknown): Promise<void> {
        const resources = this.getSelectedResources(arg, ["svn-change"]);
        if (resources.length === 0) {
            return;
        }

        try {
            await resources[0].repository.commit(
                resources.map((resource) => resource.status.absolutePath)
            );
        } catch (error) {
            this.showError(error);
        }
    }

    private async commitChangelist(arg: unknown): Promise<void> {
        const repository = await this.resolveRepository(arg);
        if (!repository) {
            return;
        }

        const changelistName = await this.promptChangelistName(
            this.getCommonChangelistName(
                this.getSelectedResources(arg, ["svn-change", "svn-conflict"])
            )
        );
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
        const resources = this.getSelectedResources(arg, ["svn-change"]);
        if (resources.length === 0) {
            return;
        }

        try {
            await resources[0].repository.update(
                resources.map((resource) => resource.status.absolutePath)
            );
        } catch (error) {
            this.showError(error);
        }
    }

    private async switchReference(arg: unknown): Promise<void> {
        await this.runForRepository(arg, (repository) => repository.switchRepositoryReference());
    }

    private async createBranchFromWorkingCopy(arg: unknown): Promise<void> {
        await this.runForRepository(arg, (repository) =>
            repository.createBranchFromWorkingCopy()
        );
    }

    private async createTagFromWorkingCopy(arg: unknown): Promise<void> {
        await this.runForRepository(arg, (repository) => repository.createTagFromWorkingCopy());
    }

    private async deleteReference(arg: unknown): Promise<void> {
        await this.runForRepository(arg, (repository) => repository.deleteRepositoryReference());
    }

    private async relocateWorkingCopy(arg: unknown): Promise<void> {
        await this.runForRepository(arg, (repository) => repository.relocateWorkingCopy());
    }

    private async runAllConflictAction(
        arg: unknown,
        action: ConflictCommandHandler
    ): Promise<void> {
        await this.runForRepository(arg, async (repository) => {
            const conflictedPaths = repository.getConflictedPaths();
            if (conflictedPaths.length === 0) {
                void vscode.window.showInformationMessage(getI18n().t("noConflictsInfo"));
                return;
            }

            await action(repository, conflictedPaths);
        });
    }

    private async runSelectedConflictAction(
        arg: unknown,
        action: ConflictCommandHandler
    ): Promise<void> {
        const resources = this.getSelectedResources(arg, ["svn-conflict"]);
        if (resources.length === 0) {
            return;
        }

        try {
            await action(
                resources[0].repository,
                resources.map((resource) => resource.status.absolutePath)
            );
        } catch (error) {
            this.showError(error);
        }
    }

    private async resolveAllConflicts(arg: unknown): Promise<void> {
        await this.runAllConflictAction(arg, (repository, paths) =>
            repository.markResolved(paths)
        );
    }

    private async acceptMineAll(arg: unknown): Promise<void> {
        await this.runAllConflictAction(arg, (repository, paths) =>
            repository.acceptMine(paths)
        );
    }

    private async acceptBaseAll(arg: unknown): Promise<void> {
        await this.runAllConflictAction(arg, (repository, paths) =>
            repository.acceptBase(paths)
        );
    }

    private async acceptMineConflictAll(arg: unknown): Promise<void> {
        await this.runAllConflictAction(arg, (repository, paths) =>
            repository.acceptMineConflict(paths)
        );
    }

    private async acceptTheirsConflictAll(arg: unknown): Promise<void> {
        await this.runAllConflictAction(arg, (repository, paths) =>
            repository.acceptTheirsConflict(paths)
        );
    }

    private async acceptTheirsAll(arg: unknown): Promise<void> {
        await this.runAllConflictAction(arg, (repository, paths) =>
            repository.acceptTheirs(paths)
        );
    }

    private async postponeAllConflicts(arg: unknown): Promise<void> {
        await this.runAllConflictAction(arg, (repository, paths) =>
            repository.postponeConflicts(paths)
        );
    }

    private async resolveConflict(arg: unknown): Promise<void> {
        await this.runSelectedConflictAction(arg, (repository, paths) =>
            repository.markResolved(paths)
        );
    }

    private async acceptMine(arg: unknown): Promise<void> {
        await this.runSelectedConflictAction(arg, (repository, paths) =>
            repository.acceptMine(paths)
        );
    }

    private async acceptBase(arg: unknown): Promise<void> {
        await this.runSelectedConflictAction(arg, (repository, paths) =>
            repository.acceptBase(paths)
        );
    }

    private async acceptMineConflict(arg: unknown): Promise<void> {
        await this.runSelectedConflictAction(arg, (repository, paths) =>
            repository.acceptMineConflict(paths)
        );
    }

    private async acceptTheirs(arg: unknown): Promise<void> {
        await this.runSelectedConflictAction(arg, (repository, paths) =>
            repository.acceptTheirs(paths)
        );
    }

    private async acceptTheirsConflict(arg: unknown): Promise<void> {
        await this.runSelectedConflictAction(arg, (repository, paths) =>
            repository.acceptTheirsConflict(paths)
        );
    }

    private async postponeConflict(arg: unknown): Promise<void> {
        await this.runSelectedConflictAction(arg, (repository, paths) =>
            repository.postponeConflicts(paths)
        );
    }

    private async revertGroup(arg: unknown): Promise<void> {
        const i18n = getI18n();
        const resources = this.getGroupResources(arg, "svn-changes-group");
        const repository = resources[0]?.repository ?? (await this.resolveRepository(arg));
        if (!repository) {
            return;
        }

        const paths =
            resources.length > 0
                ? resources.map((resource) => resource.status.absolutePath)
                : repository.getChangedPaths();
        if (paths.length === 0) {
            void vscode.window.showInformationMessage(i18n.t("noLocalChangesInfo"));
            return;
        }

        const confirmation = await vscode.window.showWarningMessage(
            i18n.t("revertGroupWarning", {
                label: i18n.formatItemCount(paths.length),
            }),
            { modal: true },
            i18n.t("revertAllButton")
        );

        if (confirmation !== i18n.t("revertAllButton")) {
            return;
        }

        try {
            await repository.revert(paths);
        } catch (error) {
            this.showError(error);
        }
    }

    private async addResource(arg: unknown): Promise<void> {
        if (!(arg instanceof ScmResource)) {
            return;
        }

        try {
            await arg.repository.add([arg.status.absolutePath]);
        } catch (error) {
            this.showError(error);
        }
    }

    private async ignoreResource(arg: unknown): Promise<void> {
        const resources = this.getSelectedResources(arg, ["svn-unversioned"]);
        if (resources.length === 0) {
            return;
        }

        try {
            for (const resource of resources) {
                await resource.repository.ignoreWorkingCopyPath(resource.status.absolutePath);
            }
        } catch (error) {
            this.showError(error);
        }
    }

    private async ignorePath(arg: unknown): Promise<void> {
        const uri = this.getUriFromArg(arg);
        if (!uri) {
            return;
        }

        const repository = this.getRepositoryForUri(uri);
        if (!repository) {
            void vscode.window.showInformationMessage(getI18n().t("noWorkingCopyInfo"));
            return;
        }

        try {
            await repository.ignoreWorkingCopyPath(uri.fsPath);
        } catch (error) {
            this.showError(error);
        }
    }

    private async unignorePath(arg: unknown): Promise<void> {
        const uri = this.getUriFromArg(arg);
        if (!uri) {
            return;
        }

        const repository = this.getRepositoryForUri(uri);
        if (!repository) {
            void vscode.window.showInformationMessage(getI18n().t("noWorkingCopyInfo"));
            return;
        }

        try {
            await repository.unignoreWorkingCopyPath(uri.fsPath);
        } catch (error) {
            this.showError(error);
        }
    }

    private async addGroup(arg: unknown): Promise<void> {
        const resources = this.getGroupResources(arg, "svn-unversioned-group");
        const repository = resources[0]?.repository ?? (await this.resolveRepository(arg));
        if (!repository) {
            return;
        }

        const paths =
            resources.length > 0
                ? resources.map((resource) => resource.status.absolutePath)
                : repository.getUnversionedPaths();
        if (paths.length === 0) {
            void vscode.window.showInformationMessage(getI18n().t("noUnversionedChangesInfo"));
            return;
        }

        try {
            await repository.add(paths);
        } catch (error) {
            this.showError(error);
        }
    }

    private async addToChangelist(arg: unknown): Promise<void> {
        const resources = this.getSelectedResources(arg, ["svn-change", "svn-conflict"]);
        if (resources.length === 0) {
            return;
        }

        const changelistName = await this.promptChangelistName(
            this.getCommonChangelistName(resources)
        );
        if (!changelistName) {
            return;
        }

        try {
            await resources[0].repository.addToChangelist(
                resources.map((resource) => resource.status.absolutePath),
                changelistName
            );
        } catch (error) {
            this.showError(error);
        }
    }

    private async removeFromChangelist(arg: unknown): Promise<void> {
        const resources = this.getSelectedResources(arg, ["svn-change", "svn-conflict"]);
        if (resources.length === 0) {
            return;
        }

        try {
            await resources[0].repository.removeFromChangelist(
                resources.map((resource) => resource.status.absolutePath)
            );
        } catch (error) {
            this.showError(error);
        }
    }

    private async deleteGroup(arg: unknown): Promise<void> {
        const i18n = getI18n();
        const resources = this.getGroupResources(arg, "svn-unversioned-group");
        const repository = resources[0]?.repository ?? (await this.resolveRepository(arg));
        if (!repository) {
            return;
        }

        const paths =
            resources.length > 0
                ? resources.map((resource) => resource.status.absolutePath)
                : repository.getUnversionedPaths();
        if (paths.length === 0) {
            void vscode.window.showInformationMessage(i18n.t("noUnversionedChangesInfo"));
            return;
        }

        const confirmation = await vscode.window.showWarningMessage(
            i18n.t("deleteGroupWarning", {
                label: i18n.formatItemCount(paths.length),
            }),
            { modal: true },
            i18n.t("deleteAllButton")
        );

        if (confirmation !== i18n.t("deleteAllButton")) {
            return;
        }

        try {
            for (const targetPath of [...new Set(paths)].sort(
                (left, right) => right.length - left.length
            )) {
                await vscode.workspace.fs.delete(vscode.Uri.file(targetPath), {
                    recursive: true,
                    useTrash: true,
                });
            }
            await repository.refresh();
        } catch (error) {
            this.showError(error);
        }
    }

    private async revealInFileManager(arg: unknown): Promise<void> {
        const uri = this.getUriFromArg(arg) ?? vscode.window.activeTextEditor?.document.uri;
        if (!uri) {
            return;
        }

        const repository = this.getRepositoryForUri(uri);
        if (!repository) {
            void vscode.window.showInformationMessage(getI18n().t("noWorkingCopyInfo"));
            return;
        }

        try {
            await repository.revealWorkingCopyPathInFileManager(uri);
        } catch (error) {
            this.showError(error);
        }
    }

    private async deleteResource(arg: unknown): Promise<void> {
        const i18n = getI18n();
        if (!(arg instanceof ScmResource)) {
            return;
        }

        const confirmation = await vscode.window.showWarningMessage(
            i18n.t("deleteResourceWarning", { path: arg.status.relativePath }),
            { modal: true },
            i18n.t("deleteButton")
        );

        if (confirmation !== i18n.t("deleteButton")) {
            return;
        }

        try {
            await vscode.workspace.fs.delete(arg.resourceUri, {
                recursive: arg.status.kind === "dir",
                useTrash: true,
            });
            await arg.repository.refresh();
        } catch (error) {
            this.showError(error);
        }
    }

    private showError(error: unknown): void {
        const message = error instanceof Error ? error.message : String(error);
        this.outputChannel.show(true);
        void vscode.window.showErrorMessage(message);
    }

    private refreshLocalization(): void {
        this.historyStatusBarItem.tooltip = getI18n().t("historyStatusTooltip");

        for (const repository of this.repositories.values()) {
            repository.refreshLocalization();
            this.historyPanel.refreshLocalization(repository);
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
        const names = [...new Set(resources.map((resource) => resource.status.changelist).filter(Boolean))];
        return names.length === 1 ? names[0] : undefined;
    }

    private async promptChangelistName(
        value?: string
    ): Promise<string | undefined> {
        const i18n = getI18n();
        const selection = await vscode.window.showInputBox({
            prompt: i18n.t("changelistNamePrompt"),
            placeHolder: i18n.t("changelistNamePlaceholder"),
            value,
            validateInput: (input) =>
                input.trim() ? undefined : i18n.t("changelistNameRequired"),
        });
        const trimmedSelection = selection?.trim();
        return trimmedSelection ? trimmedSelection : undefined;
    }

    private async promptRenamePathName(
        repository: SvnRepository,
        targetPath: string
    ): Promise<string | undefined> {
        const i18n = getI18n();
        const currentName = nodePath.basename(targetPath);
        const relativePath =
            nodePath.relative(repository.rootPath, targetPath).replace(/\\/g, "/") ||
            currentName;
        const parentPath = nodePath.dirname(targetPath);
        const selection = await vscode.window.showInputBox({
            title: i18n.t("renamePathActionLabel"),
            prompt: i18n.t("renamePathPrompt", { path: relativePath }),
            placeHolder: i18n.t("renamePathPlaceholder"),
            value: currentName,
            validateInput: (value) =>
                this.validateRenamePathName(parentPath, currentName, value),
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

        if (arg instanceof ScmResource) {
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

    private getResourceFromArg(arg: unknown): ScmResource | undefined {
        if (arg instanceof ScmResource) {
            return arg;
        }

        if (Array.isArray(arg)) {
            return arg.find((item): item is ScmResource => item instanceof ScmResource);
        }

        return undefined;
    }

    private resolvePathTarget(
        arg: unknown
    ): { repository: SvnRepository; uri: vscode.Uri; resource?: ScmResource } | undefined {
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

    private async resolveNodeInfo(target: {
        repository: SvnRepository;
        uri: vscode.Uri;
        resource?: ScmResource;
    }): Promise<SvnNodeInfo | undefined> {
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

    private getTargetDisplayPath(repository: SvnRepository, uri: vscode.Uri): string {
        const relativePath = nodePath
            .relative(repository.rootPath, uri.fsPath)
            .replace(/\\/g, "/");

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
