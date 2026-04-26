import React from "react";
import { normalizeHistoryFilters } from "./history-utils";
import type { SvnHistoryFilters } from "../svn/svn-types";
import type { RuntimeI18n } from "../i18n";
import type {
    ChangeTreeDirectory,
    ChangeTreeNodeModel,
    CollapsedDirectories,
    HistoryChange,
    HistoryFilterFormState,
    HistoryResponseMessage,
    HistoryViewStyle,
    MenuPosition,
} from "./history-webview-types";

export function getDisplayChangePath(changePath: string): string {
    return String(changePath || "").replace(/^\/+/, "");
}

export function createEmptyHistoryFilterForm(): HistoryFilterFormState {
    return {
        author: "",
        message: "",
        changedPath: "",
        dateFrom: "",
        dateTo: "",
    };
}

export function createHistoryFilterForm(
    filters?: Partial<SvnHistoryFilters>
): HistoryFilterFormState {
    const normalizedFilters = normalizeHistoryFilters(filters);

    return {
        author: normalizedFilters.author ?? "",
        message: normalizedFilters.message ?? "",
        changedPath: normalizedFilters.changedPath ?? "",
        dateFrom: normalizedFilters.dateFrom ?? "",
        dateTo: normalizedFilters.dateTo ?? "",
    };
}

export function countActiveHistoryFilters(filters?: Partial<SvnHistoryFilters>): number {
    const normalizedFilters = normalizeHistoryFilters(filters);

    return [
        normalizedFilters.author,
        normalizedFilters.message,
        normalizedFilters.changedPath,
        normalizedFilters.dateFrom,
        normalizedFilters.dateTo,
    ].filter(Boolean).length;
}

export function parseHistoryDateValue(value: string): Date | undefined {
    const trimmedValue = value.trim();
    const match = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        return undefined;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (
        Number.isNaN(date.getTime()) ||
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return undefined;
    }

    return date;
}

