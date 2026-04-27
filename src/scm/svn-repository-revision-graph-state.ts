import type { RevisionGraphNodeMetadata } from "../revision-graph/revision-graph-utils";
import type { RevisionGraphData } from "../revision-graph/revision-graph-types";
import type { SvnLogEntry, SvnStatusEntry } from "../svn/svn-types";
import { normalizeRepositoryPath } from "./svn-repository-paths";

type RevisionGraphStatusCounts = Pick<
    RevisionGraphNodeMetadata,
    "incomingChangeCount" | "localChangeCount"
>;

export function isRepositoryPathWithinScope(
    repositoryPath: string,
    scopeRepositoryPath: string
): boolean {
    const normalizedRepositoryPath = normalizeRepositoryPath(repositoryPath);
    const normalizedScopeRepositoryPath = normalizeRepositoryPath(scopeRepositoryPath);
    return (
        normalizedRepositoryPath === normalizedScopeRepositoryPath ||
        normalizedRepositoryPath.startsWith(`${normalizedScopeRepositoryPath}/`)
    );
}

export function buildRevisionGraphStatusMetadata(options: {
    readonly repositoryPaths: readonly string[];
    readonly localStatuses: readonly SvnStatusEntry[];
    readonly remoteStatuses: readonly SvnStatusEntry[];
    readonly resolveRepositoryPath: (absolutePath: string) => string;
}): Record<string, RevisionGraphStatusCounts> {
    const normalizedRepositoryPaths = options.repositoryPaths.map((repositoryPath) =>
        normalizeRepositoryPath(repositoryPath)
    );
    const metadata = Object.fromEntries(
        normalizedRepositoryPaths.map((repositoryPath) => [
            repositoryPath,
            {
                localChangeCount: 0,
                incomingChangeCount: 0,
            },
        ])
    ) as Record<string, RevisionGraphStatusCounts>;

    const applyStatuses = (
        statuses: readonly SvnStatusEntry[],
        key: keyof RevisionGraphStatusCounts
    ) => {
        for (const status of statuses) {
            const repositoryPath = normalizeRepositoryPath(
                options.resolveRepositoryPath(status.absolutePath)
            );
            for (const candidatePath of normalizedRepositoryPaths) {
                if (isRepositoryPathWithinScope(repositoryPath, candidatePath)) {
                    const candidateMetadata = metadata[candidatePath];
                    if (candidateMetadata) {
                        candidateMetadata[key] = (candidateMetadata[key] ?? 0) + 1;
                    }
                }
            }
        }
    };

    applyStatuses(options.localStatuses, "localChangeCount");
    applyStatuses(options.remoteStatuses, "incomingChangeCount");

    return metadata;
}

export function mapRevisionGraphTargetPath(
    referenceRepositoryPath: string,
    selectedRepositoryPath: string,
    selectedReferencePath: string
): string {
    const normalizedReferenceRepositoryPath =
        normalizeRepositoryPath(referenceRepositoryPath);
    const normalizedSelectedRepositoryPath =
        normalizeRepositoryPath(selectedRepositoryPath);
    const normalizedSelectedReferencePath =
        normalizeRepositoryPath(selectedReferencePath);
    if (
        normalizedSelectedRepositoryPath === normalizedSelectedReferencePath ||
        !normalizedSelectedRepositoryPath.startsWith(
            `${normalizedSelectedReferencePath}/`
        )
    ) {
        return normalizedReferenceRepositoryPath;
    }

    const relativePath = normalizedSelectedRepositoryPath.slice(
        normalizedSelectedReferencePath.length + 1
    );
    return normalizeRepositoryPath(
        `${normalizedReferenceRepositoryPath}/${relativePath}`
    );
}

export function formatRevisionGraphChangedPaths(
    entry: SvnLogEntry,
    options: {
        readonly noChangedPathsReportedLabel: string;
        readonly formatCopiedFrom: (path: string) => string;
    }
): string[] {
    if (entry.changes.length === 0) {
        return [options.noChangedPathsReportedLabel];
    }

    return entry.changes.map((change) => {
        const copiedFrom = change.copyfromPath
            ? ` (${options.formatCopiedFrom(change.copyfromPath)})`
            : "";
        return `${change.action} ${change.path}${copiedFrom}`;
    });
}

export function enrichRevisionGraphHoverState(graph: RevisionGraphData): RevisionGraphData {
    return {
        ...graph,
        nodes: graph.nodes.map((node) => ({
            ...node,
            hoverSummary: [
                ...(node.hoverSummary ?? []),
                `URL: ${node.url}`,
                ...(node.localChangeCount
                    ? [`Local changes: ${node.localChangeCount}`]
                    : []),
                ...(node.incomingChangeCount
                    ? [`Incoming changes: ${node.incomingChangeCount}`]
                    : []),
                ...(node.lockOwner ? [`Locked by ${node.lockOwner}`] : []),
                ...(node.lastSeenRevision
                    ? [`Last seen in r${node.lastSeenRevision}`]
                    : []),
            ],
        })),
    };
}
