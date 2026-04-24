import * as nodePath from "node:path";
import * as vscode from "vscode";
import { HistoryPanel } from "../history/history-panel";
import { SvnContentProvider } from "../svn/svn-content-provider";
import { SvnService } from "../svn/svn-service";
import { ScmResource } from "./scm-resource";
import { SvnRepository } from "./svn-repository";

export class SvnRepositoryManager implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private readonly repositories = new Map<string, SvnRepository>();
    private readonly outputChannel = vscode.window.createOutputChannel("SVN Graph");
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
        this.historyStatusBarItem.tooltip = "Open SVN History";
        this.historyStatusBarItem.command = "svn-graph.open-history";
        this.historyStatusBarItem.hide();
        this.disposables.push(
            this.historyStatusBarItem,
            this.outputChannel,
            this.historyPanel,
            vscode.workspace.registerTextDocumentContentProvider(
                SvnContentProvider.scheme,
                this.contentProvider
            ),
            vscode.commands.registerCommand("svn-graph.refresh", async (arg?: unknown) =>
                this.runForRepository(arg, (repository) =>
                    repository.refresh({ forceRemote: true })
                )
            ),
            vscode.commands.registerCommand("svn-graph.commit", async (arg?: unknown) =>
                this.runForRepository(arg, (repository) => repository.commit())
            ),
            vscode.commands.registerCommand("svn-graph.update", async (arg?: unknown) =>
                this.runForRepository(arg, (repository) => repository.update())
            ),
            vscode.commands.registerCommand("svn-graph.open-history", async (arg?: unknown) =>
                this.runForRepository(arg, (repository) => repository.showHistory())
            ),
            vscode.commands.registerCommand("svn-graph.open-diff", async (arg?: unknown) =>
                this.openDiff(arg)
            ),
            vscode.commands.registerCommand("svn-graph.revert-resource", async (arg?: unknown) =>
                this.revertResource(arg)
            ),
            vscode.commands.registerCommand("svn-graph.add-resource", async (arg?: unknown) =>
                this.addResource(arg)
            ),
            vscode.commands.registerCommand("svn-graph.delete-resource", async (arg?: unknown) =>
                this.deleteResource(arg)
            ),
            vscode.commands.registerCommand("svn-graph.open-history-diff", async (arg?: unknown) =>
                this.openDiff(arg)
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
                if (
                    event.affectsConfiguration("svn-graph.enable-remote-status") ||
                    event.affectsConfiguration("svn-graph.remote-status-interval-seconds")
                ) {
                    this.restartRemoteRefreshTimer();
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
        const isAvailable = await this.svnService.checkAvailability();
        if (!isAvailable) {
            void vscode.window.showWarningMessage(
                "SVN Graph could not find the `svn` executable on PATH."
            );
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
        if (arg instanceof SvnRepository) {
            return arg;
        }

        if (arg instanceof ScmResource) {
            return arg.repository;
        }

        if (arg instanceof vscode.Uri) {
            return this.getRepositoryForUri(arg);
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
            void vscode.window.showInformationMessage(
                "No SVN working copy is available in the current workspace."
            );
            return undefined;
        }

        const selection = await vscode.window.showQuickPick(
            [...this.repositories.values()].map((repository) => ({
                label: repository.label,
                description: repository.rootPath,
                repository,
            })),
            {
                placeHolder: "Select an SVN working copy",
            }
        );

        return selection?.repository;
    }

    private updateHistoryStatusBarVisibility(): void {
        if (this.repositories.size > 0) {
            this.historyStatusBarItem.show();
            return;
        }

        this.historyStatusBarItem.hide();
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

    private async revertResource(arg: unknown): Promise<void> {
        if (!(arg instanceof ScmResource)) {
            return;
        }

        const confirmation = await vscode.window.showWarningMessage(
            `Revert changes in ${arg.status.relativePath}?`,
            { modal: true },
            "Revert"
        );

        if (confirmation !== "Revert") {
            return;
        }

        try {
            await arg.repository.revert([arg.status.absolutePath]);
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

    private async deleteResource(arg: unknown): Promise<void> {
        if (!(arg instanceof ScmResource)) {
            return;
        }

        const confirmation = await vscode.window.showWarningMessage(
            `Delete ${arg.status.relativePath} from disk?`,
            { modal: true },
            "Delete"
        );

        if (confirmation !== "Delete") {
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

    private restartRemoteRefreshTimer(): void {
        if (this.remoteRefreshTimer) {
            clearInterval(this.remoteRefreshTimer);
            this.remoteRefreshTimer = undefined;
        }

        const enabled = vscode.workspace
            .getConfiguration("svn-graph")
            .get<boolean>("enable-remote-status", true);
        if (!enabled) {
            return;
        }

        const intervalSeconds = vscode.workspace
            .getConfiguration("svn-graph")
            .get<number>("remote-status-interval-seconds", 60);
        this.remoteRefreshTimer = setInterval(
            () => {
                void this.refreshAll(false);
            },
            Math.max(intervalSeconds, 10) * 1000
        );
    }
}
