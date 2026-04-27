import type { SvnLogEntry } from "../svn/svn-types";
import { buildRepositoryUrl, normalizeRepositoryPath, splitRepositoryPath } from "../scm/svn-repository-paths";
import type {
    RevisionGraphData,
    RevisionGraphEdge,
    RevisionGraphFilters,
    RevisionGraphLayoutConfig,
    RevisionGraphNode,
    RevisionGraphNodeKind,
    RevisionGraphQuery,
} from "./revision-graph-types";

interface MutableRevisionGraphNode {
    id: string;
    repositoryPath: string;
    url: string;
    label: string;
    detail: string;
    kind: RevisionGraphNodeKind;
    current: boolean;
    selected: boolean;
    createdRevision?: number;
    createdAuthor?: string;
    createdDate?: string;
    lastSeenRevision?: number;
    localChangeCount?: number;
    incomingChangeCount?: number;
    lockOwner?: string;
    mergeSourceCount?: number;
    hoverSummary?: string[];
}

export interface RevisionGraphMergeInfoSource {
    sourceRepositoryPath: string;
    revisionRange: string;
    revision: number;
}

export interface RevisionGraphNodeMetadata {
    localChangeCount?: number;
    incomingChangeCount?: number;
    lockOwner?: string;
    mergeSources?: RevisionGraphMergeInfoSource[];
}

export interface BuildRevisionGraphOptions {
    readonly entries: readonly SvnLogEntry[];
    readonly repositoryRoot: string;
    readonly currentRepositoryPath: string;
    readonly selectedRepositoryPath?: string;
    readonly layout?: Partial<RevisionGraphLayoutConfig>;
    readonly nodeMetadata?: Readonly<Record<string, RevisionGraphNodeMetadata | undefined>>;
    readonly query?: RevisionGraphQuery;
    readonly canLoadMore?: boolean;
    readonly scannedEntryCount?: number;
    readonly truncated?: boolean;
}

export interface BuildRevisionGraphResult extends RevisionGraphData {}

const defaultLayoutConfig: RevisionGraphLayoutConfig = {
    trunkNames: ["trunk"],
    branchContainerNames: ["branches"],
    tagContainerNames: ["tags"],
};

function normalizeNameList(values: readonly string[] | undefined, fallback: readonly string[]): string[] {
    const normalized = (values ?? [])
        .map((value) => String(value).trim())
        .filter(Boolean);

    return normalized.length > 0 ? normalized : [...fallback];
}

export function normalizeRevisionGraphLayoutConfig(
    layout?: Partial<RevisionGraphLayoutConfig>
): RevisionGraphLayoutConfig {
    return {
        trunkNames: normalizeNameList(layout?.trunkNames, defaultLayoutConfig.trunkNames),
        branchContainerNames: normalizeNameList(
            layout?.branchContainerNames,
            defaultLayoutConfig.branchContainerNames
        ),
        tagContainerNames: normalizeNameList(
            layout?.tagContainerNames,
            defaultLayoutConfig.tagContainerNames
        ),
    };
}

export function getRevisionGraphReferenceRoot(
    repositoryPath: string,
    layout?: Partial<RevisionGraphLayoutConfig>
): string | undefined {
    const normalizedLayout = normalizeRevisionGraphLayoutConfig(layout);
    const segments = splitRepositoryPath(repositoryPath);

    for (let index = 0; index < segments.length; index += 1) {
        if (normalizedLayout.trunkNames.includes(segments[index])) {
            return normalizeRepositoryPath(segments.slice(0, index + 1).join("/"));
        }

        if (
            normalizedLayout.branchContainerNames.includes(segments[index]) &&
            index + 1 < segments.length
        ) {
            return normalizeRepositoryPath(segments.slice(0, index + 2).join("/"));
        }

        if (
            normalizedLayout.tagContainerNames.includes(segments[index]) &&
            index + 1 < segments.length
        ) {
            return normalizeRepositoryPath(segments.slice(0, index + 2).join("/"));
        }
    }

    return undefined;
}

export function getRevisionGraphNodeKind(
    repositoryPath: string,
    layout?: Partial<RevisionGraphLayoutConfig>
): RevisionGraphNodeKind {
    const normalizedLayout = normalizeRevisionGraphLayoutConfig(layout);
    const referenceRoot = getRevisionGraphReferenceRoot(repositoryPath, normalizedLayout);
    const segments = splitRepositoryPath(referenceRoot ?? repositoryPath);

    if (segments.some((segment) => normalizedLayout.trunkNames.includes(segment))) {
        return "trunk";
    }

    if (segments.some((segment) => normalizedLayout.branchContainerNames.includes(segment))) {
        return "branch";
    }

    if (segments.some((segment) => normalizedLayout.tagContainerNames.includes(segment))) {
        return "tag";
    }

    return "path";
}

