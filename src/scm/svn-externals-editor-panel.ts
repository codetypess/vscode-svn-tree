import * as vscode from "vscode";

interface ExternalsEditorPanelStrings {
    readonly heading: string;
    readonly directoryLabel: string;
    readonly definitionsHint: string;
    readonly placeholder: string;
    readonly saveButton: string;
    readonly reloadButton: string;
    readonly savingStatus: string;
    readonly reloadingStatus: string;
}

export interface ExternalsEditorPanelState {
    readonly value: string;
    readonly directoryDisplayPath: string;
    readonly statusMessage?: string;
}

export interface ExternalsEditorPanelContext {
    readonly targetKey: string;
    readonly title: string;
    readonly strings: ExternalsEditorPanelStrings;
    readonly initialState: ExternalsEditorPanelState;
    readonly save: (value: string) => Promise<ExternalsEditorPanelState>;
    readonly reload: () => Promise<ExternalsEditorPanelState>;
    readonly handleError: (error: unknown) => void;
}

type ExternalsEditorMessage =
    | {
          readonly type: "save";
          readonly value: string;
      }
    | {
          readonly type: "reload";
      };

export class SvnExternalsEditorPanel implements vscode.Disposable {
    private panel?: vscode.WebviewPanel;
    private context?: ExternalsEditorPanelContext;
    private latestState?: ExternalsEditorPanelState;

    public dispose(): void {
        this.panel?.dispose();
        this.panel = undefined;
        this.context = undefined;
        this.latestState = undefined;
    }

    public show(context: ExternalsEditorPanelContext): void {
        if (this.panel && this.context?.targetKey === context.targetKey) {
            this.context = context;
            this.panel.title = context.title;
            this.postState({
                ...(this.latestState ?? context.initialState),
                directoryDisplayPath: context.initialState.directoryDisplayPath,
            });
            this.panel.reveal(vscode.ViewColumn.Active, false);
            return;
        }

        this.context = context;
        this.latestState = context.initialState;
        const panel = this.ensurePanel();
        panel.title = context.title;
        panel.webview.html = this.renderHtml(context);
        panel.reveal(vscode.ViewColumn.Active, false);
    }

    private ensurePanel(): vscode.WebviewPanel {
        if (this.panel) {
            return this.panel;
        }

        this.panel = vscode.window.createWebviewPanel(
            "svn-tree-externals-editor",
            "SVN Externals",
            {
                preserveFocus: false,
                viewColumn: vscode.ViewColumn.Active,
            },
            {
                enableScripts: true,
            }
        );

        this.panel.onDidDispose(() => {
            this.panel = undefined;
            this.context = undefined;
            this.latestState = undefined;
        });

        this.panel.webview.onDidReceiveMessage((message: ExternalsEditorMessage) => {
            void this.handleMessage(message);
        });

        return this.panel;
    }

    private async handleMessage(message: ExternalsEditorMessage): Promise<void> {
        const context = this.context;
        if (!context) {
            return;
        }

        try {
            if (message.type === "save") {
                this.postBusy(context.strings.savingStatus);
                this.postState(await context.save(message.value));
                return;
            }

            if (message.type === "reload") {
                this.postBusy(context.strings.reloadingStatus);
                this.postState(await context.reload());
            }
        } catch (error) {
            context.handleError(error);
            this.postState({
                ...(this.latestState ?? context.initialState),
                value:
                    message.type === "save"
                        ? message.value
                        : (this.latestState ?? context.initialState).value,
            });
        }
    }

    private postBusy(statusMessage: string): void {
        this.panel?.webview.postMessage({
            type: "busy",
            statusMessage,
        });
    }

    private postState(state: ExternalsEditorPanelState): void {
        this.latestState = state;
        this.panel?.webview.postMessage({
            type: "state",
            state,
        });
    }

