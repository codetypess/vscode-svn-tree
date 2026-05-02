import * as vscode from "vscode";
import type {
    ParsedSvnExternalDefinitions,
    SvnExternalDefinition,
} from "./svn-externals-utils";

interface ExternalsEditorPanelStrings {
    readonly heading: string;
    readonly directoryLabel: string;
    readonly definitionsHint: string;
    readonly placeholder: string;
    readonly saveButton: string;
    readonly reloadButton: string;
    readonly savingStatus: string;
    readonly reloadingStatus: string;
    readonly rawModeLabel: string;
    readonly structuredModeLabel: string;
    readonly addDefinitionButton: string;
    readonly removeDefinitionButton: string;
    readonly formatFieldLabel: string;
    readonly localPathFieldLabel: string;
    readonly sourceFieldLabel: string;
    readonly revisionFieldLabel: string;
    readonly sourceFirstFormatLabel: string;
    readonly localFirstFormatLabel: string;
    readonly structuredUnavailableLabel: string;
    readonly structuredInvalidLinesLabel: string;
    readonly structuredIncompleteLabel: string;
    readonly emptyStructuredStateLabel: string;
}

export interface ExternalsEditorPanelState {
    readonly value: string;
    readonly directoryDisplayPath: string;
    readonly structured: ParsedSvnExternalDefinitions;
    readonly statusMessage?: string;
}

export interface ExternalsEditorPanelContext {
    readonly targetKey: string;
    readonly title: string;
    readonly strings: ExternalsEditorPanelStrings;
    readonly initialState: ExternalsEditorPanelState;
    readonly save: (value: string) => Promise<ExternalsEditorPanelState>;
    readonly reload: () => Promise<ExternalsEditorPanelState>;
    readonly reparseStructured: (value: string) => Promise<ParsedSvnExternalDefinitions>;
    readonly handleError: (error: unknown) => void;
}