export function getRevisionGraphTargetLabel(
    repositoryPath: string,
    layout?: Partial<RevisionGraphLayoutConfig>
): string {
    const normalizedLayout = normalizeRevisionGraphLayoutConfig(layout);
    const referenceRoot = getRevisionGraphReferenceRoot(repositoryPath, normalizedLayout);
    const segments = splitRepositoryPath(referenceRoot ?? repositoryPath);

    if (segments.length === 0) {
        return "/";
    }

    for (let index = 0; index < segments.length; index += 1) {
        if (normalizedLayout.trunkNames.includes(segments[index])) {
            return segments[index];
        }

        if (
            normalizedLayout.branchContainerNames.includes(segments[index]) &&
            index + 1 < segments.length
        ) {
            return segments.slice(index, index + 2).join("/");
        }

        if (
            normalizedLayout.tagContainerNames.includes(segments[index]) &&
            index + 1 < segments.length
        ) {
            return segments.slice(index, index + 2).join("/");
        }
    }

    return segments.at(-1) ?? "/";
}

export function getRevisionGraphLayoutRoot(
    repositoryPath: string,
    layout?: Partial<RevisionGraphLayoutConfig>
): string {
    const normalizedLayout = normalizeRevisionGraphLayoutConfig(layout);
    const segments = splitRepositoryPath(repositoryPath);

    for (let index = 0; index < segments.length; index += 1) {
        if (
            normalizedLayout.trunkNames.includes(segments[index]) ||
            normalizedLayout.branchContainerNames.includes(segments[index]) ||
            normalizedLayout.tagContainerNames.includes(segments[index])
        ) {
            return normalizeRepositoryPath(segments.slice(0, index).join("/"));
        }
    }

    return normalizeRepositoryPath(repositoryPath);
}

export function normalizeRevisionGraphFilters(
    filters?: Partial<RevisionGraphFilters>
): RevisionGraphFilters {
    const author = filters?.author?.trim();
    const dateFrom = filters?.dateFrom?.trim();
    const dateTo = filters?.dateTo?.trim();
    const revisionFrom =
        Number.isFinite(filters?.revisionFrom) && (filters?.revisionFrom ?? 0) > 0
            ? Math.floor(filters?.revisionFrom ?? 0)
            : undefined;
    const revisionTo =
        Number.isFinite(filters?.revisionTo) && (filters?.revisionTo ?? 0) > 0
            ? Math.floor(filters?.revisionTo ?? 0)
            : undefined;

    return {
        author: author || undefined,
        dateFrom: dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? dateFrom : undefined,
        dateTo: dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? dateTo : undefined,
        revisionFrom,
        revisionTo,
    };
}

function getDateBoundary(value: string | undefined, endOfDay: boolean): number | undefined {
    if (!value) {
        return undefined;
    }

    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
        return undefined;
    }

    if (endOfDay) {
        date.setHours(23, 59, 59, 999);
    }

    return date.getTime();
}

export function hasInvalidRevisionGraphFilters(
    filters?: Partial<RevisionGraphFilters>
): boolean {
    const normalized = normalizeRevisionGraphFilters(filters);
    const startDate = getDateBoundary(normalized.dateFrom, false);
    const endDate = getDateBoundary(normalized.dateTo, true);
    if (startDate !== undefined && endDate !== undefined && startDate > endDate) {
        return true;
    }

    return (
        normalized.revisionFrom !== undefined &&
        normalized.revisionTo !== undefined &&
        normalized.revisionFrom > normalized.revisionTo
    );
}

export function matchesRevisionGraphFilters(
    entry: SvnLogEntry,
    filters?: Partial<RevisionGraphFilters>
): boolean {
    const normalized = normalizeRevisionGraphFilters(filters);
    const authorFilter = normalized.author?.toLowerCase();
    if (authorFilter && !entry.author.toLowerCase().includes(authorFilter)) {
        return false;
    }

    if (normalized.revisionFrom !== undefined && entry.revision < normalized.revisionFrom) {
        return false;
    }

    if (normalized.revisionTo !== undefined && entry.revision > normalized.revisionTo) {
        return false;
    }

    const entryDate = new Date(entry.date).getTime();
    const hasEntryDate = Number.isFinite(entryDate);
    const startDate = getDateBoundary(normalized.dateFrom, false);
    if (startDate !== undefined && (!hasEntryDate || entryDate < startDate)) {
        return false;
    }

    const endDate = getDateBoundary(normalized.dateTo, true);
    if (endDate !== undefined && (!hasEntryDate || entryDate > endDate)) {
        return false;
    }

    return true;
}

