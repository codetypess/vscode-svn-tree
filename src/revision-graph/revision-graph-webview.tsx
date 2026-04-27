import React from "react";
import { createRoot } from "react-dom/client";
import { DayPicker } from "react-day-picker";
import { enUS, zhCN } from "react-day-picker/locale";
import { createI18n } from "../i18n";
import {
    formatHistoryDateValue,
    getMenuPosition,
    parseHistoryDateValue,
} from "../history/history-webview-utils";
import type {
    RevisionGraphBootstrap,
    RevisionGraphData,
    RevisionGraphEdge,
    RevisionGraphFilters,
    RevisionGraphNode,
    RevisionGraphQuery,
    RevisionGraphRequestMessage,
    RevisionGraphResponseMessage,
} from "./revision-graph-types";

declare global {
    interface Window {
        __SVN_REVISION_GRAPH_BOOTSTRAP__?: RevisionGraphBootstrap;
    }
}

interface VsCodeApi {
    postMessage(message: RevisionGraphRequestMessage): void;
}

interface EdgeLayout {
    id: string;
    edge: RevisionGraphEdge;
    path: string;
    labelX: number;
    labelY: number;
}

interface GraphColumn {
    index: number;
    nodes: RevisionGraphNode[];
}

interface FilterFormState {
    author: string;
    dateFrom: string;
    dateTo: string;
    revisionFrom: string;
    revisionTo: string;
}

interface ContextMenuState {
    x: number;
    y: number;
    node?: RevisionGraphNode;
    edge?: RevisionGraphEdge;
}

type RevisionGraphDateFieldKey = "dateFrom" | "dateTo";

interface HoverCardState {
    x: number;
    y: number;
    title: string;
    lines: string[];
}

interface GraphState {
    locale: RevisionGraphBootstrap["locale"];
    scopeLabel: string;
    graph?: RevisionGraphData;
    loading: boolean;
    error?: string;
    searchQuery: string;
    draftFilters: FilterFormState;
    compareSourceId?: string;
    contextMenu?: ContextMenuState;
    hoverCard?: HoverCardState;
    filterError?: string;
    activeDatePicker?: RevisionGraphDateFieldKey;
}

function createEmptyFilterForm(): FilterFormState {
    return {
        author: "",
        dateFrom: "",
        dateTo: "",
        revisionFrom: "",
        revisionTo: "",
    };
}

function createFilterForm(filters?: RevisionGraphFilters): FilterFormState {
    return {
        author: filters?.author ?? "",
        dateFrom: filters?.dateFrom ?? "",
        dateTo: filters?.dateTo ?? "",
        revisionFrom: filters?.revisionFrom ? String(filters.revisionFrom) : "",
        revisionTo: filters?.revisionTo ? String(filters.revisionTo) : "",
    };
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isGraphDataMessage(
    data: unknown
): data is Extract<RevisionGraphResponseMessage, { type: "graph-data" }> {
    return (
        isObject(data) &&
        data.type === "graph-data" &&
        isObject(data.payload) &&
        Array.isArray(data.payload.nodes) &&
        Array.isArray(data.payload.edges)
    );
}

function isGraphErrorMessage(
    data: unknown
): data is Extract<RevisionGraphResponseMessage, { type: "graph-error" }> {
    return (
        isObject(data) &&
        data.type === "graph-error" &&
        isObject(data.payload) &&
        typeof data.payload.message === "string"
    );
}

function isGraphConfigMessage(
    data: unknown
): data is Extract<RevisionGraphResponseMessage, { type: "graph-config" }> {
    return (
        isObject(data) &&
        data.type === "graph-config" &&
        isObject(data.payload) &&
        (data.payload.locale === "en" || data.payload.locale === "zh-CN")
    );
}

function formatDate(locale: string, value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}

function normalizePositiveInteger(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return undefined;
    }

    return Math.floor(parsed);
}

function normalizeDraftFilters(form: FilterFormState): RevisionGraphFilters {
    const author = form.author.trim();
    const dateFrom = form.dateFrom.trim();
    const dateTo = form.dateTo.trim();
    return {
        author: author || undefined,
        dateFrom: /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? dateFrom : undefined,
        dateTo: /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? dateTo : undefined,
        revisionFrom: normalizePositiveInteger(form.revisionFrom),
        revisionTo: normalizePositiveInteger(form.revisionTo),
    };
}

function hasInvalidFilterRange(filters: RevisionGraphFilters): boolean {
    if (
        filters.revisionFrom !== undefined &&
        filters.revisionTo !== undefined &&
        filters.revisionFrom > filters.revisionTo
    ) {
        return true;
    }

    if (!filters.dateFrom || !filters.dateTo) {
        return false;
    }

    return new Date(`${filters.dateFrom}T00:00:00`).getTime() >
        new Date(`${filters.dateTo}T23:59:59`).getTime();
}

function countActiveFilters(filters: RevisionGraphFilters | undefined): number {
    if (!filters) {
        return 0;
    }

    return [
        filters.author,
        filters.dateFrom,
        filters.dateTo,
        filters.revisionFrom,
        filters.revisionTo,
    ].filter((value) => value !== undefined && value !== "").length;
}

function compareNodeOrder(left: RevisionGraphNode, right: RevisionGraphNode): number {
    if (left.current !== right.current) {
        return left.current ? -1 : 1;
    }

    if (left.selected !== right.selected) {
        return left.selected ? -1 : 1;
    }

    return left.label.localeCompare(right.label);
}

