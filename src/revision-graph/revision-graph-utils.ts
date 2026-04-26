import type { SvnLogEntry } from "../svn/svn-types";
import {
    getReferenceKindForRepositoryPath,
    getRepositoryReferenceDisplay,
    getRepositoryReferenceRoot,
    normalizeRepositoryPath,
} from "../scm/svn-repository-paths";
import type {
    RevisionGraphEdge,
    RevisionGraphNode,
    RevisionGraphNodeKind,
} from "./revision-graph-types";

interface MutableRevisionGraphNode {
    id: string;
    repositoryPath: string;
    label: string;
    detail: string;
    kind: RevisionGraphNodeKind;
    current: boolean;
    selected: boolean;
    createdRevision?: number;
    createdAuthor?: string;
    createdDate?: string;
    lastSeenRevision?: number;
}

export interface BuildRevisionGraphOptions {
    readonly entries: readonly SvnLogEntry[];
    readonly currentRepositoryPath: string;
    readonly selectedRepositoryPath?: string;
}

export interface BuildRevisionGraphResult {
    readonly currentReferencePath: string;
    readonly selectedReferencePath: string;
    readonly nodes: RevisionGraphNode[];
    readonly edges: RevisionGraphEdge[];
}

function resolveGraphPath(repositoryPath: string): string {
    return getRepositoryReferenceRoot(repositoryPath) ?? normalizeRepositoryPath(repositoryPath);
}

function getRevisionGraphNodeKind(repositoryPath: string): RevisionGraphNodeKind {
    const normalizedPath = normalizeRepositoryPath(repositoryPath);
    if (normalizedPath.endsWith("/trunk") || normalizedPath === "/trunk") {
        return "trunk";
    }

    const referenceKind = getReferenceKindForRepositoryPath(normalizedPath);
    if (referenceKind) {
        return referenceKind;
    }

    return "path";
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
    repositoryPath: string
): MutableRevisionGraphNode {
    const normalizedPath = resolveGraphPath(repositoryPath);
    const existing = nodes.get(normalizedPath);
    if (existing) {
        return existing;
    }

    const display = getRepositoryReferenceDisplay(normalizedPath);
    const node: MutableRevisionGraphNode = {
        id: normalizedPath,
        repositoryPath: normalizedPath,
        label: display.label,
        detail: normalizedPath,
        kind: getRevisionGraphNodeKind(normalizedPath),
        current: false,
        selected: false,
    };
    nodes.set(normalizedPath, node);
    return node;
}

function updateLastSeen(node: MutableRevisionGraphNode, revision: number): void {
    if (node.lastSeenRevision === undefined || revision > node.lastSeenRevision) {
        node.lastSeenRevision = revision;
    }
}

export function buildRevisionGraph(
    options: BuildRevisionGraphOptions
): BuildRevisionGraphResult {
    const currentReferencePath = resolveGraphPath(options.currentRepositoryPath);
    const selectedReferencePath = resolveGraphPath(
        options.selectedRepositoryPath ?? options.currentRepositoryPath
    );

    const nodes = new Map<string, MutableRevisionGraphNode>();
    const edges = new Map<string, RevisionGraphEdge>();

    ensureNode(nodes, currentReferencePath).current = true;
    ensureNode(nodes, selectedReferencePath).selected = true;

    for (const entry of options.entries) {
        for (const change of entry.changes) {
            const targetReferencePath = getRepositoryReferenceRoot(change.path);
            if (targetReferencePath) {
                updateLastSeen(ensureNode(nodes, targetReferencePath), entry.revision);
            }

            const sourceReferencePath = change.copyfromPath
                ? getRepositoryReferenceRoot(change.copyfromPath)
                : undefined;
            if (sourceReferencePath) {
                ensureNode(nodes, sourceReferencePath);
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

            const edgeId = `${sourceReferencePath}=>${targetReferencePath}`;
            if (edges.has(edgeId)) {
                continue;
            }

            const targetNode = ensureNode(nodes, targetReferencePath);
            targetNode.createdRevision = entry.revision;
            targetNode.createdAuthor = entry.author;
            targetNode.createdDate = entry.date;

            edges.set(edgeId, {
                id: edgeId,
                sourceId: sourceReferencePath,
                targetId: targetReferencePath,
                sourceRepositoryPath: sourceReferencePath,
                targetRepositoryPath: targetReferencePath,
                revision: entry.revision,
                author: entry.author,
                date: entry.date,
            });
        }
    }

    return {
        currentReferencePath,
        selectedReferencePath,
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
        edges: [...edges.values()].sort((left, right) => right.revision - left.revision),
    };
}