function getHighestRevisionFromRange(value: string): number {
    return value
        .split(",")
        .flatMap((segment) => {
            const normalizedSegment = segment.replace(/\*/g, "").trim();
            if (!normalizedSegment) {
                return [];
            }

            const [left, right] = normalizedSegment.split("-");
            const candidates = [left, right ?? left]
                .map((part) => Number(part))
                .filter((revision) => Number.isFinite(revision) && revision > 0);
            return candidates;
        })
        .reduce((maxRevision, revision) => Math.max(maxRevision, revision), 0);
}

export function parseRevisionGraphMergeInfo(
    value: string | undefined,
    layout?: Partial<RevisionGraphLayoutConfig>
): RevisionGraphMergeInfoSource[] {
    const normalizedValue = value?.trim();
    if (!normalizedValue) {
        return [];
    }

    const normalizedLayout = normalizeRevisionGraphLayoutConfig(layout);
    return normalizedValue
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .flatMap((line) => {
            const separatorIndex = line.indexOf(":");
            if (separatorIndex <= 0) {
                return [];
            }

            const rawPath = normalizeRepositoryPath(line.slice(0, separatorIndex).trim());
            const referenceRoot = getRevisionGraphReferenceRoot(rawPath, normalizedLayout);
            const revisionRange = line.slice(separatorIndex + 1).trim();
            const revision = getHighestRevisionFromRange(revisionRange);
            if (!referenceRoot || revision <= 0) {
                return [];
            }

            return [
                {
                    sourceRepositoryPath: referenceRoot,
                    revisionRange,
                    revision,
                },
            ];
        });
}

function createNode(
    repositoryRoot: string,
    repositoryPath: string,
    layout: RevisionGraphLayoutConfig
): MutableRevisionGraphNode {
    return {
        id: repositoryPath,
        repositoryPath,
        url: buildRepositoryUrl(repositoryRoot, repositoryPath),
        label: getRevisionGraphTargetLabel(repositoryPath, layout),
        detail: repositoryPath,
        kind: getRevisionGraphNodeKind(repositoryPath, layout),
        current: false,
        selected: false,
    };
}

function compareNodeKind(left: RevisionGraphNodeKind, right: RevisionGraphNodeKind): number {
    const order: Record<RevisionGraphNodeKind, number> = {
        trunk: 0,
        branch: 1,
        tag: 2,
        path: 3,
    };

    return order[left] - order[right];
}

function ensureNode(
    nodes: Map<string, MutableRevisionGraphNode>,
    repositoryRoot: string,
    repositoryPath: string,
    layout: RevisionGraphLayoutConfig
): MutableRevisionGraphNode {
    const normalizedPath =
        getRevisionGraphReferenceRoot(repositoryPath, layout) ?? normalizeRepositoryPath(repositoryPath);
    const existing = nodes.get(normalizedPath);
    if (existing) {
        return existing;
    }

    const node = createNode(repositoryRoot, normalizedPath, layout);
    nodes.set(normalizedPath, node);
    return node;
}

function updateLastSeen(node: MutableRevisionGraphNode, revision: number): void {
    if (node.lastSeenRevision === undefined || revision > node.lastSeenRevision) {
        node.lastSeenRevision = revision;
    }
}

function applyNodeMetadata(
    node: MutableRevisionGraphNode,
    metadata: RevisionGraphNodeMetadata | undefined
): void {
    if (!metadata) {
        return;
    }

    node.localChangeCount = metadata.localChangeCount;
    node.incomingChangeCount = metadata.incomingChangeCount;
    node.lockOwner = metadata.lockOwner;
    node.mergeSourceCount = metadata.mergeSources?.length;
}

