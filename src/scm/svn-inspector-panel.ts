import * as vscode from "vscode";
import { getHtmlLanguage } from "../i18n";
import type { SvnNodeInfo, SvnPropertyEntry } from "../svn/svn-types";
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

interface SvnInspectorPathInfoView {
    readonly kind: "path-info";
    readonly rootPath: string;
    readonly displayPath: string;
    readonly nodeInfo: SvnNodeInfo;
}

interface SvnInspectorPropertiesView {
    readonly kind: "properties";
    readonly rootPath: string;
    readonly displayPath: string;
    readonly repositoryPath: string;
    readonly url: string;
    readonly properties: readonly SvnPropertyEntry[];
}

type SvnInspectorView = SvnInspectorPathInfoView | SvnInspectorPropertiesView;

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

    public async showPathInfo(view: SvnInspectorPathInfoView): Promise<void> {
        await this.show(this.getPanelKey(view), view);
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
        const actionLabel =
            view.kind === "properties"
                ? getI18n().t("showPropertiesActionLabel")
                : getI18n().t("showPathInfoActionLabel");
        return `${actionLabel}: ${view.displayPath}`;
    }

    private updatePanel(panel: vscode.WebviewPanel, view: SvnInspectorView): void {
        panel.title = this.getPanelTitle(view);
        panel.webview.html = this.getWebviewHtml(panel.webview, view);
    }

    private getWebviewHtml(webview: vscode.Webview, view: SvnInspectorView): string {
        const stylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "media", "svn-inspector-panel.css")
        );
        const bodyMarkup =
            view.kind === "properties"
                ? this.renderPropertiesView(view)
                : this.renderPathInfoView(view);

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

    private renderPathInfoView(view: SvnInspectorPathInfoView): string {
        const i18n = getI18n();
        const summaryItems: InspectorDetailItem[] = [
            {
                label: i18n.t("infoPathLabel"),
                value: view.nodeInfo.absolutePath,
                tone: "code",
                multiline: true,
            },
            {
                label: i18n.t("infoRepositoryPathLabel"),
                value: view.nodeInfo.repositoryRelativePath,
                tone: "code",
            },
            {
                label: i18n.t("infoUrlLabel"),
                value: view.nodeInfo.url,
                tone: "code",
                multiline: true,
            },
            {
                label: i18n.t("infoRepositoryRootLabel"),
                value: view.nodeInfo.repositoryRoot,
                tone: "code",
                multiline: true,
            },
        ];

        if (view.nodeInfo.workingCopyRoot) {
            summaryItems.push({
                label: i18n.t("infoWorkingCopyRootLabel"),
                value: view.nodeInfo.workingCopyRoot,
                tone: "code",
                multiline: true,
            });
        }

        const factItems: InspectorDetailItem[] = [
            {
                label: i18n.t("infoKindLabel"),
                value: i18n.formatNodeKind(view.nodeInfo.kind),
            },
        ];

        if (view.nodeInfo.revision) {
            factItems.push({
                label: i18n.t("infoRevisionLabel"),
                value: `r${view.nodeInfo.revision}`,
                tone: "code",
            });
        }

        if (view.nodeInfo.committedRevision) {
            factItems.push({
                label: i18n.t("infoLastChangedRevisionLabel"),
                value: `r${view.nodeInfo.committedRevision}`,
                tone: "code",
            });
        }

        if (view.nodeInfo.author) {
            factItems.push({
                label: i18n.t("infoLastChangedAuthorLabel"),
                value: view.nodeInfo.author,
            });
        }

        if (view.nodeInfo.date) {
            factItems.push({
                label: i18n.t("infoLastChangedDateLabel"),
                value: view.nodeInfo.date,
            });
        }

        if (view.nodeInfo.lockOwner) {
            factItems.push({
                label: i18n.t("infoLockOwnerLabel"),
                value: view.nodeInfo.lockOwner,
            });
        }

        if (view.nodeInfo.lockCreated) {
            factItems.push({
                label: i18n.t("infoLockCreatedLabel"),
                value: view.nodeInfo.lockCreated,
            });
        }

        if (view.nodeInfo.lockComment) {
            factItems.push({
                label: i18n.t("infoLockCommentLabel"),
                value: view.nodeInfo.lockComment,
                multiline: true,
            });
        }

        return this.renderPage({
            title: i18n.t("showPathInfoActionLabel"),
            subtitle: view.displayPath,
            content: `
                <section class="surface summary-surface">
                    ${this.renderDetailItems(summaryItems)}
                </section>
                <section class="section">
                    <div class="section-header">
                        <h2>${escapeHtml(i18n.t("showPathInfoActionLabel"))}</h2>
                    </div>
                    <div class="fact-grid">
                        ${this.renderFactItems(factItems)}
                    </div>
                </section>
            `,
        });
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
