import type { SvnLogEntry } from "../svn/svn-types";

export function toRevisionNumber(value: string | number | undefined): number | undefined {
    const revision = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(revision) || revision < 1) {
        return undefined;
    }

    return Math.floor(revision);
}

export function markIncomingHistoryEntries(
    entries: readonly SvnLogEntry[],
    currentRevision: string | number | undefined
): SvnLogEntry[] {
    const baselineRevision = toRevisionNumber(currentRevision);

    return entries.map((entry) => ({
        ...entry,
        incoming:
            baselineRevision !== undefined ? entry.revision > baselineRevision : false,
    }));
}
