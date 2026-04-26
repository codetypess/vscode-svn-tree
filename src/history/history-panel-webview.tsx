import React from "react";
import { createRoot } from "react-dom/client";
import {
    createI18n,
    type FileManagerPlatform,
    type RuntimeI18n,
    type SupportedLocale,
} from "../i18n";

type HistoryViewStyle = "summary" | "detail";
type ContextActionType =
    | "update-to-revision"
    | "checkout-revision"
    | "export-revision"
    | "compare-with-working-copy"
    | "compare-with-previous-revision"
    | "revert-to-revision"
    | "revert-changes-from-revision"
    | "copy-revision"
    | "copy-message"
    | "copy-changed-paths"
    | "create-branch"
    | "create-tag";

type FileContextActionType =
    | "open-file-diff"
    | "export-file"
    | "compare-file-with-working-copy"
    | "compare-file-with-previous-revision"
    | "show-file-history"
    | "reveal-in-file-manager"
    | "copy-file-path";

interface HistoryBootstrap {
    repositoryLabel: string;
    rootPath: string;
    locale: SupportedLocale;
    platform: FileManagerPlatform;
}

interface HistoryChange {
    path: string;
    action: string;
    kind?: string;
    copyfromPath?: string;
    copyfromRevision?: number | string;
    textMods?: string;
    propMods?: string;
}

interface HistoryEntry {
    revision: number;
    author: string;
    date: string;
    message: string;
    changes: HistoryChange[];
    incoming?: boolean;
}

interface HistoryDataPayload {
    append: boolean;
    hasMore: boolean;
    currentRevision?: number;
    repositoryLabel: string;
    rootPath: string;
    entries: HistoryEntry[];
}

interface HistoryErrorPayload {
    append: boolean;
    message: string;
}

interface HistoryConfigPayload {
    locale: SupportedLocale;
}

function getDisplayChangePath(changePath: string): string {
    return String(changePath || "").replace(/^\/+/, "");
}

type HistoryResponseMessage =
    | {
          type: "history-data";
          payload: HistoryDataPayload;
      }
    | {
          type: "history-error";
          payload: HistoryErrorPayload;
      }
    | {
          type: "history-config";
          payload: HistoryConfigPayload;
      };

type HistoryRequestMessage =
    | {
          type: "ready";
      }
    | {
          type: "refresh";
      }
    | {
          type: "load-more";
          beforeRevision: number;
      }
    | {
          type:
              | "update-to-revision"
              | "checkout-revision"
              | "export-revision"
              | "revert-to-revision"
              | "revert-changes-from-revision"
              | "copy-revision"
              | "create-branch"
              | "create-tag";
          revision: number;
      }
    | {
          type:
              | "open-diff"
              | "export-file"
              | "compare-file-with-working-copy"
              | "compare-file-with-previous-revision";
          revision: number;
          path: string;
          action: string;
      }
    | {
          type: "show-file-history" | "reveal-in-file-manager";
          path: string;
      }
    | {
          type: "copy-file-path";
          revision: number;
          path: string;
      }
    | {
          type: "compare-with-working-copy" | "compare-with-previous-revision";
          revision: number;
          changes: HistoryChange[];
      }
    | {
          type: "copy-message";
          revision: number;
          message: string;
      }
    | {
          type: "copy-changed-paths";
          revision: number;
          changedPaths: string[];
      };

interface RevisionContextMenuState {
    kind: "revision";
    revision: number;
    x: number;
    y: number;
}

interface FileContextMenuState {
    kind: "file";
    revision: number;
    x: number;
    y: number;
    change: HistoryChange;
}

type ContextMenuState = RevisionContextMenuState | FileContextMenuState;

type CollapsedDirectories = Record<string, boolean>;

interface HistoryState {
    entries: HistoryEntry[];
    hasMore: boolean;
    isLoading: boolean;
    currentRevision?: number;
    loadMoreError?: string;
    expandedRevision?: number;
    collapsedDirectories: CollapsedDirectories;
    contextMenu?: ContextMenuState;
    query: string;
    repositoryLabel: string;
    rootPath: string;
    locale: SupportedLocale;
    platform: FileManagerPlatform;
}

interface ChangeTreeDirectory {
    type: "dir";
    name: string;
    fullPath: string;
    children: ChangeTreeNodeModel[];
}

interface ChangeTreeFile {
    type: "file";
    name: string;
    fullPath: string;
    change: HistoryChange;
}

type ChangeTreeNodeModel = ChangeTreeDirectory | ChangeTreeFile;

interface ChangeTreeNodeProps {
    i18n: RuntimeI18n;
    node: ChangeTreeNodeModel;
    depth: number;
    revision: number;
    rootPath: string;
    searchQuery: string;
    collapsedDirectories: CollapsedDirectories;
    onToggleDirectory: (revision: number, fullPath: string) => void;
    onOpenFileContextMenu: (
        revision: number,
        change: HistoryChange,
        clientX: number,
        clientY: number
    ) => void;
}

interface CommitDetailsProps {
    i18n: RuntimeI18n;
    entry: HistoryEntry;
    rootPath: string;
    searchQuery: string;
    collapsedDirectories: CollapsedDirectories;
    onToggleDirectory: (revision: number, fullPath: string) => void;
    onOpenFileContextMenu: (
        revision: number,
        change: HistoryChange,
        clientX: number,
        clientY: number
    ) => void;
}

interface ContextMenuProps {
    i18n: RuntimeI18n;
    platform: FileManagerPlatform;
    menu?: ContextMenuState;
    entry?: HistoryEntry;
    onClose: () => void;
    onAction: (type: ContextActionType, entry: HistoryEntry) => void;
    onFileAction: (type: FileContextActionType, revision: number, change: HistoryChange) => void;
}

interface MenuPosition {
    x: number;
    y: number;
}

interface VsCodeApi {
    postMessage(message: HistoryRequestMessage): void;
    getState(): unknown;
    setState(state: unknown): void;
}