type ExternalsEditorMessage =
    | {
          readonly type: "save";
          readonly value: string;
      }
    | {
          readonly type: "reload";
      }
    | {
          readonly type: "reparse-structured";
          readonly value: string;
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
                return;
            }

            if (message.type === "reparse-structured") {
                this.postState({
                    ...(this.latestState ?? context.initialState),
                    statusMessage: undefined,
                    value: message.value,
                    structured: await context.reparseStructured(message.value),
                });
            }
        } catch (error) {
            context.handleError(error);
            this.postState({
                ...(this.latestState ?? context.initialState),
                value:
                    message.type === "save" || message.type === "reparse-structured"
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
            --warning-bg: color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 10%, transparent);
            --warning-fg: var(--vscode-editorWarning-foreground, #cca700);
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
            gap: 16px;
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

        .meta,
        .surface {
            display: grid;
            gap: 12px;
            padding: 16px 18px;
            border: 1px solid var(--border);
            border-radius: 8px;
            background: color-mix(in srgb, var(--details-bg) 78%, var(--surface-bg));
        }

        .meta-label,
        .field-label {
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

        .toolbar,
        .mode-toolbar {
            display: flex;
            gap: 8px;
            align-items: center;
            flex-wrap: wrap;
        }

        button,
        select,
        input,
        textarea {
            font: inherit;
        }

        button {
            min-height: 28px;
            padding: 4px 12px;
            border: 1px solid transparent;
            border-radius: 4px;
            cursor: pointer;
            color: var(--accent-contrast);
            background: var(--accent);
        }

        button.secondary {
            color: var(--secondary-button-fg);
            background: var(--secondary-button-bg);
            border-color: var(--border);
        }

        button.mode-button {
            min-width: 120px;
        }

        button.active {
            box-shadow: inset 0 0 0 1px var(--focus-border);
        }

        button:hover {
            background: var(--accent-hover);
        }

        button.secondary:hover {
            background: var(--secondary-button-hover-bg);
        }

        button:focus-visible,
        select:focus-visible,
        input:focus-visible,
        textarea:focus-visible {
            outline: 1px solid var(--focus-border);
            outline-offset: 1px;
        }

        button:disabled {
            opacity: 0.6;
            cursor: default;
        }

        textarea,
        select,
        input {
            color: var(--input-fg);
            background: var(--input-bg);
            border: 1px solid var(--input-border);
            border-radius: 6px;
        }

        textarea {
            width: 100%;
            min-height: 360px;
            resize: vertical;
            padding: 12px 14px;
            line-height: 1.5;
            white-space: pre;
        }

        select,
        input {
            width: 100%;
            min-height: 32px;
            padding: 6px 8px;
        }

        .status {
            color: var(--muted);
            font-size: 12px;
        }

        .hint {
            color: var(--muted);
            font-size: 12px;
        }

        .warning {
            padding: 10px 12px;
            border: 1px solid color-mix(in srgb, var(--warning-fg) 50%, transparent);
            border-radius: 6px;
            color: var(--warning-fg);
            background: var(--warning-bg);
            font-size: 12px;
            line-height: 1.5;
            white-space: pre-wrap;
        }

        .rows {
            display: grid;
            gap: 12px;
        }

        .row {
            display: grid;
            gap: 10px;
            padding: 12px;
            border: 1px solid var(--border);
            border-radius: 6px;
            background: color-mix(in srgb, var(--surface-bg) 82%, var(--details-bg));
        }

        .row-grid {
            display: grid;
            gap: 10px;
            grid-template-columns: minmax(120px, 160px) minmax(160px, 1fr) minmax(220px, 2fr) minmax(100px, 120px) auto;
            align-items: end;
        }

        .field {
            display: grid;
            gap: 6px;
        }

        .field-label {
            font-size: 10px;
        }

        .row-actions {
            display: flex;
            justify-content: flex-end;
        }

        .empty-state {
            color: var(--muted);
            font-size: 12px;
        }

        @media (max-width: 980px) {
            .row-grid {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }

            .row-actions {
                justify-content: flex-start;
            }
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
            <section class="surface">
                <div class="mode-toolbar">
                    <button id="structured-mode" type="button" class="secondary mode-button"></button>
                    <button id="raw-mode" type="button" class="secondary mode-button"></button>
                </div>
                <div id="structured-warning" class="warning" hidden></div>
                <div id="structured-incomplete" class="warning" hidden></div>
                <div id="structured-surface" hidden>
                    <div class="toolbar">
                        <button id="add-definition" type="button" class="secondary"></button>
                    </div>
                    <div id="empty-structured-state" class="empty-state" hidden></div>
                    <div id="rows" class="rows"></div>
                </div>
                <div id="raw-surface" hidden>
                    <textarea id="editor" spellcheck="false"></textarea>
                </div>
            </section>
        </div>
    </main>
    <script>
        const vscode = acquireVsCodeApi();
        const bootstrap = ${bootstrap};
        const strings = bootstrap.strings;
        const state = {
            ...bootstrap.state,
            busy: false,
            mode:
                bootstrap.state.structured.invalidLines.length === 0
                    ? "structured"
                    : "raw",
            rows: bootstrap.state.structured.definitions.map(cloneRow),
        };

        const heading = document.getElementById("heading");
        const headerPath = document.getElementById("header-path");
        const directoryLabel = document.getElementById("directory-label");
        const directoryValue = document.getElementById("directory-value");
        const definitionsHint = document.getElementById("definitions-hint");
        const saveButton = document.getElementById("save");
        const reloadButton = document.getElementById("reload");
        const status = document.getElementById("status");
        const structuredModeButton = document.getElementById("structured-mode");
        const rawModeButton = document.getElementById("raw-mode");
        const structuredWarning = document.getElementById("structured-warning");
        const structuredIncomplete = document.getElementById("structured-incomplete");
        const addDefinitionButton = document.getElementById("add-definition");
        const rowsContainer = document.getElementById("rows");
        const rawSurface = document.getElementById("raw-surface");
        const structuredSurface = document.getElementById("structured-surface");
        const editor = document.getElementById("editor");
        const emptyStructuredState = document.getElementById("empty-structured-state");

        function cloneRow(row) {
            return {
                localPath: row.localPath ?? "",
                source: row.source ?? "",
                revision: row.revision ?? "",
                format: row.format ?? "source-first",
            };
        }

        function createBlankRow() {
            return {
                localPath: "",
                source: "",
                revision: "",
                format: "source-first",
            };
        }

        function hasStructuredParseFailures() {
            return state.structured.invalidLines.length > 0;
        }

        function hasIncompleteRows() {
            return state.rows.some((row) => !row.localPath.trim() || !row.source.trim());
        }

        function serializeRows() {
            const lines = state.rows
                .map((row) => {
                    const localPath = row.localPath.trim();
                    const source = row.source.trim();
                    const revision = row.revision.trim();
                    if (!localPath || !source) {
                        return "";
                    }

                    const parts = revision ? ["-r", revision] : [];
                    if (row.format === "local-first") {
                        parts.push(localPath, source);
                    } else {
                        parts.push(source, localPath);
                    }

                    return parts.join(" ");
                })
                .filter(Boolean);

            state.value = lines.join("\\n");
        }

        function updateRawEditor(forceRawSync) {
            if (state.mode === "structured") {
                serializeRows();
                editor.value = state.value;
                return;
            }

            if (forceRawSync) {
                editor.value = state.value;
            }
        }

        function renderRows() {
            rowsContainer.replaceChildren();
            if (state.rows.length === 0) {
                emptyStructuredState.hidden = false;
                emptyStructuredState.textContent = strings.emptyStructuredStateLabel;
                return;
            }

            emptyStructuredState.hidden = true;
            for (const [index, row] of state.rows.entries()) {
                const rowElement = document.createElement("div");
                rowElement.className = "row";

                const grid = document.createElement("div");
                grid.className = "row-grid";

                grid.appendChild(createSelectField(strings.formatFieldLabel, [
                    {
                        value: "source-first",
                        label: strings.sourceFirstFormatLabel,
                    },
                    {
                        value: "local-first",
                        label: strings.localFirstFormatLabel,
                    },
                ], row.format, (value) => {
                    row.format = value;
                    state.statusMessage = "";
                    render();
                }));

                grid.appendChild(
                    createInputField(strings.localPathFieldLabel, row.localPath, (value) => {
                        row.localPath = value;
                        state.statusMessage = "";
                        render();
                    })
                );

                grid.appendChild(
                    createInputField(strings.sourceFieldLabel, row.source, (value) => {
                        row.source = value;
                        state.statusMessage = "";
                        render();
                    })
                );

                grid.appendChild(
                    createInputField(strings.revisionFieldLabel, row.revision, (value) => {
                        row.revision = value;
                        state.statusMessage = "";
                        render();
                    })
                );

                const removeField = document.createElement("div");
                removeField.className = "row-actions";
                const removeButton = document.createElement("button");
                removeButton.type = "button";
                removeButton.className = "secondary";
                removeButton.textContent = strings.removeDefinitionButton;
                removeButton.disabled = state.busy;
                removeButton.addEventListener("click", () => {
                    state.rows.splice(index, 1);
                    state.statusMessage = "";
                    render();
                });
                removeField.appendChild(removeButton);
                grid.appendChild(removeField);

                rowElement.appendChild(grid);
                rowsContainer.appendChild(rowElement);
            }
        }

        function createFieldContainer(labelText) {
            const field = document.createElement("label");
            field.className = "field";
            const label = document.createElement("span");
            label.className = "field-label";
            label.textContent = labelText;
            field.appendChild(label);
            return field;
        }

        function createInputField(labelText, value, onInput) {
            const field = createFieldContainer(labelText);
            const input = document.createElement("input");
            input.type = "text";
            input.value = value;
            input.disabled = state.busy;
            input.addEventListener("input", (event) => {
                onInput(event.target.value);
            });
            field.appendChild(input);
            return field;
        }

        function createSelectField(labelText, options, value, onChange) {
            const field = createFieldContainer(labelText);
            const select = document.createElement("select");
            select.disabled = state.busy;
            for (const option of options) {
                const optionElement = document.createElement("option");
                optionElement.value = option.value;
                optionElement.textContent = option.label;
                optionElement.selected = option.value === value;
                select.appendChild(optionElement);
            }

            select.addEventListener("change", (event) => {
                onChange(event.target.value);
            });
            field.appendChild(select);
            return field;
        }

        function renderWarnings() {
            if (hasStructuredParseFailures()) {
                structuredWarning.hidden = false;
                structuredWarning.textContent = [
                    strings.structuredUnavailableLabel,
                    strings.structuredInvalidLinesLabel.replace(
                        "{lines}",
                        state.structured.invalidLines.join("\\n")
                    ),
                ].join("\\n");
            } else {
                structuredWarning.hidden = true;
                structuredWarning.textContent = "";
            }

            if (state.mode === "structured" && hasIncompleteRows()) {
                structuredIncomplete.hidden = false;
                structuredIncomplete.textContent = strings.structuredIncompleteLabel;
            } else {
                structuredIncomplete.hidden = true;
                structuredIncomplete.textContent = "";
            }
        }

        function render(forceRawSync = false) {
            heading.textContent = strings.heading;
            headerPath.textContent = state.directoryDisplayPath;
            directoryLabel.textContent = strings.directoryLabel;
            directoryValue.textContent = state.directoryDisplayPath;
            definitionsHint.textContent = strings.definitionsHint;
            saveButton.textContent = strings.saveButton;
            reloadButton.textContent = strings.reloadButton;
            structuredModeButton.textContent = strings.structuredModeLabel;
            rawModeButton.textContent = strings.rawModeLabel;
            addDefinitionButton.textContent = strings.addDefinitionButton;
            status.textContent = state.statusMessage ?? "";
            saveButton.disabled = state.busy || (state.mode === "structured" && hasIncompleteRows());
            reloadButton.disabled = state.busy;
            addDefinitionButton.disabled = state.busy;
            structuredModeButton.disabled = state.busy;
            rawModeButton.disabled = state.busy;
            structuredModeButton.classList.toggle("active", state.mode === "structured");
            rawModeButton.classList.toggle("active", state.mode === "raw");
            editor.placeholder = strings.placeholder;
            editor.disabled = state.busy;
            rawSurface.hidden = state.mode !== "raw";
            structuredSurface.hidden = state.mode !== "structured";

            updateRawEditor(forceRawSync);
            renderRows();
            renderWarnings();
        }

        editor.addEventListener("input", () => {
            state.value = editor.value;
            state.statusMessage = "";
            render(false);
        });

        saveButton.addEventListener("click", () => {
            if (state.mode === "structured") {
                serializeRows();
            } else {
                state.value = editor.value;
            }

            vscode.postMessage({
                type: "save",
                value: state.value,
            });
        });

        reloadButton.addEventListener("click", () => {
            vscode.postMessage({
                type: "reload",
            });
        });

        rawModeButton.addEventListener("click", () => {
            state.mode = "raw";
            state.statusMessage = "";
            render(true);
        });

        structuredModeButton.addEventListener("click", () => {
            if (state.mode === "structured") {
                return;
            }

            vscode.postMessage({
                type: "reparse-structured",
                value: editor.value,
            });
        });

        addDefinitionButton.addEventListener("click", () => {
            state.rows.push(createBlankRow());
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
                state.directoryDisplayPath =
                    message.state.directoryDisplayPath ?? state.directoryDisplayPath;
                state.structured = message.state.structured ?? state.structured;
                state.rows = state.structured.definitions.map(cloneRow);
                state.statusMessage = message.state.statusMessage ?? "";
                state.mode = hasStructuredParseFailures() ? "raw" : "structured";
                render(true);
            }
        });

        render(true);
    </script>
</body>
</html>`;
    }
}
