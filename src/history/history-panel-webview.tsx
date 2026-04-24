import React from "react";
import { createRoot } from "react-dom/client";

type HistoryViewStyle = "summary" | "detail";
type ContextActionType =
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
    | "compare-file-with-working-copy"
    | "compare-file-with-previous-revision"
    | "copy-file-path";

interface HistoryBootstrap {
    repositoryLabel: string;
    rootPath: string;
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
}

interface HistoryDataPayload {
    append: boolean;
    hasMore: boolean;
    repositoryLabel: string;
    rootPath: string;
    entries: HistoryEntry[];
}

interface HistoryErrorPayload {
    append: boolean;
    message: string;
}

type HistoryResponseMessage =
    | {
          type: "history-data";
          payload: HistoryDataPayload;
      }
    | {
          type: "history-error";
          payload: HistoryErrorPayload;
      };

type HistoryRequestMessage =
    | {
          type: "refresh";
      }
    | {
          type: "load-more";
          beforeRevision: number;
      }
    | {
          type:
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
          type: "open-diff" | "compare-file-with-working-copy" | "compare-file-with-previous-revision";
          revision: number;
          path: string;
          action: string;
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
    loadMoreError?: string;
    expandedRevision?: number;
    collapsedDirectories: CollapsedDirectories;
    contextMenu?: ContextMenuState;
    query: string;
    repositoryLabel: string;
    rootPath: string;
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
    node: ChangeTreeNodeModel;
    depth: number;
    revision: number;
    rootPath: string;
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
    entry: HistoryEntry;
    rootPath: string;
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

(function () {
    const vscode = acquireVsCodeApi();
    const bootstrap: HistoryBootstrap = window.__SVN_HISTORY_BOOTSTRAP__ ?? {
        repositoryLabel: "",
        rootPath: "",
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
        return createCommandUri("svn-graph.open-history-diff", [
            {
                rootPath,
                revision,
                path,
                action,
            },
        ]);
    }

    function formatDate(value: string | undefined, style: HistoryViewStyle = "summary"): string {
        if (!value) {
            return "Unknown date";
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }

        return new Intl.DateTimeFormat(undefined, {
            dateStyle: style === "detail" ? "full" : "medium",
            timeStyle: "short",
        }).format(date);
    }

    function summarizeMessage(value: string | undefined): string {
        const normalized = String(value || "").trim();
        if (!normalized) {
            return "(no commit message)";
        }

        return normalized.split(/\r?\n/, 1)[0];
    }

    function formatPathCount(count: number): string {
        return count === 1 ? "1 changed path" : count + " changed paths";
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

    function getMenuPosition(clientX: number, clientY: number): MenuPosition {
        return {
            x: Math.max(8, Math.min(clientX, window.innerWidth - 248)),
            y: Math.max(8, Math.min(clientY, window.innerHeight - 196)),
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
                        h("span", { className: "tree-label" }, node.name)
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
                              node: childNode,
                              depth: props.depth + 1,
                              revision: props.revision,
                              rootPath: props.rootPath,
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
            noteSegments.push(change.kind);
        }

        if (change.copyfromPath) {
            noteSegments.push(
                "from " +
                    change.copyfromPath +
                    (change.copyfromRevision ? " @ r" + change.copyfromRevision : "")
            );
        }

        if (change.textMods && change.propMods) {
            noteSegments.push("text: " + change.textMods + ", props: " + change.propMods);
        }

        return h(
            "a",
            {
                className: "tree-row change-row",
                style: depthStyle,
                title: "Open diff",
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
                    title: action,
                }),
                h("span", { className: "tree-label change-path" }, node.name)
            ),
            h(
                "span",
                { className: "tree-actions" },
                h("span", { className: "change-note" }, noteSegments.join(" • "))
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
                      "No changed paths were reported for this revision."
                  )
                : buildChangeTree(entry.changes).map(function (node) {
                      return h(ChangeTreeNode, {
                          key:
                              (node.type === "dir" ? "dir:" : "file:") +
                              entry.revision +
                              ":" +
                              node.fullPath,
                          node: node,
                          depth: 0,
                          revision: entry.revision,
                          rootPath: props.rootPath,
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
                    h("div", { className: "details-title" }, entry.message || "(no commit message)"),
                    h(
                        "div",
                        { className: "details-meta" },
                        h(
                            "div",
                            null,
                            h("strong", null, "Revision:"),
                            " r",
                            entry.revision
                        ),
                        h(
                            "div",
                            null,
                            h("strong", null, "Author:"),
                            " ",
                            entry.author
                        ),
                        h(
                            "div",
                            null,
                            h("strong", null, "Date:"),
                            " ",
                            formatDate(entry.date, "detail")
                        ),
                        h(
                            "div",
                            null,
                            h("strong", null, "Files:"),
                            " ",
                            entry.changes.length
                        )
                    )
                ),
                h(
                    "div",
                    { className: "details-files-panel" },
                    h("div", { className: "section-title" }, "Changed Files"),
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
                        h("div", { className: "context-menu-title" }, change.path),
                        h(
                            "div",
                            { className: "context-menu-subtitle" },
                            "r",
                            entry.revision,
                            " • ",
                            summarizeMessage(entry.message)
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
                            h("span", { className: "context-menu-label" }, "Open Diff")
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
                            h("span", { className: "context-menu-label" }, "Compare With Working Copy")
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
                                "Compare With Previous Revision"
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
                            h("span", { className: "context-menu-label" }, "Copy File Path")
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
                        summarizeMessage(entry.message)
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
                                props.onAction("checkout-revision", entry);
                            },
                        },
                        h("span", { className: "codicon codicon-repo-clone", "aria-hidden": "true" }),
                        h("span", { className: "context-menu-label" }, "Checkout To This Revision")
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
                        h("span", { className: "context-menu-label" }, "Export This Revision")
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
                        h("span", { className: "context-menu-label" }, "Compare With Working Copy")
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
                        h("span", { className: "context-menu-label" }, "Compare With Previous Revision")
                    ),
                    h(
                        "button",
                        {
                            className: "context-menu-item",
                            type: "button",
                            onClick: function () {
                                props.onAction("revert-to-revision", entry);
                            },
                        },
                        h("span", { className: "codicon codicon-history", "aria-hidden": "true" }),
                        h("span", { className: "context-menu-label" }, "Revert To This Revision")
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
                        h("span", { className: "codicon codicon-discard", "aria-hidden": "true" }),
                        h("span", { className: "context-menu-label" }, "Revert Changes From This Revision")
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
                        h("span", { className: "context-menu-label" }, "Create Branch From This Revision")
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
                        h("span", { className: "context-menu-label" }, "Create Tag From This Revision")
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
                        h("span", { className: "context-menu-label" }, "Copy Revision Number")
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
                        h("span", { className: "context-menu-label" }, "Copy Commit Message")
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
                        h("span", { className: "context-menu-label" }, "Copy Changed Paths")
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
            loadMoreError: undefined,
            expandedRevision: undefined,
            collapsedDirectories: {},
            contextMenu: undefined,
            query: "",
            repositoryLabel: bootstrap.repositoryLabel,
            rootPath: bootstrap.rootPath,
        });

        const filteredEntries = state.query.trim()
            ? state.entries.filter(function (entry) {
                  const haystack = [
                      "r" + entry.revision,
                      entry.author,
                      entry.date,
                      entry.message,
                  ]
                      .concat(entry.changes.map(function (change) {
                          return change.path;
                      }))
                      .join(" ")
                      .toLowerCase();

                  return haystack.includes(state.query.trim().toLowerCase());
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

        function maybeLoadMoreOnScroll() {
            const historyList = historyListRef.current;
            if (!historyList || state.isLoading || !state.hasMore) {
                return;
            }

            if (state.query.trim() && filteredEntries.length === 0) {
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

            vscode.postMessage({
                type: "copy-file-path",
                revision: revision,
                path: change.path,
            });
        }

        function renderHistoryContent() {
            if (state.entries.length === 0 && state.isLoading) {
                return h("div", { className: "empty-state" }, "Loading history...");
            }

            if (filteredEntries.length === 0) {
                if (state.loadMoreError) {
                    return h(
                        "div",
                        { className: "empty-state" },
                        "Unable to load history.",
                        h("br"),
                        h("br"),
                        state.loadMoreError
                    );
                }

                if (state.query.trim() && state.hasMore) {
                    return h(
                        React.Fragment,
                        null,
                        h(
                            "div",
                            { className: "empty-state" },
                            "No loaded revisions match the current filter yet."
                        ),
                        renderFooter()
                    );
                }

                return h(
                    "div",
                    { className: "empty-state" },
                    "No revisions match the current filter."
                );
            }

            return h(
                React.Fragment,
                null,
                filteredEntries.map(function (entry) {
                    const isExpanded = entry.revision === state.expandedRevision;

                    return h(
                        "article",
                        {
                            key: entry.revision,
                            className: "commit" + (isExpanded ? " expanded" : ""),
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
                                    className: "graph-stem graph-stem-top",
                                    "aria-hidden": "true",
                                }),
                                h("span", {
                                    className: "graph-dot",
                                    "aria-hidden": "true",
                                }),
                                h("span", {
                                    className: "graph-stem graph-stem-bottom",
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
                                        summarizeMessage(entry.message)
                                    ),
                                    h("span", { className: "summary-separator" }, "\u2022"),
                                    h(
                                        "span",
                                        { className: "summary-meta" },
                                        formatPathCount(entry.changes.length)
                                    )
                                )
                            ),
                            h(
                                "div",
                                { className: "cell-text muted" },
                                formatDate(entry.date)
                            ),
                            h("div", { className: "cell-text" }, entry.author),
                            h(
                                "div",
                                { className: "cell-text revision" },
                                "r",
                                entry.revision
                            )
                        ),
                        isExpanded
                            ? h(CommitDetails, {
                                  entry: entry,
                                  rootPath: state.rootPath,
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
                        "Loading more history..."
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
                        "Retry loading older revisions"
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
                        "Load older revisions"
                    )
                );
            }

            return h(
                "div",
                { className: "history-footer" },
                h(
                    "span",
                    { className: "history-footer-text" },
                    "All available history has been loaded."
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
                                placeholder: "Filter by revision, author, message or path",
                                value: state.query,
                                onChange: function (event: React.ChangeEvent<HTMLInputElement>) {
                                    setState(function (previous) {
                                        return {
                                            ...previous,
                                            query: event.currentTarget.value,
                                        };
                                    });
                                },
                            }),
                            h(
                                "button",
                                {
                                    type: "button",
                                    onClick: function () {
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
                                    },
                                },
                                "Refresh"
                            )
                        )
                    ),
                    h(
                        "div",
                        { className: "table-header" },
                        h("div", null, "Graph"),
                        h("div", null, "Description"),
                        h("div", null, "Date"),
                        h("div", null, "Author"),
                        h("div", null, "Revision")
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
