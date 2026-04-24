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

        panel.webview.html = this.renderHtml(panel.webview, repository);
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

    private renderHtml(webview: vscode.Webview, repository: SvnRepository): string {
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

        return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; script-src ${cspSource} 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SVN History</title>
    <link rel="stylesheet" href="${codiconStylesUri}" />
    <style>
      :root {
        color-scheme: var(--vscode-color-scheme);
        --page-bg: var(--vscode-editor-background, #1e1e1e);
        --surface-bg: var(--vscode-editor-background, #1e1e1e);
        --header-bg: var(--vscode-sideBarSectionHeader-background, var(--page-bg));
        --details-bg: var(--vscode-editorWidget-background, var(--page-bg));
        --muted: var(--vscode-descriptionForeground, #8c8c8c);
        --accent: var(--vscode-button-background, #0e639c);
        --accent-contrast: var(--vscode-button-foreground, #ffffff);
        --secondary-button-bg: var(--vscode-button-secondaryBackground, transparent);
        --secondary-button-fg: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
        --border: var(--vscode-panel-border, rgba(128, 128, 128, 0.35));
        --details-border: var(--vscode-widget-border, var(--border));
        --row-hover: var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.04));
        --row-active: var(--vscode-list-inactiveSelectionBackground, rgba(255, 255, 255, 0.06));
        --graph-node: var(--vscode-textLink-foreground, #3794ff);
        --graph-column-width: 56px;
        --graph-center: calc(var(--graph-column-width) / 2);
        --graph-rail-width: 2px;
        --graph-dot-size: 10px;
        --timeline: color-mix(in srgb, var(--graph-node) 88%, transparent);
        --timeline-strong: var(--graph-node);
        --added: var(--vscode-gitDecoration-addedResourceForeground, #81b88b);
        --modified: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d);
        --deleted: var(--vscode-gitDecoration-deletedResourceForeground, #c74e39);
        --replaced: var(--vscode-textLink-foreground, #3794ff);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        padding: 0 !important;
        font-family: var(--vscode-font-family);
        background: var(--page-bg);
        color: var(--vscode-editor-foreground);
      }

      .page {
        padding: 0;
        min-height: 100vh;
      }

      .card {
        background: var(--surface-bg);
        border: 0;
        border-radius: 0;
        overflow: hidden;
        box-shadow: none;
      }

      .toolbar {
        display: flex;
        gap: 12px;
        align-items: center;
        padding: 10px 16px;
        border-bottom: 1px solid var(--border);
      }

      .toolbar h1 {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }

      .toolbar small {
        color: var(--muted);
        display: block;
        margin-top: 2px;
        font-size: 12px;
      }

      .toolbar-actions {
        margin-left: auto;
        display: flex;
        gap: 10px;
        align-items: center;
      }

      .search {
        width: 320px;
        max-width: 100%;
        padding: 6px 10px;
        color: inherit;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: var(--vscode-input-background, transparent);
      }

      button {
        border: 1px solid transparent;
        border-radius: 999px;
        padding: 6px 12px;
        cursor: pointer;
        color: var(--accent-contrast);
        background: var(--accent);
      }

      .history-list {
        max-height: calc(100vh - 94px);
        overflow: auto;
      }

      .history-footer {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 64px;
        padding: 12px 16px 18px;
        border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
      }

      .history-footer-text {
        color: var(--muted);
        font-size: 12px;
      }

      .history-footer .secondary {
        color: var(--secondary-button-fg);
        background: var(--secondary-button-bg);
        border-color: var(--border);
      }

      .table-header,
      .commit-row {
        display: grid;
        grid-template-columns: var(--graph-column-width) minmax(0, 1fr) 180px 140px 96px;
        gap: 10px;
        align-items: center;
      }

      .table-header {
        position: sticky;
        top: 0;
        z-index: 2;
        padding: 8px 16px;
        border-bottom: 1px solid var(--border);
        background: var(--header-bg);
        color: var(--muted);
        font-size: 11px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .table-header > :first-child {
        display: flex;
        align-items: center;
        justify-content: center;
        align-self: stretch;
        color: var(--vscode-editor-foreground);
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.01em;
        text-transform: none;
      }

      .commit {
      }

      .commit-row {
        padding: 0 16px;
        min-height: 28px;
        cursor: pointer;
        transition: background-color 120ms ease;
      }

      .commit-row:hover {
        background: var(--row-hover);
      }

      .commit.expanded > .commit-row {
        background: var(--row-active);
      }

      .graph-column {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 28px;
        padding: 2px 0;
      }

      .graph-stem {
        position: absolute;
        left: var(--graph-center);
        transform: translateX(-50%);
        width: var(--graph-rail-width);
        border-radius: 999px;
        background: linear-gradient(180deg, var(--timeline-strong), var(--timeline));
      }

      .graph-stem-top {
        top: -1px;
        bottom: 50%;
      }

      .graph-stem-bottom {
        top: 50%;
        bottom: -1px;
      }

      .commit:first-child .graph-stem-top,
      .commit:last-child .graph-stem-bottom {
        display: none;
      }

      .graph-dot {
        position: relative;
        z-index: 1;
        width: var(--graph-dot-size);
        height: var(--graph-dot-size);
        border-radius: 999px;
        background: var(--graph-node);
        border: 1px solid color-mix(in srgb, black 16%, var(--graph-node));
        box-shadow: 0 0 0 1px color-mix(in srgb, black 20%, transparent);
      }

      .commit.expanded .graph-dot {
        box-shadow:
          0 0 0 1px color-mix(in srgb, black 20%, transparent),
          0 0 0 4px color-mix(in srgb, var(--graph-node) 36%, transparent);
      }

      .description-cell {
        min-width: 0;
        padding: 0;
      }

      .summary {
        display: flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
        white-space: nowrap;
        min-height: 28px;
      }

      .summary-message {
        min-width: 0;
        flex: none;
        font-weight: 600;
        font-size: 13px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .summary-separator {
        color: var(--muted);
        flex: none;
        font-size: 11px;
      }

      .summary-meta {
        color: var(--muted);
        font-size: 11px;
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .revision {
        font-weight: 700;
        letter-spacing: 0.03em;
      }

      .cell-text {
        padding: 0;
        line-height: 28px;
        font-size: 13px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .muted {
        color: var(--muted);
      }

      .details-row {
        display: grid;
        grid-template-columns: var(--graph-column-width) minmax(0, 1fr);
        gap: 10px;
        padding: 0 16px 0;
      }

      .details-rail {
        position: relative;
      }

      .details-rail::before {
        content: "";
        position: absolute;
        left: var(--graph-center);
        transform: translateX(-50%);
        top: 0;
        bottom: 0;
        width: var(--graph-rail-width);
        border-radius: 999px;
        background: linear-gradient(180deg, var(--timeline-strong), var(--timeline));
      }

      .details-panel {
        display: grid;
        grid-template-columns: minmax(300px, 0.95fr) minmax(420px, 1.25fr);
        border-top: 1px solid var(--details-border);
        background: var(--details-bg);
      }

      .details-summary-panel {
        padding: 14px 16px 16px;
        border-right: 1px solid var(--details-border);
      }

      .details-title {
        font-size: 14px;
        font-weight: 700;
        line-height: 1.4;
        margin-bottom: 14px;
      }

      .details-meta {
        display: grid;
        gap: 4px;
        color: var(--muted);
        font-size: 12px;
      }

      .details-meta strong {
        color: var(--vscode-editor-foreground);
        font-weight: 600;
      }

      .details-files-panel {
        padding: 10px 0 12px;
      }

      .section-title {
        margin: 0 12px 8px;
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .tree-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
        min-height: 24px;
        padding: 0 10px 0 calc(10px + var(--depth, 0) * 16px);
      }

      .tree-row:hover {
        background: var(--row-hover);
      }

      .tree-dir {
        color: var(--muted);
        cursor: pointer;
      }

      .tree-main {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .tree-chevron {
        width: 12px;
        font-size: 12px;
        color: var(--muted);
        flex: none;
      }

      .tree-icon {
        flex: none;
        width: 14px;
        font-size: 14px;
        color: var(--muted);
      }

      .change-row {
        background: transparent;
        cursor: pointer;
        color: inherit;
        text-decoration: none;
      }

      .change-row:hover {
        background: var(--row-hover);
      }

      .change-row:focus-visible {
        outline: 1px solid var(--vscode-focusBorder, var(--graph-node));
        outline-offset: -1px;
        background: var(--row-hover);
      }

      .change-icon {
        color: var(--muted);
      }

      .change-icon.action-a {
        color: var(--added);
      }

      .change-icon.action-d {
        color: var(--deleted);
      }

      .change-icon.action-m {
        color: var(--modified);
      }

      .change-icon.action-r {
        color: var(--replaced);
      }

      .change-body {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .tree-label {
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .change-path {
        min-width: 0;
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .tree-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        padding-right: 8px;
      }

      .change-note {
        color: var(--muted);
        font-size: 11px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .empty-state {
        padding: 28px 20px;
        color: var(--muted);
      }

      .context-menu-root {
        position: fixed;
        inset: 0;
        z-index: 30;
        pointer-events: none;
      }

      .context-menu-backdrop {
        position: absolute;
        inset: 0;
        pointer-events: auto;
      }

      .context-menu {
        position: absolute;
        min-width: 240px;
        max-width: min(320px, calc(100vw - 16px));
        padding: 6px;
        border: 1px solid var(--details-border);
        border-radius: 10px;
        background: var(--vscode-menu-background, var(--details-bg));
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.32);
        pointer-events: auto;
      }

      .context-menu-header {
        padding: 8px 10px 10px;
        border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
      }

      .context-menu-title {
        font-size: 12px;
        font-weight: 700;
      }

      .context-menu-subtitle {
        margin-top: 4px;
        color: var(--muted);
        font-size: 11px;
        line-height: 1.35;
      }

      .context-menu-actions {
        padding-top: 4px;
      }

      .context-menu-item {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: inherit;
        cursor: pointer;
        text-align: left;
      }

      .context-menu-item:hover,
      .context-menu-item:focus-visible {
        background: var(--row-hover);
        outline: none;
      }

      .context-menu-item .codicon {
        width: 16px;
        flex: none;
        color: var(--muted);
      }

      .context-menu-label {
        flex: 1;
        min-width: 0;
        font-size: 12px;
        line-height: 1.35;
      }

      .context-menu-separator {
        height: 1px;
        margin: 4px 6px;
        background: color-mix(in srgb, var(--border) 70%, transparent);
      }

      @media (max-width: 1160px) {
        :root {
          --graph-column-width: 48px;
        }

        .table-header,
        .commit-row {
          grid-template-columns: var(--graph-column-width) minmax(0, 1fr) 160px 120px 88px;
        }

        .details-panel {
          grid-template-columns: minmax(260px, 0.9fr) minmax(360px, 1.1fr);
        }
      }

      @media (max-width: 900px) {
        :root {
          --graph-column-width: 44px;
          --graph-dot-size: 8px;
        }

        .table-header {
          display: none;
        }

        .commit-row {
          grid-template-columns: var(--graph-column-width) minmax(0, 1fr) auto;
          gap: 8px;
        }

        .commit-row > .cell-text {
          display: none;
        }

        .commit-row > .cell-text.revision {
          display: block;
        }

        .summary-meta,
        .summary-separator {
          display: none;
        }

        .details-panel {
          grid-template-columns: 1fr;
        }

        .details-summary-panel {
          border-right: 0;
          border-bottom: 1px solid var(--details-border);
        }

        .change-body {
          gap: 6px;
        }

        .change-note {
          display: none;
        }

        .toolbar {
          flex-wrap: wrap;
        }

        .toolbar-actions {
          width: 100%;
          margin-left: 0;
          justify-content: space-between;
        }

        .search {
          flex: 1;
        }
      }
    </style>
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
