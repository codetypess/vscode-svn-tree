import * as nodePath from "node:path";
import { XMLParser } from "fast-xml-parser";
import type {
    SvnLogEntry,
    SvnLogPathChange,
    SvnNodeKind,
    SvnStatusEntry,
    SvnWorkingCopyInfo,
    SvnWorkingCopyStatus,
    SvnRepositoryStatus,
} from "./svn-types";

const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseTagValue: false,
    trimValues: false,
});

type MaybeArray<T> = T | T[] | undefined;

function asArray<T>(value: MaybeArray<T>): T[] {
    if (value === undefined) {
        return [];
    }

    return Array.isArray(value) ? value : [value];
}

function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function toNodeKind(value: unknown): SvnNodeKind {
    if (value === "dir" || value === "file") {
        return value;
    }

    return "unknown";
}

function toWorkingCopyStatus(value: unknown): SvnWorkingCopyStatus {
    const status = String(value ?? "none");

    if (
        status === "added" ||
        status === "conflicted" ||
        status === "deleted" ||
        status === "external" ||
        status === "ignored" ||
        status === "incomplete" ||
        status === "missing" ||
        status === "modified" ||
        status === "normal" ||
        status === "none" ||
        status === "obstructed" ||
        status === "replaced" ||
        status === "unversioned"
    ) {
        return status;
    }

    return "none";
}

function toRepositoryStatus(value: unknown): SvnRepositoryStatus | undefined {
    const status = String(value ?? "none");

    if (
        status === "added" ||
        status === "deleted" ||
        status === "modified" ||
        status === "none" ||
        status === "replaced"
    ) {
        return status;
    }

    return undefined;
}

function trimCaretPrefix(value: string): string {
    return value.startsWith("^") ? value.slice(1) : value;
}

export function parseInfoXml(xml: string, fallbackPath: string): SvnWorkingCopyInfo | undefined {
    const parsed = xmlParser.parse(xml) as {
        info?: {
            entry?: {
                path?: string;
                revision?: string;
                url?: string;
                "relative-url"?: string;
                repository?: {
                    root?: string;
                };
                "wc-info"?: {
                    "wcroot-abspath"?: string;
                };
            };
        };
    };

    const entry = parsed.info?.entry;
    const url = asString(entry?.url);
    const repositoryRoot = asString(entry?.repository?.root);
    const workingCopyRoot = asString(entry?.["wc-info"]?.["wcroot-abspath"]);

    if (!url || !repositoryRoot || !workingCopyRoot) {
        return undefined;
    }

    const repositoryRelativePath = trimCaretPrefix(asString(entry?.["relative-url"])) || "/";

    return {
        rootPath: fallbackPath,
        workingCopyRoot,
        url,
        repositoryRoot,
        repositoryRelativePath,
        revision: asString(entry?.revision) || undefined,
    };
}

export function parseStatusXml(xml: string, rootPath: string): SvnStatusEntry[] {
    const parsed = xmlParser.parse(xml) as {
        status?: {
            target?: MaybeArray<{
                path?: string;
                entry?: MaybeArray<{
                    path?: string;
                    kind?: string;
                    "wc-status"?: {
                        item?: string;
                        revision?: string;
                        commit?: {
                            revision?: string;
                            author?: string;
                            date?: string;
                        };
                    };
                    "repos-status"?: {
                        item?: string;
                    };
                }>;
            }>;
        };
    };

    const targets = asArray(parsed.status?.target);

    return targets.flatMap((target) => {
        const targetBasePath = target.path ? nodePath.resolve(rootPath, target.path) : rootPath;

        return asArray(target.entry).map((entry) => {
            const absolutePath = nodePath.resolve(targetBasePath, entry.path ?? ".");
            const relativePath =
                nodePath.relative(rootPath, absolutePath) || nodePath.basename(absolutePath);
            const wcStatus = toWorkingCopyStatus(entry["wc-status"]?.item);
            const reposStatus = toRepositoryStatus(entry["repos-status"]?.item);

            return {
                absolutePath,
                relativePath,
                kind: toNodeKind(entry.kind),
                wcStatus,
                reposStatus,
                revision: asString(entry["wc-status"]?.revision) || undefined,
                committedRevision: asString(entry["wc-status"]?.commit?.revision) || undefined,
                author: asString(entry["wc-status"]?.commit?.author) || undefined,
                date: asString(entry["wc-status"]?.commit?.date) || undefined,
            };
        });
    });
}

export function parseLogXml(xml: string): SvnLogEntry[] {
    const parsed = xmlParser.parse(xml) as {
        log?: {
            logentry?: MaybeArray<{
                revision?: string;
                author?: string;
                date?: string;
                msg?: string;
                paths?: {
                    path?: MaybeArray<{
                        action?: "A" | "D" | "M" | "R";
                        kind?: string;
                        "copyfrom-path"?: string;
                        "copyfrom-rev"?: string;
                        "text-mods"?: string;
                        "prop-mods"?: string;
                        "#text"?: string;
                    }>;
                };
            }>;
        };
    };

    return asArray(parsed.log?.logentry).map((entry) => {
        const changes: SvnLogPathChange[] = asArray(entry.paths?.path).map((pathEntry) => ({
            action: pathEntry.action ?? "M",
            kind: toNodeKind(pathEntry.kind),
            path: asString(pathEntry["#text"]),
            copyfromPath: asString(pathEntry["copyfrom-path"]) || undefined,
            copyfromRevision: asString(pathEntry["copyfrom-rev"]) || undefined,
            textMods: asString(pathEntry["text-mods"]) || undefined,
            propMods: asString(pathEntry["prop-mods"]) || undefined,
        }));

        return {
            revision: Number(entry.revision ?? 0),
            author: asString(entry.author) || "unknown",
            date: asString(entry.date),
            message: asString(entry.msg),
            changes,
        };
    });
}
