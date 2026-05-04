import * as nodePath from "node:path";
import { isSameOrChildWorkingCopyPath } from "./svn-repository-paths";

export type SvnPatchActionCode = "A" | "D" | "U" | "C" | "G";

export interface SvnPatchOutputSummary {
    readonly lines: string[];
    readonly actionCounts: Readonly<Record<SvnPatchActionCode, number>>;
    readonly hasOffsets: boolean;
    readonly hasRejects: boolean;
    readonly hasWarnings: boolean;
    readonly hasConflicts: boolean;
}

const patchActionCodes: readonly SvnPatchActionCode[] = ["A", "D", "U", "C", "G"];

export function deriveWorkingCopyPatchFileName(
    rootPath: string,
    selectedPaths?: readonly string[]
): string {
    const normalizedPaths = normalizePatchExportPaths(selectedPaths);
    if (normalizedPaths.length === 1) {
        return `${sanitizePatchFileName(nodePath.basename(normalizedPaths[0] ?? ""))}-changes.patch`;
    }

    if (normalizedPaths.length > 1) {
        return `${sanitizePatchFileName(nodePath.basename(rootPath))}-selected-changes.patch`;
    }

    return `${sanitizePatchFileName(nodePath.basename(rootPath))}-working-copy.patch`;
}

export function deriveRevisionPatchFileName(
    repositoryPath: string | undefined,
    revision: number
): string {
    const normalizedRevision = Math.max(1, Math.floor(revision));
    const fallbackName = `revision-r${normalizedRevision}`;
    const trimmedPath = repositoryPath?.trim();
    if (!trimmedPath) {
        return `${fallbackName}.patch`;
    }

    const baseName = getRepositoryPathLeafName(trimmedPath);
    return `${sanitizePatchFileName(baseName || fallbackName)}-r${normalizedRevision}.patch`;
}

export function normalizePatchExportPaths(paths?: readonly string[]): string[] {
    if (!paths || paths.length === 0) {
        return [];
    }

    const sortedPaths = [...new Set(paths.filter(Boolean))].sort(
        (left, right) => left.length - right.length
    );
    const normalizedPaths: string[] = [];

    for (const targetPath of sortedPaths) {
        if (
            !normalizedPaths.some((normalizedPath) =>
                isSameOrChildWorkingCopyPath(normalizedPath, targetPath)
            )
        ) {
            normalizedPaths.push(targetPath);
        }
    }

    return normalizedPaths;
}

export function normalizePatchStripCount(value: string | number | undefined): number | undefined {
    if (typeof value === "number") {
        return Number.isInteger(value) && value >= 0 ? value : undefined;
    }

    const trimmedValue = value?.trim();
    if (!trimmedValue || !/^\d+$/u.test(trimmedValue)) {
        return undefined;
    }

    return Number.parseInt(trimmedValue, 10);
}

export function summarizeSvnPatchOutput(output: string): SvnPatchOutputSummary {
    const lines = output
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.trim().length > 0);
    const actionCounts = {
        A: 0,
        D: 0,
        U: 0,
        C: 0,
        G: 0,
    } satisfies Record<SvnPatchActionCode, number>;
    let hasOffsets = false;
    let hasRejects = false;

    for (const line of lines) {
        const actionCode = line[0] as SvnPatchActionCode | undefined;
        if (
            actionCode &&
            patchActionCodes.includes(actionCode) &&
            /\s/u.test(line[1] ?? "")
        ) {
            actionCounts[actionCode] += 1;
        }

        if (/^>\s*/u.test(line)) {
            hasOffsets = true;
        }

        if (/\.svnpatch\.rej\b|reject(?:ed|s?)\b/iu.test(line)) {
            hasRejects = true;
        }
    }

    const hasConflicts = actionCounts.C > 0;
    return {
        lines,
        actionCounts,
        hasOffsets,
        hasRejects,
        hasConflicts,
        hasWarnings: hasConflicts || hasOffsets || hasRejects,
    };
}

function getRepositoryPathLeafName(value: string): string {
    const normalizedValue = value.replace(/\\/g, "/").replace(/\/+$/u, "");
    if (!normalizedValue || normalizedValue === "/") {
        return "repository";
    }

    const absolutePath = normalizedValue.includes("://")
        ? safeUrlPathname(normalizedValue)
        : normalizedValue;
    const segments = absolutePath.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "repository";
}

function safeUrlPathname(value: string): string {
    try {
        return new URL(value).pathname;
    } catch {
        return value;
    }
}

function sanitizePatchFileName(value: string): string {
    const trimmedValue = value.trim();
    const sanitizedValue = trimmedValue.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return sanitizedValue || "svn-patch";
}
