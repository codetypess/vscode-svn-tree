import * as vscode from "vscode";
import type { SvnLogEntry } from "../svn/svn-types";
import { getI18n } from "../vscode-i18n";
import {
    formatInlineBlameAnnotation,
    formatInlineBlameHoverTimestamp,
    formatInlineBlameLabel,
    formatInlineBlameRelativeTime,
    type ParsedBlameLine,
} from "./svn-blame-utils";
import type { SvnRepository } from "./svn-repository";

const inlineBlameConfigurationKey = "enable-inline-blame";
const inlineBlameUpdateDelayMs = 150;
const fileBlameVisibleRevisionPrefetchLimit = 40;
const fileBlameRenderOverscanLines = 20;
const fileBlameSummaryColumnWidthCh = 36;
const fileBlameTimeColumnWidthCh = 13;
const fileBlameColumnGapText = "  ";
const fileBlameColumnSidePaddingText = " ";
const fileBlameColumnWidthCh =
    fileBlameColumnSidePaddingText.length * 2 +
    fileBlameSummaryColumnWidthCh +
    fileBlameColumnGapText.length +
    fileBlameTimeColumnWidthCh;
const fileBlameEmptyColumnText = "\u00a0";
const fileBlameColumnSeparatorColor = "rgba(128, 128, 128, 0.45)";
const fileBlamePalettes = [
    {
        lineBackgroundColor: "rgba(86, 156, 214, 0.16)",
        columnBackgroundColor: "rgba(86, 156, 214, 0.24)",
        overviewRulerColor: "rgba(86, 156, 214, 1)",
    },
] as const;
const fileBlameColumnBaseTextDecoration = `text-decoration:none;box-sizing:border-box;white-space:pre;font-variant-numeric:tabular-nums;font-family:var(--vscode-editor-font-family);font-size:var(--vscode-editor-font-size);font-variant-ligatures:none;border-right:1px solid ${fileBlameColumnSeparatorColor};`;

