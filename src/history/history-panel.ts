import * as vscode from "vscode";
import { getHtmlLanguage, type SupportedLocale } from "../i18n";
import type { SvnRepository } from "../scm/svn-repository";
import type { SvnLogPathChange } from "../svn/svn-types";
import { getDisplayLocale, getI18n } from "../vscode-i18n";

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

function isSvnLogPathAction(value: unknown): value is SvnLogPathChange["action"] {
    return value === "A" || value === "D" || value === "M" || value === "R";
}

interface HistoryPanelScope {
    key: string;
    label: string;
    targetPath?: string;
}

interface HistoryPanelState {
    panel: vscode.WebviewPanel;
    repositoryRootPath: string;
    scope: HistoryPanelScope;
}

export class HistoryPanel implements vscode.Disposable {
    private readonly panels = new Map<string, HistoryPanelState>();
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
        scope: Partial<HistoryPanelScope> = {}
    ): Promise<void> {
        const resolvedScope = this.resolveScope(repository, scope);
        const existingState = this.panels.get(resolvedScope.key);
        const existingPanel = existingState?.panel;

        if (existingPanel) {
            this.updatePanelLocalization(existingPanel, resolvedScope);
            existingPanel.reveal(vscode.ViewColumn.Active);
            await this.pushEntries(existingPanel, repository, {
                scope: resolvedScope,
            });
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            "svn-tree.history",
            getI18n().t("historyPanelTitle", { label: resolvedScope.label }),
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                enableCommandUris: ["svn-tree.open-history-diff"],
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

        this.panels.set(resolvedScope.key, {
            panel,
            repositoryRootPath: repository.rootPath,
            scope: resolvedScope,
        });
        this.updatePanelLocalization(panel, resolvedScope);

        panel.onDidDispose(
            () => {
                this.panels.delete(resolvedScope.key);
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
                    message?: string;
                    changedPaths?: string[];
                    changes?: SvnLogPathChange[];
                };

                if (payload.type === "refresh") {
                    await this.pushEntries(panel, repository, {
                        scope: resolvedScope,
                    });
                    return;
                }

                if (payload.type === "ready") {
                    await this.pushEntries(panel, repository, {
                        scope: resolvedScope,
                    });
                    return;
                }

                if (
                    payload.type === "load-more" &&
                    typeof payload.beforeRevision === "number"
                ) {
                    await this.pushEntries(panel, repository, {
                        scope: resolvedScope,
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
                    payload.type === "compare-with-working-copy" &&
                    typeof payload.revision === "number" &&
                    Array.isArray(payload.changes)
                ) {
                    await repository.compareRevisionWithWorkingCopy(
                        payload.revision,
                        payload.changes
                    );
                    return;
                }

                if (
                    payload.type === "compare-with-previous-revision" &&
                    typeof payload.revision === "number" &&
                    Array.isArray(payload.changes)
                ) {
                    await repository.compareRevisionWithPreviousRevision(
                        payload.revision,
                        payload.changes
                    );
                    return;
                }

                if (
                    payload.type === "compare-file-with-working-copy" &&
                    typeof payload.revision === "number" &&
                    typeof payload.path === "string" &&
                    isSvnLogPathAction(payload.action)
                ) {
                    await repository.compareFileRevisionWithWorkingCopy(
                        payload.revision,
                        payload.path,
                        payload.action
                    );
                    return;
                }

                if (
                    payload.type === "compare-file-with-previous-revision" &&
                    typeof payload.revision === "number" &&
                    typeof payload.path === "string" &&
                    isSvnLogPathAction(payload.action)
                ) {
                    await repository.compareFileRevisionWithPreviousRevision(
                        payload.revision,
                        payload.path,
                        payload.action
                    );
                    return;
                }

                if (
                    payload.type === "revert-to-revision" &&
                    typeof payload.revision === "number"
                ) {
                    await repository.revertToRevision(payload.revision);
                    return;
                }

                if (
                    payload.type === "revert-changes-from-revision" &&
                    typeof payload.revision === "number"
                ) {
                    await repository.revertChangesFromRevision(payload.revision);
                    return;
                }

                if (
                    payload.type === "copy-file-path" &&
                    typeof payload.revision === "number" &&
                    typeof payload.path === "string"
                ) {
                    await this.copyToClipboard(
                        payload.path,
                        getI18n().t("copiedFilePathStatus", { revision: payload.revision })
                    );
                    return;
                }

                if (
                    payload.type === "copy-revision" &&
                    typeof payload.revision === "number"
                ) {
                    await this.copyToClipboard(
                        `r${payload.revision}`,
                        getI18n().t("copiedRevisionStatus", { revision: payload.revision })
                    );
                    return;
                }

                if (
                    payload.type === "copy-message" &&
                    typeof payload.revision === "number" &&
                    typeof payload.message === "string"
                ) {
                    await this.copyToClipboard(
                        payload.message,
                        getI18n().t("copiedCommitMessageStatus", {
                            revision: payload.revision,
                        })
                    );
                    return;
                }

                if (
                    payload.type === "copy-changed-paths" &&
                    typeof payload.revision === "number" &&
                    Array.isArray(payload.changedPaths)
                ) {
                    await this.copyToClipboard(
                        payload.changedPaths.join("\n"),
                        getI18n().t("copiedChangedPathsStatus", {
                            revision: payload.revision,
                        })
                    );
                    return;
                }

                if (
                    payload.type === "create-branch" &&
                    typeof payload.revision === "number"
                ) {
                    await repository.createBranchFromRevision(payload.revision);
                    return;
                }

                if (
                    payload.type === "create-tag" &&
                    typeof payload.revision === "number"
                ) {
                    await repository.createTagFromRevision(payload.revision);
                }
            },
            null,
            this.disposables
        );

        panel.webview.html = this.getWebviewHtml(panel.webview, repository, resolvedScope);
    }

    public refreshLocalization(repository: SvnRepository): void {
        for (const state of this.panels.values()) {
            if (state.repositoryRootPath !== repository.rootPath) {
                continue;
            }

            this.updatePanelLocalization(state.panel, state.scope);
            void state.panel.webview.postMessage({
                type: "history-config",
                payload: {
                    locale: getDisplayLocale(),
                },
            });
        }
    }

    private async pushEntries(
        panel: vscode.WebviewPanel,
        repository: SvnRepository,
        options: {
            scope?: HistoryPanelScope;
            append?: boolean;
            beforeRevision?: number;
        } = {}
    ): Promise<void> {
        try {
            const scope = options.scope ?? this.getScopeForPanel(panel, repository);
            const page = await repository.loadHistoryPage(options.beforeRevision, scope.targetPath);
            panel.webview.postMessage({
                type: "history-data",
                payload: {
                    append: options.append === true,
                    hasMore: page.hasMore,
                    repositoryLabel: scope.label,
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

    private async copyToClipboard(value: string, message: string): Promise<void> {
        await vscode.env.clipboard.writeText(value);
        void vscode.window.setStatusBarMessage(message, 2000);
    }

    private updatePanelLocalization(
        panel: vscode.WebviewPanel,
        scope: HistoryPanelScope
    ): void {
        panel.title = getI18n().t("historyPanelTitle", { label: scope.label });
    }

    private getWebviewHtml(
        webview: vscode.Webview,
        repository: SvnRepository,
        scope: HistoryPanelScope
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
        const appScriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "media", "history-panel-webview.js")
        );
        const appStylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "media", "history-panel.css")
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
    <title>${escapeHtml(getI18n().t("historyPanelTitle", { label: scope.label }))}</title>
    <link rel="stylesheet" href="${codiconStylesUri}" />
    <link rel="stylesheet" href="${appStylesUri}" />
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">
      window.__SVN_HISTORY_BOOTSTRAP__ = {
        repositoryLabel: ${JSON.stringify(scope.label)},
        rootPath: ${JSON.stringify(repository.rootPath)},
        locale: ${JSON.stringify(locale as SupportedLocale)}
      };
    </script>
    <script src="${appScriptUri}"></script>
  </body>
</html>`;
    }

    private resolveScope(
        repository: SvnRepository,
        scope: Partial<HistoryPanelScope>
    ): HistoryPanelScope {
        return {
            key: scope.key ?? `${repository.rootPath}::repository`,
            label: scope.label ?? repository.label,
            targetPath: scope.targetPath,
        };
    }

    private getScopeForPanel(
        panel: vscode.WebviewPanel,
        repository: SvnRepository
    ): HistoryPanelScope {
        for (const state of this.panels.values()) {
            if (state.panel === panel) {
                return state.scope;
            }
        }

        return this.resolveScope(repository, {});
    }
}