export function buildRevisionGraphSummary(graph: RevisionGraphData): string {
    const lines = [
        `${graph.scopeLabel}`,
        `Layout Root: ${graph.layoutRootPath}`,
        `Selected: ${graph.selectedReferencePath}`,
        `Current: ${graph.currentReferencePath}`,
        `Nodes: ${graph.nodes.length}`,
        `Edges: ${graph.edges.length}`,
        `Loaded Revisions: ${graph.scannedEntryCount}`,
    ];

    if (graph.query.filters?.author) {
        lines.push(`Author Filter: ${graph.query.filters.author}`);
    }
    if (graph.query.filters?.dateFrom || graph.query.filters?.dateTo) {
        lines.push(
            `Date Filter: ${graph.query.filters.dateFrom ?? "..."} -> ${
                graph.query.filters.dateTo ?? "..."
            }`
        );
    }
    if (
        graph.query.filters?.revisionFrom !== undefined ||
        graph.query.filters?.revisionTo !== undefined
    ) {
        lines.push(
            `Revision Filter: r${graph.query.filters?.revisionFrom ?? "..."} -> r${
                graph.query.filters?.revisionTo ?? "..."
            }`
        );
    }

    lines.push("");
    lines.push("Nodes:");
    for (const node of graph.nodes) {
        const badges = [
            node.current ? "current" : undefined,
            node.selected ? "selected" : undefined,
            node.localChangeCount ? `local:${node.localChangeCount}` : undefined,
            node.incomingChangeCount ? `incoming:${node.incomingChangeCount}` : undefined,
            node.lockOwner ? `lock:${node.lockOwner}` : undefined,
            node.mergeSourceCount ? `merge:${node.mergeSourceCount}` : undefined,
        ].filter(Boolean);

        lines.push(`- ${node.label} (${node.kind}) ${node.repositoryPath}${badges.length > 0 ? ` [${badges.join(", ")}]` : ""}`);
    }

    lines.push("");
    lines.push("Edges:");
    for (const edge of graph.edges) {
        const edgeLabel =
            edge.kind === "mergeinfo"
                ? `${edge.sourceRepositoryPath} => ${edge.targetRepositoryPath} [mergeinfo ${edge.revisionRange ?? `r${edge.revision}`}]`
                : `${edge.sourceRepositoryPath} => ${edge.targetRepositoryPath} [copy r${edge.revision}]`;
        lines.push(`- ${edgeLabel}`);
    }

    return lines.join("\n");
}

