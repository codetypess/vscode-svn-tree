import * as vscode from "vscode";
import { getHtmlLanguage, type SupportedLocale } from "../i18n";
import type {
    RepositoryBrowserAction,
    RepositoryBrowserEntryAction,
} from "../scm/svn-repository-browser";
import type { SvnRepository } from "../scm/svn-repository";
import { getDisplayLocale, getI18n } from "../vscode-i18n";
import type {
    RepositoryBrowserRequestMessage,
    RepositoryBrowserResponseMessage,
} from "./repository-browser-types";

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function getNonce(): string {
    const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let value = "";
    for (let index = 0; index < 32; index += 1) {
        value += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return value;
}

interface RepositoryBrowserPanelState {
    panel: vscode.WebviewPanel;
    repositoryRootPath: string;
    currentRepositoryPath: string;
}

export class RepositoryBrowserPanel implements vscode.Disposable {
    private readonly panels = new Map<string, RepositoryBrowserPanelState>();
    private readonly disposables: vscode.Disposable[] = [];

    public constructor(private readonly extensionUri: vscode.Uri) {}

    public dispose(): void {
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }

        for (const state of this.panels.values()) {
            state.panel.dispose();
        }

        this.panels.clear();
    }

    public async show(
        repository: SvnRepository,
        repositoryPath?: string
    ): Promise<void> {
        const currentRepositoryPath =
            repositoryPath ?? repository.info.repositoryRelativePath;
        const existingState = this.panels.get(repository.rootPath);

        if (existingState) {
            existingState.currentRepositoryPath = currentRepositoryPath;
            this.updatePanelTitle(
                existingState.panel,
                currentRepositoryPath
            );
            existingState.panel.reveal(vscode.ViewColumn.Active);
            await this.pushData(existingState, repository);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            "svn-tree.repository-browser",
            getI18n().t("repositoryBrowserPanelTitle", {
                path: currentRepositoryPath,
            }),
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    this.extensionUri,
                    vscode.Uri.joinPath(
                        this.extensionUri,
                        "node_modules",
                        "@vscode",
                        "codicons",
                        "dist"
                    ),
                ],
            }
        );

        const state: RepositoryBrowserPanelState = {
            panel,
            repositoryRootPath: repository.rootPath,
            currentRepositoryPath,
        };
        this.panels.set(repository.rootPath, state);
        this.updatePanelTitle(panel, currentRepositoryPath);

        panel.onDidDispose(
            () => {
                this.panels.delete(repository.rootPath);
            },
            null,
            this.disposables
        );

        panel.webview.onDidReceiveMessage(
            (message: RepositoryBrowserRequestMessage) => {
                void this.handleMessage(repository, state, message);
            },
            null,
            this.disposables
        );

        panel.webview.html = this.getWebviewHtml(panel.webview, repository, currentRepositoryPath);
    }

    public refreshLocalization(repository: SvnRepository): void {
        const state = this.panels.get(repository.rootPath);
        if (!state) {
            return;
        }

        this.updatePanelTitle(state.panel, state.currentRepositoryPath);
        void state.panel.webview.postMessage({
            type: "browser-config",
            payload: {
                locale: getDisplayLocale(),
            },
        } satisfies RepositoryBrowserResponseMessage);
        void this.pushData(state, repository);
    }

    public async refresh(repository: SvnRepository): Promise<void> {
        const state = this.panels.get(repository.rootPath);
        if (!state) {
            return;
        }

        await this.pushData(state, repository);
    }

    private async handleMessage(
        repository: SvnRepository,
        state: RepositoryBrowserPanelState,
        message: RepositoryBrowserRequestMessage
    ): Promise<void> {
        let errorRepositoryPath = state.currentRepositoryPath;
        repository.logRepositoryBrowser(
            `Received webview message ${message.type} for ${"repositoryPath" in message ? message.repositoryPath : state.currentRepositoryPath}.`
        );
        try {
            switch (message.type) {
                case "ready":
                case "refresh":
                    await this.pushData(state, repository);
                    return;
                case "navigate":
                    errorRepositoryPath = message.repositoryPath;
                    state.currentRepositoryPath = message.repositoryPath;
                    await this.pushData(state, repository);
                    return;
                case "load-directory":
                    errorRepositoryPath = message.repositoryPath;
                    await this.pushDirectoryData(state, repository, message.repositoryPath);
                    return;
                case "run-current-action": {
                    errorRepositoryPath = message.repositoryPath;
                    const nextRepositoryPath =
                        await repository.runRepositoryBrowserCurrentAction(
                            message.action,
                            message.repositoryPath
                        );
                    if (shouldRefreshAfterCurrentAction(message.action)) {
                        state.currentRepositoryPath =
                            nextRepositoryPath ?? message.repositoryPath;
                        await this.pushData(state, repository);
                    }
                    return;
                }
                case "run-entry-action": {
                    errorRepositoryPath = message.repositoryPath;
                    const nextRepositoryPath =
                        await repository.runRepositoryBrowserEntryAction(
                            message.action,
                            message.repositoryPath,
                            message.kind
                        );
                    if (message.action === "open-directory" && nextRepositoryPath) {
                        state.currentRepositoryPath = nextRepositoryPath;
                        await this.pushData(state, repository);
                        return;
                    }

                    if (shouldRefreshAfterEntryAction(message.action)) {
                        await this.pushData(state, repository);
                    }
                    return;
                }
            }
        } catch (error) {
            const messageText = error instanceof Error ? error.message : String(error);
            repository.logRepositoryBrowser(
                `Failed to handle ${message.type} for ${errorRepositoryPath}: ${messageText}`
            );
            await state.panel.webview.postMessage({
                type: "browser-error",
                payload: {
                    repositoryPath: errorRepositoryPath,
                    message: messageText,
                },
            } satisfies RepositoryBrowserResponseMessage);
        }
    }

    private async pushData(
        state: RepositoryBrowserPanelState,
        repository: SvnRepository
    ): Promise<void> {
        repository.logRepositoryBrowser(
            `Pushing browser data for ${state.currentRepositoryPath}.`
        );
        const browserData = await repository.loadRepositoryBrowserData(
            state.currentRepositoryPath
        );
        state.currentRepositoryPath = browserData.currentRepositoryPath;
        this.updatePanelTitle(state.panel, browserData.currentRepositoryPath);
        await state.panel.webview.postMessage({
            type: "browser-data",
            payload: browserData,
        } satisfies RepositoryBrowserResponseMessage);
    }

    private async pushDirectoryData(
        state: RepositoryBrowserPanelState,
        repository: SvnRepository,
        repositoryPath: string
    ): Promise<void> {
        repository.logRepositoryBrowser(`Pushing directory data for ${repositoryPath}.`);
        const browserData = await repository.loadRepositoryBrowserData(repositoryPath);
        await state.panel.webview.postMessage({
            type: "directory-data",
            payload: browserData,
        } satisfies RepositoryBrowserResponseMessage);
    }

    private updatePanelTitle(panel: vscode.WebviewPanel, repositoryPath: string): void {
        panel.title = getI18n().t("repositoryBrowserPanelTitle", {
            path: repositoryPath,
        });
    }

    private getWebviewHtml(
        webview: vscode.Webview,
        repository: SvnRepository,
        repositoryPath: string
    ): string {
        const nonce = getNonce();
        const cspSource = webview.cspSource;
        const locale = getDisplayLocale();
        const codiconStylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.extensionUri,
                "node_modules",
                "@vscode",
                "codicons",
                "dist",
                "codicon.css"
            )
        );
        const sharedStylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "media", "history-panel.css")
        );
        const browserStylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "media", "repository-browser-panel.css")
        );
        const appScriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "media", "repository-browser-webview.js")
        );

        return `<!DOCTYPE html>
<html lang="${getHtmlLanguage(locale)}">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; script-src ${cspSource} 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(
        getI18n().t("repositoryBrowserPanelTitle", { path: repositoryPath })
    )}</title>
    <link rel="stylesheet" href="${codiconStylesUri}" />
    <link rel="stylesheet" href="${sharedStylesUri}" />
    <link rel="stylesheet" href="${browserStylesUri}" />
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">
      window.__SVN_REPOSITORY_BROWSER_BOOTSTRAP__ = {
        repositoryLabel: ${JSON.stringify(repository.label)},
        rootPath: ${JSON.stringify(repository.rootPath)},
        initialRepositoryPath: ${JSON.stringify(repositoryPath)},
        currentWorkingCopyRepositoryPath: ${JSON.stringify(
            repository.info.repositoryRelativePath
        )},
        locale: ${JSON.stringify(locale as SupportedLocale)}
      };
    </script>
    <script src="${appScriptUri}"></script>
  </body>
</html>`;
    }
}

function shouldRefreshAfterCurrentAction(action: RepositoryBrowserAction): boolean {
    switch (action) {
        case "create-directory":
        case "copy-directory":
        case "move-directory":
        case "delete-directory":
        case "switch-here":
        case "create-branch-from-working-copy":
        case "create-tag-from-working-copy":
        case "delete-reference":
            return true;
        default:
            return false;
    }
}

function shouldRefreshAfterEntryAction(action: RepositoryBrowserEntryAction): boolean {
    switch (action) {
        case "create-directory":
        case "copy-directory":
        case "move-directory":
        case "delete-directory":
        case "switch-here":
        case "create-branch-from-working-copy":
        case "create-tag-from-working-copy":
        case "delete-reference":
            return true;
        default:
            return false;
    }
}
