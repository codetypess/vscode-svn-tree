import * as vscode from "vscode";
import { getHtmlLanguage, type SupportedLocale } from "../i18n";
import type { SvnRepository } from "../scm/svn-repository";
import {
    getCommitTargetLabel,
    normalizeRepositoryPath,
} from "../scm/svn-repository-paths";
import { getDisplayLocale, getI18n } from "../vscode-i18n";
import type {
    RevisionGraphData,
    RevisionGraphQuery,
    RevisionGraphRequestMessage,
    RevisionGraphResponseMessage,
} from "./revision-graph-types";
import { buildRevisionGraphSummary } from "./revision-graph-utils";

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

interface RevisionGraphScope {
    key: string;
    label: string;
    repositoryPath: string;
}

interface RevisionGraphPanelState {
    panel: vscode.WebviewPanel;
    repositoryRootPath: string;
    scope: RevisionGraphScope;
    query: RevisionGraphQuery;
    graph?: RevisionGraphData;
}

export class RevisionGraphPanel implements vscode.Disposable {
    private readonly panels = new Map<string, RevisionGraphPanelState>();
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
        const resolvedScope = this.resolveScope(repository, repositoryPath);
        const existingState = this.panels.get(resolvedScope.key);
        const existingPanel = existingState?.panel;

        if (existingPanel && existingState) {
            existingState.scope = resolvedScope;
            this.updatePanelLocalization(existingPanel, existingState.scope);
            existingPanel.reveal(vscode.ViewColumn.Active);
            await this.pushGraph(existingState, repository);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            "svn-tree.revision-graph",
            getI18n().t("revisionGraphPanelTitle", { label: resolvedScope.label }),
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

        const panelState: RevisionGraphPanelState = {
            panel,
            repositoryRootPath: repository.rootPath,
            scope: resolvedScope,
            query: {},
        };
        this.panels.set(resolvedScope.key, panelState);
        this.updatePanelLocalization(panel, resolvedScope);

        panel.onDidDispose(
            () => {
                this.panels.delete(resolvedScope.key);
            },
            null,
            this.disposables
        );

        panel.webview.onDidReceiveMessage(
            async (message: RevisionGraphRequestMessage) => {
                try {
                    await this.handleMessage(repository, panelState, message);
                } catch (error) {
                    const response: RevisionGraphResponseMessage = {
                        type: "graph-error",
                        payload: {
                            message: error instanceof Error ? error.message : String(error),
                        },
                    };
                    await panel.webview.postMessage(response);
                }
            },
            null,
            this.disposables
        );

        panel.webview.html = this.getWebviewHtml(panel.webview, resolvedScope);
    }

    public refreshLocalization(repository: SvnRepository): void {
        for (const state of this.panels.values()) {
            if (state.repositoryRootPath !== repository.rootPath) {
                continue;
            }

            this.updatePanelLocalization(state.panel, state.scope);
            void state.panel.webview.postMessage({
                type: "graph-config",
                payload: {
                    locale: getDisplayLocale(),
                },
            } satisfies RevisionGraphResponseMessage);
        }
    }

    public async refresh(repository: SvnRepository): Promise<void> {
        const panels = [...this.panels.values()].filter(
            (state) => state.repositoryRootPath === repository.rootPath
        );

        await Promise.all(panels.map((state) => this.pushGraph(state, repository)));
    }

