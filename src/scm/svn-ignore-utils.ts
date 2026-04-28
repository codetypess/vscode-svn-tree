import * as nodePath from "node:path";

export function parseIgnoreEntries(value: string | undefined): string[] {
    return [...new Set(splitIgnoreEntries(value))].sort((left, right) =>
        left.localeCompare(right)
    );
}

export function serializeIgnoreEntries(entries: readonly string[]): string | undefined {
    const normalizedEntries = [...new Set(entries.map((entry) => entry.trim()).filter(Boolean))].sort(
        (left, right) => left.localeCompare(right)
    );

    return normalizedEntries.length > 0 ? normalizedEntries.join("\n") : undefined;
}

export function normalizeIgnoreEditorValue(value: string): string | undefined {
    return serializeIgnoreEntries(value.split(/\r?\n/u));
}

export function getSuggestedIgnoreEntry(
    propertyDirectoryPath: string,
    targetPath: string
): string | undefined {
    const relativePath = nodePath.relative(propertyDirectoryPath, targetPath);
    if (
        !relativePath ||
        relativePath === "." ||
        relativePath === ".." ||
        relativePath.startsWith(`..${nodePath.sep}`) ||
        nodePath.isAbsolute(relativePath)
    ) {
        return undefined;
    }

    return relativePath.replace(/\\/g, "/").split("/")[0] || undefined;
}

function splitIgnoreEntries(value: string | undefined): string[] {
    return (value ?? "")
        .split(/\r?\n/u)
        .map((entry) => entry.trim())
        .filter(Boolean);
}
