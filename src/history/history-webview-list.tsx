import React from "react";
import type {
    CommitItemProps,
    HistoryFooterProps,
} from "./history-webview-types";
import { CommitDetails } from "./history-webview-tree";
import {
    formatDate,
    formatPathCount,
    isCurrentRevisionEntry,
    isIncomingEntry,
    renderHighlightedText,
    summarizeMessage,
} from "./history-webview-utils";

export function CommitItem(props: CommitItemProps): React.ReactElement {
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const entry = props.entry;
    const isExpanded = entry.revision === props.expandedRevision;
    const incoming = isIncomingEntry(entry);
    const isCurrentRevision = isCurrentRevisionEntry(entry, props.currentRevision);

    React.useEffect(
        function () {
            const element = containerRef.current;
            if (!element) {
                return;
            }
            const measuredElement: HTMLDivElement = element;

            let animationFrame = 0;

            function reportHeight(): void {
                const nextHeight = Math.ceil(measuredElement.getBoundingClientRect().height);
                if (nextHeight > 0) {
                    props.onHeightChange(entry.revision, props.layoutKey, nextHeight);
                }
            }

            reportHeight();

            if (typeof ResizeObserver === "undefined") {
                window.addEventListener("resize", reportHeight);
                return function () {
                    window.removeEventListener("resize", reportHeight);
                };
            }

            const observer = new ResizeObserver(function () {
                window.cancelAnimationFrame(animationFrame);
                animationFrame = window.requestAnimationFrame(reportHeight);
            });
            observer.observe(element);

            return function () {
                observer.disconnect();
                window.cancelAnimationFrame(animationFrame);
            };
        },
        [entry.revision, props.layoutKey]
    );

    return React.createElement(
        "div",
        {
            className: "history-virtual-item",
            style: props.layoutStyle,
            ref: containerRef,
        },
        React.createElement(
            "article",
            {
                className:
                    "commit" +
                    (isExpanded ? " expanded" : "") +
                    (incoming ? " incoming" : "") +
                    (isCurrentRevision ? " current" : "") +
                    (props.isFirstInList ? " is-first" : "") +
                    (props.isLastInList ? " is-last" : ""),
                "data-revision": entry.revision,
            },
            React.createElement(
                "div",
                {
                    className: "commit-row",
                    onClick: function () {
                        props.onToggleExpandedRevision(entry.revision);
                    },
                    onContextMenu: function (event: React.MouseEvent<HTMLDivElement>) {
                        event.preventDefault();
                        props.onOpenRevisionContextMenu(
                            entry.revision,
                            event.clientX,
                            event.clientY
                        );
                    },
                },
                React.createElement(
                    "div",
                    { className: "graph-column" },
                    React.createElement("span", {
                        className:
                            "graph-stem graph-stem-top" +
                            (props.topStemIncoming ? " graph-stem-incoming" : ""),
                        "aria-hidden": "true",
                    }),
                    React.createElement("span", {
                        className:
                            "graph-dot" +
                            (incoming ? " graph-dot-incoming" : "") +
                            (isCurrentRevision ? " graph-dot-current" : ""),
                        "aria-hidden": "true",
                    }),
                    React.createElement("span", {
                        className:
                            "graph-stem graph-stem-bottom" +
                            (props.bottomStemIncoming ? " graph-stem-incoming" : ""),
                        "aria-hidden": "true",
                    })
                ),
                React.createElement(
                    "div",
                    { className: "description-cell" },
                    React.createElement(
                        "div",
                        { className: "summary" },
                        React.createElement(
                            "span",
                            { className: "summary-message" },
                            renderHighlightedText(
                                summarizeMessage(entry.message, props.i18n),
                                props.searchQuery
                            )
                        ),
                        React.createElement("span", { className: "summary-separator" }, "\u2022"),
                        React.createElement(
                            "span",
                            { className: "summary-meta" },
                            formatPathCount(entry.changes.length, props.i18n)
                        ),
                        incoming
                            ? React.createElement(
                                  "span",
                                  { className: "summary-badge incoming" },
                                  props.i18n.t("incomingChange")
                              )
                            : null
                    )
                ),
                React.createElement(
                    "div",
                    { className: "cell-text muted" },
                    renderHighlightedText(formatDate(entry.date, props.i18n), props.searchQuery)
                ),
                React.createElement(
                    "div",
                    { className: "cell-text" },
                    renderHighlightedText(entry.author, props.searchQuery)
                ),
                React.createElement(
                    "div",
                    { className: "cell-text revision" },
                    renderHighlightedText("r" + String(entry.revision), props.searchQuery)
                )
            ),
            isExpanded
                ? React.createElement(CommitDetails, {
                      i18n: props.i18n,
                      entry: entry,
                      rootPath: props.rootPath,
                      focusedRepositoryPath: props.focusedRepositoryPath,
                      searchQuery: props.searchQuery,
                      collapsedDirectories: props.collapsedDirectories,
                      onToggleDirectory: props.onToggleDirectory,
                      onOpenFileContextMenu: props.onOpenFileContextMenu,
                  })
                : null
        )
    );
}

export function HistoryFooter(props: HistoryFooterProps): React.ReactElement {
    const footerRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(
        function () {
            if (!props.onHeightChange) {
                return;
            }

            const element = footerRef.current;
            if (!element) {
                return;
            }
            const measuredElement: HTMLDivElement = element;

            let animationFrame = 0;

            function reportHeight(): void {
                const nextHeight = Math.ceil(measuredElement.getBoundingClientRect().height);
                if (nextHeight > 0) {
                    props.onHeightChange?.(nextHeight);
                }
            }

            reportHeight();

            if (typeof ResizeObserver === "undefined") {
                window.addEventListener("resize", reportHeight);
                return function () {
                    window.removeEventListener("resize", reportHeight);
                };
            }

            const observer = new ResizeObserver(function () {
                window.cancelAnimationFrame(animationFrame);
                animationFrame = window.requestAnimationFrame(reportHeight);
            });
            observer.observe(element);

            return function () {
                observer.disconnect();
                window.cancelAnimationFrame(animationFrame);
            };
        },
        [props.hasMore, props.isLoading, props.loadMoreError]
    );

    if (props.isLoading) {
        return React.createElement(
            "div",
            {
                className: "history-footer",
                style: props.layoutStyle,
                ref: footerRef,
            },
            React.createElement(
                "span",
                { className: "history-footer-text" },
                props.i18n.t("loadingMoreHistory")
            )
        );
    }

    if (props.loadMoreError) {
        return React.createElement(
            "div",
            {
                className: "history-footer",
                style: props.layoutStyle,
                ref: footerRef,
            },
            React.createElement(
                "button",
                {
                    className: "secondary",
                    type: "button",
                    onClick: props.onRequestMore,
                },
                props.i18n.t("retryLoadingOlderRevisions")
            )
        );
    }

    if (props.hasMore) {
        return React.createElement(
            "div",
            {
                className: "history-footer",
                style: props.layoutStyle,
                ref: footerRef,
            },
            React.createElement(
                "button",
                {
                    className: "secondary",
                    type: "button",
                    onClick: props.onRequestMore,
                },
                props.i18n.t("loadOlderRevisions")
            )
        );
    }

    return React.createElement(
        "div",
        {
            className: "history-footer",
            style: props.layoutStyle,
            ref: footerRef,
        },
        React.createElement(
            "span",
            { className: "history-footer-text" },
            props.i18n.t("allHistoryLoaded")
        )
    );
}