function createFileBlameGutterIcon(color: string): vscode.Uri {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="6" height="16" viewBox="0 0 6 16"><rect x="1" width="4" height="16" fill="${color}" /></svg>`;
    return vscode.Uri.parse(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
}

interface VisibleFileBlameBlock {
    readonly blockStartLine: number;
    readonly startLine: number;
    readonly endLine: number;
    readonly blameLine: ParsedBlameLine;
}

interface FileBlameLineRange {
    readonly startLine: number;
    readonly endLine: number;
}

export class SvnInlineBlameController implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private readonly inlineDecorationType = vscode.window.createTextEditorDecorationType({
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        after: {
            margin: "0 0 0 1rem",
            color: new vscode.ThemeColor("editorCodeLens.foreground"),
        },
    });
    private readonly fileBlameColumnDecorationType = vscode.window.createTextEditorDecorationType({
        rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen,
        before: {
            backgroundColor: new vscode.ThemeColor("editorGutter.background"),
            color: new vscode.ThemeColor("editorCodeLens.foreground"),
            height: "100%",
            margin: "0 26px -1px 0",
            width: `calc(${fileBlameColumnWidthCh}ch - 6px)`,
            textDecoration: fileBlameColumnBaseTextDecoration,
        },
    });
    private readonly fileBlameBlockDecorationTypes = fileBlamePalettes.map((palette) =>
        vscode.window.createTextEditorDecorationType({
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
            isWholeLine: true,
            backgroundColor: palette.lineBackgroundColor,
            gutterIconPath: createFileBlameGutterIcon(palette.overviewRulerColor),
            gutterIconSize: "contain",
            overviewRulerLane: vscode.OverviewRulerLane.Left,
            overviewRulerColor: palette.overviewRulerColor,
        })
    );
    private readonly blameCache = new Map<string, readonly ParsedBlameLine[]>();
    private readonly blameRequestCache = new Map<string, Promise<readonly ParsedBlameLine[]>>();
    private readonly logEntryCache = new Map<string, Promise<SvnLogEntry | undefined>>();
    private readonly logEntryValueCache = new Map<string, SvnLogEntry | undefined>();
    private readonly fileBlameDocumentKeys = new Set<string>();
    private updateTimer: NodeJS.Timeout | undefined;
    private updateRequestId = 0;
    private lastRenderedStateKey: string | undefined;

    public constructor(
        private readonly resolveRepositoryForUri: (uri: vscode.Uri) => SvnRepository | undefined
    ) {
        this.disposables.push(
            this.inlineDecorationType,
            this.fileBlameColumnDecorationType,
            ...this.fileBlameBlockDecorationTypes,
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.scheduleRefresh(0);
            }),
            vscode.window.onDidChangeTextEditorSelection((event) => {
                if (event.textEditor === vscode.window.activeTextEditor) {
                    this.scheduleRefresh();
                }
            }),
            vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
                if (event.textEditor === vscode.window.activeTextEditor) {
                    this.scheduleRefresh(0);
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
            vscode.workspace.onDidCloseTextDocument((document) => {
                this.fileBlameDocumentKeys.delete(this.getDocumentUriKey(document.uri));
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
        this.logEntryValueCache.clear();
        this.fileBlameDocumentKeys.clear();

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

    public async toggleFileBlame(uri: vscode.Uri): Promise<void> {
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document, {
            preview: true,
            preserveFocus: false,
            viewColumn: vscode.ViewColumn.Active,
        });
        const documentKey = this.getDocumentUriKey(editor.document.uri);
        const nextEnabled = !this.fileBlameDocumentKeys.has(documentKey);

        if (nextEnabled) {
            this.fileBlameDocumentKeys.add(documentKey);
        } else {
            this.fileBlameDocumentKeys.delete(documentKey);
        }

        this.lastRenderedStateKey = undefined;
        this.scheduleRefresh(0);
        const i18n = getI18n();
        void vscode.window.setStatusBarMessage(
            i18n.t(nextEnabled ? "fileBlameEnabledStatus" : "fileBlameDisabledStatus"),
            2000
        );
    }

    private isInlineBlameEnabled(): boolean {
        return vscode.workspace
            .getConfiguration("svn-tree")
            .get<boolean>(inlineBlameConfigurationKey, false);
    }

    private isFileBlameEnabled(uri: vscode.Uri): boolean {
        return this.fileBlameDocumentKeys.has(this.getDocumentUriKey(uri));
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
            void this.renderDecorations(editor);
        }, delayMs);
    }

    private async renderDecorations(editor: vscode.TextEditor): Promise<void> {
        const isInlineEnabled = this.isInlineBlameEnabled();
        const isFileBlameEnabled = this.isFileBlameEnabled(editor.document.uri);
        const stateKey = this.buildRenderedStateKey(editor, isInlineEnabled, isFileBlameEnabled);
        if (stateKey === this.lastRenderedStateKey) {
            return;
        }

        if (
            editor !== vscode.window.activeTextEditor ||
            !this.canRenderBlame(editor) ||
            (!isInlineEnabled && !isFileBlameEnabled)
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

        if (isFileBlameEnabled) {
            this.renderFileBlame(editor, repository, blameLines);
            this.lastRenderedStateKey = stateKey;
            return;
        }

        await this.renderInlineBlame(editor, repository, blameLines, requestId, stateKey);
    }

    private renderFileBlame(
        editor: vscode.TextEditor,
        repository: SvnRepository,
        blameLines: readonly ParsedBlameLine[]
    ): void {
        void this.prefetchVisibleLogEntries(repository, editor, blameLines);

        const visibleBlocks = this.buildVisibleFileBlameBlocks(editor, blameLines);
        const selectedBlameLine = blameLines[editor.selection.active.line];
        const columnDecorations: vscode.DecorationOptions[] = [];
        const blockDecorations = this.fileBlameBlockDecorationTypes.map(
            () => [] as vscode.DecorationOptions[]
        );

        for (const visibleBlock of visibleBlocks) {
            const isHighlighted =
                selectedBlameLine?.revision !== undefined &&
                visibleBlock.blameLine.revision === selectedBlameLine.revision;
            const palette = isHighlighted ? fileBlamePalettes[0] : undefined;
            const entry = this.tryGetCachedLogEntry(repository, visibleBlock.blameLine.revision);
            const hoverMessage = this.buildHoverMessage(
                editor.document.uri,
                visibleBlock.blameLine,
                entry
            );
            const columnText = this.buildFileBlameColumnText(visibleBlock.blameLine, entry);

            for (
                let lineIndex = visibleBlock.startLine;
                lineIndex <= visibleBlock.endLine;
                lineIndex++
            ) {
                const line = editor.document.lineAt(lineIndex);
                const isBlockStartLine = lineIndex === visibleBlock.blockStartLine;
                const backgroundColor =
                    palette === undefined
                        ? new vscode.ThemeColor("editorGutter.background")
                        : palette.columnBackgroundColor;
                if (isHighlighted) {
                    blockDecorations[0].push({
                        range: line.range,
                        hoverMessage,
                    });
                }
                columnDecorations.push({
                    range: new vscode.Range(lineIndex, 0, lineIndex, 0),
                    hoverMessage,
                    renderOptions: {
                        before: {
                            contentText: isBlockStartLine ? columnText : fileBlameEmptyColumnText,
                            backgroundColor,
                        },
                    },
                });
            }
        }

        this.clearInlineDecorations();
        editor.setDecorations(this.fileBlameColumnDecorationType, columnDecorations);
        this.fileBlameBlockDecorationTypes.forEach((decorationType, index) => {
            editor.setDecorations(decorationType, blockDecorations[index]);
        });
    }

    private async renderInlineBlame(
        editor: vscode.TextEditor,
        repository: SvnRepository,
        blameLines: readonly ParsedBlameLine[],
        requestId: number,
        stateKey: string
    ): Promise<void> {
        const blameLine = blameLines[editor.selection.active.line];
        if (!blameLine) {
            this.lastRenderedStateKey = stateKey;
            this.clearDecorations();
            return;
        }

        const hasCachedEntry = this.hasCachedLogEntry(repository, blameLine.revision);
        const entry = hasCachedEntry
            ? this.tryGetCachedLogEntry(repository, blameLine.revision)
            : undefined;
        if (!hasCachedEntry) {
            void this.prefetchInlineLogEntry(repository, editor, blameLine.revision);
        }

        const hoverMessage = this.buildHoverMessage(editor.document.uri, blameLine, entry);
        if (requestId !== this.updateRequestId || editor !== vscode.window.activeTextEditor) {
            return;
        }

        const activeLine = editor.document.lineAt(editor.selection.active.line);
        const i18n = getI18n();
        this.clearFileBlameDecorations();
        editor.setDecorations(this.inlineDecorationType, [
            {
                range: new vscode.Range(activeLine.range.end, activeLine.range.end),
                hoverMessage,
                renderOptions: {
                    after: {
                        contentText: formatInlineBlameAnnotation(blameLine, entry, {
                            locale: i18n.locale,
                            noCommitMessage: i18n.t("noCommitMessage"),
                        }),
                    },
                },
            },
        ]);
        this.lastRenderedStateKey = stateKey;
    }

    private canRenderBlame(editor: vscode.TextEditor): boolean {
        return this.canRenderBlameDocument(editor.document);
    }

    private canRenderBlameDocument(document: vscode.TextDocument): boolean {
        return (
            document.uri.scheme === "file" &&
            !document.isUntitled &&
            !document.isDirty &&
            document.lineCount > 0
        );
    }

    private buildRenderedStateKey(
        editor: vscode.TextEditor,
        isInlineEnabled: boolean,
        isFileBlameEnabled: boolean
    ): string {
        return [
            isFileBlameEnabled ? "file" : isInlineEnabled ? "inline" : "disabled",
            editor.document.uri.toString(),
            editor.document.version,
            editor.document.isDirty ? "dirty" : "clean",
            isFileBlameEnabled
                ? `${this.buildVisibleRangesKey(editor.visibleRanges)}::${editor.selection.active.line}`
                : String(editor.selection.active.line),
        ].join("::");
    }

    private buildVisibleRangesKey(ranges: readonly vscode.Range[]): string {
        return ranges.map((range) => `${range.start.line}:${range.end.line}`).join(",");
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

    private async prefetchVisibleLogEntries(
        repository: SvnRepository,
        editor: vscode.TextEditor,
        blameLines: readonly ParsedBlameLine[]
    ): Promise<void> {
        await this.prefetchRangeLogEntries(
            repository,
            editor.document.uri,
            blameLines,
            this.buildFileBlameRenderRanges(editor)
        );
    }

    private async prefetchRangeLogEntries(
        repository: SvnRepository,
        documentUri: vscode.Uri,
        blameLines: readonly ParsedBlameLine[],
        renderRanges: readonly FileBlameLineRange[]
    ): Promise<void> {
        const revisions = new Set<number>();
        for (const blameLine of blameLines) {
            const lineIndex = blameLine.lineNumber - 1;
            if (!this.isLineInFileBlameRanges(renderRanges, lineIndex)) {
                continue;
            }

            const revision = Number.parseInt(blameLine.revision, 10);
            if (!Number.isFinite(revision) || revision <= 0) {
                continue;
            }

            revisions.add(revision);
            if (revisions.size >= fileBlameVisibleRevisionPrefetchLimit) {
                break;
            }
        }

        const missingRevisions = [...revisions].filter(
            (revision) => !this.logEntryCache.has(this.getLogEntryCacheKey(repository, revision))
        );
        if (missingRevisions.length === 0) {
            return;
        }

        await Promise.all(
            missingRevisions.map((revision) => this.getLogEntry(repository, revision))
        );

        if (
            vscode.window.activeTextEditor?.document.uri.toString() === documentUri.toString() &&
            this.isFileBlameEnabled(documentUri)
        ) {
            this.lastRenderedStateKey = undefined;
            this.scheduleRefresh(0);
        }
    }

    private isLineInFileBlameRanges(
        ranges: readonly FileBlameLineRange[],
        lineIndex: number
    ): boolean {
        return ranges.some((range) => lineIndex >= range.startLine && lineIndex <= range.endLine);
    }

    private buildVisibleFileBlameBlocks(
        editor: vscode.TextEditor,
        blameLines: readonly ParsedBlameLine[]
    ): readonly VisibleFileBlameBlock[] {
        const visibleBlocks: VisibleFileBlameBlock[] = [];
        const renderRanges = this.buildFileBlameRenderRanges(editor);

        let blockStartLine = -1;
        let currentBlameLine: ParsedBlameLine | undefined;

        for (let lineIndex = 0; lineIndex < editor.document.lineCount; lineIndex++) {
            const blameLine = blameLines[lineIndex];
            if (!blameLine) {
                if (currentBlameLine && blockStartLine >= 0) {
                    this.pushVisibleFileBlameBlockSegments(
                        visibleBlocks,
                        renderRanges,
                        blockStartLine,
                        lineIndex - 1,
                        currentBlameLine
                    );
                }

                currentBlameLine = undefined;
                blockStartLine = -1;
                continue;
            }

            if (!currentBlameLine) {
                currentBlameLine = blameLine;
                blockStartLine = lineIndex;
                continue;
            }

            if (blameLine.revision === currentBlameLine.revision) {
                continue;
            }

            this.pushVisibleFileBlameBlockSegments(
                visibleBlocks,
                renderRanges,
                blockStartLine,
                lineIndex - 1,
                currentBlameLine
            );
            currentBlameLine = blameLine;
            blockStartLine = lineIndex;
        }

        if (currentBlameLine && blockStartLine >= 0) {
            this.pushVisibleFileBlameBlockSegments(
                visibleBlocks,
                renderRanges,
                blockStartLine,
                editor.document.lineCount - 1,
                currentBlameLine
            );
        }

        return visibleBlocks;
    }

    private pushVisibleFileBlameBlockSegments(
        visibleBlocks: VisibleFileBlameBlock[],
        visibleRanges: readonly FileBlameLineRange[],
        blockStartLine: number,
        blockEndLine: number,
        blameLine: ParsedBlameLine
    ): void {
        for (const visibleRange of visibleRanges) {
            const visibleStartLine = Math.max(blockStartLine, visibleRange.startLine);
            const visibleEndLine = Math.min(blockEndLine, visibleRange.endLine);
            if (visibleStartLine > visibleEndLine) {
                continue;
            }

            visibleBlocks.push({
                blockStartLine,
                startLine: visibleStartLine,
                endLine: visibleEndLine,
                blameLine,
            });
        }
    }

    private buildFileBlameRenderRanges(editor: vscode.TextEditor): readonly FileBlameLineRange[] {
        const ranges = editor.visibleRanges
            .map((range) => this.expandFileBlameRange(editor.document, range))
            .filter((range) => range.startLine <= range.endLine)
            .sort((left, right) => left.startLine - right.startLine);

        return ranges.reduce<FileBlameLineRange[]>((mergedRanges, range) => {
            const lastRange = mergedRanges.at(-1);
            if (!lastRange || range.startLine > lastRange.endLine + 1) {
                mergedRanges.push(range);
                return mergedRanges;
            }

            mergedRanges[mergedRanges.length - 1] = {
                startLine: lastRange.startLine,
                endLine: Math.max(lastRange.endLine, range.endLine),
            };
            return mergedRanges;
        }, []);
    }

    private expandFileBlameRange(
        document: vscode.TextDocument,
        range: vscode.Range
    ): FileBlameLineRange {
        return {
            startLine: Math.max(0, range.start.line - fileBlameRenderOverscanLines),
            endLine: Math.min(
                document.lineCount - 1,
                range.end.line + fileBlameRenderOverscanLines
            ),
        };
    }

    private buildHoverMessage(
        documentUri: vscode.Uri,
        blameLine: ParsedBlameLine,
        entry?: SvnLogEntry
    ): vscode.MarkdownString {
        const hoverMessage = new vscode.MarkdownString(undefined, true);
        const i18n = getI18n();
        const author = entry?.author || blameLine.author;
        const timestamp = formatInlineBlameHoverTimestamp(entry?.date, i18n.locale);
        const message = entry?.message || (entry ? i18n.t("noCommitMessage") : undefined);

        hoverMessage.isTrusted = true;
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
            `  |  [$(note) ${i18n.t("showBlameFileActionLabel")}](${this.createCommandUri(
                "svn-tree.show-blame",
                [documentUri.toJSON()]
            )})`
        );
        return hoverMessage;
    }

    private buildFileBlameColumnText(
        blameLine: ParsedBlameLine,
        entry: SvnLogEntry | undefined
    ): string {
        const i18n = getI18n();
        const relative =
            formatInlineBlameRelativeTime(entry?.date, i18n.locale) ??
            formatInlineBlameLabel(blameLine);
        const summaryText = this.formatFileBlameColumnPart(
            this.getFileBlameSummary(blameLine, entry, i18n),
            fileBlameSummaryColumnWidthCh,
            "end"
        );
        const relativeText = this.formatFileBlameColumnPart(
            relative,
            fileBlameTimeColumnWidthCh,
            "start"
        );

        return `${fileBlameColumnSidePaddingText}${summaryText}${fileBlameColumnGapText}${relativeText}${fileBlameColumnSidePaddingText}`;
    }

    private getFileBlameSummary(
        blameLine: ParsedBlameLine,
        entry: SvnLogEntry | undefined,
        i18n: ReturnType<typeof getI18n>
    ): string {
        if (!entry) {
            return formatInlineBlameLabel(blameLine);
        }

        const subject = entry.message.split(/\r?\n/u, 1)[0]?.trim();
        return subject || i18n.t("noCommitMessage");
    }

    private formatFileBlameColumnPart(
        value: string,
        maxWidth: number,
        align: "start" | "end"
    ): string {
        const truncatedValue = this.truncateFileBlameColumnPart(value, maxWidth);
        const padding = " ".repeat(
            Math.max(0, maxWidth - this.getFileBlameDisplayWidth(truncatedValue))
        );

        return align === "start" ? `${padding}${truncatedValue}` : `${truncatedValue}${padding}`;
    }

    private truncateFileBlameColumnPart(value: string, maxWidth: number): string {
        const normalizedValue = value.replace(/\s+/g, " ").trim();
        if (this.getFileBlameDisplayWidth(normalizedValue) <= maxWidth) {
            return normalizedValue;
        }

        if (maxWidth <= 3) {
            return this.truncateFileBlameTextByDisplayWidth(normalizedValue, maxWidth);
        }

        return `${this.truncateFileBlameTextByDisplayWidth(normalizedValue, maxWidth - 3)}...`;
    }

    private truncateFileBlameTextByDisplayWidth(value: string, maxWidth: number): string {
        let width = 0;
        let truncatedValue = "";
        for (const character of value) {
            const characterWidth = this.getFileBlameCharacterWidth(character);
            if (width + characterWidth > maxWidth) {
                break;
            }

            width += characterWidth;
            truncatedValue += character;
        }

        return truncatedValue;
    }

    private getFileBlameDisplayWidth(value: string): number {
        let width = 0;
        for (const character of value) {
            width += this.getFileBlameCharacterWidth(character);
        }

        return width;
    }

    private getFileBlameCharacterWidth(character: string): number {
        const codePoint = character.codePointAt(0) ?? 0;
        if (codePoint === 0 || codePoint < 32 || (codePoint >= 0x7f && codePoint < 0xa0)) {
            return 0;
        }

        return this.isFileBlameWideCharacter(codePoint) ? 2 : 1;
    }

    private isFileBlameWideCharacter(codePoint: number): boolean {
        return (
            codePoint >= 0x1100 &&
            (codePoint <= 0x115f ||
                codePoint === 0x2329 ||
                codePoint === 0x232a ||
                (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
                (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
                (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
                (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
                (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
                (codePoint >= 0xff00 && codePoint <= 0xff60) ||
                (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
                (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
                (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
                (codePoint >= 0x20000 && codePoint <= 0x3fffd))
        );
    }

    private tryGetCachedLogEntry(
        repository: SvnRepository,
        revisionValue: string
    ): SvnLogEntry | undefined {
        const revision = Number.parseInt(revisionValue, 10);
        if (!Number.isFinite(revision) || revision <= 0) {
            return undefined;
        }

        return this.logEntryValueCache.get(this.getLogEntryCacheKey(repository, revision));
    }

    private hasCachedLogEntry(repository: SvnRepository, revisionValue: string): boolean {
        const revision = Number.parseInt(revisionValue, 10);
        if (!Number.isFinite(revision) || revision <= 0) {
            return true;
        }

        return this.logEntryValueCache.has(this.getLogEntryCacheKey(repository, revision));
    }

    private async prefetchInlineLogEntry(
        repository: SvnRepository,
        editor: vscode.TextEditor,
        revisionValue: string
    ): Promise<void> {
        const revision = Number.parseInt(revisionValue, 10);
        if (!Number.isFinite(revision) || revision <= 0) {
            return;
        }

        const cacheKey = this.getLogEntryCacheKey(repository, revision);
        await this.getLogEntry(repository, revision);
        if (!this.logEntryValueCache.has(cacheKey)) {
            return;
        }

        if (editor === vscode.window.activeTextEditor && this.isInlineBlameEnabled()) {
            this.lastRenderedStateKey = undefined;
            this.scheduleRefresh(0);
        }
    }

    private getLogEntry(
        repository: SvnRepository,
        revision: number
    ): Promise<SvnLogEntry | undefined> {
        const cacheKey = this.getLogEntryCacheKey(repository, revision);
        const cached = this.logEntryCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const request = repository
            .loadLogEntryAtRevision(revision)
            .then((entry) => {
                this.logEntryValueCache.set(cacheKey, entry);
                return entry;
            })
            .catch(() => {
                this.logEntryCache.delete(cacheKey);
                this.logEntryValueCache.delete(cacheKey);
                return undefined;
            });
        this.logEntryCache.set(cacheKey, request);
        return request;
    }

    private getLogEntryCacheKey(repository: SvnRepository, revision: number): string {
        return `${repository.info.rootPath}::${revision}`;
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

    private getDocumentUriKey(uri: vscode.Uri): string {
        return uri.toString();
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

    private clearInlineDecorations(): void {
        for (const editor of vscode.window.visibleTextEditors) {
            editor.setDecorations(this.inlineDecorationType, []);
        }
    }

    private clearFileBlameDecorations(): void {
        for (const editor of vscode.window.visibleTextEditors) {
            editor.setDecorations(this.fileBlameColumnDecorationType, []);
            this.fileBlameBlockDecorationTypes.forEach((decorationType) => {
                editor.setDecorations(decorationType, []);
            });
        }
    }

    private clearDecorations(): void {
        this.clearInlineDecorations();
        this.clearFileBlameDecorations();
    }
}
