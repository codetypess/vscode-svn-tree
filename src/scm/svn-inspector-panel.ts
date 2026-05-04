import * as vscode from "vscode";
import { getHtmlLanguage } from "../i18n";
import type { SvnPropertyEntry } from "../svn/svn-types";
import { getDisplayLocale, getI18n } from "../vscode-i18n";

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

interface InspectorDetailItem {
    readonly label: string;
    readonly value: string;
    readonly tone?: "code";
    readonly multiline?: boolean;
}

interface SvnInspectorPropertiesView {
    readonly kind: "properties";
    readonly rootPath: string;
    readonly displayPath: string;
    readonly repositoryPath: string;
    readonly url: string;
    readonly properties: readonly SvnPropertyEntry[];
}

type SvnInspectorView = SvnInspectorPropertiesView;

interface SvnInspectorPanelState {
    readonly panel: vscode.WebviewPanel;
    view: SvnInspectorView;
}

export class SvnInspectorPanel implements vscode.Disposable {
    private readonly panels = new Map<string, SvnInspectorPanelState>();
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

    public async showProperties(view: SvnInspectorPropertiesView): Promise<void> {
        await this.show(this.getPanelKey(view), view);
    }

    public refreshLocalization(): void {
        for (const state of this.panels.values()) {
            this.updatePanel(state.panel, state.view);
        }
    }

    private async show(panelKey: string, view: SvnInspectorView): Promise<void> {
        const existingState = this.panels.get(panelKey);
        if (existingState) {
            existingState.view = view;
            this.updatePanel(existingState.panel, view);
            existingState.panel.reveal(vscode.ViewColumn.Active);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            "svn-tree.inspector",
            this.getPanelTitle(view),
            vscode.ViewColumn.Active,
            {
                enableScripts: false,
                retainContextWhenHidden: true,
                localResourceRoots: [this.extensionUri],
            }
        );

        const state: SvnInspectorPanelState = {
            panel,
            view,
        };
        this.panels.set(panelKey, state);
        this.updatePanel(panel, view);

        panel.onDidDispose(
            () => {
                this.panels.delete(panelKey);
            },
            null,
            this.disposables
        );
    }

    private getPanelKey(view: SvnInspectorView): string {
        return `${view.kind}:${view.rootPath}`;
    }

    private getPanelTitle(view: SvnInspectorView): string {
        return `${getI18n().t("showPropertiesActionLabel")}: ${view.displayPath}`;
    }

    private updatePanel(panel: vscode.WebviewPanel, view: SvnInspectorView): void {
        panel.title = this.getPanelTitle(view);
        panel.webview.html = this.getWebviewHtml(panel.webview, view);
    }

    private getWebviewHtml(webview: vscode.Webview, view: SvnInspectorView): string {
        const stylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "media", "svn-inspector-panel.css")
        );
        const bodyMarkup = this.renderPropertiesView(view);

        return `<!DOCTYPE html>
<html lang="${escapeHtml(getHtmlLanguage(getDisplayLocale()))}">
<head>
    <meta charset="UTF-8" />
    <meta
        http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource};"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${stylesUri}" />
    <title>${escapeHtml(this.getPanelTitle(view))}</title>
</head>
<body>
    ${bodyMarkup}
</body>
</html>`;
    }

    private renderPropertiesView(view: SvnInspectorPropertiesView): string {
        const i18n = getI18n();
        const summaryItems: InspectorDetailItem[] = [
            {
                label: i18n.t("infoPathLabel"),
                value: view.displayPath,
                tone: "code",
            },
        ];

        if (view.repositoryPath !== view.displayPath) {
            summaryItems.push({
                label: i18n.t("infoRepositoryPathLabel"),
                value: view.repositoryPath,
                tone: "code",
            });
        }

        summaryItems.push({
            label: i18n.t("infoUrlLabel"),
            value: view.url,
            tone: "code",
            multiline: true,
        });

        const propertiesMarkup =
            view.properties.length > 0
                ? `
                    <div class="property-list">
                        ${view.properties
                            .map((property) => {
                                return `
                                    <article class="property-card">
                                        <div class="property-name">${escapeHtml(property.name)}</div>
                                        <pre class="property-value">${escapeHtml(property.value)}</pre>
                                    </article>
                                `;
                            })
                            .join("")}
                    </div>
                `
                : `<div class="empty-state">${escapeHtml(i18n.t("noPropertiesFoundLabel"))}</div>`;

        return this.renderPage({
            title: i18n.t("showPropertiesActionLabel"),
            subtitle: view.displayPath,
            content: `
                <section class="surface summary-surface">
                    ${this.renderDetailItems(summaryItems)}
                </section>
                <section class="section">
                    <div class="section-header">
                        <h2>${escapeHtml(i18n.t("propertiesHeaderLabel"))}</h2>
                    </div>
                    ${propertiesMarkup}
                </section>
            `,
        });
    }

    private renderPage(options: {
        readonly title: string;
        readonly subtitle: string;
        readonly content: string;
    }): string {
        return `
            <div class="page">
                <div class="card">
                    <header class="toolbar">
                        <div class="toolbar-copy">
                            <h1>${escapeHtml(options.title)}</h1>
                            <small>${escapeHtml(options.subtitle)}</small>
                        </div>
                    </header>
                    <main class="content">
                        ${options.content}
                    </main>
                </div>
            </div>
        `;
    }

    private renderDetailItems(items: readonly InspectorDetailItem[]): string {
        return items
            .map((item) => {
                const valueClass =
                    item.tone === "code" ? "detail-value detail-value-code" : "detail-value";
                return `
                    <div class="detail-row${item.multiline ? " multiline" : ""}">
                        <div class="detail-label">${escapeHtml(item.label)}</div>
                        <div class="${valueClass}">${escapeHtml(item.value)}</div>
                    </div>
                `;
            })
            .join("");
    }

    private renderFactItems(items: readonly InspectorDetailItem[]): string {
        return items
            .map((item) => {
                const valueClass =
                    item.tone === "code" ? "detail-value detail-value-code" : "detail-value";
                return `
                    <article class="fact-card${item.multiline ? " fact-card-wide" : ""}">
                        <div class="detail-label">${escapeHtml(item.label)}</div>
                        <div class="${valueClass}">${escapeHtml(item.value)}</div>
                    </article>
                `;
            })
            .join("");
    }
}
