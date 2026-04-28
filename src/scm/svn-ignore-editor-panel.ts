import * as vscode from "vscode";

interface IgnoreEditorPanelStrings {
    readonly heading: string;
    readonly directoryLabel: string;
    readonly rulesHint: string;
    readonly placeholder: string;
    readonly saveButton: string;
    readonly reloadButton: string;
    readonly savingStatus: string;
    readonly reloadingStatus: string;
    readonly suggestedEntryLabel: string;
    readonly addSuggestedEntryButton: string;
}

export interface IgnoreEditorPanelState {
    readonly value: string;
    readonly directoryDisplayPath: string;
    readonly suggestedEntry?: string;
    readonly statusMessage?: string;
}

export interface IgnoreEditorPanelContext {
    readonly targetKey: string;
    readonly title: string;
    readonly strings: IgnoreEditorPanelStrings;
    readonly initialState: IgnoreEditorPanelState;
    readonly save: (value: string) => Promise<IgnoreEditorPanelState>;
    readonly reload: () => Promise<IgnoreEditorPanelState>;
    readonly handleError: (error: unknown) => void;
}

type IgnoreEditorMessage =
    | {
          readonly type: "save";
          readonly value: string;
      }
    | {
          readonly type: "reload";
      };

export class SvnIgnoreEditorPanel implements vscode.Disposable {
    private panel?: vscode.WebviewPanel;
    private context?: IgnoreEditorPanelContext;
    private latestState?: IgnoreEditorPanelState;

    public dispose(): void {
        this.panel?.dispose();
        this.panel = undefined;
        this.context = undefined;
        this.latestState = undefined;
    }

    public show(context: IgnoreEditorPanelContext): void {
        if (this.panel && this.context?.targetKey === context.targetKey) {
            this.context = context;
            this.panel.title = context.title;
            this.postState({
                ...(this.latestState ?? context.initialState),
                directoryDisplayPath: context.initialState.directoryDisplayPath,
                suggestedEntry: context.initialState.suggestedEntry,
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
            "svn-tree-ignore-editor",
            "SVN Ignore",
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

        this.panel.webview.onDidReceiveMessage((message: IgnoreEditorMessage) => {
            void this.handleMessage(message);
        });

        return this.panel;
    }

    private async handleMessage(message: IgnoreEditorMessage): Promise<void> {
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

    private postState(state: IgnoreEditorPanelState): void {
        this.latestState = state;
        this.panel?.webview.postMessage({
            type: "state",
            state,
        });
    }

    private renderHtml(context: IgnoreEditorPanelContext): string {
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
            color-scheme: light dark;
        }

        body {
            margin: 0;
            padding: 20px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
        }

        main {
            display: grid;
            gap: 14px;
        }

        h1 {
            margin: 0;
            font-size: 1.15rem;
            font-weight: 600;
        }

        p {
            margin: 0;
            line-height: 1.5;
        }

        .meta {
            display: grid;
            gap: 8px;
            padding: 12px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            background: color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-button-background) 12%);
        }

        .meta-label {
            color: var(--vscode-descriptionForeground);
        }

        .toolbar {
            display: flex;
            gap: 8px;
            align-items: center;
            flex-wrap: wrap;
        }

        button {
            border: none;
            border-radius: 6px;
            padding: 6px 12px;
            cursor: pointer;
            color: var(--vscode-button-foreground);
            background: var(--vscode-button-background);
        }

        button.secondary {
            color: var(--vscode-button-secondaryForeground);
            background: var(--vscode-button-secondaryBackground);
        }

        button:disabled {
            opacity: 0.6;
            cursor: default;
        }

        textarea {
            width: 100%;
            min-height: 360px;
            resize: vertical;
            box-sizing: border-box;
            padding: 12px;
            line-height: 1.5;
            color: var(--vscode-input-foreground);
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
            border-radius: 8px;
            font: inherit;
            white-space: pre;
        }

        .status {
            color: var(--vscode-descriptionForeground);
        }

        .hint {
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <main>
        <header>
            <h1 id="heading"></h1>
        </header>
        <section class="meta">
            <div>
                <div class="meta-label" id="directory-label"></div>
                <strong id="directory-value"></strong>
            </div>
            <p id="rules-hint" class="hint"></p>
            <div id="suggestion-row" class="toolbar" hidden>
                <span id="suggestion-label"></span>
                <button id="add-suggestion" type="button" class="secondary"></button>
            </div>
        </section>
        <section class="toolbar">
            <button id="save" type="button"></button>
            <button id="reload" type="button" class="secondary"></button>
            <span id="status" class="status"></span>
        </section>
        <textarea id="editor" spellcheck="false"></textarea>
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
        const directoryLabel = document.getElementById("directory-label");
        const directoryValue = document.getElementById("directory-value");
        const rulesHint = document.getElementById("rules-hint");
        const suggestionRow = document.getElementById("suggestion-row");
        const suggestionLabel = document.getElementById("suggestion-label");
        const addSuggestionButton = document.getElementById("add-suggestion");
        const saveButton = document.getElementById("save");
        const reloadButton = document.getElementById("reload");
        const status = document.getElementById("status");
        const editor = document.getElementById("editor");

        function currentEntries() {
            return editor.value
                .split(/\\r?\\n/u)
                .map((entry) => entry.trim())
                .filter(Boolean);
        }

        function render() {
            heading.textContent = strings.heading;
            directoryLabel.textContent = strings.directoryLabel;
            directoryValue.textContent = state.directoryDisplayPath;
            rulesHint.textContent = strings.rulesHint;
            suggestionLabel.textContent = state.suggestedEntry
                ? strings.suggestedEntryLabel.replace("{entry}", state.suggestedEntry)
                : "";
            addSuggestionButton.textContent = strings.addSuggestedEntryButton;
            addSuggestionButton.disabled =
                state.busy ||
                !state.suggestedEntry ||
                currentEntries().includes(state.suggestedEntry);
            suggestionRow.hidden = !state.suggestedEntry;
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

        addSuggestionButton.addEventListener("click", () => {
            if (!state.suggestedEntry) {
                return;
            }

            const entries = currentEntries();
            if (!entries.includes(state.suggestedEntry)) {
                entries.push(state.suggestedEntry);
                editor.value = entries.join("\\n");
            }

            state.statusMessage = "";
            render();
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
                state.directoryDisplayPath = message.state.directoryDisplayPath ?? state.directoryDisplayPath;
                state.suggestedEntry = message.state.suggestedEntry;
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
