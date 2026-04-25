import * as nodePath from "node:path";
import * as vscode from "vscode";
import { HistoryPanel } from "../history/history-panel";
import { getI18n } from "../vscode-i18n";
import { SvnContentProvider } from "../svn/svn-content-provider";
import { SvnService } from "../svn/svn-service";
import { ScmResource } from "./scm-resource";
import { SvnRepository } from "./svn-repository";

interface RepositoryActionItem extends vscode.QuickPickItem {
    readonly run: (repository: SvnRepository) => Promise<void>;
}

export class SvnRepositoryManager implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private readonly repositories = new Map<string, SvnRepository>();
    private readonly outputChannel = vscode.window.createOutputChannel("SVN Tree");
    private readonly historyStatusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    private readonly svnService = new SvnService(this.outputChannel);
    private readonly contentProvider = new SvnContentProvider(this.svnService);
    private readonly historyPanel: HistoryPanel;
    private remoteRefreshTimer: NodeJS.Timeout | undefined;

    public constructor(context: vscode.ExtensionContext) {
        this.historyPanel = new HistoryPanel(context.extensionUri);
        this.historyStatusBarItem.text = "$(history)";
        this.historyStatusBarItem.tooltip = getI18n().t("historyStatusTooltip");
        this.historyStatusBarItem.command = "svn-tree.open-history";
        this.historyStatusBarItem.hide();
        this.disposables.push(
            this.historyStatusBarItem,
            this.outputChannel,
            this.historyPanel,
            vscode.workspace.registerTextDocumentContentProvider(
                SvnContentProvider.scheme,
                this.contentProvider
            ),
            vscode.commands.registerCommand("svn-tree.refresh", async (arg?: unknown) =>
                this.runForRepository(arg, (repository) =>
                    repository.refresh({ forceRemote: true })
                )
            ),
            vscode.commands.registerCommand("svn-tree.commit", async (arg?: unknown) =>
                this.runForRepository(arg, (repository) => repository.commit())
            ),
            vscode.commands.registerCommand("svn-tree.update", async (arg?: unknown) =>
                this.runForRepository(arg, (repository) => repository.update())
            ),
            vscode.commands.registerCommand("svn-tree.cleanup", async (arg?: unknown) =>
                this.runForRepository(arg, (repository) => repository.cleanup())
            ),
            vscode.commands.registerCommand("svn-tree.open-history", async (arg?: unknown) =>
                this.runForRepository(arg, (repository) => repository.showHistory())
            ),
            vscode.commands.registerCommand(
                "svn-tree.open-repository-actions",
                async (arg?: unknown) => this.openRepositoryActions(arg)
            ),
            vscode.commands.registerCommand("svn-tree.show-output", async () => {
                this.outputChannel.show(true);
            }),
            vscode.commands.registerCommand("svn-tree.open-diff", async (arg?: unknown) =>
                this.openDiff(arg)
            ),
            vscode.commands.registerCommand("svn-tree.open-file", async (arg?: unknown) =>
                this.openFile(arg)
            ),
            vscode.commands.registerCommand("svn-tree.revert-resource", async (arg?: unknown) =>
                this.revertResource(arg)
            ),
            vscode.commands.registerCommand("svn-tree.revert-group", async (arg?: unknown) =>
                this.revertGroup(arg)
            ),
            vscode.commands.registerCommand("svn-tree.add-resource", async (arg?: unknown) =>
                this.addResource(arg)
            ),
            vscode.commands.registerCommand("svn-tree.add-group", async (arg?: unknown) =>
                this.addGroup(arg)
            ),
            vscode.commands.registerCommand("svn-tree.delete-resource", async (arg?: unknown) =>
                this.deleteResource(arg)
            ),
            vscode.commands.registerCommand("svn-tree.open-history-diff", async (arg?: unknown) =>
                this.openDiff(arg)
            ),
            vscode.commands.registerCommand("svn-tree.open-file-history", async (arg?: unknown) =>
                this.openFileHistory(arg)
            ),
            vscode.workspace.onDidSaveTextDocument((document) => {
                void this.refreshRepositoryForUri(document.uri, false);
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
                const languageChanged = event.affectsConfiguration("svn-tree.display-language");
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
            })
        );

        this.restartRemoteRefreshTimer();
        void this.initialize();
    }

    public dispose(): void {
        for (const repository of this.repositories.values()) {
            repository.dispose();
        }

        this.repositories.clear();
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
                    this.contentProvider
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

        const selection = await vscode.window.showQuickPick<RepositoryActionItem>(
            [
                {
                    label: i18n.t("refreshStatusActionLabel"),
                    description: i18n.t("refreshStatusActionDescription"),
                    run: async (targetRepository) =>
                        targetRepository.refresh({ forceRemote: true }),
                },
                {
                    label: i18n.t("updateWorkingCopyActionLabel"),
                    description: i18n.t("updateWorkingCopyActionDescription"),
                    run: async (targetRepository) => targetRepository.update(),
                },
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
            ],
            {
                placeHolder: i18n.t("actionsPlaceholder", { label: repository.label }),
            }
        );

        if (!selection) {
            return;
        }

        try {
            await selection.run(repository);
        } catch (error) {
            this.showError(error);
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

    private async revertGroup(arg: unknown): Promise<void> {
        const i18n = getI18n();
        const resources = this.getGroupResources(arg, "svn-changes-group");
        if (resources.length === 0) {
            return;
        }

        const repository = resources[0].repository;
        const confirmation = await vscode.window.showWarningMessage(
            i18n.t("revertGroupWarning", {
                label: i18n.formatItemCount(resources.length),
            }),
            { modal: true },
            i18n.t("revertAllButton")
        );

        if (confirmation !== i18n.t("revertAllButton")) {
            return;
        }

        try {
            await repository.revert(resources.map((resource) => resource.status.absolutePath));
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

    private async addGroup(arg: unknown): Promise<void> {
        const resources = this.getGroupResources(arg, "svn-unversioned-group");
        if (resources.length === 0) {
            return;
        }

        try {
            await resources[0].repository.add(
                resources.map((resource) => resource.status.absolutePath)
            );
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
