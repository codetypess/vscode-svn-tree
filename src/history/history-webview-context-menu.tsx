import React from "react";
import {
    getDisplayChangePath,
    isIncomingEntry,
    summarizeMessage,
    useConstrainedMenuPosition,
} from "./history-webview-utils";
import type { ContextMenuProps } from "./history-webview-types";

export function ContextMenu(props: ContextMenuProps): React.ReactElement | null {
    if (!props.menu || !props.entry) {
        return null;
    }

    const entry = props.entry;
    const { menuRef, position } = useConstrainedMenuPosition(props.menu);
    const menuPosition = position ?? props.menu;
    if (props.menu.kind === "file") {
        const change = props.menu.change;
        const displayPath = getDisplayChangePath(change.path);

        return React.createElement(
            "div",
            { className: "context-menu-root" },
            React.createElement("div", {
                className: "context-menu-backdrop",
                onClick: props.onClose,
            }),
            React.createElement(
                "div",
                {
                    className: "context-menu",
                    ref: menuRef,
                    style: {
                        left: menuPosition.x + "px",
                        top: menuPosition.y + "px",
                    },
                },
                React.createElement(
                    "div",
                    { className: "context-menu-header" },
                    React.createElement(
                        "div",
                        { className: "context-menu-title", title: displayPath },
                        displayPath
                    ),
                    React.createElement(
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
                React.createElement(
                    "div",
                    { className: "context-menu-actions" },
                    React.createElement(
                        "button",
                        {
                            className: "context-menu-item",
                            type: "button",
                            onClick: function () {
                                props.onFileAction("open-file-diff", entry.revision, change);
                            },
                        },
                        React.createElement("span", {
                            className: "codicon codicon-diff",
                            "aria-hidden": "true",
                        }),
                        React.createElement(
                            "span",
                            { className: "context-menu-label" },
                            props.i18n.t("openDiff")
                        )
                    ),
                    React.createElement(
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
                        React.createElement("span", {
                            className: "codicon codicon-diff",
                            "aria-hidden": "true",
                        }),
                        React.createElement(
                            "span",
                            { className: "context-menu-label" },
                            props.i18n.t("compareWithWorkingCopy")
                        )
                    ),
                    React.createElement(
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
                        React.createElement("span", {
                            className: "codicon codicon-git-compare",
                            "aria-hidden": "true",
                        }),
                        React.createElement(
                            "span",
                            { className: "context-menu-label" },
                            props.i18n.t("compareWithPreviousRevision")
                        )
                    ),
                    React.createElement(
                        "button",
                        {
                            className: "context-menu-item",
                            type: "button",
                            onClick: function () {
                                props.onFileAction("show-file-history", entry.revision, change);
                            },
                        },
                        React.createElement("span", {
                            className: "codicon codicon-history",
                            "aria-hidden": "true",
                        }),
                        React.createElement(
                            "span",
                            { className: "context-menu-label" },
                            props.i18n.t("showFileHistory")
                        )
                    ),
                    React.createElement(
                        "button",
                        {
                            className: "context-menu-item",
                            type: "button",
                            onClick: function () {
                                props.onFileAction("export-file", entry.revision, change);
                            },
                        },
                        React.createElement("span", {
                            className: "codicon codicon-save",
                            "aria-hidden": "true",
                        }),
                        React.createElement(
                            "span",
                            { className: "context-menu-label" },
                            props.i18n.t("exportThisFile")
                        )
                    ),
                    React.createElement(
                        "button",
                        {
                            className: "context-menu-item",
                            type: "button",
                            onClick: function () {
                                props.onFileAction(
                                    "reveal-in-system-file-manager",
                                    entry.revision,
                                    change
                                );
                            },
                        },
                        React.createElement("span", {
                            className: "codicon codicon-folder-opened",
                            "aria-hidden": "true",
                        }),
                        React.createElement(
                            "span",
                            { className: "context-menu-label" },
                            props.i18n.formatRevealInFileManager(props.platform)
                        )
                    ),
                    React.createElement("div", {
                        className: "context-menu-separator",
                        "aria-hidden": "true",
                    }),
                    React.createElement(
                        "button",
                        {
                            className: "context-menu-item",
                            type: "button",
                            onClick: function () {
                                props.onFileAction("copy-file-path", entry.revision, change);
                            },
                        },
                        React.createElement("span", {
                            className: "codicon codicon-copy",
                            "aria-hidden": "true",
                        }),
                        React.createElement(
                            "span",
                            { className: "context-menu-label" },
                            props.i18n.t("copyFilePath")
                        )
                    )
                )
            )
        );
    }

    return React.createElement(
        "div",
        { className: "context-menu-root" },
        React.createElement("div", {
            className: "context-menu-backdrop",
            onClick: props.onClose,
        }),
        React.createElement(
            "div",
            {
                className: "context-menu",
                ref: menuRef,
                style: {
                    left: menuPosition.x + "px",
                    top: menuPosition.y + "px",
                },
            },
            React.createElement(
                "div",
                { className: "context-menu-header" },
                React.createElement("div", { className: "context-menu-title" }, "r" + entry.revision),
                React.createElement(
                    "div",
                    { className: "context-menu-subtitle" },
                    isIncomingEntry(entry)
                        ? props.i18n.t("incomingChange") +
                              " • " +
                              summarizeMessage(entry.message, props.i18n)
                        : summarizeMessage(entry.message, props.i18n)
                )
            ),
            React.createElement(
                "div",
                { className: "context-menu-actions" },
                React.createElement(
                    "button",
                    {
                        className: "context-menu-item",
                        type: "button",
                        onClick: function () {
                            props.onAction("update-to-revision", entry);
                        },
                    },
                    React.createElement("span", {
                        className: "codicon codicon-cloud-download",
                        "aria-hidden": "true",
                    }),
                    React.createElement(
                        "span",
                        { className: "context-menu-label" },
                        props.i18n.t("updateWorkingCopyToThisRevision")
                    )
                ),
                React.createElement(
                    "button",
                    {
                        className: "context-menu-item",
                        type: "button",
                        onClick: function () {
                            props.onAction("checkout-revision", entry);
                        },
                    },
                    React.createElement("span", {
                        className: "codicon codicon-repo-clone",
                        "aria-hidden": "true",
                    }),
                    React.createElement(
                        "span",
                        { className: "context-menu-label" },
                        props.i18n.t("checkoutToThisRevision")
                    )
                ),
                React.createElement(
                    "button",
                    {
                        className: "context-menu-item",
                        type: "button",
                        onClick: function () {
                            props.onAction("export-revision", entry);
                        },
                    },
                    React.createElement("span", {
                        className: "codicon codicon-folder-opened",
                        "aria-hidden": "true",
                    }),
                    React.createElement(
                        "span",
                        { className: "context-menu-label" },
                        props.i18n.t("exportThisRevision")
                    )
                ),
                React.createElement(
                    "button",
                    {
                        className: "context-menu-item",
                        type: "button",
                        onClick: function () {
                            props.onAction("export-patch", entry);
                        },
                    },
                    React.createElement("span", {
                        className: "codicon codicon-diff",
                        "aria-hidden": "true",
                    }),
                    React.createElement(
                        "span",
                        { className: "context-menu-label" },
                        props.i18n.t("exportRevisionPatch")
                    )
                ),
                React.createElement(
                    "button",
                    {
                        className: "context-menu-item",
                        type: "button",
                        onClick: function () {
                            props.onAction("compare-with-working-copy", entry);
                        },
                    },
                    React.createElement("span", {
                        className: "codicon codicon-diff",
                        "aria-hidden": "true",
                    }),
                    React.createElement(
                        "span",
                        { className: "context-menu-label" },
                        props.i18n.t("compareWithWorkingCopy")
                    )
                ),
                React.createElement(
                    "button",
                    {
                        className: "context-menu-item",
                        type: "button",
                        onClick: function () {
                            props.onAction("compare-with-previous-revision", entry);
                        },
                    },
                    React.createElement("span", {
                        className: "codicon codicon-git-compare",
                        "aria-hidden": "true",
                    }),
                    React.createElement(
                        "span",
                        { className: "context-menu-label" },
                        props.i18n.t("compareWithPreviousRevision")
                    )
                ),
                isIncomingEntry(entry)
                    ? null
                    : React.createElement(
                          React.Fragment,
                          null,
                          React.createElement(
                              "button",
                              {
                                  className: "context-menu-item",
                                  type: "button",
                                  onClick: function () {
                                      props.onAction("revert-to-revision", entry);
                                  },
                              },
                              React.createElement("span", {
                                  className: "codicon codicon-history",
                                  "aria-hidden": "true",
                              }),
                              React.createElement(
                                  "span",
                                  { className: "context-menu-label" },
                                  props.i18n.t("revertToThisRevision")
                              )
                          ),
                          React.createElement(
                              "button",
                              {
                                  className: "context-menu-item",
                                  type: "button",
                                  onClick: function () {
                                      props.onAction("revert-changes-from-revision", entry);
                                  },
                              },
                              React.createElement("span", {
                                  className: "codicon codicon-discard",
                                  "aria-hidden": "true",
                              }),
                              React.createElement(
                                  "span",
                                  { className: "context-menu-label" },
                                  props.i18n.t("revertChangesFromThisRevision")
                              )
                          )
                      ),
                React.createElement("div", {
                    className: "context-menu-separator",
                    "aria-hidden": "true",
                }),
                React.createElement(
                    "button",
                    {
                        className: "context-menu-item",
                        type: "button",
                        onClick: function () {
                            props.onAction("create-branch", entry);
                        },
                    },
                    React.createElement("span", {
                        className: "codicon codicon-git-branch",
                        "aria-hidden": "true",
                    }),
                    React.createElement(
                        "span",
                        { className: "context-menu-label" },
                        props.i18n.t("createBranchFromThisRevision")
                    )
                ),
                React.createElement(
                    "button",
                    {
                        className: "context-menu-item",
                        type: "button",
                        onClick: function () {
                            props.onAction("create-tag", entry);
                        },
                    },
                    React.createElement("span", {
                        className: "codicon codicon-tag",
                        "aria-hidden": "true",
                    }),
                    React.createElement(
                        "span",
                        { className: "context-menu-label" },
                        props.i18n.t("createTagFromThisRevision")
                    )
                ),
                React.createElement("div", {
                    className: "context-menu-separator",
                    "aria-hidden": "true",
                }),
                React.createElement(
                    "button",
                    {
                        className: "context-menu-item",
                        type: "button",
                        onClick: function () {
                            props.onAction("copy-revision", entry);
                        },
                    },
                    React.createElement("span", {
                        className: "codicon codicon-copy",
                        "aria-hidden": "true",
                    }),
                    React.createElement(
                        "span",
                        { className: "context-menu-label" },
                        props.i18n.t("copyRevisionNumber")
                    )
                ),
                React.createElement(
                    "button",
                    {
                        className: "context-menu-item",
                        type: "button",
                        onClick: function () {
                            props.onAction("copy-message", entry);
                        },
                    },
                    React.createElement("span", {
                        className: "codicon codicon-note",
                        "aria-hidden": "true",
                    }),
                    React.createElement(
                        "span",
                        { className: "context-menu-label" },
                        props.i18n.t("copyCommitMessage")
                    )
                ),
                React.createElement(
                    "button",
                    {
                        className: "context-menu-item",
                        type: "button",
                        onClick: function () {
                            props.onAction("copy-changed-paths", entry);
                        },
                    },
                    React.createElement("span", {
                        className: "codicon codicon-list-unordered",
                        "aria-hidden": "true",
                    }),
                    React.createElement(
                        "span",
                        { className: "context-menu-label" },
                        props.i18n.t("copyChangedPaths")
                    )
                )
            )
        )
    );
}
