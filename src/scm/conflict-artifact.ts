import * as nodePath from "node:path";
import type { SvnStatusEntry } from "../svn/svn-types";

function getRelatedConflictPath(artifactPath: string): string | undefined {
    const basename = nodePath.basename(artifactPath);
    const dirname = nodePath.dirname(artifactPath);

    if (basename.endsWith(".mine")) {
        return nodePath.join(dirname, basename.slice(0, -".mine".length));
    }

    if (basename.endsWith(".prej")) {
        return nodePath.join(dirname, basename.slice(0, -".prej".length));
    }

    const revisionMatch = basename.match(/^(.*)\.r\d+$/);
    if (!revisionMatch || !revisionMatch[1]) {
        return undefined;
    }

    return nodePath.join(dirname, revisionMatch[1]);
}

export function isConflictArtifactStatus(
    status: SvnStatusEntry,
    conflictedAbsolutePaths: ReadonlySet<string>
): boolean {
    if (status.wcStatus !== "unversioned") {
        return false;
    }

    const relatedPath = getRelatedConflictPath(status.absolutePath);
    return relatedPath !== undefined && conflictedAbsolutePaths.has(relatedPath);
}
