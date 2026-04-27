import React from "react";
import { createRoot } from "react-dom/client";
import { DayPicker } from "react-day-picker";
import { enUS, zhCN } from "react-day-picker/locale";
import {
    areHistoryFiltersEqual,
    hasActiveHistoryFilters,
    hasInvalidHistoryDateRange,
    normalizeHistoryFilters,
} from "./history-utils";
import { ContextMenu } from "./history-webview-context-menu";
import { CommitItem, HistoryFooter } from "./history-webview-list";
import {
    countActiveHistoryFilters,
    createEmptyHistoryFilterForm,
    createHistoryFilterForm,
    formatHistoryDateValue,
    getEstimatedHistoryItemHeight,
    getHistoryItemLayoutKey,
    getMenuPosition,
    historyFooterHeightEstimatePx,
    historyOverscanPx,
    isHistoryConfigMessage,
    isHistoryDataMessage,
    isHistoryErrorMessage,
    isIncomingEntry,
    parseHistoryDateValue,
} from "./history-webview-utils";
import type { SvnHistoryFilters } from "../svn/svn-types";
import {
    createI18n,
} from "../i18n";
import type {
    ContextActionType,
    FileContextActionType,
    HistoryBootstrap,
    HistoryChange,
    HistoryDateFieldKey,
    HistoryEntry,
    HistoryFilterFormState,
    HistoryState,
    MeasuredHistoryItemSize,
    VirtualizedHistoryLayoutItem,
} from "./history-webview-types";

