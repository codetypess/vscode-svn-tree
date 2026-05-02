import * as vscode from "vscode";
import { getHtmlLanguage } from "../i18n";
import { getDisplayLocale, getI18n } from "../vscode-i18n";
import type {
    ConflictInspectorArtifact,
    ConflictInspectorDiffAction,
    ConflictInspectorResolutionAction,
    ConflictInspectorView,
} from "./svn-conflict-inspector-types";
import type { SvnRepository } from "./svn-repository";

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

type ConflictInspectorRequestMessage =
    | {
          readonly type: "refresh";
      }
    | {
          readonly type: "open-working-file";
      }
    | {
          readonly type: "open-artifact";
          readonly artifactPath: string;
      }
    | {
          readonly type: "open-diff";
          readonly action: ConflictInspectorDiffAction;
      }
    | {
          readonly type: "resolve";
          readonly action: ConflictInspectorResolutionAction;
      };

interface ConflictInspectorPanelState {
    readonly panel: vscode.WebviewPanel;
    readonly repositoryRootPath: string;
    targetPath: string;
    view: ConflictInspectorView;
}

interface ConflictInspectorDiffActionItem {
    readonly action: ConflictInspectorDiffAction;
    readonly label: string;
}

interface ConflictInspectorResolutionActionItem {
    readonly action: ConflictInspectorResolutionAction;
    readonly label: string;
}

export class SvnConflictInspectorPanel implements vscode.Disposable {
    private readonly panels = new Map<string, ConflictInspectorPanelState>();
    private readonly disposables: vscode.Disposable[] = [];

