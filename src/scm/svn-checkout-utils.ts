const invalidDestinationNamePattern = /[<>:"/\\|?*\u0000-\u001f]/g;

export function normalizeCheckoutRepositoryUrl(
    value: string | undefined
): string | undefined {
    const trimmedValue = value?.trim();
    if (!trimmedValue) {
        return undefined;
    }

    try {
        const parsedUrl = new URL(trimmedValue);
        if (!parsedUrl.protocol) {
            return undefined;
        }

        if (parsedUrl.protocol !== "file:" && !parsedUrl.hostname) {
            return undefined;
        }

        return trimmedValue;
    } catch {
        return undefined;
    }
}

export function normalizeCheckoutRevision(
    value: string | number | undefined
): string | undefined {
    if (typeof value === "number") {
        return Number.isInteger(value) && value > 0 ? String(value) : undefined;
    }

    const trimmedValue = value?.trim();
    if (!trimmedValue) {
        return undefined;
    }

    if (trimmedValue.toUpperCase() === "HEAD") {
        return "HEAD";
    }

    if (!/^\d+$/.test(trimmedValue)) {
        return undefined;
    }

    const revision = Number(trimmedValue);
    if (!Number.isSafeInteger(revision) || revision < 1) {
        return undefined;
    }

    return String(revision);
}

export function deriveCheckoutDestinationName(
    repositoryUrl: string,
    revision: string
): string {
    let baseName = "";

    try {
        const parsedUrl = new URL(repositoryUrl);
        const segments = parsedUrl.pathname
            .split("/")
            .map((segment) => segment.trim())
            .filter((segment) => segment.length > 0);
        const lastSegment = segments.at(-1);
        if (lastSegment) {
            try {
                baseName = decodeURIComponent(lastSegment);
            } catch {
                baseName = lastSegment;
            }
        }
    } catch {
        baseName = "";
    }

    const sanitizedBaseName =
        sanitizeDestinationName(baseName) || "svn-checkout";

    if (revision === "HEAD") {
        return sanitizedBaseName;
    }

    return `${sanitizedBaseName}-r${revision}`;
}

function sanitizeDestinationName(value: string): string {
    return value
        .replace(invalidDestinationNamePattern, "-")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^[.\s]+|[.\s]+$/g, "");
}
