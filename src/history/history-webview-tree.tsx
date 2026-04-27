import React from "react";
import type {
    ChangeTreeNodeProps,
    CommitDetailsProps,
} from "./history-webview-types";
import {
    actionToIconClass,
    buildChangeTree,
    createHistoryDiffCommandUri,
    directoryKey,
    formatDate,
    isIncomingEntry,
    renderHighlightedText,
    summarizeMessage,
} from "./history-webview-utils";

function normalizeRepositoryPath(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }

    const normalized = value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    return normalized ? `/${normalized}` : "/";
}

function isFocusedAncestorDirectory(
    directoryPath: string,
    focusedRepositoryPath: string | undefined
): boolean {
    if (!focusedRepositoryPath) {
        return false;
    }

    const normalizedDirectoryPath = normalizeRepositoryPath(directoryPath);
    if (!normalizedDirectoryPath || normalizedDirectoryPath === "/") {
        return false;
    }

    return focusedRepositoryPath.startsWith(`${normalizedDirectoryPath}/`);
}

function ChangeTreeNode(props: ChangeTreeNodeProps): React.ReactElement {
    const node = props.node;
    const depthStyle = { "--depth": props.depth } as React.CSSProperties & {
        "--depth": number;
    };

    if (node.type === "dir") {
        const key = directoryKey(props.revision, node.fullPath);
        const collapsed = props.collapsedDirectories[key] === true;
        const isFocusedAncestor =
            props.hasFocusedFileMatch === true &&
            isFocusedAncestorDirectory(node.fullPath, props.focusedRepositoryPath);

        return React.createElement(
            React.Fragment,
            { key: "dir:" + props.revision + ":" + node.fullPath },
            React.createElement(
                "div",
                {
                    className:
                        "tree-row tree-dir" +
                        (isFocusedAncestor ? " is-focused-ancestor" : "") +
                        (props.hasFocusedFileMatch === true && !isFocusedAncestor
                            ? " is-dimmed-dir"
                            : ""),
                    style: depthStyle,
                    onClick: function () {
                        props.onToggleDirectory(props.revision, node.fullPath);
                    },
                },
                React.createElement(
                    "div",
                    { className: "tree-main" },
                    React.createElement("span", {
                        className:
                            "tree-chevron codicon " +
                            (collapsed ? "codicon-chevron-right" : "codicon-chevron-down"),
                    }),
                    React.createElement("span", {
                        className:
                            "tree-icon codicon " +
                            (collapsed ? "codicon-folder" : "codicon-folder-opened"),
                    }),
                    React.createElement(
                        "span",
                        { className: "tree-label" },
                        renderHighlightedText(node.name, props.searchQuery)
                    )
                ),
                React.createElement("div")
            ),
            collapsed
                ? null
                : node.children.map(function (childNode) {
                      return React.createElement(ChangeTreeNode, {
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
                          focusedRepositoryPath: props.focusedRepositoryPath,
                          hasFocusedFileMatch: props.hasFocusedFileMatch,
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
    const isFocusedFile =
        props.hasFocusedFileMatch === true &&
        normalizeRepositoryPath(change.path) === props.focusedRepositoryPath;
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

    return React.createElement(
        "a",
        {
            className:
                "tree-row change-row" +
                (isFocusedFile ? " is-focused-file" : "") +
                (props.hasFocusedFileMatch === true && !isFocusedFile ? " is-dimmed-file" : ""),
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
        React.createElement(
            "span",
            { className: "tree-main change-body" },
            React.createElement("span", {
                className:
                    "tree-icon change-icon codicon " +
                    actionToIconClass(action) +
                    " action-" +
                    String(change.action).toLowerCase(),
                title: props.i18n.formatHistoryAction(action),
            }),
            React.createElement(
                "span",
                { className: "tree-label change-path" },
                renderHighlightedText(node.name, props.searchQuery)
            )
        ),
        React.createElement(
            "span",
            { className: "tree-actions" },
            React.createElement(
                "span",
                { className: "change-note" },
                renderHighlightedText(noteSegments.join(" • "), props.searchQuery)
            )
        )
    );
}

export function CommitDetails(props: CommitDetailsProps): React.ReactElement {
    const entry = props.entry;
    const focusedRepositoryPath = normalizeRepositoryPath(props.focusedRepositoryPath);
    const hasFocusedFileMatch =
        focusedRepositoryPath !== undefined &&
        entry.changes.some(function (change) {
            return normalizeRepositoryPath(change.path) === focusedRepositoryPath;
        });
    const treeMarkup =
        entry.changes.length === 0
            ? React.createElement(
                  "div",
                  { className: "empty-state" },
                  props.i18n.t("noChangedPathsReported")
              )
            : buildChangeTree(entry.changes).map(function (node) {
                  return React.createElement(ChangeTreeNode, {
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
                      focusedRepositoryPath: focusedRepositoryPath,
                      hasFocusedFileMatch: hasFocusedFileMatch,
                      searchQuery: props.searchQuery,
                      collapsedDirectories: props.collapsedDirectories,
                      onToggleDirectory: props.onToggleDirectory,
                      onOpenFileContextMenu: props.onOpenFileContextMenu,
                  });
              });

    return React.createElement(
        "div",
        { className: "details-row" },
        React.createElement("div", { className: "details-rail" }),
        React.createElement(
            "div",
            { className: "details-panel" },
            React.createElement(
                "div",
                { className: "details-summary-panel" },
                React.createElement(
                    "div",
                    { className: "details-title-row" },
                    React.createElement(
                        "div",
                        { className: "details-title" },
                        renderHighlightedText(
                            summarizeMessage(entry.message, props.i18n),
                            props.searchQuery
                        )
                    ),
                    isIncomingEntry(entry)
                        ? React.createElement(
                              "span",
                              { className: "summary-badge incoming" },
                              props.i18n.t("incomingChange")
                          )
                        : null
                ),
                React.createElement(
                    "div",
                    { className: "details-meta" },
                    React.createElement(
                        "div",
                        null,
                        React.createElement(
                            "strong",
                            null,
                            props.i18n.t("revisionLabel") + ":"
                        ),
                        " r",
                        renderHighlightedText(entry.revision, props.searchQuery)
                    ),
                    React.createElement(
                        "div",
                        null,
                        React.createElement(
                            "strong",
                            null,
                            props.i18n.t("authorDetailLabel") + ":"
                        ),
                        " ",
                        renderHighlightedText(entry.author, props.searchQuery)
                    ),
                    React.createElement(
                        "div",
                        null,
                        React.createElement(
                            "strong",
                            null,
                            props.i18n.t("dateLabel") + ":"
                        ),
                        " ",
                        renderHighlightedText(
                            formatDate(entry.date, props.i18n, "detail"),
                            props.searchQuery
                        )
                    ),
                    React.createElement(
                        "div",
                        null,
                        React.createElement(
                            "strong",
                            null,
                            props.i18n.t("filesLabel") + ":"
                        ),
                        " ",
                        entry.changes.length
                    )
                )
            ),
            React.createElement(
                "div",
                { className: "details-files-panel" },
                React.createElement(
                    "div",
                    { className: "section-title" },
                    props.i18n.t("changedFilesLabel")
                ),
                React.createElement("div", { className: "changes" }, treeMarkup)
            )
        )
    );
}