export function formatHistoryDateValue(date: Date | undefined): string {
    if (!date || Number.isNaN(date.getTime())) {
        return "";
    }

    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export function isHistoryDataMessage(
    data: unknown
): data is Extract<HistoryResponseMessage, { type: "history-data" }> {
    if (!isObject(data) || data.type !== "history-data" || !isObject(data.payload)) {
        return false;
    }

    return Array.isArray(data.payload.entries);
}

export function isHistoryErrorMessage(
    data: unknown
): data is Extract<HistoryResponseMessage, { type: "history-error" }> {
    if (!isObject(data) || data.type !== "history-error" || !isObject(data.payload)) {
        return false;
    }

    return typeof data.payload.message === "string";
}

export function isHistoryConfigMessage(
    data: unknown
): data is Extract<HistoryResponseMessage, { type: "history-config" }> {
    return (
        isObject(data) &&
        data.type === "history-config" &&
        isObject(data.payload) &&
        (data.payload.locale === "en" || data.payload.locale === "zh-CN")
    );
}

export function createCommandUri(command: string, args: readonly unknown[]): string {
    return "command:" + command + "?" + encodeURIComponent(JSON.stringify(args));
}

export function createHistoryDiffCommandUri(
    rootPath: string,
    revision: number,
    path: string,
    action: string
): string {
    return createCommandUri("svn-tree.open-history-diff", [
        {
            rootPath,
            revision,
            path,
            action,
        },
    ]);
}

export function formatDate(
    value: string | undefined,
    i18n: RuntimeI18n,
    style: HistoryViewStyle = "summary"
): string {
    if (!value) {
        return i18n.t("unknownDate");
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat(i18n.locale, {
        dateStyle: style === "detail" ? "full" : "medium",
        timeStyle: "short",
    }).format(date);
}

export function summarizeMessage(value: string | undefined, i18n: RuntimeI18n): string {
    const normalized = String(value || "").trim();
    if (!normalized) {
        return i18n.t("noCommitMessage");
    }

    return normalized.split(/\r?\n/, 1)[0];
}

export function formatPathCount(count: number, i18n: RuntimeI18n): string {
    return i18n.formatChangedPathCount(count);
}

export function isIncomingEntry(entry: { incoming?: boolean } | undefined): boolean {
    return entry?.incoming === true;
}

export function isCurrentRevisionEntry(
    entry: { revision: number },
    currentRevision: number | undefined
): boolean {
    return typeof currentRevision === "number" && entry.revision === currentRevision;
}

export function renderHighlightedText(
    value: string | number | undefined,
    query: string
): React.ReactNode {
    const text = String(value ?? "");
    const trimmedQuery = String(query ?? "").trim();

    if (!trimmedQuery) {
        return text;
    }

    const normalizedText = text.toLowerCase();
    const normalizedQuery = trimmedQuery.toLowerCase();

    if (!normalizedText.includes(normalizedQuery)) {
        return text;
    }

    const parts: React.ReactNode[] = [];
    let startIndex = 0;
    let matchIndex = normalizedText.indexOf(normalizedQuery, startIndex);

    while (matchIndex !== -1) {
        if (matchIndex > startIndex) {
            parts.push(text.slice(startIndex, matchIndex));
        }

        const matchedText = text.slice(matchIndex, matchIndex + trimmedQuery.length);
        parts.push(
            React.createElement(
                "mark",
                {
                    className: "search-highlight",
                    key: `${matchIndex}:${matchedText}`,
                },
                matchedText
            )
        );

        startIndex = matchIndex + trimmedQuery.length;
        matchIndex = normalizedText.indexOf(normalizedQuery, startIndex);
    }

    if (startIndex < text.length) {
        parts.push(text.slice(startIndex));
    }

    return parts;
}

export function actionToIconClass(action: string): string {
    if (action === "A") {
        return "codicon-diff-added";
    }

    if (action === "D") {
        return "codicon-diff-removed";
    }

    if (action === "R") {
        return "codicon-diff-renamed";
    }

    return "codicon-diff-modified";
}

export function directoryKey(revision: number, fullPath: string): string {
    return String(revision) + ":" + String(fullPath);
}

export function buildChangeTree(changes: HistoryChange[]): ChangeTreeNodeModel[] {
    const root: ChangeTreeNodeModel[] = [];

    function getOrCreateDirectory(
        nodes: ChangeTreeNodeModel[],
        name: string,
        fullPath: string
    ): ChangeTreeDirectory {
        let match = nodes.find(
            (node): node is ChangeTreeDirectory => node.type === "dir" && node.name === name
        );
        if (!match) {
            match = {
                type: "dir",
                name,
                fullPath,
                children: [],
            };
            nodes.push(match);
        }

        return match;
    }

    for (const change of changes) {
        const segments = String(change.path || "")
            .split("/")
            .filter(Boolean);
        let currentNodes = root;
        let currentPath = "";

        for (let index = 0; index < segments.length; index += 1) {
            const segment = segments[index];
            currentPath += "/" + segment;
            const isLeaf = index === segments.length - 1;

            if (isLeaf) {
                currentNodes.push({
                    type: "file",
                    name: segment,
                    fullPath: change.path,
                    change,
                });
                continue;
            }

            const directory = getOrCreateDirectory(currentNodes, segment, currentPath);
            currentNodes = directory.children;
        }
    }

    function sortNodes(nodes: ChangeTreeNodeModel[]): void {
        nodes.sort((left, right) => {
            if (left.type !== right.type) {
                return left.type === "dir" ? -1 : 1;
            }

            return left.name.localeCompare(right.name);
        });

        for (const node of nodes) {
            if (node.type === "dir") {
                sortNodes(node.children);
            }
        }
    }

    function compressDirectories(nodes: ChangeTreeNodeModel[]): ChangeTreeNodeModel[] {
        return nodes.map((node) => {
            if (node.type !== "dir") {
                return node;
            }

            let name = node.name;
            let fullPath = node.fullPath;
            let current = node;

            while (current.children.length === 1 && current.children[0].type === "dir") {
                current = current.children[0];
                name += " / " + current.name;
                fullPath = current.fullPath;
            }

            return {
                type: "dir",
                name,
                fullPath,
                children: compressDirectories(current.children),
            };
        });
    }

    sortNodes(root);
    return compressDirectories(root);
}

const contextMenuViewportMarginPx = 8;
const contextMenuMaxWidthPx = 360;
const contextMenuEstimatedHeightPx = 196;
const collapsedCommitHeightEstimatePx = 28;
const expandedCommitHeightEstimatePx = 320;
export const historyFooterHeightEstimatePx = 94;
export const historyOverscanPx = 480;

export function getMenuPosition(clientX: number, clientY: number): MenuPosition {
    const estimatedMenuWidth = Math.min(
        contextMenuMaxWidthPx,
        Math.max(0, window.innerWidth - contextMenuViewportMarginPx * 2)
    );
    return {
        x: Math.max(
            contextMenuViewportMarginPx,
            Math.min(
                clientX,
                window.innerWidth - contextMenuViewportMarginPx - estimatedMenuWidth
            )
        ),
        y: Math.max(
            contextMenuViewportMarginPx,
            Math.min(clientY, window.innerHeight - contextMenuEstimatedHeightPx)
        ),
    };
}

export function getHistoryItemLayoutKey(
    revision: number,
    isExpanded: boolean,
    collapsedDirectories: CollapsedDirectories
): string {
    if (!isExpanded) {
        return "collapsed";
    }

    const revisionPrefix = String(revision) + ":";
    const collapsedPaths = Object.keys(collapsedDirectories)
        .filter(function (key) {
            return collapsedDirectories[key] === true && key.startsWith(revisionPrefix);
        })
        .sort();

    return collapsedPaths.length === 0
        ? "expanded"
        : "expanded:" + collapsedPaths.join("|");
}

export function getEstimatedHistoryItemHeight(layoutKey: string): number {
    return layoutKey === "collapsed"
        ? collapsedCommitHeightEstimatePx
        : expandedCommitHeightEstimatePx;
}
