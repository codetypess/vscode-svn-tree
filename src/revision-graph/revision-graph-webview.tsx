import React from "react";
import { createRoot } from "react-dom/client";
import { createI18n } from "../i18n";
import type {
    RevisionGraphBootstrap,
    RevisionGraphData,
    RevisionGraphEdge,
    RevisionGraphNode,
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
    path: string;
    labelX: number;
    labelY: number;
    revision: number;
}

interface GraphState {
    locale: RevisionGraphBootstrap["locale"];
    scopeLabel: string;
    graph?: RevisionGraphData;
    loading: boolean;
    error?: string;
}

interface GraphColumn {
    index: number;
    nodes: RevisionGraphNode[];
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

function compareNodeOrder(left: RevisionGraphNode, right: RevisionGraphNode): number {
    if (left.current !== right.current) {
        return left.current ? -1 : 1;
    }

    if (left.selected !== right.selected) {
        return left.selected ? -1 : 1;
    }

    return left.label.localeCompare(right.label);
}

function buildGraphColumns(graph: RevisionGraphData | undefined): GraphColumn[] {
    if (!graph || graph.nodes.length === 0) {
        return [];
    }

    const parentsByNode = new Map<string, string[]>();
    for (const node of graph.nodes) {
        parentsByNode.set(node.id, []);
    }

    for (const edge of graph.edges) {
        const parents = parentsByNode.get(edge.targetId);
        if (!parents) {
            continue;
        }

        parents.push(edge.sourceId);
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

    return [...nodesByLevel.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([index, nodes]) => ({
            index,
            nodes: nodes.sort(compareNodeOrder),
        }));
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
        });
        const surfaceRef = React.useRef<HTMLDivElement | null>(null);
        const nodeRefs = React.useRef<Record<string, HTMLElement | null>>({});
        const [edgeLayout, setEdgeLayout] = React.useState<EdgeLayout[]>([]);
        const i18n = createI18n(state.locale);
        const graph = state.graph;
        const columns = React.useMemo(() => buildGraphColumns(graph), [graph]);

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
                if (!surface || !graph) {
                    setEdgeLayout([]);
                    return;
                }
                const measuredSurface = surface;
                const measuredGraph = graph;

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
                        const horizontalGap = Math.max(56, (endX - startX) / 2);
                        nextLayout.push({
                            id: edge.id,
                            path: `M ${startX} ${startY} C ${startX + horizontalGap} ${startY}, ${
                                endX - horizontalGap
                            } ${endY}, ${endX} ${endY}`,
                            labelX: (startX + endX) / 2,
                            labelY: (startY + endY) / 2,
                            revision: edge.revision,
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
            [graph, columns]
        );

        function requestRefresh(): void {
            setState((previous) => ({
                ...previous,
                loading: true,
                error: undefined,
            }));
            vscode.postMessage({
                type: "refresh",
            });
        }

        function runNodeAction(
            type: Extract<
                RevisionGraphRequestMessage["type"],
                "open-history" | "open-browser" | "switch-reference" | "copy-path" | "copy-url"
            >,
            repositoryPath: string
        ): void {
            vscode.postMessage({
                type,
                repositoryPath,
            });
        }

        return React.createElement(
            "div",
            { className: "revision-graph-app" },
            React.createElement(
                "header",
                { className: "revision-graph-header" },
                React.createElement(
                    "div",
                    { className: "revision-graph-header-copy" },
                    React.createElement(
                        "div",
                        { className: "revision-graph-kicker" },
                        i18n.t("revisionGraphPanelHeading")
                    ),
                    React.createElement(
                        "h1",
                        { className: "revision-graph-title" },
                        i18n.t("revisionGraphPanelTitle", {
                            label: state.scopeLabel,
                        })
                    ),
                    React.createElement(
                        "div",
                        { className: "revision-graph-meta" },
                        graph
                            ? [
                                  React.createElement(
                                      "span",
                                      {
                                          className: "revision-graph-chip",
                                          key: "layout",
                                      },
                                      i18n.t("revisionGraphLayoutRootLabel", {
                                          path: graph.layoutRootPath,
                                      })
                                  ),
                                  React.createElement(
                                      "span",
                                      {
                                          className: "revision-graph-chip",
                                          key: "scanned",
                                      },
                                      i18n.t("revisionGraphScannedEntriesLabel", {
                                          count: graph.scannedEntryCount,
                                      })
                                  ),
                                  graph.truncated
                                      ? React.createElement(
                                            "span",
                                            {
                                                className: "revision-graph-chip warning",
                                                key: "truncated",
                                            },
                                            i18n.t("revisionGraphTruncatedNotice")
                                        )
                                      : null,
                              ]
                            : null
                    )
                ),
                React.createElement(
                    "button",
                    {
                        className: "primary revision-graph-refresh",
                        type: "button",
                        onClick: requestRefresh,
                    },
                    React.createElement("span", {
                        className:
                            "codicon " +
                            (state.loading ? "codicon-loading codicon-modifier-spin" : "codicon-refresh"),
                        "aria-hidden": "true",
                    }),
                    React.createElement(
                        "span",
                        null,
                        i18n.t("refreshButton")
                    )
                )
            ),
            state.error
                ? React.createElement(
                      "section",
                      { className: "revision-graph-banner error" },
                      state.error
                  )
                : null,
            state.loading && !graph
                ? React.createElement(
                      "section",
                      { className: "revision-graph-banner loading" },
                      i18n.t("revisionGraphLoading")
                  )
                : null,
            graph && graph.nodes.length === 0
                ? React.createElement(
                      "section",
                      { className: "revision-graph-banner empty" },
                      i18n.t("revisionGraphEmpty")
                  )
                : null,
            graph && graph.nodes.length > 0
                ? React.createElement(
                      "section",
                      { className: "revision-graph-surface", ref: surfaceRef },
                      React.createElement(
                          "svg",
                          {
                              className: "revision-graph-edges",
                              width: "100%",
                              height: "100%",
                              "aria-hidden": "true",
                          },
                          edgeLayout.map((edge) =>
                              React.createElement(
                                  "g",
                                  { className: "revision-graph-edge", key: edge.id },
                                  React.createElement("path", {
                                      className: "revision-graph-edge-path",
                                      d: edge.path,
                                  }),
                                  React.createElement(
                                      "text",
                                      {
                                          className: "revision-graph-edge-label",
                                          x: edge.labelX,
                                          y: edge.labelY - 6,
                                      },
                                      "r",
                                      edge.revision
                                  )
                              )
                          )
                      ),
                      React.createElement(
                          "div",
                          { className: "revision-graph-columns" },
                          columns.map((column) =>
                              React.createElement(
                                  "div",
                                  {
                                      className: "revision-graph-column",
                                      key: String(column.index),
                                  },
                                  React.createElement(
                                      "div",
                                      { className: "revision-graph-column-label" },
                                      i18n.t("revisionGraphColumnLabel", {
                                          level: column.index + 1,
                                      })
                                  ),
                                  column.nodes.map((node) =>
                                      React.createElement(
                                          "article",
                                          {
                                              className:
                                                  "revision-node kind-" +
                                                  node.kind +
                                                  (node.current ? " is-current" : "") +
                                                  (node.selected ? " is-selected" : ""),
                                              key: node.id,
                                              ref: (element) => {
                                                  nodeRefs.current[node.id] = element;
                                              },
                                          },
                                          React.createElement(
                                              "div",
                                              { className: "revision-node-heading" },
                                              React.createElement(
                                                  "div",
                                                  { className: "revision-node-title-row" },
                                                  React.createElement(
                                                      "h2",
                                                      { className: "revision-node-title" },
                                                      node.label
                                                  ),
                                                  node.current
                                                      ? React.createElement(
                                                            "span",
                                                            {
                                                                className:
                                                                    "revision-node-badge current",
                                                            },
                                                            i18n.t("revisionGraphCurrentBadge")
                                                        )
                                                      : null,
                                                  node.selected && !node.current
                                                      ? React.createElement(
                                                            "span",
                                                            {
                                                                className:
                                                                    "revision-node-badge selected",
                                                            },
                                                            i18n.t("revisionGraphSelectedBadge")
                                                        )
                                                      : null
                                              ),
                                              React.createElement(
                                                  "div",
                                                  { className: "revision-node-path" },
                                                  node.detail
                                              )
                                          ),
                                          React.createElement(
                                              "dl",
                                              { className: "revision-node-facts" },
                                              React.createElement(
                                                  "div",
                                                  { className: "revision-node-fact" },
                                                  React.createElement(
                                                      "dt",
                                                      null,
                                                      i18n.t("revisionLabel")
                                                  ),
                                                  React.createElement(
                                                      "dd",
                                                      null,
                                                      node.createdRevision
                                                          ? "r" + String(node.createdRevision)
                                                          : "\u2014"
                                                  )
                                              ),
                                              React.createElement(
                                                  "div",
                                                  { className: "revision-node-fact" },
                                                  React.createElement(
                                                      "dt",
                                                      null,
                                                      i18n.t("authorDetailLabel")
                                                  ),
                                                  React.createElement(
                                                      "dd",
                                                      null,
                                                      node.createdAuthor ?? "\u2014"
                                                  )
                                              ),
                                              React.createElement(
                                                  "div",
                                                  { className: "revision-node-fact wide" },
                                                  React.createElement(
                                                      "dt",
                                                      null,
                                                      i18n.t("dateLabel")
                                                  ),
                                                  React.createElement(
                                                      "dd",
                                                      null,
                                                      formatDate(state.locale, node.createdDate) ??
                                                          "\u2014"
                                                  )
                                              ),
                                              React.createElement(
                                                  "div",
                                                  { className: "revision-node-fact wide" },
                                                  React.createElement(
                                                      "dt",
                                                      null,
                                                      i18n.t("revisionGraphLastSeenLabel")
                                                  ),
                                                  React.createElement(
                                                      "dd",
                                                      null,
                                                      node.lastSeenRevision
                                                          ? "r" + String(node.lastSeenRevision)
                                                          : "\u2014"
                                                  )
                                              )
                                          ),
                                          React.createElement(
                                              "div",
                                              { className: "revision-node-actions" },
                                              React.createElement(
                                                  "button",
                                                  {
                                                      className: "secondary",
                                                      type: "button",
                                                      onClick: function () {
                                                          runNodeAction(
                                                              "open-history",
                                                              node.repositoryPath
                                                          );
                                                      },
                                                  },
                                                  i18n.t("openHistoryActionLabel")
                                              ),
                                              React.createElement(
                                                  "button",
                                                  {
                                                      className: "secondary",
                                                      type: "button",
                                                      onClick: function () {
                                                          runNodeAction(
                                                              "open-browser",
                                                              node.repositoryPath
                                                          );
                                                      },
                                                  },
                                                  i18n.t("repositoryBrowserActionLabel")
                                              ),
                                              React.createElement(
                                                  "button",
                                                  {
                                                      className: "secondary",
                                                      type: "button",
                                                      onClick: function () {
                                                          runNodeAction(
                                                              "copy-path",
                                                              node.repositoryPath
                                                          );
                                                      },
                                                  },
                                                  i18n.t("copyPathButton")
                                              ),
                                              !node.current && node.kind !== "path"
                                                  ? React.createElement(
                                                        "button",
                                                        {
                                                            className: "primary small",
                                                            type: "button",
                                                            onClick: function () {
                                                                runNodeAction(
                                                                    "switch-reference",
                                                                    node.repositoryPath
                                                                );
                                                            },
                                                        },
                                                        i18n.t(
                                                            "repositoryBrowserSwitchHereLabel"
                                                        )
                                                    )
                                                  : null
                                          )
                                      )
                                  )
                              )
                          )
                      )
                  )
                : null,
            graph && graph.nodes.length > 0 && graph.edges.length === 0
                ? React.createElement(
                      "section",
                      { className: "revision-graph-banner subtle" },
                      i18n.t("revisionGraphNoEdges")
                  )
                : null
        );
    }

    createRoot(document.getElementById("root") as HTMLElement).render(
        React.createElement(RevisionGraphApp)
    );
})();