    private async handleMessage(
        repository: SvnRepository,
        state: RevisionGraphPanelState,
        message: RevisionGraphRequestMessage
    ): Promise<void> {
        if (
            message.type === "ready" ||
            message.type === "refresh" ||
            message.type === "load-more"
        ) {
            state.query = message.query ?? state.query;
            await this.pushGraph(state, repository);
            return;
        }

        switch (message.type) {
            case "open-history":
                await repository.showHistoryForRepositoryPath(message.repositoryPath);
                return;
            case "open-browser":
                await repository.openRepositoryBrowser(message.repositoryPath);
                return;
            case "open-at-head":
                if (!state.graph) {
                    return;
                }
                await repository.openRepositoryPathAtHead(
                    message.repositoryPath,
                    state.graph.selectedRepositoryPath,
                    state.graph.selectedReferencePath
                );
                return;
            case "switch-reference":
                await repository.switchToRepositoryPath(message.repositoryPath);
                await this.pushGraph(state, repository);
                return;
            case "copy-path":
                await vscode.env.clipboard.writeText(message.repositoryPath);
                void vscode.window.setStatusBarMessage(
                    getI18n().t("copiedRepositoryPathStatus"),
                    2000
                );
                return;
            case "copy-url":
                await vscode.env.clipboard.writeText(
                    repository.getRepositoryUrlForPath(message.repositoryPath)
                );
                void vscode.window.setStatusBarMessage(
                    getI18n().t("copiedRepositoryUrlStatus"),
                    2000
                );
                return;
            case "create-branch":
                await repository.createBranchFromWorkingCopyAt(message.repositoryPath);
                await this.pushGraph(state, repository);
                return;
            case "create-tag":
                await repository.createTagFromWorkingCopyAt(message.repositoryPath);
                await this.pushGraph(state, repository);
                return;
            case "delete-reference":
                await repository.deleteRepositoryReferenceAt(message.repositoryPath);
                await this.pushGraph(state, repository);
                return;
            case "compare-references":
                if (!state.graph) {
                    return;
                }
                await repository.compareRepositoryReferences(
                    message.sourceRepositoryPath,
                    message.targetRepositoryPath,
                    state.graph.selectedRepositoryPath,
                    state.graph.selectedReferencePath
                );
                return;
            case "diff-references":
                if (!state.graph) {
                    return;
                }
                await repository.diffRepositoryReferences(
                    message.sourceRepositoryPath,
                    message.targetRepositoryPath,
                    state.graph.selectedRepositoryPath,
                    state.graph.selectedReferencePath
                );
                return;
            case "open-edge-revision":
                await repository.openRevisionGraphRevisionDetails(
                    message.revision,
                    message.repositoryPath
                );
                return;
            case "copy-summary": {
                const summary = message.summary || (state.graph ? buildRevisionGraphSummary(state.graph) : "");
                await vscode.env.clipboard.writeText(summary);
                void vscode.window.setStatusBarMessage(
                    getI18n().t("revisionGraphCopiedSummaryStatus"),
                    2000
                );
                return;
            }
            case "export-summary": {
                const summary = message.summary || (state.graph ? buildRevisionGraphSummary(state.graph) : "");
                const baseFileName =
                    ((message.suggestedFileName ?? state.scope.label) || "revision-graph")
                        .replace(/[^\w.-]+/g, "-")
                        .replace(/^-+|-+$/g, "") || "revision-graph";
                const destinationUri = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(
                        `${state.repositoryRootPath}/${baseFileName}.txt`
                    ),
                    saveLabel: getI18n().t("exportFileSaveLabel"),
                    title: getI18n().t("revisionGraphExportSummaryTitle"),
                });
                if (!destinationUri) {
                    return;
                }

                await vscode.workspace.fs.writeFile(
                    destinationUri,
                    new TextEncoder().encode(summary)
                );
                void vscode.window.setStatusBarMessage(
                    getI18n().t("revisionGraphExportedSummaryStatus"),
                    2000
                );
                return;
            }
        }
    }

    private async pushGraph(
        state: RevisionGraphPanelState,
        repository: SvnRepository
    ): Promise<void> {
        try {
            const graph = await repository.loadRevisionGraph(
                state.scope.repositoryPath,
                state.query
            );
            state.graph = graph;
            state.query = graph.query;
            state.scope = {
                ...state.scope,
                label: graph.scopeLabel,
            };
            this.updatePanelLocalization(state.panel, state.scope);
            await state.panel.webview.postMessage({
                type: "graph-data",
                payload: graph,
            } satisfies RevisionGraphResponseMessage);
        } catch (error) {
            await state.panel.webview.postMessage({
                type: "graph-error",
                payload: {
                    message: error instanceof Error ? error.message : String(error),
                },
            } satisfies RevisionGraphResponseMessage);
        }
    }

    private updatePanelLocalization(
        panel: vscode.WebviewPanel,
        scope: RevisionGraphScope
    ): void {
        panel.title = getI18n().t("revisionGraphPanelTitle", { label: scope.label });
    }

    private getWebviewHtml(
        webview: vscode.Webview,
        scope: RevisionGraphScope
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
            vscode.Uri.joinPath(this.extensionUri, "media", "revision-graph-webview.js")
        );
        const appStylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "media", "revision-graph.css")
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
    <title>${escapeHtml(getI18n().t("revisionGraphPanelTitle", { label: scope.label }))}</title>
    <link rel="stylesheet" href="${codiconStylesUri}" />
    <link rel="stylesheet" href="${appStylesUri}" />
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">
      window.__SVN_REVISION_GRAPH_BOOTSTRAP__ = {
        scopeLabel: ${JSON.stringify(scope.label)},
        locale: ${JSON.stringify(locale as SupportedLocale)}
      };
    </script>
    <script src="${appScriptUri}"></script>
  </body>
</html>`;
    }

    private resolveScope(
        repository: SvnRepository,
        repositoryPath?: string
    ): RevisionGraphScope {
        const normalizedRepositoryPath = normalizeRepositoryPath(
            repositoryPath ?? repository.info.repositoryRelativePath
        );

        return {
            key: `${repository.rootPath}::revision-graph::${normalizedRepositoryPath}`,
            label: getCommitTargetLabel(normalizedRepositoryPath),
            repositoryPath: normalizedRepositoryPath,
        };
    }
}