export function buildRevisionGraph(
    options: BuildRevisionGraphOptions
): BuildRevisionGraphResult {
    const layout = normalizeRevisionGraphLayoutConfig(options.layout);
    const currentReferencePath =
        getRevisionGraphReferenceRoot(options.currentRepositoryPath, layout) ??
        normalizeRepositoryPath(options.currentRepositoryPath);
    const selectedReferencePath =
        getRevisionGraphReferenceRoot(
            options.selectedRepositoryPath ?? options.currentRepositoryPath,
            layout
        ) ??
        normalizeRepositoryPath(options.selectedRepositoryPath ?? options.currentRepositoryPath);

    const nodes = new Map<string, MutableRevisionGraphNode>();
    const edges = new Map<string, RevisionGraphEdge>();
    const filteredEntries = options.entries.filter((entry) =>
        matchesRevisionGraphFilters(entry, options.query?.filters)
    );

    applyNodeMetadata(
        ensureNode(nodes, options.repositoryRoot, currentReferencePath, layout),
        options.nodeMetadata?.[currentReferencePath]
    );
    nodes.get(currentReferencePath)!.current = true;

    applyNodeMetadata(
        ensureNode(nodes, options.repositoryRoot, selectedReferencePath, layout),
        options.nodeMetadata?.[selectedReferencePath]
    );
    nodes.get(selectedReferencePath)!.selected = true;

    for (const entry of filteredEntries) {
        for (const change of entry.changes) {
            const targetReferencePath = getRevisionGraphReferenceRoot(change.path, layout);
            if (targetReferencePath) {
                const targetNode = ensureNode(
                    nodes,
                    options.repositoryRoot,
                    targetReferencePath,
                    layout
                );
                applyNodeMetadata(targetNode, options.nodeMetadata?.[targetReferencePath]);
                updateLastSeen(targetNode, entry.revision);
            }

            const sourceReferencePath = change.copyfromPath
                ? getRevisionGraphReferenceRoot(change.copyfromPath, layout)
                : undefined;
            if (sourceReferencePath) {
                const sourceNode = ensureNode(
                    nodes,
                    options.repositoryRoot,
                    sourceReferencePath,
                    layout
                );
                applyNodeMetadata(sourceNode, options.nodeMetadata?.[sourceReferencePath]);
            }

            if (
                change.kind !== "dir" ||
                !targetReferencePath ||
                !sourceReferencePath ||
                sourceReferencePath === targetReferencePath ||
                normalizeRepositoryPath(change.path) !== targetReferencePath
            ) {
                continue;
            }

            const edgeId = `copy:${sourceReferencePath}=>${targetReferencePath}`;
            if (edges.has(edgeId)) {
                continue;
            }

            const targetNode = ensureNode(
                nodes,
                options.repositoryRoot,
                targetReferencePath,
                layout
            );
            targetNode.createdRevision = entry.revision;
            targetNode.createdAuthor = entry.author;
            targetNode.createdDate = entry.date;
            targetNode.hoverSummary = [
                `Created from ${sourceReferencePath}`,
                `r${entry.revision} by ${entry.author}`,
                entry.message || "(no commit message)",
            ];

            edges.set(edgeId, {
                id: edgeId,
                kind: "copy",
                sourceId: sourceReferencePath,
                targetId: targetReferencePath,
                sourceRepositoryPath: sourceReferencePath,
                targetRepositoryPath: targetReferencePath,
                revision: entry.revision,
                author: entry.author,
                date: entry.date,
                hoverSummary: [
                    `${sourceReferencePath} -> ${targetReferencePath}`,
                    `Created in r${entry.revision} by ${entry.author}`,
                    entry.message || "(no commit message)",
                ],
            });
        }
    }

    for (const [repositoryPath, metadata] of Object.entries(options.nodeMetadata ?? {})) {
        const targetNode = ensureNode(nodes, options.repositoryRoot, repositoryPath, layout);
        applyNodeMetadata(targetNode, metadata);

        for (const mergeSource of metadata?.mergeSources ?? []) {
            const sourceNode = ensureNode(
                nodes,
                options.repositoryRoot,
                mergeSource.sourceRepositoryPath,
                layout
            );
            applyNodeMetadata(
                sourceNode,
                options.nodeMetadata?.[mergeSource.sourceRepositoryPath]
            );

            const copyEdgeId = `copy:${mergeSource.sourceRepositoryPath}=>${repositoryPath}`;
            const mergeEdgeId = `mergeinfo:${mergeSource.sourceRepositoryPath}=>${repositoryPath}`;
            if (
                mergeSource.sourceRepositoryPath === repositoryPath ||
                edges.has(copyEdgeId) ||
                edges.has(mergeEdgeId)
            ) {
                continue;
            }

            edges.set(mergeEdgeId, {
                id: mergeEdgeId,
                kind: "mergeinfo",
                sourceId: sourceNode.id,
                targetId: targetNode.id,
                sourceRepositoryPath: mergeSource.sourceRepositoryPath,
                targetRepositoryPath: repositoryPath,
                revision: mergeSource.revision,
                revisionRange: mergeSource.revisionRange,
                hoverSummary: [
                    `${mergeSource.sourceRepositoryPath} -> ${repositoryPath}`,
                    `Merged revisions: ${mergeSource.revisionRange}`,
                ],
            });
        }
    }

    const graph: BuildRevisionGraphResult = {
        scopeLabel: getRevisionGraphTargetLabel(selectedReferencePath, layout),
        layoutRootPath: getRevisionGraphLayoutRoot(selectedReferencePath, layout),
        selectedRepositoryPath:
            options.selectedRepositoryPath ?? options.currentRepositoryPath,
        selectedReferencePath,
        currentReferencePath,
        query: {
            entryBudget: options.query?.entryBudget,
            filters: normalizeRevisionGraphFilters(options.query?.filters),
        },
        nodes: [...nodes.values()].sort((left, right) => {
            if (left.current !== right.current) {
                return left.current ? -1 : 1;
            }

            if (left.selected !== right.selected) {
                return left.selected ? -1 : 1;
            }

            const kindResult = compareNodeKind(left.kind, right.kind);
            if (kindResult !== 0) {
                return kindResult;
            }

            return left.label.localeCompare(right.label);
        }),
        edges: [...edges.values()].sort((left, right) => {
            if (left.kind !== right.kind) {
                return left.kind === "copy" ? -1 : 1;
            }

            return right.revision - left.revision;
        }),
        scannedEntryCount: options.scannedEntryCount ?? options.entries.length,
        truncated: options.truncated === true,
        canLoadMore: options.canLoadMore === true,
    };

    return graph;
}
