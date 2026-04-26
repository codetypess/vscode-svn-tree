import type { SvnHistoryFilters, SvnLogEntry } from "../svn/svn-types";

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

function normalizeHistoryFilterValue(value: string | undefined): string | undefined {
    const normalizedValue = value?.trim();
    return normalizedValue ? normalizedValue : undefined;
}

function normalizeHistoryFilterDate(value: string | undefined): string | undefined {
    const normalizedValue = normalizeHistoryFilterValue(value);
    return normalizedValue && /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)
        ? normalizedValue
        : undefined;
}

function getHistoryFilterDateBoundary(
    value: string | undefined,
    endOfDay: boolean
): number | undefined {
    const normalizedValue = normalizeHistoryFilterDate(value);
    if (!normalizedValue) {
        return undefined;
    }

    const date = new Date(`${normalizedValue}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
        return undefined;
    }

    if (endOfDay) {
        date.setHours(23, 59, 59, 999);
    }

    return date.getTime();
}

export function normalizeHistoryFilters(
    filters?: Partial<SvnHistoryFilters>
): SvnHistoryFilters {
    return {
        author: normalizeHistoryFilterValue(filters?.author),
        message: normalizeHistoryFilterValue(filters?.message),
        changedPath: normalizeHistoryFilterValue(filters?.changedPath),
        dateFrom: normalizeHistoryFilterDate(filters?.dateFrom),
        dateTo: normalizeHistoryFilterDate(filters?.dateTo),
    };
}

export function areHistoryFiltersEqual(
    left?: Partial<SvnHistoryFilters>,
    right?: Partial<SvnHistoryFilters>
): boolean {
    const normalizedLeft = normalizeHistoryFilters(left);
    const normalizedRight = normalizeHistoryFilters(right);

    return (
        normalizedLeft.author === normalizedRight.author &&
        normalizedLeft.message === normalizedRight.message &&
        normalizedLeft.changedPath === normalizedRight.changedPath &&
        normalizedLeft.dateFrom === normalizedRight.dateFrom &&
        normalizedLeft.dateTo === normalizedRight.dateTo
    );
}

export function hasActiveHistoryFilters(filters?: Partial<SvnHistoryFilters>): boolean {
    const normalizedFilters = normalizeHistoryFilters(filters);

    return Boolean(
        normalizedFilters.author ||
            normalizedFilters.message ||
            normalizedFilters.changedPath ||
            normalizedFilters.dateFrom ||
            normalizedFilters.dateTo
    );
}

export function hasInvalidHistoryDateRange(
    filters?: Partial<SvnHistoryFilters>
): boolean {
    const normalizedFilters = normalizeHistoryFilters(filters);
    const startDate = getHistoryFilterDateBoundary(normalizedFilters.dateFrom, false);
    const endDate = getHistoryFilterDateBoundary(normalizedFilters.dateTo, true);

    return (
        startDate !== undefined &&
        endDate !== undefined &&
        startDate > endDate
    );
}

export function matchesHistoryFilters(
    entry: SvnLogEntry,
    filters?: Partial<SvnHistoryFilters>
): boolean {
    const normalizedFilters = normalizeHistoryFilters(filters);
    const authorFilter = normalizedFilters.author?.toLowerCase();
    if (authorFilter && !entry.author.toLowerCase().includes(authorFilter)) {
        return false;
    }

    const messageFilter = normalizedFilters.message?.toLowerCase();
    if (messageFilter && !entry.message.toLowerCase().includes(messageFilter)) {
        return false;
    }

    const changedPathFilter = normalizedFilters.changedPath?.toLowerCase();
    if (
        changedPathFilter &&
        !entry.changes.some((change) => change.path.toLowerCase().includes(changedPathFilter))
    ) {
        return false;
    }

    const entryDate = new Date(entry.date).getTime();
    const hasEntryDate = Number.isFinite(entryDate);
    const startDate = getHistoryFilterDateBoundary(normalizedFilters.dateFrom, false);
    if (startDate !== undefined && (!hasEntryDate || entryDate < startDate)) {
        return false;
    }

    const endDate = getHistoryFilterDateBoundary(normalizedFilters.dateTo, true);
    if (endDate !== undefined && (!hasEntryDate || entryDate > endDate)) {
        return false;
    }

    return true;
}
