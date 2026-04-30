import * as vscode from "vscode";
import type { SvnLogEntry } from "../svn/svn-types";
import { getI18n } from "../vscode-i18n";
import {
    formatInlineBlameHoverTimestamp,
    formatInlineBlameLabel,
    type ParsedBlameLine,
} from "./svn-blame-utils";
import type { SvnRepository } from "./svn-repository";

const inlineBlameConfigurationKey = "enable-inline-blame";
const inlineBlameUpdateDelayMs = 150;

export class SvnInlineBlameController implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private readonly decorationType = vscode.window.createTextEditorDecorationType({
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        after: {
            margin: "0 0 0 1.5rem",
            color: new vscode.ThemeColor("editorCodeLens.foreground"),
            fontStyle: "italic",
        },
    });
    private readonly blameCache = new Map<string, readonly ParsedBlameLine[]>();
    private readonly blameRequestCache = new Map<string, Promise<readonly ParsedBlameLine[]>>();
    private readonly logEntryCache = new Map<string, Promise<SvnLogEntry | undefined>>();
    private updateTimer: NodeJS.Timeout | undefined;
    private updateRequestId = 0;
    private lastRenderedStateKey: string | undefined;

    public constructor(
        private readonly resolveRepositoryForUri: (uri: vscode.Uri) => SvnRepository | undefined
    ) {
        this.disposables.push(
            this.decorationType,
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.scheduleRefresh(0);
            }),
            vscode.window.onDidChangeTextEditorSelection((event) => {
                if (event.textEditor === vscode.window.activeTextEditor) {
                    this.scheduleRefresh();
                }
            }),
            vscode.workspace.onDidChangeTextDocument((event) => {
                this.invalidateDocumentCache(event.document.uri);
                if (event.document === vscode.window.activeTextEditor?.document) {
                    this.scheduleRefresh(0);
                }
            }),
            vscode.workspace.onDidSaveTextDocument((document) => {
                this.invalidateDocumentCache(document.uri);
                if (document === vscode.window.activeTextEditor?.document) {
                    this.scheduleRefresh(0);
                }
            }),
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration(`svn-tree.${inlineBlameConfigurationKey}`)) {
                    this.refresh();
                }
            })
        );

        this.refresh();
    }

    public dispose(): void {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
            this.updateTimer = undefined;
        }

        this.clearDecorations();
        this.blameCache.clear();
        this.blameRequestCache.clear();
        this.logEntryCache.clear();

        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }

    public refresh(): void {
        this.lastRenderedStateKey = undefined;
        this.scheduleRefresh(0);
    }

    public async toggle(): Promise<void> {
        const config = vscode.workspace.getConfiguration("svn-tree");
        const currentValue = config.get<boolean>(inlineBlameConfigurationKey, false);
        const nextValue = !currentValue;
        const target = vscode.workspace.workspaceFolders?.length
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.Global;

        await config.update(inlineBlameConfigurationKey, nextValue, target);
        void vscode.window.setStatusBarMessage(
            getI18n().t(nextValue ? "inlineBlameEnabledStatus" : "inlineBlameDisabledStatus"),
            2000
        );
        this.refresh();
    }

    private isInlineBlameEnabled(): boolean {
        return vscode.workspace
            .getConfiguration("svn-tree")
            .get<boolean>(inlineBlameConfigurationKey, false);
    }

    private scheduleRefresh(delayMs = inlineBlameUpdateDelayMs): void {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            this.lastRenderedStateKey = undefined;
            this.clearDecorations();
            return;
        }

        this.updateTimer = setTimeout(() => {
            this.updateTimer = undefined;
            void this.renderInlineBlame(editor);
        }, delayMs);
    }

    private async renderInlineBlame(editor: vscode.TextEditor): Promise<void> {
        const isEnabled = this.isInlineBlameEnabled();
        const stateKey = this.buildRenderedStateKey(editor, isEnabled);
        if (stateKey === this.lastRenderedStateKey) {
            return;
        }

        if (
            !isEnabled ||
            editor !== vscode.window.activeTextEditor ||
            !this.canRenderInlineBlame(editor)
        ) {
            this.lastRenderedStateKey = stateKey;
            this.clearDecorations();
            return;
        }

        const repository = this.resolveRepositoryForUri(editor.document.uri);
        if (!repository) {
            this.lastRenderedStateKey = stateKey;
            this.clearDecorations();
            return;
        }

        const requestId = ++this.updateRequestId;
        const blameLines = await this.getBlameLines(repository, editor.document);
        if (requestId !== this.updateRequestId || editor !== vscode.window.activeTextEditor) {
            return;
        }

        const blameLine = blameLines[editor.selection.active.line];
        if (!blameLine) {
            this.lastRenderedStateKey = stateKey;
            this.clearDecorations();
            return;
        }

        const hoverMessage = await this.buildHoverMessage(
            repository,
            editor.document.uri,
            blameLine
        );
        if (requestId !== this.updateRequestId || editor !== vscode.window.activeTextEditor) {
            return;
        }

        const activeLine = editor.document.lineAt(editor.selection.active.line);
        editor.setDecorations(this.decorationType, [
            {
                range: new vscode.Range(activeLine.range.end, activeLine.range.end),
                hoverMessage,
                renderOptions: {
                    after: {
                        contentText: formatInlineBlameLabel(blameLine),
                    },
                },
            },
        ]);
        this.lastRenderedStateKey = stateKey;
    }

    private canRenderInlineBlame(editor: vscode.TextEditor): boolean {
        const { document } = editor;
        return (
            document.uri.scheme === "file" &&
            !document.isUntitled &&
            !document.isDirty &&
            document.lineCount > 0
        );
    }

    private buildRenderedStateKey(editor: vscode.TextEditor, isEnabled: boolean): string {
        return [
            isEnabled ? "enabled" : "disabled",
            editor.document.uri.toString(),
            editor.document.version,
            editor.document.isDirty ? "dirty" : "clean",
            editor.selection.active.line,
        ].join("::");
    }

    private async getBlameLines(
        repository: SvnRepository,
        document: vscode.TextDocument
    ): Promise<readonly ParsedBlameLine[]> {
        const cacheKey = await this.getDocumentCacheKey(document);
        const cached = this.blameCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const pendingRequest = this.blameRequestCache.get(cacheKey);
        if (pendingRequest) {
            return pendingRequest;
        }

        const request = repository
            .loadWorkingCopyBlameLines(document.uri.fsPath)
            .then((lines) => {
                this.blameRequestCache.delete(cacheKey);
                this.replaceDocumentCacheEntry(cacheKey, lines);
                return lines;
            })
            .catch(() => {
                this.blameRequestCache.delete(cacheKey);
                return [];
            });

        this.replaceDocumentRequestEntry(cacheKey, request);
        return request;
    }

    private async buildHoverMessage(
        repository: SvnRepository,
        documentUri: vscode.Uri,
        blameLine: ParsedBlameLine
    ): Promise<vscode.MarkdownString> {
        const hoverMessage = new vscode.MarkdownString(undefined, true);
        const i18n = getI18n();
        const revision = Number.parseInt(blameLine.revision, 10);
        let author = blameLine.author;
        let timestamp: string | undefined;
        let message: string | undefined;

        hoverMessage.isTrusted = true;
        if (Number.isFinite(revision) && revision > 0) {
            const entry = await this.getLogEntry(repository, revision);
            if (entry) {
                author = entry.author || author;
                timestamp = formatInlineBlameHoverTimestamp(entry.date, i18n.locale);
                message = entry.message || i18n.t("noCommitMessage");
            }
        }

        hoverMessage.appendMarkdown("$(account) **");
        hoverMessage.appendText(author);
        hoverMessage.appendMarkdown("**");

        if (timestamp) {
            hoverMessage.appendMarkdown("  $(history) _");
            hoverMessage.appendText(timestamp);
            hoverMessage.appendMarkdown("_");
        } else {
            hoverMessage.appendMarkdown("  $(git-commit) `");
            hoverMessage.appendText(`r${blameLine.revision}`);
            hoverMessage.appendMarkdown("`");
        }

        hoverMessage.appendMarkdown("\n\n");
        hoverMessage.appendText(message ?? formatInlineBlameLabel(blameLine));
        hoverMessage.appendMarkdown("\n\n---\n\n");
        hoverMessage.appendMarkdown("$(git-commit) `");
        hoverMessage.appendText(`r${blameLine.revision}`);
        hoverMessage.appendMarkdown("`");
        hoverMessage.appendMarkdown(
            `  |  [$(history) ${i18n.t("inlineBlameOpenFileHistoryLink")}](${this.createCommandUri(
                "svn-tree.open-file-history",
                [documentUri.toJSON()]
            )})`
        );
        hoverMessage.appendMarkdown(
            `  |  [$(note) ${i18n.t("showBlameTextActionLabel")}](${this.createCommandUri(
                "svn-tree.show-blame",
                [documentUri.toJSON()]
            )})`
        );
        return hoverMessage;
    }

    private getLogEntry(
        repository: SvnRepository,
        revision: number
    ): Promise<SvnLogEntry | undefined> {
        const cacheKey = `${repository.info.rootPath}::${revision}`;
        const cached = this.logEntryCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const request = repository.loadLogEntryAtRevision(revision).catch(() => {
            this.logEntryCache.delete(cacheKey);
            return undefined;
        });
        this.logEntryCache.set(cacheKey, request);
        return request;
    }

    private async getDocumentCacheKey(document: vscode.TextDocument): Promise<string> {
        try {
            const stat = await vscode.workspace.fs.stat(document.uri);
            return `${document.uri.toString()}::${stat.mtime}`;
        } catch {
            return document.uri.toString();
        }
    }

    private replaceDocumentCacheEntry(cacheKey: string, lines: readonly ParsedBlameLine[]): void {
        this.blameCache.set(cacheKey, lines);
    }

    private replaceDocumentRequestEntry(
        cacheKey: string,
        request: Promise<readonly ParsedBlameLine[]>
    ): void {
        this.blameRequestCache.set(cacheKey, request);
    }

    private createCommandUri(command: string, args: readonly unknown[]): string {
        return "command:" + command + "?" + encodeURIComponent(JSON.stringify(args));
    }

    private invalidateDocumentCache(uri: vscode.Uri): void {
        const prefix = `${uri.toString()}::`;
        for (const key of this.blameCache.keys()) {
            if (key.startsWith(prefix)) {
                this.blameCache.delete(key);
            }
        }
        for (const key of this.blameRequestCache.keys()) {
            if (key.startsWith(prefix)) {
                this.blameRequestCache.delete(key);
            }
        }

        this.blameCache.delete(uri.toString());
        this.blameRequestCache.delete(uri.toString());
    }

    private clearDecorations(): void {
        for (const editor of vscode.window.visibleTextEditors) {
            editor.setDecorations(this.decorationType, []);
        }
    }
}
