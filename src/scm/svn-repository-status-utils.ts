import type { SvnStatusEntry } from "../svn/svn-types";
import { isConflictArtifactStatus } from "./conflict-artifact";

export interface PartitionedStatusEntries {
    readonly changeStatuses: SvnStatusEntry[];
    readonly conflictArtifactStatuses: SvnStatusEntry[];
    readonly unversionedStatuses: SvnStatusEntry[];
    readonly remoteStatuses: SvnStatusEntry[];
}

export function isLocalChange(status: SvnStatusEntry): boolean {
    return (
        status.wcStatus !== "normal" &&
        status.wcStatus !== "none" &&
        status.wcStatus !== "unversioned"
    );
}

export function isUnversionedChange(status: SvnStatusEntry): boolean {
    return status.wcStatus === "unversioned";
}

export function isConflictedChange(status: SvnStatusEntry): boolean {
    return status.wcStatus === "conflicted";
}

export function isRemoteChange(status: SvnStatusEntry): boolean {
    return !!status.reposStatus && status.reposStatus !== "none";
}

export function sortStatusesByRelativePath(
    statuses: readonly SvnStatusEntry[]
): SvnStatusEntry[] {
    return [...statuses].sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath)
    );
}

export function partitionStatusEntries(
    statuses: readonly SvnStatusEntry[],
    includeRemote: boolean
): PartitionedStatusEntries {
    const conflictedPaths = new Set(
        statuses.filter(isConflictedChange).map((status) => status.absolutePath)
    );

    return {
        changeStatuses: sortStatusesByRelativePath(statuses.filter(isLocalChange)),
        conflictArtifactStatuses: sortStatusesByRelativePath(
            statuses.filter((status) => isConflictArtifactStatus(status, conflictedPaths))
        ),
        unversionedStatuses: sortStatusesByRelativePath(
            statuses.filter(
                (status) =>
                    isUnversionedChange(status) &&
                    !isConflictArtifactStatus(status, conflictedPaths)
            )
        ),
        remoteStatuses: includeRemote
            ? sortStatusesByRelativePath(statuses.filter(isRemoteChange))
            : [],
    };
}
