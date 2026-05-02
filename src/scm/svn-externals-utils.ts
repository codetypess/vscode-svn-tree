export type SvnExternalDefinitionFormat = "source-first" | "local-first";

export interface SvnExternalDefinition {
    readonly localPath: string;
    readonly source: string;
    readonly revision?: string;
    readonly format: SvnExternalDefinitionFormat;
}

export interface ParsedSvnExternalDefinitions {
    readonly definitions: readonly SvnExternalDefinition[];
    readonly invalidLines: readonly string[];
}

export function normalizeExternalsEditorValue(value: string): string | undefined {
    const normalizedValue = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (!normalizedValue.trim()) {
        return undefined;
    }

    return normalizedValue.replace(/\n+$/u, "");
}

export function parseExternalsDefinitions(
    value: string | undefined
): ParsedSvnExternalDefinitions {
    const normalizedValue = normalizeExternalsEditorValue(value ?? "");
    if (!normalizedValue) {
        return {
            definitions: [],
            invalidLines: [],
        };
    }

    const definitions: SvnExternalDefinition[] = [];
    const invalidLines: string[] = [];
    for (const rawLine of normalizedValue.split("\n")) {
        const trimmedLine = rawLine.trim();
        if (!trimmedLine) {
            continue;
        }

        const definition = parseExternalDefinitionLine(trimmedLine);
        if (!definition) {
            invalidLines.push(trimmedLine);
            continue;
        }

        definitions.push(definition);
    }

    return {
        definitions,
        invalidLines,
    };
}

export function serializeExternalsDefinitions(
    definitions: readonly SvnExternalDefinition[]
): string | undefined {
    const lines = definitions
        .map((definition) => serializeExternalDefinition(definition))
        .filter((line): line is string => Boolean(line));
    if (lines.length === 0) {
        return undefined;
    }

    return lines.join("\n");
}

function parseExternalDefinitionLine(line: string): SvnExternalDefinition | undefined {
    const tokens = line.split(/\s+/u).filter(Boolean);
    if (tokens.length < 2) {
        return undefined;
    }

    let index = 0;
    let revision: string | undefined;
    if (tokens[index] === "-r") {
        revision = tokens[index + 1]?.trim();
        index += 2;
        if (!revision) {
            return undefined;
        }
    }

    const definitionTokens = tokens.slice(index);
    if (definitionTokens.length !== 2) {
        return undefined;
    }

    const [firstToken, secondToken] = definitionTokens;
    if (looksLikeExternalSource(firstToken) && !looksLikeExternalSource(secondToken)) {
        return {
            localPath: secondToken,
            source: firstToken,
            revision,
            format: "source-first",
        };
    }

    if (!looksLikeExternalSource(firstToken) && looksLikeExternalSource(secondToken)) {
        return {
            localPath: firstToken,
            source: secondToken,
            revision,
            format: "local-first",
        };
    }

    return undefined;
}

function serializeExternalDefinition(definition: SvnExternalDefinition): string | undefined {
    const localPath = definition.localPath.trim();
    const source = definition.source.trim();
    const revision = definition.revision?.trim();
    if (!localPath || !source) {
        return undefined;
    }

    const parts = revision ? ["-r", revision] : [];
    if (definition.format === "local-first") {
        parts.push(localPath, source);
    } else {
        parts.push(source, localPath);
    }

    return parts.join(" ");
}

function looksLikeExternalSource(token: string): boolean {
    return (
        /^[a-z][a-z0-9+.-]*:\/\//iu.test(token) ||
        token.startsWith("^/") ||
        token.startsWith("//") ||
        token.startsWith("../") ||
        token.startsWith("..\\") ||
        token.startsWith("/")
    );
}