(function () {
    const vscode = acquireVsCodeApi();
    const bootstrap: HistoryBootstrap = window.__SVN_HISTORY_BOOTSTRAP__ ?? {
        repositoryLabel: "",
        rootPath: "",
        locale: "en",
        platform: "unknown",
    };
    const h = React.createElement;

    function HistoryApp(): React.ReactElement {
        const historyListRef = React.useRef<HTMLDivElement | null>(null);
        const dateFromFieldRef = React.useRef<HTMLDivElement | null>(null);
        const dateToFieldRef = React.useRef<HTMLDivElement | null>(null);
        const measuredHistoryItemsRef = React.useRef<Record<number, MeasuredHistoryItemSize>>(
            {}
        );
        const [state, setState] = React.useState<HistoryState>({
            entries: [],
            hasMore: true,
            isLoading: true,
            currentRevision: undefined,
            nextBeforeRevision: undefined,
            loadMoreError: undefined,
            expandedRevision: undefined,
            collapsedDirectories: {},
            contextMenu: undefined,
            localQuery: "",
            appliedFilters: normalizeHistoryFilters(),
            draftFilters: createEmptyHistoryFilterForm(),
            filtersOpen: false,
            filterError: undefined,
            activeDatePicker: undefined,
            repositoryLabel: bootstrap.repositoryLabel,
            rootPath: bootstrap.rootPath,
            locale: bootstrap.locale,
            platform: bootstrap.platform,
        });
        const [, refreshHistoryLayout] = React.useState(0);
        const [footerHeight, setFooterHeight] = React.useState(
            historyFooterHeightEstimatePx
        );
        const [virtualViewport, setVirtualViewport] = React.useState({
            scrollTop: 0,
            viewportHeight: 0,
        });
        const i18n = createI18n(state.locale);
        const dayPickerLocale = state.locale === "zh-CN" ? zhCN : enUS;
        const selectedDateFrom = parseHistoryDateValue(state.draftFilters.dateFrom);
        const selectedDateTo = parseHistoryDateValue(state.draftFilters.dateTo);

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
            vscode.postMessage({
                type: "ready",
                filters: normalizeHistoryFilters(state.appliedFilters),
            });
        }, []);

        React.useEffect(function () {
            const historyList = historyListRef.current;
            if (!historyList) {
                return;
            }
            const measuredHistoryList: HTMLDivElement = historyList;

            function syncViewport(): void {
                setVirtualViewport(function (previous) {
                    const nextScrollTop = measuredHistoryList.scrollTop;
                    const nextViewportHeight = measuredHistoryList.clientHeight;

                    if (
                        previous.scrollTop === nextScrollTop &&
                        previous.viewportHeight === nextViewportHeight
                    ) {
                        return previous;
                    }

                    return {
                        scrollTop: nextScrollTop,
                        viewportHeight: nextViewportHeight,
                    };
                });
            }

            syncViewport();

            if (typeof ResizeObserver === "undefined") {
                window.addEventListener("resize", syncViewport);
                return function () {
                    window.removeEventListener("resize", syncViewport);
                };
            }

            const observer = new ResizeObserver(syncViewport);
            observer.observe(historyList);

            return function () {
                observer.disconnect();
            };
        }, []);

        const searchQuery = state.localQuery.trim();
        const normalizedQuery = searchQuery.toLowerCase();
        const activeFilterCount = countActiveHistoryFilters(state.appliedFilters);
        const hasAppliedFilters = hasActiveHistoryFilters(state.appliedFilters);

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

        function updateFooterHeight(nextHeight: number): void {
            if (!Number.isFinite(nextHeight) || nextHeight < 1) {
                return;
            }

            setFooterHeight(function (previous) {
                return previous === nextHeight ? previous : nextHeight;
            });
        }

        function updateMeasuredHistoryItem(
            revision: number,
            layoutKey: string,
            height: number
        ): void {
            if (!Number.isFinite(height) || height < 1) {
                return;
            }

            const nextHeight = Math.ceil(height);
            const previousMeasurement = measuredHistoryItemsRef.current[revision];
            if (
                previousMeasurement?.layoutKey === layoutKey &&
                previousMeasurement.height === nextHeight
            ) {
                return;
            }

            measuredHistoryItemsRef.current[revision] = {
                height: nextHeight,
                layoutKey: layoutKey,
            };
            refreshHistoryLayout(function (previous) {
                return previous + 1;
            });
        }

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
            if (state.isLoading || !state.hasMore) {
                return;
            }

            const beforeRevision = state.nextBeforeRevision;
            if (
                typeof beforeRevision !== "number" ||
                !Number.isFinite(beforeRevision) ||
                beforeRevision < 1
            ) {
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
                filters: normalizeHistoryFilters(state.appliedFilters),
            });
        }

        function requestRefresh(
            nextFilters: SvnHistoryFilters = state.appliedFilters,
            options: {
                replaceEntries?: boolean;
                closeFilters?: boolean;
                syncDraftFilters?: boolean;
            } = {}
        ) {
            const normalizedFilters = normalizeHistoryFilters(nextFilters);
            setState(function (previous) {
                return {
                    ...previous,
                    entries: options.replaceEntries === true ? [] : previous.entries,
                    isLoading: true,
                    hasMore: true,
                    nextBeforeRevision: undefined,
                    loadMoreError: undefined,
                    contextMenu: undefined,
                    filterError: undefined,
                    activeDatePicker: undefined,
                    filtersOpen:
                        options.closeFilters === true ? false : previous.filtersOpen,
                    appliedFilters: normalizedFilters,
                    draftFilters:
                        options.syncDraftFilters === true
                            ? createHistoryFilterForm(normalizedFilters)
                            : previous.draftFilters,
                };
            });
            vscode.postMessage({
                type: "refresh",
                filters: normalizedFilters,
            });
        }

        function updateDraftFilter(
            key: keyof HistoryFilterFormState,
            value: string
        ): void {
            setState(function (previous) {
                return {
                    ...previous,
                    draftFilters: {
                        ...previous.draftFilters,
                        [key]: value,
                    },
                    filterError: undefined,
                };
            });
        }

        function toggleFiltersOpen(): void {
            setState(function (previous) {
                return {
                    ...previous,
                    filtersOpen: !previous.filtersOpen,
                    activeDatePicker: undefined,
                    contextMenu: undefined,
                };
            });
        }

        function closeDatePicker(): void {
            setState(function (previous) {
                if (!previous.activeDatePicker) {
                    return previous;
                }

                return {
                    ...previous,
                    activeDatePicker: undefined,
                };
            });
        }

        function toggleDatePicker(field: HistoryDateFieldKey): void {
            setState(function (previous) {
                return {
                    ...previous,
                    activeDatePicker:
                        previous.activeDatePicker === field ? undefined : field,
                };
            });
        }

        function selectDateFromPicker(
            field: HistoryDateFieldKey,
            date: Date | undefined
        ): void {
            updateDraftFilter(field, formatHistoryDateValue(date));
            setState(function (previous) {
                return {
                    ...previous,
                    activeDatePicker: undefined,
                };
            });
        }

        function applyHistoryFilters(): void {
            const nextFilters = normalizeHistoryFilters(state.draftFilters);
            if (hasInvalidHistoryDateRange(nextFilters)) {
                setState(function (previous) {
                    return {
                        ...previous,
                        filterError: i18n.t("historyFilterInvalidDateRange"),
                    };
                });
                return;
            }

            requestRefresh(nextFilters, {
                replaceEntries: !areHistoryFiltersEqual(
                    nextFilters,
                    state.appliedFilters
                ),
                closeFilters: true,
                syncDraftFilters: true,
            });
        }

        function clearHistoryFilters(): void {
            const emptyFilters = normalizeHistoryFilters();
            const filtersChanged = !areHistoryFiltersEqual(
                emptyFilters,
                state.appliedFilters
            );

            setState(function (previous) {
                return {
                    ...previous,
                    draftFilters: createEmptyHistoryFilterForm(),
                    filterError: undefined,
                    activeDatePicker: undefined,
                };
            });

            if (filtersChanged) {
                requestRefresh(emptyFilters, {
                    replaceEntries: true,
                    syncDraftFilters: true,
                });
            }
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
                            nextBeforeRevision: data.payload.nextBeforeRevision,
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
                            nextBeforeRevision: undefined,
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
                closeDatePicker();
            }

            function handleKeydown(event: KeyboardEvent): void {
                if (event.key === "Escape") {
                    hideContextMenu();
                    closeDatePicker();
                }
            }

            function handleMouseDown(event: MouseEvent): void {
                const activeField =
                    state.activeDatePicker === "dateFrom"
                        ? dateFromFieldRef.current
                        : state.activeDatePicker === "dateTo"
                          ? dateToFieldRef.current
                          : null;
                if (!activeField) {
                    return;
                }

                if (event.target instanceof Node && activeField.contains(event.target)) {
                    return;
                }

                closeDatePicker();
            }

            window.addEventListener("message", handleMessage);
            window.addEventListener("resize", handleResize);
            window.addEventListener("keydown", handleKeydown);
            window.addEventListener("mousedown", handleMouseDown);

            return function () {
                window.removeEventListener("message", handleMessage);
                window.removeEventListener("resize", handleResize);
                window.removeEventListener("keydown", handleKeydown);
                window.removeEventListener("mousedown", handleMouseDown);
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
            const key = String(revision) + ":" + String(fullPath);
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

        function toggleExpandedRevision(revision: number): void {
            setState(function (previous) {
                return {
                    ...previous,
                    expandedRevision:
                        previous.expandedRevision === revision ? undefined : revision,
                    contextMenu: undefined,
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

        function renderDateFilterField(
            field: HistoryDateFieldKey,
            label: string,
            value: string,
            selectedDate: Date | undefined,
            ref: React.RefObject<HTMLDivElement | null>
        ): React.ReactElement {
            const isOpen = state.activeDatePicker === field;

            return h(
                "label",
                {
                    className: "filter-field filter-date-field" + (isOpen ? " is-open" : ""),
                    ref: ref,
                },
                h("span", { className: "filter-label" }, label),
                h(
                    "div",
                    { className: "filter-date-input" },
                    h("input", {
                        className: "filter-input",
                        type: "text",
                        inputMode: "numeric",
                        placeholder: "YYYY-MM-DD",
                        value: value,
                        onChange: function (event: React.ChangeEvent<HTMLInputElement>) {
                            updateDraftFilter(field, event.currentTarget.value);
                        },
                        onKeyDown: function (event: React.KeyboardEvent<HTMLInputElement>) {
                            if (event.key === "ArrowDown" || event.key === "Enter") {
                                event.preventDefault();
                                toggleDatePicker(field);
                            }
                        },
                    }),
                    h(
                        "button",
                        {
                            className: "filter-date-button",
                            type: "button",
                            title: i18n.t("openDatePicker"),
                            "aria-label": label + ": " + i18n.t("openDatePicker"),
                            "aria-expanded": isOpen,
                            onClick: function () {
                                toggleDatePicker(field);
                            },
                        },
                        h("span", {
                            className: "codicon codicon-calendar",
                            "aria-hidden": "true",
                        })
                    )
                ),
                isOpen
                    ? h(
                          "div",
                          { className: "filter-date-popover" },
                          h(DayPicker, {
                              mode: "single",
                              selected: selectedDate,
                              onSelect: function (date: Date | undefined) {
                                  selectDateFromPicker(field, date);
                              },
                              defaultMonth: selectedDate ?? new Date(),
                              locale: dayPickerLocale,
                              navLayout: "around",
                              showOutsideDays: true,
                              fixedWeeks: true,
                          })
                      )
                    : null
            );
        }

        function renderFooter(
            layoutStyle?: React.CSSProperties,
            onHeightChange?: (height: number) => void
        ): React.ReactElement {
            return h(HistoryFooter, {
                i18n: i18n,
                hasMore: state.hasMore,
                isLoading: state.isLoading,
                loadMoreError: state.loadMoreError,
                layoutStyle,
                onRequestMore: requestMoreEntries,
                onHeightChange,
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

            const viewportTop = Math.max(0, virtualViewport.scrollTop - historyOverscanPx);
            const viewportBottom =
                virtualViewport.scrollTop +
                Math.max(virtualViewport.viewportHeight, historyOverscanPx) +
                historyOverscanPx;
            const visibleItems: VirtualizedHistoryLayoutItem[] = [];
            let totalEntriesHeight = 0;

            for (let index = 0; index < filteredEntries.length; index += 1) {
                const entry = filteredEntries[index];
                const isExpanded = entry.revision === state.expandedRevision;
                const layoutKey = getHistoryItemLayoutKey(
                    entry.revision,
                    isExpanded,
                    state.collapsedDirectories
                );
                const measurement = measuredHistoryItemsRef.current[entry.revision];
                const height =
                    measurement?.layoutKey === layoutKey
                        ? measurement.height
                        : getEstimatedHistoryItemHeight(layoutKey);
                const offsetTop = totalEntriesHeight;
                const offsetBottom = offsetTop + height;

                if (offsetBottom >= viewportTop && offsetTop <= viewportBottom) {
                    visibleItems.push({
                        entry: entry,
                        index: index,
                        height: height,
                        offsetTop: offsetTop,
                        layoutKey: layoutKey,
                    });
                }

                totalEntriesHeight = offsetBottom;
            }

            return h(
                "div",
                {
                    className: "history-virtualized",
                    style: {
                        height: totalEntriesHeight + footerHeight + "px",
                    },
                },
                visibleItems.map(function (item) {
                    const incoming = isIncomingEntry(item.entry);

                    return h(CommitItem, {
                        key: item.entry.revision,
                        entry: item.entry,
                        i18n: i18n,
                        rootPath: state.rootPath,
                        searchQuery: searchQuery,
                        collapsedDirectories: state.collapsedDirectories,
                        currentRevision: state.currentRevision,
                        expandedRevision: state.expandedRevision,
                        isFirstInList: item.index === 0,
                        isLastInList: item.index === filteredEntries.length - 1,
                        topStemIncoming:
                            incoming || isIncomingEntry(filteredEntries[item.index - 1]),
                        bottomStemIncoming:
                            incoming || isIncomingEntry(filteredEntries[item.index + 1]),
                        layoutKey: item.layoutKey,
                        layoutStyle: {
                            top: item.offsetTop + "px",
                        },
                        onToggleDirectory: toggleDirectory,
                        onOpenRevisionContextMenu: openRevisionContextMenu,
                        onOpenFileContextMenu: openFileContextMenu,
                        onToggleExpandedRevision: toggleExpandedRevision,
                        onHeightChange: updateMeasuredHistoryItem,
                    });
                }),
                renderFooter(
                    {
                        left: "0",
                        right: "0",
                        top: totalEntriesHeight + "px",
                    },
                    updateFooterHeight
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
                                value: state.localQuery,
                                onChange: function (event: React.ChangeEvent<HTMLInputElement>) {
                                    const query = event.currentTarget.value;
                                    setState(function (previous) {
                                        return {
                                            ...previous,
                                            localQuery: query,
                                        };
                                    });
                                },
                            }),
                            h(
                                "button",
                                {
                                    className:
                                        "toolbar-button secondary" +
                                        (state.filtersOpen || hasAppliedFilters
                                            ? " is-active"
                                            : ""),
                                    type: "button",
                                    title: i18n.t("historyFiltersButton"),
                                    "aria-label": i18n.t("historyFiltersButton"),
                                    onClick: toggleFiltersOpen,
                                },
                                h("span", {
                                    className: "codicon codicon-filter",
                                    "aria-hidden": "true",
                                }),
                                h(
                                    "span",
                                    { className: "toolbar-button-label" },
                                    i18n.t("historyFiltersButton") +
                                        (activeFilterCount > 0
                                            ? ` (${activeFilterCount})`
                                            : "")
                                )
                            ),
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
                    state.filtersOpen
                        ? h(
                              "div",
                              { className: "filter-panel" },
                              h(
                                  "div",
                                  { className: "filter-grid" },
                                  h(
                                      "label",
                                      { className: "filter-field" },
                                      h(
                                          "span",
                                          { className: "filter-label" },
                                          i18n.t("historyFilterAuthorLabel")
                                      ),
                                      h("input", {
                                          className: "filter-input",
                                          type: "text",
                                          placeholder: i18n.t(
                                              "historyFilterAuthorPlaceholder"
                                          ),
                                          value: state.draftFilters.author,
                                          onChange: function (
                                              event: React.ChangeEvent<HTMLInputElement>
                                          ) {
                                              updateDraftFilter(
                                                  "author",
                                                  event.currentTarget.value
                                              );
                                          },
                                      })
                                  ),
                                  h(
                                      "label",
                                      { className: "filter-field" },
                                      h(
                                          "span",
                                          { className: "filter-label" },
                                          i18n.t("historyFilterMessageLabel")
                                      ),
                                      h("input", {
                                          className: "filter-input",
                                          type: "text",
                                          placeholder: i18n.t(
                                              "historyFilterMessagePlaceholder"
                                          ),
                                          value: state.draftFilters.message,
                                          onChange: function (
                                              event: React.ChangeEvent<HTMLInputElement>
                                          ) {
                                              updateDraftFilter(
                                                  "message",
                                                  event.currentTarget.value
                                              );
                                          },
                                      })
                                  ),
                                  h(
                                      "label",
                                      { className: "filter-field" },
                                      h(
                                          "span",
                                          { className: "filter-label" },
                                          i18n.t("historyFilterPathLabel")
                                      ),
                                      h("input", {
                                          className: "filter-input",
                                          type: "text",
                                          placeholder: i18n.t(
                                              "historyFilterPathPlaceholder"
                                          ),
                                          value: state.draftFilters.changedPath,
                                          onChange: function (
                                              event: React.ChangeEvent<HTMLInputElement>
                                          ) {
                                              updateDraftFilter(
                                                  "changedPath",
                                                  event.currentTarget.value
                                              );
                                          },
                                      })
                                  ),
                                  renderDateFilterField(
                                      "dateFrom",
                                      i18n.t("historyFilterDateFromLabel"),
                                      state.draftFilters.dateFrom,
                                      selectedDateFrom,
                                      dateFromFieldRef
                                  ),
                                  renderDateFilterField(
                                      "dateTo",
                                      i18n.t("historyFilterDateToLabel"),
                                      state.draftFilters.dateTo,
                                      selectedDateTo,
                                      dateToFieldRef
                                  )
                              ),
                              state.filterError
                                  ? h(
                                        "div",
                                        { className: "filter-error" },
                                        state.filterError
                                    )
                                  : null,
                              h(
                                  "div",
                                  { className: "filter-actions" },
                                  h(
                                      "button",
                                      {
                                          className: "filter-action-button secondary",
                                          type: "button",
                                          onClick: clearHistoryFilters,
                                      },
                                      h("span", {
                                          className: "codicon codicon-clear-all",
                                          "aria-hidden": "true",
                                      }),
                                      h(
                                          "span",
                                          { className: "filter-action-button-label" },
                                          i18n.t("clearFiltersButton")
                                      )
                                  ),
                                  h(
                                      "button",
                                      {
                                          className: "filter-action-button",
                                          type: "button",
                                          onClick: applyHistoryFilters,
                                      },
                                      h("span", {
                                          className: "codicon codicon-check",
                                          "aria-hidden": "true",
                                      }),
                                      h(
                                          "span",
                                          { className: "filter-action-button-label" },
                                          i18n.t("applyFiltersButton")
                                      )
                                  )
                              )
                          )
                        : null,
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
                            onScroll: function (event: React.UIEvent<HTMLDivElement>) {
                                const nextScrollTop = event.currentTarget.scrollTop;
                                const nextViewportHeight = event.currentTarget.clientHeight;
                                hideContextMenu();
                                setVirtualViewport(function (previous) {
                                    if (
                                        previous.scrollTop === nextScrollTop &&
                                        previous.viewportHeight === nextViewportHeight
                                    ) {
                                        return previous;
                                    }

                                    return {
                                        scrollTop: nextScrollTop,
                                        viewportHeight: nextViewportHeight,
                                    };
                                });
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