    public constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly handleError: (error: unknown) => void
    ) {}

    public dispose(): void {
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }

        for (const state of this.panels.values()) {
            state.panel.dispose();
        }

        this.panels.clear();
    }

    public async show(repository: SvnRepository, targetPath: string): Promise<void> {
        const view = await repository.loadConflictInspectorView(targetPath);
        const panelKey = this.getPanelKey(repository.rootPath, view.conflictPath);
        const existingState = this.panels.get(panelKey);

        if (existingState) {
            existingState.targetPath = view.conflictPath;
            existingState.view = view;
            this.updatePanel(existingState.panel, view);
            existingState.panel.reveal(vscode.ViewColumn.Active);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            "svn-tree.conflict-inspector",
            this.getPanelTitle(view),
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [this.extensionUri],
            }
        );

        const state: ConflictInspectorPanelState = {
            panel,
            repositoryRootPath: repository.rootPath,
            targetPath: view.conflictPath,
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

        panel.webview.onDidReceiveMessage(
            (message: ConflictInspectorRequestMessage) => {
                void this.onDidReceiveMessage(repository, state, message);
            },
            null,
            this.disposables
        );
    }

    public refreshLocalization(): void {
        for (const state of this.panels.values()) {
            this.updatePanel(state.panel, state.view);
        }
    }

    public async refresh(repository: SvnRepository): Promise<void> {
        const repositoryStates = [...this.panels.values()].filter(
            (state) => state.repositoryRootPath === repository.rootPath
        );

        for (const state of repositoryStates) {
            state.view = await repository.loadConflictInspectorView(state.targetPath);
            this.updatePanel(state.panel, state.view);
        }
    }

    private getPanelKey(repositoryRootPath: string, conflictPath: string): string {
        return `${repositoryRootPath}:${conflictPath}`;
    }

    private getPanelTitle(view: ConflictInspectorView): string {
        return getI18n().t("conflictInspectorPanelTitle", {
            path: view.conflictRelativePath,
        });
    }

    private async onDidReceiveMessage(
        repository: SvnRepository,
        state: ConflictInspectorPanelState,
        message: ConflictInspectorRequestMessage
    ): Promise<void> {
        try {
            switch (message.type) {
                case "refresh":
                    state.view = await repository.loadConflictInspectorView(state.targetPath);
                    this.updatePanel(state.panel, state.view);
                    return;
                case "open-working-file":
                    await repository.openConflictInspectorPath(state.targetPath);
                    return;
                case "open-artifact":
                    await repository.openConflictInspectorArtifact(message.artifactPath);
                    return;
                case "open-diff":
                    await repository.openConflictInspectorDiff(state.targetPath, message.action);
                    return;
                case "resolve":
                    await repository.runConflictInspectorResolution(
                        state.targetPath,
                        message.action
                    );
                    state.view = await repository.loadConflictInspectorView(state.targetPath);
                    this.updatePanel(state.panel, state.view);
                    return;
            }
        } catch (error) {
            this.handleError(error);
        }
    }

    private updatePanel(panel: vscode.WebviewPanel, view: ConflictInspectorView): void {
        panel.title = this.getPanelTitle(view);
        panel.webview.html = this.getWebviewHtml(panel.webview, view);
    }

    private getWebviewHtml(webview: vscode.Webview, view: ConflictInspectorView): string {
        const nonce = getNonce();
        const sharedStylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "media", "history-panel.css")
        );
        const conflictStylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "media", "svn-conflict-inspector-panel.css")
        );

        return `<!DOCTYPE html>
<html lang="${escapeHtml(getHtmlLanguage(getDisplayLocale()))}">
<head>
    <meta charset="UTF-8" />
    <meta
        http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${sharedStylesUri}" />
    <link rel="stylesheet" href="${conflictStylesUri}" />
    <title>${escapeHtml(this.getPanelTitle(view))}</title>
</head>
<body>
    ${this.renderView(view)}
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        for (const button of document.querySelectorAll("[data-message]")) {
            button.addEventListener("click", () => {
                const raw = button.getAttribute("data-message");
                if (!raw) {
                    return;
                }

                vscode.postMessage(JSON.parse(raw));
            });
        }
    </script>
</body>
</html>`;
    }

    private renderView(view: ConflictInspectorView): string {
        const i18n = getI18n();
        const detailItems = [
            {
                label: i18n.t("infoKindLabel"),
                value: i18n.formatNodeKind(view.kind),
            },
            {
                label: i18n.t("infoRepositoryPathLabel"),
                value: view.repositoryPath,
                breakable: true,
            },
            view.revision
                ? {
                      label: i18n.t("revisionLabel"),
                      value: view.revision,
                  }
                : undefined,
            view.author
                ? {
                      label: i18n.t("authorDetailLabel"),
                      value: view.author,
                  }
                : undefined,
            view.date
                ? {
                      label: i18n.t("dateLabel"),
                      value: view.date,
                  }
                : undefined,
        ].filter(Boolean) as Array<{
            label: string;
            value: string;
            breakable?: boolean;
        }>;
        const diffActions = this.buildDiffActions(view);
        const resolutionActions = view.resolved ? [] : this.buildResolutionActions();

        return `
            <div class="page">
                <div class="card">
                    <header class="toolbar">
                        <div class="toolbar-copy">
                            <h1>${escapeHtml(i18n.t("openConflictInspectorActionLabel"))}</h1>
                            <small>${escapeHtml(view.conflictRelativePath)}</small>
                        </div>
                    </header>
                    <main class="content">
                        ${
                            view.resolved
                                ? `<div class="status-note">${escapeHtml(
                                      i18n.t("conflictInspectorResolvedState")
                                  )}</div>`
                                : ""
                        }
                        <section class="surface summary-surface">
                            ${detailItems
                                .map(
                                    (item) => `
                                        <div class="detail-row">
                                            <div class="detail-label">${escapeHtml(item.label)}</div>
                                            <div class="detail-value${
                                                item.breakable ? " is-breakable" : ""
                                            }">${escapeHtml(item.value)}</div>
                                        </div>
                                    `
                                )
                                .join("")}
                        </section>

                        <section class="section">
                            <div class="section-header">
                                <h2>${escapeHtml(i18n.t("conflictInspectorWorkingFileSectionLabel"))}</h2>
                            </div>
                            <div class="action-grid">
                                ${this.renderActionButton(
                                    {
                                        type: "open-working-file",
                                    },
                                    i18n.t("conflictInspectorOpenWorkingFileActionLabel"),
                                    false
                                )}
                                ${this.renderActionButton(
                                    {
                                        type: "refresh",
                                    },
                                    i18n.t("refreshButton"),
                                    true
                                )}
                            </div>
                        </section>

                        <section class="section">
                            <div class="section-header">
                                <h2>${escapeHtml(i18n.t("conflictInspectorArtifactsSectionLabel"))}</h2>
                            </div>
                            ${
                                view.artifacts.length === 0
                                    ? `<div class="empty-state">${escapeHtml(
                                          i18n.t("conflictInspectorNoArtifactsState")
                                      )}</div>`
                                    : `<div class="artifact-list">${view.artifacts
                                          .map((artifact) => this.renderArtifactCard(artifact))
                                          .join("")}</div>`
                            }
                        </section>

                        <section class="section">
                            <div class="section-header">
                                <h2>${escapeHtml(i18n.t("conflictInspectorCompareSectionLabel"))}</h2>
                            </div>
                            ${
                                diffActions.length === 0
                                    ? `<div class="empty-state">${escapeHtml(
                                          i18n.t("conflictInspectorNoCompareState")
                                      )}</div>`
                                    : `<div class="action-grid">${diffActions
                                          .map((action) =>
                                              this.renderActionButton(
                                                  {
                                                      type: "open-diff",
                                                      action: action.action,
                                                  },
                                                  action.label,
                                                  true
                                              )
                                          )
                                          .join("")}</div>`
                            }
                        </section>

                        <section class="section">
                            <div class="section-header">
                                <h2>${escapeHtml(i18n.t("conflictInspectorResolutionSectionLabel"))}</h2>
                            </div>
                            ${
                                resolutionActions.length === 0
                                    ? `<div class="empty-state">${escapeHtml(
                                          i18n.t("conflictInspectorResolvedState")
                                      )}</div>`
                                    : `<div class="action-grid">${resolutionActions
                                          .map((action) =>
                                              this.renderActionButton(
                                                  {
                                                      type: "resolve",
                                                      action: action.action,
                                                  },
                                                  action.label,
                                                  false
                                              )
                                          )
                                          .join("")}</div>`
                            }
                        </section>
                    </main>
                </div>
            </div>
        `;
    }

    private renderArtifactCard(artifact: ConflictInspectorArtifact): string {
        return `
            <article class="artifact-card">
                <div class="artifact-copy">
                    <div class="artifact-title">${escapeHtml(this.getArtifactLabel(artifact))}</div>
                    <div class="artifact-path">${escapeHtml(artifact.relativePath)}</div>
                </div>
                ${this.renderActionButton(
                    {
                        type: "open-artifact",
                        artifactPath: artifact.path,
                    },
                    getI18n().t("openFile"),
                    true
                )}
            </article>
        `;
    }

    private renderActionButton(
        message: ConflictInspectorRequestMessage,
        label: string,
        secondary: boolean
    ): string {
        return `<button type="button" class="${secondary ? "secondary " : ""}action-button" data-message="${escapeHtml(
            JSON.stringify(message)
        )}">${escapeHtml(label)}</button>`;
    }

    private buildDiffActions(view: ConflictInspectorView): ConflictInspectorDiffActionItem[] {
        const i18n = getI18n();
        const roles = new Set(view.artifacts.map((artifact) => artifact.role));
        const actions: ConflictInspectorDiffActionItem[] = [];

        if (roles.has("base")) {
            actions.push({
                action: "base-working",
                label: i18n.t("conflictInspectorCompareBaseWorkingActionLabel"),
            });
        }

        if (roles.has("mine")) {
            actions.push({
                action: "mine-working",
                label: i18n.t("conflictInspectorCompareMineWorkingActionLabel"),
            });
        }

        if (roles.has("incoming")) {
            actions.push({
                action: "working-incoming",
                label: i18n.t("conflictInspectorCompareWorkingIncomingActionLabel"),
            });
        }

        if (roles.has("mine") && roles.has("incoming")) {
            actions.push({
                action: "mine-incoming",
                label: i18n.t("conflictInspectorCompareMineIncomingActionLabel"),
            });
        }

        return actions;
    }

    private buildResolutionActions(): ConflictInspectorResolutionActionItem[] {
        const i18n = getI18n();
        return [
            {
                action: "working",
                label: i18n.t("conflictInspectorMarkResolvedActionLabel"),
            },
            {
                action: "mine-full",
                label: i18n.t("conflictInspectorAcceptMineActionLabel"),
            },
            {
                action: "base",
                label: i18n.t("conflictInspectorAcceptBaseActionLabel"),
            },
            {
                action: "mine-conflict",
                label: i18n.t("conflictInspectorAcceptMineConflictActionLabel"),
            },
            {
                action: "theirs-conflict",
                label: i18n.t("conflictInspectorAcceptTheirsConflictActionLabel"),
            },
            {
                action: "theirs-full",
                label: i18n.t("conflictInspectorAcceptTheirsActionLabel"),
            },
            {
                action: "postpone",
                label: i18n.t("conflictInspectorPostponeActionLabel"),
            },
        ];
    }

    private getArtifactLabel(artifact: ConflictInspectorArtifact): string {
        const i18n = getI18n();
        switch (artifact.role) {
            case "mine":
                return i18n.t("conflictInspectorArtifactMineLabel");
            case "base":
                return i18n.t("conflictInspectorArtifactBaseLabel", {
                    revision: artifact.revision ?? "",
                });
            case "incoming":
                return i18n.t("conflictInspectorArtifactIncomingLabel", {
                    revision: artifact.revision ?? "",
                });
            case "property":
                return i18n.t("conflictInspectorArtifactPropertyLabel");
            case "revision":
                return i18n.t("conflictInspectorArtifactRevisionLabel", {
                    revision: artifact.revision ?? "",
                });
            case "related":
                return i18n.t("conflictInspectorArtifactRelatedLabel");
        }
    }
}