function getNodeSearchText(node: RevisionGraphNode): string {
    return [
        node.label,
        node.detail,
        node.repositoryPath,
        node.url,
        node.createdAuthor,
        node.lockOwner,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

function buildGraphColumns(graph: RevisionGraphData | undefined): GraphColumn[] {
    if (!graph || graph.nodes.length === 0) {
        return [];
    }

    const copyEdges = graph.edges.filter((edge) => edge.kind === "copy");
    const parentsByNode = new Map<string, string[]>();
    for (const node of graph.nodes) {
        parentsByNode.set(node.id, []);
    }

    for (const edge of copyEdges) {
        const parents = parentsByNode.get(edge.targetId);
        if (parents) {
            parents.push(edge.sourceId);
        }
    }

    const levelCache = new Map<string, number>();
    const visiting = new Set<string>();

    function getNodeLevel(nodeId: string): number {
        const cached = levelCache.get(nodeId);
        if (cached !== undefined) {
            return cached;
        }

        if (visiting.has(nodeId)) {
            return 0;
        }

        visiting.add(nodeId);
        const parents = parentsByNode.get(nodeId) ?? [];
        const level =
            parents.length === 0
                ? 0
                : parents.reduce((maxLevel, parentId) => {
                      return Math.max(maxLevel, getNodeLevel(parentId) + 1);
                  }, 0);
        visiting.delete(nodeId);
        levelCache.set(nodeId, level);
        return level;
    }

    const nodesByLevel = new Map<number, RevisionGraphNode[]>();
    for (const node of graph.nodes) {
        const level = getNodeLevel(node.id);
        const nodes = nodesByLevel.get(level) ?? [];
        nodes.push(node);
        nodesByLevel.set(level, nodes);
    }

    const levels = [...nodesByLevel.keys()].sort((left, right) => left - right);
    const nodeOrder = new Map<string, number>();
    const columns: GraphColumn[] = [];

    for (const level of levels) {
        const nodes = [...(nodesByLevel.get(level) ?? [])];
        nodes.sort((left, right) => {
            const leftParents = parentsByNode.get(left.id) ?? [];
            const rightParents = parentsByNode.get(right.id) ?? [];

            const leftBarycenter =
                leftParents.length === 0
                    ? Number.POSITIVE_INFINITY
                    : leftParents.reduce((sum, parentId) => sum + (nodeOrder.get(parentId) ?? 0), 0) /
                      leftParents.length;
            const rightBarycenter =
                rightParents.length === 0
                    ? Number.POSITIVE_INFINITY
                    : rightParents.reduce(
                          (sum, parentId) => sum + (nodeOrder.get(parentId) ?? 0),
                          0
                      ) / rightParents.length;

            if (leftBarycenter !== rightBarycenter) {
                return leftBarycenter - rightBarycenter;
            }

            return compareNodeOrder(left, right);
        });

        nodes.forEach((node, index) => {
            nodeOrder.set(node.id, index);
        });
        columns.push({
            index: level,
            nodes,
        });
    }

    return columns;
}

function buildGraphSummaryText(graph: RevisionGraphData): string {
    const lines = [
        graph.scopeLabel,
        `Layout Root: ${graph.layoutRootPath}`,
        `Selected: ${graph.selectedRepositoryPath}`,
        `Nodes: ${graph.nodes.length}`,
        `Edges: ${graph.edges.length}`,
        `Loaded Revisions: ${graph.scannedEntryCount}`,
        "",
        "Nodes:",
        ...graph.nodes.map((node) => {
            const badges = [
                node.current ? "current" : "",
                node.selected ? "selected" : "",
                node.localChangeCount ? `local:${node.localChangeCount}` : "",
                node.incomingChangeCount ? `incoming:${node.incomingChangeCount}` : "",
                node.lockOwner ? `lock:${node.lockOwner}` : "",
            ].filter(Boolean);
            return `- ${node.label} ${node.repositoryPath}${
                badges.length > 0 ? ` [${badges.join(", ")}]` : ""
            }`;
        }),
        "",
        "Edges:",
        ...graph.edges.map((edge) => {
            return `- ${edge.sourceRepositoryPath} -> ${edge.targetRepositoryPath} (${
                edge.kind === "mergeinfo"
                    ? edge.revisionRange ?? `r${edge.revision}`
                    : `r${edge.revision}`
            })`;
        }),
    ];

    return lines.join("\n");
}

(function () {
    const vscode = acquireVsCodeApi() as VsCodeApi;
    const bootstrap = window.__SVN_REVISION_GRAPH_BOOTSTRAP__ ?? {
        scopeLabel: "",
        locale: "en" as const,
    };

    function RevisionGraphApp(): React.ReactElement {
        const [state, setState] = React.useState<GraphState>({
            locale: bootstrap.locale,
            scopeLabel: bootstrap.scopeLabel,
            loading: true,
            searchQuery: "",
            draftFilters: createEmptyFilterForm(),
            activeDatePicker: undefined,
        });
        const surfaceRef = React.useRef<HTMLDivElement | null>(null);
        const nodeRefs = React.useRef<Record<string, HTMLElement | null>>({});
        const dateFromFieldRef = React.useRef<HTMLLabelElement | null>(null);
        const dateToFieldRef = React.useRef<HTMLLabelElement | null>(null);
        const [edgeLayout, setEdgeLayout] = React.useState<EdgeLayout[]>([]);
        const i18n = createI18n(state.locale);
        const graph = state.graph;
        const dayPickerLocale = state.locale === "zh-CN" ? zhCN : enUS;
        const selectedDateFrom = parseHistoryDateValue(state.draftFilters.dateFrom);
        const selectedDateTo = parseHistoryDateValue(state.draftFilters.dateTo);

        const normalizedSearchQuery = state.searchQuery.trim().toLowerCase();
        const visibleNodes = React.useMemo(() => {
            if (!graph) {
                return [];
            }

            if (!normalizedSearchQuery) {
                return graph.nodes;
            }

            return graph.nodes.filter((node) =>
                getNodeSearchText(node).includes(normalizedSearchQuery)
            );
        }, [graph, normalizedSearchQuery]);
        const visibleNodeIds = React.useMemo(
            () => new Set(visibleNodes.map((node) => node.id)),
            [visibleNodes]
        );
        const visibleGraph = React.useMemo<RevisionGraphData | undefined>(() => {
            if (!graph) {
                return undefined;
            }

            return {
                ...graph,
                nodes: visibleNodes,
                edges: graph.edges.filter(
                    (edge) =>
                        visibleNodeIds.has(edge.sourceId) && visibleNodeIds.has(edge.targetId)
                ),
            };
        }, [graph, visibleNodeIds, visibleNodes]);
        const columns = React.useMemo(() => buildGraphColumns(visibleGraph), [visibleGraph]);
        const compareSource =
            graph && state.compareSourceId
                ? graph.nodes.find((node) => node.id === state.compareSourceId)
                : undefined;
        const activeFilterCount = countActiveFilters(graph?.query.filters);

        React.useEffect(function () {
            vscode.postMessage({
                type: "ready",
            });
        }, []);

        React.useEffect(
            function () {
                function handleMessage(event: MessageEvent<unknown>): void {
                    const message = event.data;
                    if (isGraphDataMessage(message)) {
                        setState((previous) => ({
                            ...previous,
                            scopeLabel: message.payload.scopeLabel,
                            graph: message.payload,
                            loading: false,
                            error: undefined,
                            draftFilters: createFilterForm(message.payload.query.filters),
                            filterError: undefined,
                        }));
                        return;
                    }

                    if (isGraphErrorMessage(message)) {
                        setState((previous) => ({
                            ...previous,
                            loading: false,
                            error: message.payload.message,
                        }));
                        return;
                    }

                    if (isGraphConfigMessage(message)) {
                        setState((previous) => ({
                            ...previous,
                            locale: message.payload.locale,
                        }));
                    }
                }

                window.addEventListener("message", handleMessage);
                return function () {
                    window.removeEventListener("message", handleMessage);
                };
            },
            []
        );

        React.useEffect(function () {
            function closeDatePicker(): void {
                setState((previous) => {
                    if (!previous.activeDatePicker) {
                        return previous;
                    }

                    return {
                        ...previous,
                        activeDatePicker: undefined,
                    };
                });
            }

            function closeContextMenu(): void {
                setState((previous) => {
                    if (!previous.contextMenu) {
                        return previous;
                    }

                    return {
                        ...previous,
                        contextMenu: undefined,
                    };
                });
            }

            function handleResize(): void {
                closeContextMenu();
                closeDatePicker();
            }

            function handleKeydown(event: KeyboardEvent): void {
                if (event.key === "Escape") {
                    closeContextMenu();
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

            function handleClick(): void {
                closeContextMenu();
            }

            window.addEventListener("resize", handleResize);
            window.addEventListener("keydown", handleKeydown);
            window.addEventListener("mousedown", handleMouseDown);
            window.addEventListener("click", handleClick);

            return function () {
                window.removeEventListener("resize", handleResize);
                window.removeEventListener("keydown", handleKeydown);
                window.removeEventListener("mousedown", handleMouseDown);
                window.removeEventListener("click", handleClick);
            };
        });

        React.useEffect(
            function () {
                document.title = i18n.t("revisionGraphPanelTitle", {
                    label: state.scopeLabel,
                });
                document.documentElement.lang = state.locale;
            },
            [i18n, state.locale, state.scopeLabel]
        );

        React.useLayoutEffect(
            function () {
                const surface = surfaceRef.current;
                if (!surface || !visibleGraph) {
                    setEdgeLayout([]);
                    return;
                }
                const measuredSurface = surface;
                const measuredGraph = visibleGraph;

                function updateLayout(): void {
                    const nextLayout: EdgeLayout[] = [];
                    const surfaceRect = measuredSurface.getBoundingClientRect();

                    for (const edge of measuredGraph.edges) {
                        const sourceElement = nodeRefs.current[edge.sourceId];
                        const targetElement = nodeRefs.current[edge.targetId];
                        if (!sourceElement || !targetElement) {
                            continue;
                        }

                        const sourceRect = sourceElement.getBoundingClientRect();
                        const targetRect = targetElement.getBoundingClientRect();
                        const startX = sourceRect.right - surfaceRect.left;
                        const startY =
                            sourceRect.top - surfaceRect.top + sourceRect.height / 2;
                        const endX = targetRect.left - surfaceRect.left;
                        const endY = targetRect.top - surfaceRect.top + targetRect.height / 2;
                        const horizontalGap = Math.max(72, (endX - startX) / 2);
                        const verticalOffset = edge.kind === "mergeinfo" ? 18 : 0;

                        nextLayout.push({
                            id: edge.id,
                            edge,
                            path: `M ${startX} ${startY} C ${startX + horizontalGap} ${
                                startY + verticalOffset
                            }, ${endX - horizontalGap} ${endY + verticalOffset}, ${endX} ${endY}`,
                            labelX: (startX + endX) / 2,
                            labelY: (startY + endY) / 2 + verticalOffset,
                        });
                    }

                    setEdgeLayout(nextLayout);
                }

                updateLayout();

                if (typeof ResizeObserver === "undefined") {
                    window.addEventListener("resize", updateLayout);
                    return function () {
                        window.removeEventListener("resize", updateLayout);
                    };
                }

                const observer = new ResizeObserver(updateLayout);
                observer.observe(measuredSurface);
                for (const node of measuredGraph.nodes) {
                    const element = nodeRefs.current[node.id];
                    if (element) {
                        observer.observe(element);
                    }
                }

                return function () {
                    observer.disconnect();
                };
            },
            [visibleGraph, columns]
        );

        function setLoading(): void {
            setState((previous) => ({
                ...previous,
                loading: true,
                error: undefined,
                contextMenu: undefined,
                activeDatePicker: undefined,
            }));
        }

        function buildQuery(entryBudget?: number): RevisionGraphQuery {
            return {
                entryBudget,
                filters: normalizeDraftFilters(state.draftFilters),
            };
        }

        function requestGraph(type: "refresh" | "load-more", entryBudget?: number): void {
            const filters = normalizeDraftFilters(state.draftFilters);
            if (hasInvalidFilterRange(filters)) {
                setState((previous) => ({
                    ...previous,
                    filterError: i18n.t("revisionGraphInvalidFilters"),
                }));
                return;
            }

            setLoading();
            setState((previous) => ({
                ...previous,
                filterError: undefined,
            }));
            vscode.postMessage({
                type,
                query: buildQuery(entryBudget),
            });
        }

        function requestRefresh(): void {
            requestGraph("refresh", graph?.query.entryBudget);
        }

        function requestLoadMore(): void {
            const currentBudget = graph?.query.entryBudget ?? graph?.scannedEntryCount ?? 300;
            requestGraph("load-more", Math.min(5000, currentBudget + 300));
        }

        function toggleDatePicker(field: RevisionGraphDateFieldKey): void {
            setState((previous) => ({
                ...previous,
                activeDatePicker:
                    previous.activeDatePicker === field ? undefined : field,
            }));
        }

        function selectDateFromPicker(
            field: RevisionGraphDateFieldKey,
            date: Date | undefined
        ): void {
            setState((previous) => ({
                ...previous,
                draftFilters: {
                    ...previous.draftFilters,
                    [field]: formatHistoryDateValue(date),
                },
                activeDatePicker: undefined,
            }));
        }

        function clearFilters(): void {
            setState((previous) => ({
                ...previous,
                draftFilters: createEmptyFilterForm(),
                filterError: undefined,
                activeDatePicker: undefined,
            }));
            setLoading();
            vscode.postMessage({
                type: "refresh",
                query: {
                    entryBudget: graph?.query.entryBudget,
                    filters: {},
                },
            });
        }

        function runNodeAction(
            type: Extract<
                RevisionGraphRequestMessage["type"],
                | "open-history"
                | "open-browser"
                | "open-at-head"
                | "switch-reference"
                | "copy-path"
                | "copy-url"
                | "create-branch"
                | "create-tag"
                | "delete-reference"
            >,
            repositoryPath: string
        ): void {
            vscode.postMessage({
                type,
                repositoryPath,
            });
            setState((previous) => ({
                ...previous,
                contextMenu: undefined,
            }));
        }

        function runNodeComparison(
            type: "compare-references" | "diff-references",
            node: RevisionGraphNode
        ): void {
            if (!compareSource || compareSource.id === node.id) {
                return;
            }

            vscode.postMessage({
                type,
                sourceRepositoryPath: compareSource.repositoryPath,
                targetRepositoryPath: node.repositoryPath,
            });
            setState((previous) => ({
                ...previous,
                contextMenu: undefined,
            }));
        }

        function openEdgeRevision(edge: RevisionGraphEdge): void {
            vscode.postMessage({
                type: "open-edge-revision",
                revision: edge.revision,
                repositoryPath: edge.targetRepositoryPath,
            });
            setState((previous) => ({
                ...previous,
                contextMenu: undefined,
            }));
        }

        function showHoverCard(
            title: string,
            lines: string[],
            event: React.MouseEvent<HTMLElement | SVGElement>
        ): void {
            if (lines.length === 0) {
                return;
            }

            setState((previous) => ({
                ...previous,
                hoverCard: {
                    x: event.clientX + 14,
                    y: event.clientY + 14,
                    title,
                    lines,
                },
            }));
        }

        function moveHoverCard(
            event: React.MouseEvent<HTMLElement | SVGElement>
        ): void {
            setState((previous) => {
                if (!previous.hoverCard) {
                    return previous;
                }

                return {
                    ...previous,
                    hoverCard: {
                        ...previous.hoverCard,
                        x: event.clientX + 14,
                        y: event.clientY + 14,
                    },
                };
            });
        }

        function hideHoverCard(): void {
            setState((previous) => ({
                ...previous,
                hoverCard: undefined,
            }));
        }

        function openNodeContextMenu(
            node: RevisionGraphNode,
            event: React.MouseEvent<HTMLElement>
        ): void {
            event.preventDefault();
            const position = getMenuPosition(event.clientX, event.clientY);
            setState((previous) => ({
                ...previous,
                contextMenu: {
                    x: position.x,
                    y: position.y,
                    node,
                },
            }));
        }

        function openEdgeContextMenu(
            edge: RevisionGraphEdge,
            event: React.MouseEvent<SVGElement>
        ): void {
            event.preventDefault();
            const position = getMenuPosition(event.clientX, event.clientY);
            setState((previous) => ({
                ...previous,
                contextMenu: {
                    x: position.x,
                    y: position.y,
                    edge,
                },
            }));
        }

        function renderDateFilterField(
            field: RevisionGraphDateFieldKey,
            label: string,
            value: string,
            selectedDate: Date | undefined,
            ref: React.RefObject<HTMLLabelElement | null>
        ): React.ReactElement {
            const isOpen = state.activeDatePicker === field;

            return (
                <label
                    className={`filter-field filter-date-field${isOpen ? " is-open" : ""}`}
                    ref={ref}
                >
                    <span className="filter-label">{label}</span>
                    <div className="filter-date-input">
                        <input
                            className="filter-input"
                            type="text"
                            inputMode="numeric"
                            placeholder="YYYY-MM-DD"
                            value={value}
                            onChange={(event) =>
                                setState((previous) => ({
                                    ...previous,
                                    draftFilters: {
                                        ...previous.draftFilters,
                                        [field]: event.target.value,
                                    },
                                }))
                            }
                            onKeyDown={(event) => {
                                if (event.key === "ArrowDown" || event.key === "Enter") {
                                    event.preventDefault();
                                    toggleDatePicker(field);
                                }
                            }}
                        />
                        <button
                            className="filter-date-button"
                            type="button"
                            title={i18n.t("openDatePicker")}
                            aria-label={`${label}: ${i18n.t("openDatePicker")}`}
                            aria-expanded={isOpen}
                            onClick={(event) => {
                                event.stopPropagation();
                                toggleDatePicker(field);
                            }}
                        >
                            <span
                                className="codicon codicon-calendar"
                                aria-hidden="true"
                            />
                        </button>
                    </div>
                    {isOpen ? (
                        <div className="filter-date-popover">
                            <DayPicker
                                mode="single"
                                selected={selectedDate}
                                onSelect={(date) => selectDateFromPicker(field, date)}
                                defaultMonth={selectedDate ?? new Date()}
                                locale={dayPickerLocale}
                                navLayout="around"
                                showOutsideDays
                                fixedWeeks
                            />
                        </div>
                    ) : null}
                </label>
            );
        }

        function renderContextMenuItem(
            icon: string,
            label: string,
            onClick: () => void,
            danger = false
        ): React.ReactElement {
            return (
                <button
                    className={`context-menu-item${danger ? " danger" : ""}`}
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        onClick();
                    }}
                >
                    <span className={`codicon ${icon}`} aria-hidden="true" />
                    <span className="context-menu-label">{label}</span>
                </button>
            );
        }

        function copySummary(): void {
            if (!graph) {
                return;
            }

            vscode.postMessage({
                type: "copy-summary",
                summary: buildGraphSummaryText(graph),
            });
        }

        function exportSummary(): void {
            if (!graph) {
                return;
            }

            vscode.postMessage({
                type: "export-summary",
                summary: buildGraphSummaryText(graph),
                suggestedFileName: `${graph.scopeLabel.replace(/[^\w.-]+/g, "-")}-revision-graph`,
            });
        }

        return (
            <div className="revision-graph-app" onMouseLeave={hideHoverCard}>
                <header className="revision-graph-header">
                    <div className="revision-graph-header-copy">
                        <div className="revision-graph-kicker">
                            {i18n.t("revisionGraphPanelHeading")}
                        </div>
                        <h1 className="revision-graph-title">
                            {i18n.t("revisionGraphPanelTitle", {
                                label: state.scopeLabel,
                            })}
                        </h1>
                        <div className="revision-graph-meta">
                            {graph ? (
                                <>
                                    <span className="revision-graph-chip">
                                        {i18n.t("revisionGraphLayoutRootLabel", {
                                            path: graph.layoutRootPath,
                                        })}
                                    </span>
                                    <span className="revision-graph-chip">
                                        {i18n.t("revisionGraphScannedEntriesLabel", {
                                            count: graph.scannedEntryCount,
                                        })}
                                    </span>
                                    {activeFilterCount > 0 ? (
                                        <span className="revision-graph-chip">
                                            {i18n.t("revisionGraphActiveFiltersLabel", {
                                                count: activeFilterCount,
                                            })}
                                        </span>
                                    ) : null}
                                    {compareSource ? (
                                        <span className="revision-graph-chip">
                                            {i18n.t("revisionGraphCompareSourceLabel", {
                                                label: compareSource.label,
                                            })}
                                        </span>
                                    ) : null}
                                    {graph.truncated ? (
                                        <span className="revision-graph-chip warning">
                                            {i18n.t("revisionGraphTruncatedNotice")}
                                        </span>
                                    ) : null}
                                </>
                            ) : null}
                        </div>
                    </div>
                    <div className="revision-graph-header-actions">
                        <input
                            className="search"
                            type="search"
                            value={state.searchQuery}
                            placeholder={i18n.t("revisionGraphSearchPlaceholder")}
                            onChange={(event) =>
                                setState((previous) => ({
                                    ...previous,
                                    searchQuery: event.target.value,
                                }))
                            }
                        />
                        <button
                            className="toolbar-button secondary"
                            type="button"
                            onClick={copySummary}
                            disabled={!graph}
                        >
                            <span className="codicon codicon-copy" aria-hidden="true" />
                            <span className="toolbar-button-label">
                                {i18n.t("revisionGraphCopySummary")}
                            </span>
                        </button>
                        <button
                            className="toolbar-button secondary"
                            type="button"
                            onClick={exportSummary}
                            disabled={!graph}
                        >
                            <span className="codicon codicon-export" aria-hidden="true" />
                            <span className="toolbar-button-label">
                                {i18n.t("revisionGraphExportSummary")}
                            </span>
                        </button>
                        <button
                            className={`toolbar-button secondary${state.loading ? " is-active" : ""}`}
                            type="button"
                            onClick={requestRefresh}
                        >
                            <span
                                className={
                                    "codicon " +
                                    (state.loading
                                        ? "codicon-loading codicon-modifier-spin"
                                        : "codicon-refresh")
                                }
                                aria-hidden="true"
                            />
                            <span className="toolbar-button-label">
                                {i18n.t("refreshButton")}
                            </span>
                        </button>
                    </div>
                </header>

                <section className="filter-panel revision-graph-toolbar">
                    <div className="filter-grid revision-graph-filter-grid">
                        <label className="filter-field">
                            <span className="filter-label">{i18n.t("historyFilterAuthorLabel")}</span>
                            <input
                                className="filter-input"
                                type="text"
                                value={state.draftFilters.author}
                                placeholder={i18n.t("historyFilterAuthorPlaceholder")}
                                onChange={(event) =>
                                    setState((previous) => ({
                                        ...previous,
                                        draftFilters: {
                                            ...previous.draftFilters,
                                            author: event.target.value,
                                        },
                                    }))
                                }
                            />
                        </label>
                        {renderDateFilterField(
                            "dateFrom",
                            i18n.t("historyFilterDateFromLabel"),
                            state.draftFilters.dateFrom,
                            selectedDateFrom,
                            dateFromFieldRef
                        )}
                        {renderDateFilterField(
                            "dateTo",
                            i18n.t("historyFilterDateToLabel"),
                            state.draftFilters.dateTo,
                            selectedDateTo,
                            dateToFieldRef
                        )}
                        <label className="filter-field">
                            <span className="filter-label">
                                {i18n.t("revisionGraphRevisionFromLabel")}
                            </span>
                            <input
                                className="filter-input"
                                type="number"
                                min="1"
                                value={state.draftFilters.revisionFrom}
                                onChange={(event) =>
                                    setState((previous) => ({
                                        ...previous,
                                        draftFilters: {
                                            ...previous.draftFilters,
                                            revisionFrom: event.target.value,
                                        },
                                    }))
                                }
                            />
                        </label>
                        <label className="filter-field">
                            <span className="filter-label">
                                {i18n.t("revisionGraphRevisionToLabel")}
                            </span>
                            <input
                                className="filter-input"
                                type="number"
                                min="1"
                                value={state.draftFilters.revisionTo}
                                onChange={(event) =>
                                    setState((previous) => ({
                                        ...previous,
                                        draftFilters: {
                                            ...previous.draftFilters,
                                            revisionTo: event.target.value,
                                        },
                                    }))
                                }
                            />
                        </label>
                    </div>
                    {state.filterError ? (
                        <div className="filter-error revision-graph-inline-error">
                            {state.filterError}
                        </div>
                    ) : null}
                    <div className="filter-actions revision-graph-toolbar-actions">
                        {compareSource ? (
                            <button
                                className="filter-action-button secondary"
                                type="button"
                                onClick={() =>
                                    setState((previous) => ({
                                        ...previous,
                                        compareSourceId: undefined,
                                    }))
                                }
                            >
                                <span
                                    className="codicon codicon-close"
                                    aria-hidden="true"
                                />
                                <span className="filter-action-button-label">
                                    {i18n.t("revisionGraphClearCompareSource")}
                                </span>
                            </button>
                        ) : null}
                        <button
                            className="filter-action-button secondary"
                            type="button"
                            onClick={clearFilters}
                        >
                            <span className="codicon codicon-clear-all" aria-hidden="true" />
                            <span className="filter-action-button-label">
                                {i18n.t("clearFiltersButton")}
                            </span>
                        </button>
                        <button
                            className="filter-action-button"
                            type="button"
                            onClick={requestRefresh}
                        >
                            <span className="codicon codicon-check" aria-hidden="true" />
                            <span className="filter-action-button-label">
                                {i18n.t("applyFiltersButton")}
                            </span>
                        </button>
                    </div>
                </section>

                {state.error ? (
                    <section className="revision-graph-banner error">{state.error}</section>
                ) : null}
                {state.loading && !graph ? (
                    <section className="revision-graph-banner loading">
                        {i18n.t("revisionGraphLoading")}
                    </section>
                ) : null}
                {graph && visibleNodes.length === 0 ? (
                    <section className="revision-graph-banner empty">
                        {normalizedSearchQuery
                            ? i18n.t("revisionGraphNoSearchMatches")
                            : i18n.t("revisionGraphEmpty")}
                    </section>
                ) : null}

                {graph && visibleNodes.length > 0 ? (
                    <section className="revision-graph-surface" ref={surfaceRef}>
                        <svg
                            className="revision-graph-edges"
                            width="100%"
                            height="100%"
                            aria-hidden="true"
                        >
                            {edgeLayout.map((layout) => (
                                <g
                                    className={`revision-graph-edge kind-${layout.edge.kind}`}
                                    key={layout.id}
                                >
                                    <path
                                        className="revision-graph-edge-hit"
                                        d={layout.path}
                                        onClick={() => openEdgeRevision(layout.edge)}
                                        onContextMenu={(event) => openEdgeContextMenu(layout.edge, event)}
                                        onMouseEnter={(event) =>
                                            showHoverCard(
                                                `r${layout.edge.revision}`,
                                                layout.edge.hoverSummary ?? [],
                                                event
                                            )
                                        }
                                        onMouseMove={moveHoverCard}
                                        onMouseLeave={hideHoverCard}
                                    />
                                    <path
                                        className="revision-graph-edge-path"
                                        d={layout.path}
                                    />
                                    <text
                                        className="revision-graph-edge-label"
                                        x={layout.labelX}
                                        y={layout.labelY - 6}
                                        onClick={() => openEdgeRevision(layout.edge)}
                                        onContextMenu={(event) => openEdgeContextMenu(layout.edge, event)}
                                    >
                                        {layout.edge.kind === "mergeinfo"
                                            ? layout.edge.revisionRange ?? `r${layout.edge.revision}`
                                            : `r${layout.edge.revision}`}
                                    </text>
                                </g>
                            ))}
                        </svg>

                        <div className="revision-graph-columns">
                            {columns.map((column) => (
                                <div className="revision-graph-column" key={String(column.index)}>
                                    <div className="revision-graph-column-label">
                                        {i18n.t("revisionGraphColumnLabel", {
                                            level: column.index + 1,
                                        })}
                                    </div>
                                    {column.nodes.map((node) => (
                                        <article
                                            className={
                                                "revision-node kind-" +
                                                node.kind +
                                                (node.current ? " is-current" : "") +
                                                (node.selected ? " is-selected" : "") +
                                                (compareSource?.id === node.id
                                                    ? " is-compare-source"
                                                    : "")
                                            }
                                            key={node.id}
                                            ref={(element) => {
                                                nodeRefs.current[node.id] = element;
                                            }}
                                            onContextMenu={(event) => openNodeContextMenu(node, event)}
                                            onMouseEnter={(event) =>
                                                showHoverCard(
                                                    node.label,
                                                    node.hoverSummary ?? [],
                                                    event
                                                )
                                            }
                                            onMouseMove={moveHoverCard}
                                            onMouseLeave={hideHoverCard}
                                        >
                                            <div className="revision-node-heading">
                                                <div className="revision-node-title-row">
                                                    <h2 className="revision-node-title">{node.label}</h2>
                                                    <button
                                                        className="icon-button"
                                                        type="button"
                                                        onClick={(event) =>
                                                            openNodeContextMenu(
                                                                node,
                                                                event as unknown as React.MouseEvent<HTMLElement>
                                                            )
                                                        }
                                                        aria-label={i18n.t("actionsPlaceholder", {
                                                            label: node.label,
                                                        })}
                                                    >
                                                        <span className="codicon codicon-ellipsis" />
                                                    </button>
                                                </div>
                                                <div className="revision-node-badges">
                                                    {node.current ? (
                                                        <span className="revision-node-badge current">
                                                            {i18n.t("revisionGraphCurrentBadge")}
                                                        </span>
                                                    ) : null}
                                                    {node.selected && !node.current ? (
                                                        <span className="revision-node-badge selected">
                                                            {i18n.t("revisionGraphSelectedBadge")}
                                                        </span>
                                                    ) : null}
                                                    {compareSource?.id === node.id ? (
                                                        <span className="revision-node-badge compare">
                                                            {i18n.t("revisionGraphCompareSourceBadge")}
                                                        </span>
                                                    ) : null}
                                                    {node.localChangeCount ? (
                                                        <span className="revision-node-badge status local">
                                                            {i18n.t("revisionGraphLocalChangesBadge", {
                                                                count: node.localChangeCount,
                                                            })}
                                                        </span>
                                                    ) : null}
                                                    {node.incomingChangeCount ? (
                                                        <span className="revision-node-badge status incoming">
                                                            {i18n.t("revisionGraphIncomingChangesBadge", {
                                                                count: node.incomingChangeCount,
                                                            })}
                                                        </span>
                                                    ) : null}
                                                    {node.lockOwner ? (
                                                        <span className="revision-node-badge status lock">
                                                            {i18n.t("revisionGraphLockedBadge")}
                                                        </span>
                                                    ) : null}
                                                    {node.mergeSourceCount ? (
                                                        <span className="revision-node-badge status merge">
                                                            {i18n.t("revisionGraphMergeSourceBadge", {
                                                                count: node.mergeSourceCount,
                                                            })}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <div className="revision-node-path">{node.detail}</div>
                                            </div>

                                            <dl className="revision-node-facts">
                                                <div className="revision-node-fact">
                                                    <dt>{i18n.t("dateLabel")}</dt>
                                                    <dd>
                                                        {formatDate(state.locale, node.createdDate) ??
                                                            "\u2014"}
                                                    </dd>
                                                </div>
                                                <div className="revision-node-fact">
                                                    <dt>{i18n.t("authorDetailLabel")}</dt>
                                                    <dd className="revision-node-fact-stack">
                                                        <span>{node.createdAuthor ?? "\u2014"}</span>
                                                        <span className="revision-node-inline-meta">
                                                            <span className="revision-node-inline-meta-label">
                                                                {i18n.t("revisionLabel")}
                                                            </span>
                                                            <span className="revision-node-inline-meta-value">
                                                                {node.createdRevision
                                                                    ? `r${String(node.createdRevision)}`
                                                                    : "\u2014"}
                                                            </span>
                                                        </span>
                                                    </dd>
                                                </div>
                                                <div className="revision-node-fact">
                                                    <dt>{i18n.t("revisionGraphLastSeenLabel")}</dt>
                                                    <dd>
                                                        {node.lastSeenRevision
                                                            ? `r${String(node.lastSeenRevision)}`
                                                            : "\u2014"}
                                                    </dd>
                                                </div>
                                            </dl>

                                            <div className="revision-node-actions">
                                                <button
                                                    className="secondary"
                                                    type="button"
                                                    onClick={() =>
                                                        runNodeAction("open-history", node.repositoryPath)
                                                    }
                                                >
                                                    {i18n.t("openHistoryActionLabel")}
                                                </button>
                                                <button
                                                    className="secondary"
                                                    type="button"
                                                    onClick={() =>
                                                        runNodeAction("open-at-head", node.repositoryPath)
                                                    }
                                                >
                                                    {i18n.t("revisionGraphOpenAtHead")}
                                                </button>
                                                {!compareSource || compareSource.id === node.id ? (
                                                    <button
                                                        className="secondary"
                                                        type="button"
                                                        onClick={() =>
                                                            setState((previous) => ({
                                                                ...previous,
                                                                compareSourceId: node.id,
                                                            }))
                                                        }
                                                    >
                                                        {i18n.t("revisionGraphSetCompareSource")}
                                                    </button>
                                                ) : (
                                                    <>
                                                        <button
                                                            className="secondary"
                                                            type="button"
                                                            onClick={() =>
                                                                runNodeComparison(
                                                                    "compare-references",
                                                                    node
                                                                )
                                                            }
                                                        >
                                                            {i18n.t("revisionGraphCompareAction")}
                                                        </button>
                                                        <button
                                                            className="primary small"
                                                            type="button"
                                                            onClick={() =>
                                                                runNodeComparison(
                                                                    "diff-references",
                                                                    node
                                                                )
                                                            }
                                                        >
                                                            {i18n.t("openDiff")}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null}

                {graph && visibleNodes.length > 0 && visibleGraph && visibleGraph.edges.length === 0 ? (
                    <section className="revision-graph-banner subtle">
                        {i18n.t("revisionGraphNoEdges")}
                    </section>
                ) : null}

                {graph ? (
                    <footer className="revision-graph-footer">
                        {graph.canLoadMore ? (
                            <button
                                className="secondary"
                                type="button"
                                onClick={requestLoadMore}
                                disabled={state.loading}
                            >
                                {i18n.t("revisionGraphLoadMore")}
                            </button>
                        ) : (
                            <span className="revision-graph-footer-note">
                                {i18n.t("allHistoryLoaded")}
                            </span>
                        )}
                        {normalizedSearchQuery ? (
                            <span className="revision-graph-footer-note">
                                {i18n.t("revisionGraphSearchMatchesLabel", {
                                    count: visibleNodes.length,
                                })}
                            </span>
                        ) : null}
                    </footer>
                ) : null}

                {state.contextMenu?.node ? (
                    <div className="context-menu-root">
                        <div
                            className="context-menu-backdrop"
                            onClick={() =>
                                setState((previous) => ({
                                    ...previous,
                                    contextMenu: undefined,
                                }))
                            }
                        />
                        <div
                            className="context-menu revision-graph-context-menu"
                            style={{
                                left: `${state.contextMenu.x}px`,
                                top: `${state.contextMenu.y}px`,
                            }}
                            onClick={(event) => event.stopPropagation()}
                            onMouseDown={(event) => event.stopPropagation()}
                        >
                            <div className="context-menu-header">
                                <div
                                    className="context-menu-title"
                                    title={state.contextMenu.node.label}
                                >
                                    {state.contextMenu.node.label}
                                </div>
                                <div
                                    className="context-menu-subtitle"
                                    title={state.contextMenu.node.detail}
                                >
                                    {state.contextMenu.node.detail}
                                </div>
                            </div>
                            <div className="context-menu-actions">
                                {renderContextMenuItem(
                                    "codicon-go-to-file",
                                    i18n.t("revisionGraphOpenAtHead"),
                                    () =>
                                        runNodeAction(
                                            "open-at-head",
                                            state.contextMenu?.node?.repositoryPath ?? ""
                                        )
                                )}
                                {renderContextMenuItem(
                                    "codicon-folder-opened",
                                    i18n.t("repositoryBrowserActionLabel"),
                                    () =>
                                        runNodeAction(
                                            "open-browser",
                                            state.contextMenu?.node?.repositoryPath ?? ""
                                        )
                                )}
                                <div className="context-menu-separator" aria-hidden="true" />
                                {renderContextMenuItem(
                                    "codicon-link",
                                    i18n.t("copyRepositoryUrlActionLabel"),
                                    () =>
                                        runNodeAction(
                                            "copy-url",
                                            state.contextMenu?.node?.repositoryPath ?? ""
                                        )
                                )}
                                {renderContextMenuItem(
                                    "codicon-copy",
                                    i18n.t("copyRepositoryPathActionLabel"),
                                    () =>
                                        runNodeAction(
                                            "copy-path",
                                            state.contextMenu?.node?.repositoryPath ?? ""
                                        )
                                )}
                                <div className="context-menu-separator" aria-hidden="true" />
                                {renderContextMenuItem(
                                    "codicon-git-branch",
                                    i18n.t("revisionGraphCreateBranchHere"),
                                    () =>
                                        runNodeAction(
                                            "create-branch",
                                            state.contextMenu?.node?.repositoryPath ?? ""
                                        )
                                )}
                                {renderContextMenuItem(
                                    "codicon-tag",
                                    i18n.t("revisionGraphCreateTagHere"),
                                    () =>
                                        runNodeAction(
                                            "create-tag",
                                            state.contextMenu?.node?.repositoryPath ?? ""
                                        )
                                )}
                                {renderContextMenuItem(
                                    "codicon-git-compare",
                                    i18n.t("revisionGraphSetCompareSource"),
                                    () =>
                                        setState((previous) => ({
                                            ...previous,
                                            compareSourceId: previous.contextMenu?.node?.id,
                                            contextMenu: undefined,
                                        }))
                                )}
                                {compareSource &&
                                state.contextMenu.node &&
                                compareSource.id !== state.contextMenu.node.id ? (
                                    <>
                                        {renderContextMenuItem(
                                            "codicon-git-compare",
                                            i18n.t("revisionGraphCompareAction"),
                                            () =>
                                                runNodeComparison(
                                                    "compare-references",
                                                    state.contextMenu?.node as RevisionGraphNode
                                                )
                                        )}
                                        {renderContextMenuItem(
                                            "codicon-diff",
                                            i18n.t("openDiff"),
                                            () =>
                                                runNodeComparison(
                                                    "diff-references",
                                                    state.contextMenu?.node as RevisionGraphNode
                                                )
                                        )}
                                    </>
                                ) : null}
                                {!state.contextMenu.node.current &&
                                state.contextMenu.node.kind !== "path" ? (
                                    <>
                                        <div
                                            className="context-menu-separator"
                                            aria-hidden="true"
                                        />
                                        {renderContextMenuItem(
                                            "codicon-source-control",
                                            i18n.t("repositoryBrowserSwitchHereLabel"),
                                            () =>
                                                runNodeAction(
                                                    "switch-reference",
                                                    state.contextMenu?.node?.repositoryPath ?? ""
                                                )
                                        )}
                                    </>
                                ) : null}
                                {state.contextMenu.node.kind !== "path" ? (
                                    <>
                                        <div
                                            className="context-menu-separator"
                                            aria-hidden="true"
                                        />
                                        {renderContextMenuItem(
                                            "codicon-trash",
                                            i18n.t("deleteReferenceActionLabel"),
                                            () =>
                                                runNodeAction(
                                                    "delete-reference",
                                                    state.contextMenu?.node?.repositoryPath ?? ""
                                                ),
                                            true
                                        )}
                                    </>
                                ) : null}
                            </div>
                        </div>
                    </div>
                ) : null}

                {state.contextMenu?.edge ? (
                    <div className="context-menu-root">
                        <div
                            className="context-menu-backdrop"
                            onClick={() =>
                                setState((previous) => ({
                                    ...previous,
                                    contextMenu: undefined,
                                }))
                            }
                        />
                        <div
                            className="context-menu revision-graph-context-menu"
                            style={{
                                left: `${state.contextMenu.x}px`,
                                top: `${state.contextMenu.y}px`,
                            }}
                            onClick={(event) => event.stopPropagation()}
                            onMouseDown={(event) => event.stopPropagation()}
                        >
                            <div className="context-menu-header">
                                <div className="context-menu-title">
                                    {`r${state.contextMenu.edge.revision}`}
                                </div>
                                <div
                                    className="context-menu-subtitle"
                                    title={state.contextMenu.edge.targetRepositoryPath}
                                >
                                    {[
                                        state.contextMenu.edge.targetRepositoryPath,
                                        state.contextMenu.edge.author,
                                        formatDate(state.locale, state.contextMenu.edge.date),
                                    ]
                                        .filter(Boolean)
                                        .join(" • ")}
                                </div>
                            </div>
                            <div className="context-menu-actions">
                                {renderContextMenuItem(
                                    "codicon-history",
                                    i18n.t("revisionGraphOpenRevisionDetails"),
                                    () =>
                                        openEdgeRevision(
                                            state.contextMenu?.edge as RevisionGraphEdge
                                        )
                                )}
                            </div>
                        </div>
                    </div>
                ) : null}

                {state.hoverCard ? (
                    <div
                        className="revision-graph-hover-card"
                        style={{
                            left: `${state.hoverCard.x}px`,
                            top: `${state.hoverCard.y}px`,
                        }}
                    >
                        <div className="revision-graph-hover-title">{state.hoverCard.title}</div>
                        {state.hoverCard.lines.map((line, index) => (
                            <div className="revision-graph-hover-line" key={`${line}-${index}`}>
                                {line}
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>
        );
    }

    createRoot(document.getElementById("root") as HTMLElement).render(
        <RevisionGraphApp />
    );
})();