declare global {
    function acquireVsCodeApi(): VsCodeApi;

    interface Window {
        __SVN_HISTORY_BOOTSTRAP__?: HistoryBootstrap;
    }
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isHistoryDataMessage(data: unknown): data is Extract<HistoryResponseMessage, { type: "history-data" }> {
    if (!isObject(data) || data.type !== "history-data" || !isObject(data.payload)) {
        return false;
    }

    return Array.isArray(data.payload.entries);
}

function isHistoryErrorMessage(
    data: unknown
): data is Extract<HistoryResponseMessage, { type: "history-error" }> {
    if (!isObject(data) || data.type !== "history-error" || !isObject(data.payload)) {
        return false;
    }

    return typeof data.payload.message === "string";
}

function isHistoryConfigMessage(
    data: unknown
): data is Extract<HistoryResponseMessage, { type: "history-config" }> {
    return (
        isObject(data) &&
        data.type === "history-config" &&
        isObject(data.payload) &&
        (data.payload.locale === "en" || data.payload.locale === "zh-CN")
    );
}

(function () {
    const vscode = acquireVsCodeApi();
    const bootstrap: HistoryBootstrap = window.__SVN_HISTORY_BOOTSTRAP__ ?? {
        repositoryLabel: "",
        rootPath: "",
        locale: "en",
        platform: "unknown",
    };
    const h = React.createElement;

    function createCommandUri(command: string, args: readonly unknown[]): string {
        return "command:" + command + "?" + encodeURIComponent(JSON.stringify(args));
    }

    function createHistoryDiffCommandUri(
        rootPath: string,
        revision: number,
        path: string,
        action: string
    ): string {
        return createCommandUri("svn-tree.open-history-diff", [
            {
                rootPath,
                revision,
                path,
                action,
            },
        ]);
    }

    function formatDate(
        value: string | undefined,
        i18n: RuntimeI18n,
        style: HistoryViewStyle = "summary"
    ): string {
        if (!value) {
            return i18n.t("unknownDate");
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }

        return new Intl.DateTimeFormat(i18n.locale, {
            dateStyle: style === "detail" ? "full" : "medium",
            timeStyle: "short",
        }).format(date);
    }

    function summarizeMessage(value: string | undefined, i18n: RuntimeI18n): string {
        const normalized = String(value || "").trim();
        if (!normalized) {
            return i18n.t("noCommitMessage");
        }

        return normalized.split(/\r?\n/, 1)[0];
    }

    function formatPathCount(count: number, i18n: RuntimeI18n): string {
        return i18n.formatChangedPathCount(count);
    }

    function isIncomingEntry(entry: HistoryEntry | undefined): boolean {
        return entry?.incoming === true;
    }

    function isCurrentRevisionEntry(
        entry: HistoryEntry,
        currentRevision: number | undefined
    ): boolean {
        return typeof currentRevision === "number" && entry.revision === currentRevision;
    }

    function renderHighlightedText(value: string | number | undefined, query: string): React.ReactNode {
        const text = String(value ?? "");
        const trimmedQuery = String(query ?? "").trim();

        if (!trimmedQuery) {
            return text;
        }

        const normalizedText = text.toLowerCase();
        const normalizedQuery = trimmedQuery.toLowerCase();

        if (!normalizedText.includes(normalizedQuery)) {
            return text;
        }

        const parts: React.ReactNode[] = [];
        let startIndex = 0;
        let matchIndex = normalizedText.indexOf(normalizedQuery, startIndex);

        while (matchIndex !== -1) {
            if (matchIndex > startIndex) {
                parts.push(text.slice(startIndex, matchIndex));
            }

            const matchedText = text.slice(matchIndex, matchIndex + trimmedQuery.length);
            parts.push(
                h(
                    "mark",
                    {
                        className: "search-highlight",
                        key: `${matchIndex}:${matchedText}`,
                    },
                    matchedText
                )
            );

            startIndex = matchIndex + trimmedQuery.length;
            matchIndex = normalizedText.indexOf(normalizedQuery, startIndex);
        }

        if (startIndex < text.length) {
            parts.push(text.slice(startIndex));
        }

        return parts;
    }

    function actionToIconClass(action: string): string {
        if (action === "A") {
            return "codicon-diff-added";
        }

        if (action === "D") {
            return "codicon-diff-removed";
        }

        if (action === "R") {
            return "codicon-diff-renamed";
        }

        return "codicon-diff-modified";
    }

    function directoryKey(revision: number, fullPath: string): string {
        return String(revision) + ":" + String(fullPath);
    }

    function buildChangeTree(changes: HistoryChange[]): ChangeTreeNodeModel[] {
        const root: ChangeTreeNodeModel[] = [];

        function getOrCreateDirectory(
            nodes: ChangeTreeNodeModel[],
            name: string,
            fullPath: string
        ): ChangeTreeDirectory {
            let match = nodes.find(
                (node): node is ChangeTreeDirectory => node.type === "dir" && node.name === name
            );
            if (!match) {
                match = {
                    type: "dir",
                    name,
                    fullPath,
                    children: [],
                };
                nodes.push(match);
            }

            return match;
        }

        for (const change of changes) {
            const segments = String(change.path || "")
                .split("/")
                .filter(Boolean);
            let currentNodes = root;
            let currentPath = "";

            for (let index = 0; index < segments.length; index += 1) {
                const segment = segments[index];
                currentPath += "/" + segment;
                const isLeaf = index === segments.length - 1;

                if (isLeaf) {
                    currentNodes.push({
                        type: "file",
                        name: segment,
                        fullPath: change.path,
                        change,
                    });
                    continue;
                }

                const directory = getOrCreateDirectory(currentNodes, segment, currentPath);
                currentNodes = directory.children;
            }
        }

        function sortNodes(nodes: ChangeTreeNodeModel[]): void {
            nodes.sort((left, right) => {
                if (left.type !== right.type) {
                    return left.type === "dir" ? -1 : 1;
                }

                return left.name.localeCompare(right.name);
            });

            for (const node of nodes) {
                if (node.type === "dir") {
                    sortNodes(node.children);
                }
            }
        }

        function compressDirectories(nodes: ChangeTreeNodeModel[]): ChangeTreeNodeModel[] {
            return nodes.map((node) => {
                if (node.type !== "dir") {
                    return node;
                }

                let name = node.name;
                let fullPath = node.fullPath;
                let current = node;

                while (current.children.length === 1 && current.children[0].type === "dir") {
                    current = current.children[0];
                    name += " / " + current.name;
                    fullPath = current.fullPath;
                }

                return {
                    type: "dir",
                    name,
                    fullPath,
                    children: compressDirectories(current.children),
                };
            });
        }

        sortNodes(root);
        return compressDirectories(root);
    }

    const contextMenuViewportMarginPx = 8;
    const contextMenuMaxWidthPx = 360;
    const contextMenuEstimatedHeightPx = 196;

    function getMenuPosition(clientX: number, clientY: number): MenuPosition {
        const estimatedMenuWidth = Math.min(
            contextMenuMaxWidthPx,
            Math.max(0, window.innerWidth - contextMenuViewportMarginPx * 2)
        );
        return {
            x: Math.max(
                contextMenuViewportMarginPx,
                Math.min(
                    clientX,
                    window.innerWidth - contextMenuViewportMarginPx - estimatedMenuWidth
                )
            ),
            y: Math.max(
                contextMenuViewportMarginPx,
                Math.min(clientY, window.innerHeight - contextMenuEstimatedHeightPx)
            ),
        };
    }

    function ChangeTreeNode(props: ChangeTreeNodeProps): React.ReactElement {
        const node = props.node;
        const depthStyle = { "--depth": props.depth } as React.CSSProperties & {
            "--depth": number;
        };

        if (node.type === "dir") {
            const key = directoryKey(props.revision, node.fullPath);
            const collapsed = props.collapsedDirectories[key] === true;

            return h(
                React.Fragment,
                { key: "dir:" + props.revision + ":" + node.fullPath },
                h(
                    "div",
                    {
                        className: "tree-row tree-dir",
                        style: depthStyle,
                        onClick: function () {
                            props.onToggleDirectory(props.revision, node.fullPath);
                        },
                    },
                    h(
                        "div",
                        { className: "tree-main" },
                        h("span", {
                            className:
                                "tree-chevron codicon " +
                                (collapsed ? "codicon-chevron-right" : "codicon-chevron-down"),
                        }),
                        h("span", {
                            className:
                                "tree-icon codicon " +
                                (collapsed ? "codicon-folder" : "codicon-folder-opened"),
                        }),
                        h(
                            "span",
                            { className: "tree-label" },
                            renderHighlightedText(node.name, props.searchQuery)
                        )
                    ),
                    h("div")
                ),
                collapsed
                    ? null
                    : node.children.map(function (childNode) {
                          return h(ChangeTreeNode, {
                              key:
                                  (childNode.type === "dir" ? "dir:" : "file:") +
                                  props.revision +
                                  ":" +
                                  childNode.fullPath,
                              i18n: props.i18n,
                              node: childNode,
                              depth: props.depth + 1,
                              revision: props.revision,
                              rootPath: props.rootPath,
                              searchQuery: props.searchQuery,
                              collapsedDirectories: props.collapsedDirectories,
                              onToggleDirectory: props.onToggleDirectory,
                              onOpenFileContextMenu: props.onOpenFileContextMenu,
                          });
                      })
            );
        }

        const change = node.change;
        const action = String(change.action).toUpperCase();
        const noteSegments: string[] = [];

        if (change.kind) {
            noteSegments.push(props.i18n.formatNodeKind(change.kind));
        }

        if (change.copyfromPath) {
            noteSegments.push(
                change.copyfromRevision
                    ? props.i18n.t("historyCopiedFromRevision", {
                          path: change.copyfromPath,
                          revision: change.copyfromRevision,
                      })
                    : props.i18n.t("historyCopiedFrom", {
                          path: change.copyfromPath,
                      })
            );
        }

        if (change.textMods && change.propMods) {
            noteSegments.push(
                props.i18n.t("historyTextAndProps", {
                    text: change.textMods,
                    props: change.propMods,
                })
            );
        }

        return h(
            "a",
            {
                className: "tree-row change-row",
                style: depthStyle,
                title: props.i18n.t("openDiff"),
                href: createHistoryDiffCommandUri(
                    props.rootPath,
                    props.revision,
                    change.path,
                    change.action
                ),
                onContextMenu: function (event: React.MouseEvent<HTMLAnchorElement>) {
                    event.preventDefault();
                    props.onOpenFileContextMenu(
                        props.revision,
                        change,
                        event.clientX,
                        event.clientY
                    );
                },
            },
            h(
                "span",
                { className: "tree-main change-body" },
                h("span", {
                    className:
                        "tree-icon change-icon codicon " +
                        actionToIconClass(action) +
                        " action-" +
                        String(change.action).toLowerCase(),
                    title: props.i18n.formatHistoryAction(action),
                }),
                h(
                    "span",
                    { className: "tree-label change-path" },
                    renderHighlightedText(node.name, props.searchQuery)
                )
            ),
            h(
                "span",
                { className: "tree-actions" },
                h(
                    "span",
                    { className: "change-note" },
                    renderHighlightedText(noteSegments.join(" • "), props.searchQuery)
                )
            )
        );
    }

    function CommitDetails(props: CommitDetailsProps): React.ReactElement {
        const entry = props.entry;
        const treeMarkup =
            entry.changes.length === 0
                ? h(
                      "div",
                      { className: "empty-state" },
                      props.i18n.t("noChangedPathsReported")
                  )
                : buildChangeTree(entry.changes).map(function (node) {
                      return h(ChangeTreeNode, {
                          key:
                              (node.type === "dir" ? "dir:" : "file:") +
                              entry.revision +
                              ":" +
                              node.fullPath,
                          i18n: props.i18n,
                          node: node,
                          depth: 0,
                          revision: entry.revision,
                          rootPath: props.rootPath,
                          searchQuery: props.searchQuery,
                          collapsedDirectories: props.collapsedDirectories,
                          onToggleDirectory: props.onToggleDirectory,
                          onOpenFileContextMenu: props.onOpenFileContextMenu,
                      });
                  });

        return h(
            "div",
            { className: "details-row" },
            h("div", { className: "details-rail" }),
            h(
                "div",
                { className: "details-panel" },
                h(
                    "div",
                    { className: "details-summary-panel" },
                    h(
                        "div",
                        { className: "details-title-row" },
                        h(
                            "div",
                            { className: "details-title" },
                            renderHighlightedText(
                                summarizeMessage(entry.message, props.i18n),
                                props.searchQuery
                            )
                        ),
                        isIncomingEntry(entry)
                            ? h(
                                  "span",
                                  { className: "summary-badge incoming" },
                                  props.i18n.t("incomingChange")
                              )
                            : null
                    ),
                    h(
                        "div",
                        { className: "details-meta" },
                        h(
                            "div",
                            null,
                            h("strong", null, props.i18n.t("revisionLabel") + ":"),
                            " r",
                            renderHighlightedText(entry.revision, props.searchQuery)
                        ),
                        h(
                            "div",
                            null,
                            h("strong", null, props.i18n.t("authorDetailLabel") + ":"),
                            " ",
                            renderHighlightedText(entry.author, props.searchQuery)
                        ),
                        h(
                            "div",
                            null,
                            h("strong", null, props.i18n.t("dateLabel") + ":"),
                            " ",
                            renderHighlightedText(
                                formatDate(entry.date, props.i18n, "detail"),
                                props.searchQuery
                            )
                        ),
                        h(
                            "div",
                            null,
                            h("strong", null, props.i18n.t("filesLabel") + ":"),
                            " ",
                            entry.changes.length
                        )
                    )
                ),
                h(
                    "div",
                    { className: "details-files-panel" },
                    h("div", { className: "section-title" }, props.i18n.t("changedFilesLabel")),
                    h("div", { className: "changes" }, treeMarkup)
                )
            )
        );
    }

    function ContextMenu(props: ContextMenuProps): React.ReactElement | null {
        if (!props.menu || !props.entry) {
            return null;
        }

        const entry = props.entry;
        if (props.menu.kind === "file") {
            const change = props.menu.change;
            const displayPath = getDisplayChangePath(change.path);

            return h(
                "div",
                { className: "context-menu-root" },
                h("div", {
                    className: "context-menu-backdrop",
                    onClick: props.onClose,
                }),
                h(
                    "div",
                    {
                        className: "context-menu",
                        style: { left: props.menu.x + "px", top: props.menu.y + "px" },
                    },
                    h(
                        "div",
                        { className: "context-menu-header" },
                        h("div", { className: "context-menu-title", title: displayPath }, displayPath),
                        h(
                            "div",
                            { className: "context-menu-subtitle" },
                            "r",
                            entry.revision,
                            isIncomingEntry(entry)
                                ? " • " + props.i18n.t("incomingChange")
                                : "",
                            " • ",
                            summarizeMessage(entry.message, props.i18n)
                        )
                    ),
                    h(
                        "div",
                        { className: "context-menu-actions" },
                        h(
                            "button",
                            {
                                className: "context-menu-item",
                                type: "button",
                                onClick: function () {
                                    props.onFileAction("open-file-diff", entry.revision, change);
                                },
                            },
                            h("span", { className: "codicon codicon-diff", "aria-hidden": "true" }),
                            h("span", { className: "context-menu-label" }, props.i18n.t("openDiff"))
                        ),
                        h(
                            "button",
                            {
                                className: "context-menu-item",
                                type: "button",
                                onClick: function () {
                                    props.onFileAction(
                                        "compare-file-with-working-copy",
                                        entry.revision,
                                        change
                                    );
                                },
                            },
                            h("span", { className: "codicon codicon-diff", "aria-hidden": "true" }),
                            h(
                                "span",
                                { className: "context-menu-label" },
                                props.i18n.t("compareWithWorkingCopy")
                            )
                        ),
                        h(
                            "button",
                            {
                                className: "context-menu-item",
                                type: "button",
                                onClick: function () {
                                    props.onFileAction(
                                        "compare-file-with-previous-revision",
                                        entry.revision,
                                        change
                                    );
                                },
                            },
                            h("span", {
                                className: "codicon codicon-git-compare",
                                "aria-hidden": "true",
                            }),
                            h(
                                "span",
                                { className: "context-menu-label" },
                                props.i18n.t("compareWithPreviousRevision")
                            )
                        ),
                        h(
                            "button",
                            {
                                className: "context-menu-item",
                                type: "button",
                                onClick: function () {
                                    props.onFileAction("show-file-history", entry.revision, change);
                                },
                            },
                            h("span", {
                                className: "codicon codicon-history",
                                "aria-hidden": "true",
                            }),
                            h(
                                "span",
                                { className: "context-menu-label" },
                                props.i18n.t("showFileHistory")
                            )
                        ),
                        h(
                            "button",
                            {
                                className: "context-menu-item",
                                type: "button",
                                onClick: function () {
                                    props.onFileAction("export-file", entry.revision, change);
                                },
                            },
                            h("span", {
                                className: "codicon codicon-save",
                                "aria-hidden": "true",
                            }),
                            h(
                                "span",
                                { className: "context-menu-label" },
                                props.i18n.t("exportThisFile")
                            )
                        ),
                        h(
                            "button",
                            {
                                className: "context-menu-item",
                                type: "button",
                                onClick: function () {
                                    props.onFileAction(
                                        "reveal-in-file-manager",
                                        entry.revision,
                                        change
                                    );
                                },
                            },
                            h("span", {
                                className: "codicon codicon-folder-opened",
                                "aria-hidden": "true",
                            }),
                            h(
                                "span",
                                { className: "context-menu-label" },
                                props.i18n.formatRevealInFileManager(props.platform)
                            )
                        ),
                        h("div", { className: "context-menu-separator", "aria-hidden": "true" }),
                        h(
                            "button",
                            {
                                className: "context-menu-item",
                                type: "button",
                                onClick: function () {
                                    props.onFileAction("copy-file-path", entry.revision, change);
                                },
                            },
                            h("span", { className: "codicon codicon-copy", "aria-hidden": "true" }),
                            h("span", { className: "context-menu-label" }, props.i18n.t("copyFilePath"))
                        )
                    )
                )
            );
        }

        return h(
            "div",
            { className: "context-menu-root" },
            h("div", {
                className: "context-menu-backdrop",
                onClick: props.onClose,
            }),
            h(
                "div",
                {
                    className: "context-menu",
                    style: { left: props.menu.x + "px", top: props.menu.y + "px" },
                },
                h(
                    "div",
                    { className: "context-menu-header" },
                    h("div", { className: "context-menu-title" }, "r" + entry.revision),
                    h(
                        "div",
                        { className: "context-menu-subtitle" },
                        isIncomingEntry(entry)
                            ? props.i18n.t("incomingChange") +
                                  " • " +
                                  summarizeMessage(entry.message, props.i18n)
                            : summarizeMessage(entry.message, props.i18n)
                    )
                ),
                h(
                    "div",
                    { className: "context-menu-actions" },
                    h(
                        "button",
                        {
                            className: "context-menu-item",
                            type: "button",
                            onClick: function () {
                                props.onAction("update-to-revision", entry);
                            },
                        },
                        h("span", {
                            className: "codicon codicon-cloud-download",
                            "aria-hidden": "true",
                        }),
                        h(
                            "span",
                            { className: "context-menu-label" },
                            props.i18n.t("updateWorkingCopyToThisRevision")
                        )
                    ),
                    h(
                        "button",
                        {
                            className: "context-menu-item",
                            type: "button",
                            onClick: function () {
                                props.onAction("checkout-revision", entry);
                            },
                        },
                        h("span", { className: "codicon codicon-repo-clone", "aria-hidden": "true" }),
                        h(
                            "span",
                            { className: "context-menu-label" },
                            props.i18n.t("checkoutToThisRevision")
                        )
                    ),
                    h(
                        "button",
                        {
                            className: "context-menu-item",
                            type: "button",
                            onClick: function () {
                                props.onAction("export-revision", entry);
                            },
                        },
                        h("span", {
                            className: "codicon codicon-folder-opened",
                            "aria-hidden": "true",
                        }),
                        h("span", { className: "context-menu-label" }, props.i18n.t("exportThisRevision"))
                    ),
                    h(
                        "button",
                        {
                            className: "context-menu-item",
                            type: "button",
                            onClick: function () {
                                props.onAction("compare-with-working-copy", entry);
                            },
                        },
                        h("span", { className: "codicon codicon-diff", "aria-hidden": "true" }),
                        h(
                            "span",
                            { className: "context-menu-label" },
                            props.i18n.t("compareWithWorkingCopy")
                        )
                    ),
                    h(
                        "button",
                        {
                            className: "context-menu-item",
                            type: "button",
                            onClick: function () {
                                props.onAction("compare-with-previous-revision", entry);
                            },
                        },
                        h("span", { className: "codicon codicon-git-compare", "aria-hidden": "true" }),
                        h(
                            "span",
                            { className: "context-menu-label" },
                            props.i18n.t("compareWithPreviousRevision")
                        )
                    ),
                    isIncomingEntry(entry)
                        ? null
                        : h(
                              React.Fragment,
                              null,
                              h(
                                  "button",
                                  {
                                      className: "context-menu-item",
                                      type: "button",
                                      onClick: function () {
                                          props.onAction("revert-to-revision", entry);
                                      },
                                  },
                                  h("span", {
                                      className: "codicon codicon-history",
                                      "aria-hidden": "true",
                                  }),
                                  h(
                                      "span",
                                      { className: "context-menu-label" },
                                      props.i18n.t("revertToThisRevision")
                                  )
                              ),
                              h(
                                  "button",
                                  {
                                      className: "context-menu-item",
                                      type: "button",
                                      onClick: function () {
                                          props.onAction("revert-changes-from-revision", entry);
                                      },
                                  },
                                  h("span", {
                                      className: "codicon codicon-discard",
                                      "aria-hidden": "true",
                                  }),
                                  h(
                                      "span",
                                      { className: "context-menu-label" },
                                      props.i18n.t("revertChangesFromThisRevision")
                                  )
                              )
                          ),
                    h("div", { className: "context-menu-separator", "aria-hidden": "true" }),
                    h(
                        "button",
                        {
                            className: "context-menu-item",
                            type: "button",
                            onClick: function () {
                                props.onAction("create-branch", entry);
                            },
                        },
                        h("span", {
                            className: "codicon codicon-git-branch",
                            "aria-hidden": "true",
                        }),
                        h(
                            "span",
                            { className: "context-menu-label" },
                            props.i18n.t("createBranchFromThisRevision")
                        )
                    ),
                    h(
                        "button",
                        {
                            className: "context-menu-item",
                            type: "button",
                            onClick: function () {
                                props.onAction("create-tag", entry);
                            },
                        },
                        h("span", { className: "codicon codicon-tag", "aria-hidden": "true" }),
                        h(
                            "span",
                            { className: "context-menu-label" },
                            props.i18n.t("createTagFromThisRevision")
                        )
                    ),
                    h("div", { className: "context-menu-separator", "aria-hidden": "true" }),
                    h(
                        "button",
                        {
                            className: "context-menu-item",
                            type: "button",
                            onClick: function () {
                                props.onAction("copy-revision", entry);
                            },
                        },
                        h("span", { className: "codicon codicon-copy", "aria-hidden": "true" }),
                        h(
                            "span",
                            { className: "context-menu-label" },
                            props.i18n.t("copyRevisionNumber")
                        )
                    ),
                    h(
                        "button",
                        {
                            className: "context-menu-item",
                            type: "button",
                            onClick: function () {
                                props.onAction("copy-message", entry);
                            },
                        },
                        h("span", { className: "codicon codicon-note", "aria-hidden": "true" }),
                        h(
                            "span",
                            { className: "context-menu-label" },
                            props.i18n.t("copyCommitMessage")
                        )
                    ),
                    h(
                        "button",
                        {
                            className: "context-menu-item",
                            type: "button",
                            onClick: function () {
                                props.onAction("copy-changed-paths", entry);
                            },
                        },
                        h("span", { className: "codicon codicon-list-unordered", "aria-hidden": "true" }),
                        h(
                            "span",
                            { className: "context-menu-label" },
                            props.i18n.t("copyChangedPaths")
                        )
                    )
                )
            )
        );
    }

    function HistoryApp(): React.ReactElement {
        const historyListRef = React.useRef<HTMLDivElement | null>(null);
        const [state, setState] = React.useState<HistoryState>({
            entries: [],
            hasMore: true,
            isLoading: true,
            currentRevision: undefined,
            loadMoreError: undefined,
            expandedRevision: undefined,
            collapsedDirectories: {},
            contextMenu: undefined,
            query: "",
            repositoryLabel: bootstrap.repositoryLabel,
            rootPath: bootstrap.rootPath,
            locale: bootstrap.locale,
            platform: bootstrap.platform,
        });
        const i18n = createI18n(state.locale);

        React.useEffect(
            function () {
                document.title = i18n.t("historyPanelTitle", {
                    label: state.repositoryLabel,
                });
                document.documentElement.lang = state.locale;
            },
            [i18n, state.locale, state.repositoryLabel]
        );

        React.useEffect(function () {
            vscode.postMessage({ type: "ready" });
        }, []);

        const searchQuery = state.query.trim();
        const normalizedQuery = searchQuery.toLowerCase();

        const filteredEntries = normalizedQuery
            ? state.entries.filter(function (entry) {
                  const haystack = [
                      "r" + String(entry.revision ?? ""),
                      String(entry.author ?? ""),
                      String(entry.date ?? ""),
                      String(entry.message ?? ""),
                  ]
                      .concat(entry.changes.map(function (change) {
                          return String(change.path ?? "");
                      }))
                      .join(" ")
                      .toLowerCase();

                  return haystack.includes(normalizedQuery);
              })
            : state.entries;

        const contextRevision = state.contextMenu?.revision;
        const contextEntry =
            typeof contextRevision === "number"
                ? state.entries.find(function (entry) {
                      return entry.revision === contextRevision;
                  })
                : undefined;

        function hideContextMenu() {
            setState(function (previous) {
                if (!previous.contextMenu) {
                    return previous;
                }

                return {
                    ...previous,
                    contextMenu: undefined,
                };
            });
        }

        function requestMoreEntries() {
            if (state.isLoading || !state.hasMore || state.entries.length === 0) {
                return;
            }

            const beforeRevision = Number(state.entries[state.entries.length - 1].revision) - 1;
            if (!Number.isFinite(beforeRevision) || beforeRevision < 1) {
                setState(function (previous) {
                    return {
                        ...previous,
                        hasMore: false,
                    };
                });
                return;
            }

            setState(function (previous) {
                return {
                    ...previous,
                    isLoading: true,
                    loadMoreError: undefined,
                    contextMenu: undefined,
                };
            });
            vscode.postMessage({
                type: "load-more",
                beforeRevision: beforeRevision,
            });
        }

        function requestRefresh() {
            setState(function (previous) {
                return {
                    ...previous,
                    isLoading: true,
                    hasMore: true,
                    loadMoreError: undefined,
                    contextMenu: undefined,
                };
            });
            vscode.postMessage({ type: "refresh" });
        }

        function maybeLoadMoreOnScroll() {
            const historyList = historyListRef.current;
            if (!historyList || state.isLoading || !state.hasMore) {
                return;
            }

            if (normalizedQuery && filteredEntries.length === 0) {
                return;
            }

            const remaining =
                historyList.scrollHeight - historyList.scrollTop - historyList.clientHeight;
            if (remaining < 240) {
                requestMoreEntries();
            }
        }

        React.useEffect(function () {
            function handleMessage(event: MessageEvent<unknown>) {
                const data = event.data;
                if (isHistoryDataMessage(data)) {
                    setState(function (previous) {
                        const nextEntries = data.payload.append
                            ? previous.entries.concat(
                                  data.payload.entries.filter(function (entry) {
                                      return !previous.entries.some(function (existing) {
                                          return existing.revision === entry.revision;
                                      });
                                  })
                              )
                            : data.payload.entries;

                        return {
                            ...previous,
                            entries: nextEntries,
                            hasMore: data.payload.hasMore === true,
                            isLoading: false,
                            currentRevision: data.payload.currentRevision,
                            loadMoreError: undefined,
                            repositoryLabel: data.payload.repositoryLabel,
                            rootPath: data.payload.rootPath,
                        };
                    });
                    setTimeout(function () {
                        maybeLoadMoreOnScroll();
                    }, 0);
                    return;
                }

                if (isHistoryErrorMessage(data)) {
                    setState(function (previous) {
                        if (data.payload.append) {
                            return {
                                ...previous,
                                isLoading: false,
                                loadMoreError: data.payload.message,
                            };
                        }

                        return {
                            ...previous,
                            entries: [],
                            hasMore: false,
                            isLoading: false,
                            loadMoreError: data.payload.message,
                            contextMenu: undefined,
                        };
                    });
                    return;
                }

                if (isHistoryConfigMessage(data)) {
                    setState(function (previous) {
                        return {
                            ...previous,
                            locale: data.payload.locale,
                        };
                    });
                }
            }

            function handleResize(): void {
                hideContextMenu();
            }

            function handleKeydown(event: KeyboardEvent): void {
                if (event.key === "Escape") {
                    hideContextMenu();
                }
            }

            window.addEventListener("message", handleMessage);
            window.addEventListener("resize", handleResize);
            window.addEventListener("keydown", handleKeydown);

            return function () {
                window.removeEventListener("message", handleMessage);
                window.removeEventListener("resize", handleResize);
                window.removeEventListener("keydown", handleKeydown);
            };
        });

        React.useEffect(
            function () {
                if (
                    !normalizedQuery ||
                    filteredEntries.length > 0 ||
                    state.isLoading ||
                    !state.hasMore ||
                    state.entries.length === 0
                ) {
                    return;
                }

                requestMoreEntries();
            },
            [
                filteredEntries.length,
                normalizedQuery,
                state.entries.length,
                state.hasMore,
                state.isLoading,
            ]
        );

        React.useEffect(
            function () {
                if (
                    state.expandedRevision &&
                    !filteredEntries.some(function (entry) {
                        return entry.revision === state.expandedRevision;
                    })
                ) {
                    setState(function (previous) {
                        return {
                            ...previous,
                            expandedRevision: undefined,
                        };
                    });
                }

                if (
                    typeof contextRevision === "number" &&
                    !state.entries.some(function (entry) {
                        return entry.revision === contextRevision;
                    })
                ) {
                    setState(function (previous) {
                        return {
                            ...previous,
                            contextMenu: undefined,
                        };
                    });
                }
            },
            [contextRevision, filteredEntries, state.entries, state.expandedRevision]
        );

        function toggleDirectory(revision: number, fullPath: string): void {
            const key = directoryKey(revision, fullPath);
            setState(function (previous) {
                return {
                    ...previous,
                    collapsedDirectories: {
                        ...previous.collapsedDirectories,
                        [key]: previous.collapsedDirectories[key] !== true,
                    },
                };
            });
        }

        function openRevisionContextMenu(revision: number, clientX: number, clientY: number): void {
            const position = getMenuPosition(clientX, clientY);
            setState(function (previous) {
                return {
                    ...previous,
                    contextMenu: {
                        kind: "revision",
                        revision: revision,
                        x: position.x,
                        y: position.y,
                    },
                };
            });
        }

        function openFileContextMenu(
            revision: number,
            change: HistoryChange,
            clientX: number,
            clientY: number
        ): void {
            const position = getMenuPosition(clientX, clientY);
            setState(function (previous) {
                return {
                    ...previous,
                    contextMenu: {
                        kind: "file",
                        revision: revision,
                        x: position.x,
                        y: position.y,
                        change: change,
                    },
                };
            });
        }

        function triggerContextAction(type: ContextActionType, entry: HistoryEntry): void {
            hideContextMenu();
            if (
                type === "compare-with-working-copy" ||
                type === "compare-with-previous-revision"
            ) {
                vscode.postMessage({
                    type: type,
                    revision: entry.revision,
                    changes: entry.changes,
                });
                return;
            }

            if (type === "copy-message") {
                vscode.postMessage({
                    type: "copy-message",
                    revision: entry.revision,
                    message: entry.message,
                });
                return;
            }

            if (type === "copy-changed-paths") {
                vscode.postMessage({
                    type: "copy-changed-paths",
                    revision: entry.revision,
                    changedPaths: entry.changes.map(function (change) {
                        return `${change.action} ${change.path}`;
                    }),
                });
                return;
            }

            vscode.postMessage({
                type: type,
                revision: entry.revision,
            });
        }

        function triggerFileContextAction(
            type: FileContextActionType,
            revision: number,
            change: HistoryChange
        ): void {
            hideContextMenu();

            if (type === "open-file-diff") {
                vscode.postMessage({
                    type: "open-diff",
                    revision: revision,
                    path: change.path,
                    action: change.action,
                });
                return;
            }

            if (type === "compare-file-with-working-copy") {
                vscode.postMessage({
                    type: "compare-file-with-working-copy",
                    revision: revision,
                    path: change.path,
                    action: change.action,
                });
                return;
            }

            if (type === "compare-file-with-previous-revision") {
                vscode.postMessage({
                    type: "compare-file-with-previous-revision",
                    revision: revision,
                    path: change.path,
                    action: change.action,
                });
                return;
            }

            if (type === "export-file") {
                vscode.postMessage({
                    type: "export-file",
                    revision: revision,
                    path: change.path,
                    action: change.action,
                });
                return;
            }

            if (type === "show-file-history" || type === "reveal-in-file-manager") {
                vscode.postMessage({
                    type: type,
                    path: change.path,
                });
                return;
            }

            vscode.postMessage({
                type: "copy-file-path",
                revision: revision,
                path: change.path,
            });
        }

        function renderHistoryContent() {
            if (state.entries.length === 0 && state.isLoading) {
                return h("div", { className: "empty-state" }, i18n.t("loadingHistory"));
            }

            if (filteredEntries.length === 0) {
                if (state.loadMoreError) {
                    return h(
                        "div",
                        { className: "empty-state" },
                        h("div", null, i18n.t("unableLoadHistory")),
                        h("div", { className: "empty-state-error" }, state.loadMoreError),
                        h(
                            "div",
                            { className: "empty-state-actions" },
                            h(
                                "button",
                                {
                                    className: "secondary",
                                    type: "button",
                                    onClick: requestRefresh,
                                },
                                i18n.t("retryLoadingHistory")
                            )
                        )
                    );
                }

                if (normalizedQuery && state.hasMore) {
                    return h(
                        React.Fragment,
                        null,
                        h(
                            "div",
                            { className: "empty-state" },
                            i18n.t("noLoadedRevisionsMatch")
                        ),
                        renderFooter()
                    );
                }

                return h(
                    "div",
                    { className: "empty-state" },
                    i18n.t("noRevisionsMatch")
                );
            }

            return h(
                React.Fragment,
                null,
                filteredEntries.map(function (entry, index) {
                    const isExpanded = entry.revision === state.expandedRevision;
                    const incoming = isIncomingEntry(entry);
                    const isCurrentRevision = isCurrentRevisionEntry(
                        entry,
                        state.currentRevision
                    );
                    const topStemIncoming =
                        incoming || isIncomingEntry(filteredEntries[index - 1]);
                    const bottomStemIncoming =
                        incoming || isIncomingEntry(filteredEntries[index + 1]);

                    return h(
                        "article",
                        {
                            key: entry.revision,
                            className:
                                "commit" +
                                (isExpanded ? " expanded" : "") +
                                (incoming ? " incoming" : "") +
                                (isCurrentRevision ? " current" : ""),
                            "data-revision": entry.revision,
                        },
                        h(
                            "div",
                            {
                                className: "commit-row",
                                onClick: function () {
                                    setState(function (previous) {
                                        return {
                                            ...previous,
                                            expandedRevision:
                                                previous.expandedRevision === entry.revision
                                                    ? undefined
                                                    : entry.revision,
                                            contextMenu: undefined,
                                        };
                                    });
                                },
                                onContextMenu: function (event: React.MouseEvent<HTMLDivElement>) {
                                    event.preventDefault();
                                    openRevisionContextMenu(
                                        entry.revision,
                                        event.clientX,
                                        event.clientY
                                    );
                                },
                            },
                            h(
                                "div",
                                { className: "graph-column" },
                                h("span", {
                                    className:
                                        "graph-stem graph-stem-top" +
                                        (topStemIncoming ? " graph-stem-incoming" : ""),
                                    "aria-hidden": "true",
                                }),
                                h("span", {
                                    className:
                                        "graph-dot" +
                                        (incoming ? " graph-dot-incoming" : "") +
                                        (isCurrentRevision ? " graph-dot-current" : ""),
                                    "aria-hidden": "true",
                                }),
                                h("span", {
                                    className:
                                        "graph-stem graph-stem-bottom" +
                                        (bottomStemIncoming ? " graph-stem-incoming" : ""),
                                    "aria-hidden": "true",
                                })
                            ),
                            h(
                                "div",
                                { className: "description-cell" },
                                h(
                                    "div",
                                    { className: "summary" },
                                    h(
                                        "span",
                                        { className: "summary-message" },
                                        renderHighlightedText(
                                            summarizeMessage(entry.message, i18n),
                                            searchQuery
                                        )
                                    ),
                                    h("span", { className: "summary-separator" }, "\u2022"),
                                    h(
                                        "span",
                                        { className: "summary-meta" },
                                        formatPathCount(entry.changes.length, i18n)
                                    ),
                                    incoming
                                        ? h(
                                              "span",
                                              { className: "summary-badge incoming" },
                                              i18n.t("incomingChange")
                                          )
                                        : null
                                )
                            ),
                            h(
                                "div",
                                { className: "cell-text muted" },
                                renderHighlightedText(formatDate(entry.date, i18n), searchQuery)
                            ),
                            h(
                                "div",
                                { className: "cell-text" },
                                renderHighlightedText(entry.author, searchQuery)
                            ),
                            h(
                                "div",
                                { className: "cell-text revision" },
                                renderHighlightedText("r" + String(entry.revision), searchQuery)
                            )
                        ),
                        isExpanded
                            ? h(CommitDetails, {
                                  i18n: i18n,
                                  entry: entry,
                                  rootPath: state.rootPath,
                                  searchQuery,
                                  collapsedDirectories: state.collapsedDirectories,
                                  onToggleDirectory: toggleDirectory,
                                  onOpenFileContextMenu: openFileContextMenu,
                              })
                            : null
                    );
                }),
                renderFooter()
            );
        }

        function renderFooter() {
            if (state.isLoading) {
                return h(
                    "div",
                    { className: "history-footer" },
                    h(
                        "span",
                        { className: "history-footer-text" },
                        i18n.t("loadingMoreHistory")
                    )
                );
            }

            if (state.loadMoreError) {
                return h(
                    "div",
                    { className: "history-footer" },
                    h(
                        "button",
                        {
                            className: "secondary",
                            type: "button",
                            onClick: requestMoreEntries,
                        },
                        i18n.t("retryLoadingOlderRevisions")
                    )
                );
            }

            if (state.hasMore) {
                return h(
                    "div",
                    { className: "history-footer" },
                    h(
                        "button",
                        {
                            className: "secondary",
                            type: "button",
                            onClick: requestMoreEntries,
                        },
                        i18n.t("loadOlderRevisions")
                    )
                );
            }

            return h(
                "div",
                { className: "history-footer" },
                h(
                    "span",
                    { className: "history-footer-text" },
                    i18n.t("allHistoryLoaded")
                )
            );
        }

        return h(
            React.Fragment,
            null,
            h(
                "div",
                { className: "page" },
                h(
                    "section",
                    { className: "card" },
                    h(
                        "div",
                        { className: "toolbar" },
                        h(
                            "div",
                            null,
                            h("h1", null, state.repositoryLabel),
                            h("small", { id: "root-path" }, state.rootPath)
                        ),
                        h(
                            "div",
                            { className: "toolbar-actions" },
                            h("input", {
                                className: "search",
                                type: "search",
                                placeholder: i18n.t("filterPlaceholder"),
                                value: state.query,
                                onChange: function (event: React.ChangeEvent<HTMLInputElement>) {
                                    const query = event.currentTarget.value;
                                    setState(function (previous) {
                                        return {
                                            ...previous,
                                            query,
                                        };
                                    });
                                },
                            }),
                            h(
                                "button",
                                {
                                    className: "toolbar-button secondary",
                                    type: "button",
                                    title: i18n.t("refreshButton"),
                                    "aria-label": i18n.t("refreshButton"),
                                    onClick: requestRefresh,
                                },
                                h("span", {
                                    className: "codicon codicon-refresh",
                                    "aria-hidden": "true",
                                }),
                                h(
                                    "span",
                                    { className: "toolbar-button-label" },
                                    i18n.t("refreshButton")
                                )
                            )
                        )
                    ),
                    h(
                        "div",
                        { className: "table-header" },
                        h("div", null, i18n.t("graphLabel")),
                        h("div", null, i18n.t("descriptionLabel")),
                        h("div", null, i18n.t("dateLabel")),
                        h("div", null, i18n.t("authorDetailLabel")),
                        h("div", null, i18n.t("revisionLabel"))
                    ),
                    h(
                        "div",
                        {
                            className: "history-list",
                            ref: historyListRef,
                            onScroll: function () {
                                hideContextMenu();
                                maybeLoadMoreOnScroll();
                            },
                        },
                        renderHistoryContent()
                    )
                )
            ),
            h(ContextMenu, {
                i18n: i18n,
                platform: state.platform,
                menu: state.contextMenu,
                entry: contextEntry,
                onClose: hideContextMenu,
                onAction: triggerContextAction,
                onFileAction: triggerFileContextAction,
            })
        );
    }

    const rootElement = document.getElementById("root");
    if (!rootElement) {
        return;
    }

    createRoot(rootElement).render(h(HistoryApp));
})();
