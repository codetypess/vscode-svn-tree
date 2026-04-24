import * as vscode from "vscode";
import type { SvnRepository } from "../scm/svn-repository";
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

export class HistoryPanel implements vscode.Disposable {
    private readonly panels = new Map<string, vscode.WebviewPanel>();
    private readonly disposables: vscode.Disposable[] = [];

    public constructor(private readonly extensionUri: vscode.Uri) {}

    public dispose(): void {
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }

        for (const panel of this.panels.values()) {
            panel.dispose();
        }

        this.panels.clear();
    }

    public async show(repository: SvnRepository): Promise<void> {
        const existingPanel = this.panels.get(repository.rootPath);

        if (existingPanel) {
            existingPanel.reveal(vscode.ViewColumn.Active);
            await this.pushEntries(existingPanel, repository);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            "svn-graph.history",
            `SVN History: ${repository.label}`,
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                enableCommandUris: ["svn-graph.open-history-diff"],
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

        this.panels.set(repository.rootPath, panel);

        panel.onDidDispose(
            () => {
                this.panels.delete(repository.rootPath);
            },
            null,
            this.disposables
        );

        panel.webview.onDidReceiveMessage(
            async (message: unknown) => {
                const payload = message as {
                    type?: string;
                    revision?: number;
                    beforeRevision?: number;
                    path?: string;
                    action?: string;
                };

                if (payload.type === "refresh") {
                    await this.pushEntries(panel, repository);
                    return;
                }

                if (
                    payload.type === "load-more" &&
                    typeof payload.beforeRevision === "number"
                ) {
                    await this.pushEntries(panel, repository, {
                        append: true,
                        beforeRevision: payload.beforeRevision,
                    });
                    return;
                }

                if (
                    payload.type === "open-diff" &&
                    typeof payload.revision === "number" &&
                    typeof payload.path === "string" &&
                    typeof payload.action === "string"
                ) {
                    await repository.openHistoryDiff(
                        payload.revision,
                        payload.path,
                        payload.action
                    );
                    return;
                }

                if (
                    payload.type === "checkout-revision" &&
                    typeof payload.revision === "number"
                ) {
                    await repository.checkoutRevision(payload.revision);
                    return;
                }

                if (
                    payload.type === "export-revision" &&
                    typeof payload.revision === "number"
                ) {
                    await repository.exportRevision(payload.revision);
                    return;
                }

                if (
                    payload.type === "copy-revision" &&
                    typeof payload.revision === "number"
                ) {
                    await vscode.env.clipboard.writeText(`r${payload.revision}`);
                    void vscode.window.setStatusBarMessage(
                        `Copied revision r${payload.revision}`,
                        2000
                    );
                }
            },
            null,
            this.disposables
        );

        panel.webview.html = this.getWebviewHtml(panel.webview, repository);
        await this.pushEntries(panel, repository);
    }

    private async pushEntries(
        panel: vscode.WebviewPanel,
        repository: SvnRepository,
        options: {
            append?: boolean;
            beforeRevision?: number;
        } = {}
    ): Promise<void> {
        try {
            const page = await repository.loadHistoryPage(options.beforeRevision);
            panel.webview.postMessage({
                type: "history-data",
                payload: {
                    append: options.append === true,
                    hasMore: page.hasMore,
                    repositoryLabel: repository.label,
                    rootPath: repository.rootPath,
                    entries: page.entries,
                },
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            panel.webview.postMessage({
                type: "history-error",
                payload: {
                    append: options.append === true,
                    message,
                },
            });
        }
    }

    private getWebviewHtml(webview: vscode.Webview, repository: SvnRepository): string {
        const nonce = getNonce();
        const cspSource = webview.cspSource;
        const title = escapeHtml(repository.label);
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
        const appScriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "media", "history-panel-webview.js")
        );
        const appStylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "media", "history-panel.css")
        );

        return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; script-src ${cspSource} 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SVN History: ${title}</title>
    <link rel="stylesheet" href="${codiconStylesUri}" />
    <link rel="stylesheet" href="${appStylesUri}" />
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">
      window.__SVN_HISTORY_BOOTSTRAP__ = {
        repositoryLabel: ${JSON.stringify(repository.label)},
        rootPath: ${JSON.stringify(repository.rootPath)}
      };
    </script>
    <script src="${appScriptUri}"></script>
  </body>
</html>`;
    }
}