    private renderHtml(context: ExternalsEditorPanelContext): string {
        const bootstrap = JSON.stringify({
            strings: context.strings,
            state: context.initialState,
        });

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
        :root {
            color-scheme: var(--vscode-color-scheme);
            --page-bg: var(--vscode-editor-background, #1e1e1e);
            --surface-bg: var(--vscode-editor-background, #1e1e1e);
            --details-bg: var(--vscode-editorWidget-background, var(--page-bg));
            --muted: var(--vscode-descriptionForeground, #8c8c8c);
            --accent: var(--vscode-button-background, #0e639c);
            --accent-hover: var(--vscode-button-hoverBackground, #1177bb);
            --accent-contrast: var(--vscode-button-foreground, #ffffff);
            --secondary-button-bg: var(--vscode-button-secondaryBackground, transparent);
            --secondary-button-hover-bg: var(
                --vscode-button-secondaryHoverBackground,
                color-mix(in srgb, var(--secondary-button-bg) 82%, white)
            );
            --secondary-button-fg: var(
                --vscode-button-secondaryForeground,
                var(--vscode-editor-foreground)
            );
            --border: var(--vscode-panel-border, rgba(128, 128, 128, 0.35));
            --input-bg: var(--vscode-input-background, transparent);
            --input-fg: var(--vscode-input-foreground, var(--vscode-editor-foreground));
            --input-border: var(--vscode-input-border, var(--border));
            --focus-border: var(--vscode-focusBorder, var(--accent));
        }

        * {
            box-sizing: border-box;
        }

        html,
        body {
            height: 100%;
        }

        body {
            margin: 0;
            padding: 0 !important;
            font-family: var(--vscode-font-family);
            font-size: 13px;
            color: var(--vscode-editor-foreground);
            background: var(--page-bg);
        }

        main {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .content {
            display: grid;
            gap: 18px;
            padding: 24px;
        }

        .panel-header {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 16px;
            border-bottom: 1px solid var(--border);
            background: var(--surface-bg);
        }

        .panel-header-copy {
            display: flex;
            flex-direction: column;
            min-width: 0;
        }

        h1 {
            margin: 0;
            font-size: 15px;
            font-weight: 700;
            letter-spacing: 0.02em;
        }

        #header-path {
            margin-top: 2px;
            color: var(--muted);
            font-size: 12px;
            line-height: 1.4;
            word-break: break-word;
        }

        p {
            margin: 0;
            line-height: 1.5;
        }

        .meta {
            display: grid;
            gap: 12px;
            padding: 16px 18px;
            border: 1px solid var(--border);
            border-radius: 8px;
            background: color-mix(in srgb, var(--details-bg) 78%, var(--surface-bg));
        }

        .meta-label {
            color: var(--muted);
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.04em;
            text-transform: uppercase;
        }

        #directory-value {
            font-size: 15px;
            font-weight: 600;
        }

        .toolbar {
            display: flex;
            gap: 8px;
            align-items: center;
            flex-wrap: wrap;
        }

        button {
            min-height: 28px;
            padding: 4px 12px;
            border: 1px solid transparent;
            border-radius: 4px;
            cursor: pointer;
            font: inherit;
            color: var(--accent-contrast);
            background: var(--accent);
        }

        button.secondary {
            color: var(--secondary-button-fg);
            background: var(--secondary-button-bg);
            border-color: var(--border);
        }

        button:hover {
            background: var(--accent-hover);
        }

        button.secondary:hover {
            background: var(--secondary-button-hover-bg);
        }

        button:focus-visible {
            outline: 1px solid var(--focus-border);
            outline-offset: 1px;
        }

        button:disabled {
            opacity: 0.6;
            cursor: default;
        }

        textarea {
            width: 100%;
            min-height: 360px;
            resize: vertical;
            padding: 12px 14px;
            line-height: 1.5;
            color: var(--input-fg);
            background: var(--input-bg);
            border: 1px solid var(--input-border);
            border-radius: 8px;
            font: inherit;
            white-space: pre;
            outline: none;
        }

        textarea:hover {
            border-color: color-mix(in srgb, var(--input-border) 70%, var(--focus-border));
        }

        textarea:focus {
            border-color: var(--focus-border);
            box-shadow: inset 0 0 0 1px var(--focus-border);
        }

        .status {
            color: var(--muted);
            font-size: 12px;
        }

        .hint {
            color: var(--muted);
            font-size: 12px;
        }
    </style>
</head>
<body>
    <main>
        <header class="panel-header">
            <div class="panel-header-copy">
                <h1 id="heading"></h1>
                <small id="header-path"></small>
            </div>
        </header>
        <div class="content">
            <section class="meta">
                <div>
                    <div class="meta-label" id="directory-label"></div>
                    <strong id="directory-value"></strong>
                </div>
                <p id="definitions-hint" class="hint"></p>
            </section>
            <section class="toolbar">
                <button id="save" type="button"></button>
                <button id="reload" type="button" class="secondary"></button>
                <span id="status" class="status"></span>
            </section>
            <textarea id="editor" spellcheck="false"></textarea>
        </div>
    </main>
    <script>
        const vscode = acquireVsCodeApi();
        const bootstrap = ${bootstrap};
        const strings = bootstrap.strings;
        const state = {
            ...bootstrap.state,
            busy: false,
        };

        const heading = document.getElementById("heading");
        const headerPath = document.getElementById("header-path");
        const directoryLabel = document.getElementById("directory-label");
        const directoryValue = document.getElementById("directory-value");
        const definitionsHint = document.getElementById("definitions-hint");
        const saveButton = document.getElementById("save");
        const reloadButton = document.getElementById("reload");
        const status = document.getElementById("status");
        const editor = document.getElementById("editor");

        function render() {
            heading.textContent = strings.heading;
            headerPath.textContent = state.directoryDisplayPath;
            directoryLabel.textContent = strings.directoryLabel;
            directoryValue.textContent = state.directoryDisplayPath;
            definitionsHint.textContent = strings.definitionsHint;
            saveButton.textContent = strings.saveButton;
            reloadButton.textContent = strings.reloadButton;
            saveButton.disabled = state.busy;
            reloadButton.disabled = state.busy;
            status.textContent = state.statusMessage ?? "";
            editor.placeholder = strings.placeholder;
        }

        editor.value = state.value;
        editor.addEventListener("input", () => {
            state.statusMessage = "";
            render();
        });

        saveButton.addEventListener("click", () => {
            vscode.postMessage({
                type: "save",
                value: editor.value,
            });
        });

        reloadButton.addEventListener("click", () => {
            vscode.postMessage({
                type: "reload",
            });
        });

        window.addEventListener("message", (event) => {
            const message = event.data;
            if (!message || typeof message !== "object") {
                return;
            }

            if (message.type === "busy") {
                state.busy = true;
                state.statusMessage = message.statusMessage;
                render();
                return;
            }

            if (message.type === "state" && message.state) {
                state.busy = false;
                state.value = message.state.value ?? "";
                state.directoryDisplayPath =
                    message.state.directoryDisplayPath ?? state.directoryDisplayPath;
                state.statusMessage = message.state.statusMessage ?? "";
                editor.value = state.value;
                render();
            }
        });

        render();
    </script>
</body>
</html>`;
    }
}
