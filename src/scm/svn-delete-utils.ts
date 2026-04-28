import { isSameOrChildWorkingCopyPath } from "./svn-repository-paths";

export type DeleteTargetKind = "versioned" | "unversioned";

export interface DeleteTarget {
    absolutePath: string;
    kind: DeleteTargetKind;
}

export interface PartitionedDeleteTargets {
    versionedPaths: string[];
    unversionedPaths: string[];
}

export function partitionDeleteTargets(
    targets: readonly DeleteTarget[]
): PartitionedDeleteTargets {
    const versionedPaths = collapseDeleteRoots(
        targets
            .filter((target) => target.kind === "versioned")
            .map((target) => target.absolutePath)
    );
    const unversionedPaths = collapseDeleteRoots(
        targets
            .filter((target) => target.kind === "unversioned")
            .map((target) => target.absolutePath)
    ).filter(
        (targetPath) =>
            !versionedPaths.some((versionedPath) =>
                isSameOrChildWorkingCopyPath(versionedPath, targetPath)
            )
    );

    return {
        versionedPaths,
        unversionedPaths,
    };
}

function collapseDeleteRoots(paths: readonly string[]): string[] {
    const sortedPaths = [...new Set(paths.filter(Boolean))].sort(
        (left, right) => left.length - right.length
    );
    const roots: string[] = [];

    for (const targetPath of sortedPaths) {
        if (!roots.some((rootPath) => isSameOrChildWorkingCopyPath(rootPath, targetPath))) {
            roots.push(targetPath);
        }
    }

    return roots;
}
