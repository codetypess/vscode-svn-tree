import React from "react";
import { createRoot } from "react-dom/client";
import { createI18n } from "../i18n";
import {
    getMenuPosition,
    useConstrainedMenuPosition,
} from "../history/history-webview-utils";
import type {
    RepositoryBrowserAction,
    RepositoryBrowserEntryAction,
    RepositoryBrowserEntryItem,
} from "../scm/svn-repository-browser";
import type {
    RepositoryBrowserBootstrap,
    RepositoryBrowserConfigPayload,
    RepositoryBrowserDataPayload,
    RepositoryBrowserErrorPayload,
    RepositoryBrowserRequestMessage,
    RepositoryBrowserResponseMessage,
} from "./repository-browser-types";

const browserTreeRowHeightPx = 34;
const browserTreeOverscanPx = browserTreeRowHeightPx * 8;
const repositoryBrowserDebugPrefix = "[SVN Tree][Repository Browser]";

interface VsCodeApi {
    postMessage(message: RepositoryBrowserRequestMessage): void;
}

interface RepositoryBrowserDirectoryCache {
    [repositoryPath: string]: RepositoryBrowserDataPayload | undefined;
}

interface RepositoryBrowserState {
    repositoryLabel: string;
    rootPath: string;
    currentRepositoryPath: string;
    currentUrl: string;
    parentRepositoryPath?: string;
    breadcrumbs: readonly {
        label: string;
        repositoryPath: string;
    }[];
    currentActions: RepositoryBrowserDataPayload["currentActions"];
    entries: RepositoryBrowserDataPayload["entries"];
    selectedRepositoryPath?: string;
    isLoading: boolean;
    error?: string;
    locale: RepositoryBrowserBootstrap["locale"];
    directoryDataByPath: RepositoryBrowserDirectoryCache;
    expandedDirectoryPaths: Record<string, boolean>;
    loadingDirectoryPaths: Record<string, boolean>;
    contextMenu?: RepositoryBrowserContextMenuState;
}

interface RepositoryBrowserContextMenuActionItem {
    readonly id: RepositoryBrowserAction | RepositoryBrowserEntryAction;
    readonly label: string;
    readonly icon: string;
}

type RepositoryBrowserContextMenuTarget =
    | {
          readonly kind: "current-directory";
          readonly title: string;
          readonly subtitle: string;
          readonly repositoryPath: string;
          readonly actions: readonly RepositoryBrowserContextMenuActionItem[];
      }
    | {
          readonly kind: "entry";
          readonly title: string;
          readonly subtitle: string;
          readonly repositoryPath: string;
          readonly entry: RepositoryBrowserEntryItem;
          readonly actions: readonly RepositoryBrowserContextMenuActionItem[];
      }
    | {
          readonly kind: "directory-path";
          readonly title: string;
          readonly subtitle: string;
          readonly repositoryPath: string;
          readonly actions: readonly RepositoryBrowserContextMenuActionItem[];
      };

interface RepositoryBrowserContextMenuState {
    readonly x: number;
    readonly y: number;
    readonly target: RepositoryBrowserContextMenuTarget;
}

interface RepositoryBrowserEntryTreeRow {
    rowType: "entry";
    key: string;
    entry: RepositoryBrowserEntryItem;
    depth: number;
    isExpanded: boolean;
    isLoadingChildren: boolean;
    isCurrentDirectory: boolean;
}

interface RepositoryBrowserPathTreeRow {
    rowType: "path";
    key: string;
    repositoryPath: string;
    name: string;
    depth: number;
    isExpanded: boolean;
    isCurrent: boolean;
    isLoading: boolean;
}

type RepositoryBrowserTreeRow =
    | RepositoryBrowserPathTreeRow
    | RepositoryBrowserEntryTreeRow;

interface VirtualizedRepositoryBrowserRow {
    index: number;
    offsetTop: number;
    row: RepositoryBrowserTreeRow;
}

interface RepositoryBrowserDetailItem {
    readonly label: string;
    readonly value: string;
}

function normalizeRepositoryPath(value: string): string {
    const normalized = value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    return normalized ? `/${normalized}` : "/";
}

function isSameOrChildRepositoryPath(rootPath: string, targetPath: string): boolean {
    const normalizedRootPath = normalizeRepositoryPath(rootPath);
    const normalizedTargetPath = normalizeRepositoryPath(targetPath);

    return (
        normalizedRootPath === "/" ||
        normalizedTargetPath === normalizedRootPath ||
        normalizedTargetPath.startsWith(`${normalizedRootPath}/`)
    );
}

function getTreeDepthStyle(
    depth: number
): React.CSSProperties & {
    "--tree-depth": number;
} {
    return {
        "--tree-depth": depth,
    };
}

function getDirectoryToggleIconClassName(
    isExpanded: boolean,
    isLoading: boolean
): string {
    return `codicon browser-tree-chevron${
        isLoading ? " is-loading" : ""
    } ${
        isLoading
            ? "codicon-refresh codicon-modifier-spin"
            : `codicon-${isExpanded ? "chevron-down" : "chevron-right"}`
    }`;
}

function findRepositoryBrowserEntry(
    directoryDataByPath: RepositoryBrowserDirectoryCache,
    repositoryPath: string | undefined
): RepositoryBrowserEntryItem | undefined {
    if (!repositoryPath) {
        return undefined;
    }

    for (const directoryData of Object.values(directoryDataByPath)) {
        const entry = directoryData?.entries.find(function (candidate) {
            return candidate.repositoryPath === repositoryPath;
        });

        if (entry) {
            return entry;
        }
    }

    return undefined;
}

function buildRepositoryBrowserTreeRows(options: {
    readonly directoryDataByPath: RepositoryBrowserDirectoryCache;
    readonly expandedDirectoryPaths: Record<string, boolean>;
    readonly loadingDirectoryPaths: Record<string, boolean>;
    readonly currentRepositoryPath: string;
    readonly breadcrumbs: readonly {
        label: string;
        repositoryPath: string;
    }[];
}): RepositoryBrowserTreeRow[] {
    const rootDirectoryData = options.directoryDataByPath["/"];
    const rows: RepositoryBrowserTreeRow[] = [];
    const visibleBreadcrumbs = options.breadcrumbs.slice(1);

    function visitDirectory(repositoryPath: string, depth: number): void {
        const directoryData = options.directoryDataByPath[repositoryPath];
        if (!directoryData) {
            return;
        }

        for (const entry of directoryData.entries) {
            const isDirectory = entry.kind === "dir";
            const isExpanded =
                isDirectory && options.expandedDirectoryPaths[entry.repositoryPath] === true;
            const isLoadingChildren =
                isDirectory &&
                options.loadingDirectoryPaths[entry.repositoryPath] === true &&
                !options.directoryDataByPath[entry.repositoryPath];

            rows.push({
                rowType: "entry",
                key: `entry:${entry.repositoryPath}`,
                entry,
                depth,
                isExpanded,
                isLoadingChildren,
                isCurrentDirectory:
                    entry.repositoryPath === options.currentRepositoryPath,
            });

            if (!isDirectory || !isExpanded) {
                continue;
            }

            if (options.directoryDataByPath[entry.repositoryPath]) {
                visitDirectory(entry.repositoryPath, depth + 1);
            }
        }
    }

    function visitFallbackBreadcrumb(index: number, depth: number): void {
        const breadcrumb = visibleBreadcrumbs[index];
        if (!breadcrumb) {
            return;
        }

        const isExpanded =
            options.expandedDirectoryPaths[breadcrumb.repositoryPath] === true;
        const hasLoadedDirectory =
            options.directoryDataByPath[breadcrumb.repositoryPath] !== undefined;

        rows.push({
            rowType: "path",
            key: `path:${breadcrumb.repositoryPath}`,
            repositoryPath: breadcrumb.repositoryPath,
            name: breadcrumb.label,
            depth,
            isExpanded,
            isCurrent: breadcrumb.repositoryPath === options.currentRepositoryPath,
            isLoading:
                options.loadingDirectoryPaths[breadcrumb.repositoryPath] === true &&
                !hasLoadedDirectory,
        });

        if (!isExpanded) {
            return;
        }

        if (hasLoadedDirectory) {
            visitDirectory(breadcrumb.repositoryPath, depth + 1);
            return;
        }

        visitFallbackBreadcrumb(index + 1, depth + 1);
    }

    if (!rootDirectoryData) {
        const currentDirectoryData =
            options.directoryDataByPath[options.currentRepositoryPath];
        if (!currentDirectoryData) {
            return [];
        }

        if (visibleBreadcrumbs.length > 0) {
            visitFallbackBreadcrumb(0, 0);
            return rows;
        }

        visitDirectory(options.currentRepositoryPath, 0);

        return rows;
    }

    visitDirectory("/", 0);
    return rows;
}

function logRepositoryBrowserDebug(
    message: string,
    details?: Record<string, unknown>
): void {
    if (details && Object.keys(details).length > 0) {
        console.debug(repositoryBrowserDebugPrefix, message, details);
        return;
    }

    console.debug(repositoryBrowserDebugPrefix, message);
}

function buildDirectoryPathContextActions(
    i18n: ReturnType<typeof createI18n>
): readonly RepositoryBrowserContextMenuActionItem[] {
    return [
        {
            id: "open-directory",
            label: i18n.t("repositoryBrowserOpenDirectoryActionLabel"),
            icon: "folder-opened",
        },
        {
            id: "show-history",
            label: i18n.t("openHistoryActionLabel"),
            icon: "history",
        },
        {
            id: "show-properties",
            label: i18n.t("showPropertiesActionLabel"),
            icon: "symbol-property",
        },
        {
            id: "checkout-directory",
            label: i18n.t("repositoryBrowserCheckoutDirectoryActionLabel"),
            icon: "repo-clone",
        },
        {
            id: "export-directory",
            label: i18n.t("repositoryBrowserExportDirectoryActionLabel"),
            icon: "export",
        },
        {
            id: "copy-url",
            label: i18n.t("copyRepositoryUrlActionLabel"),
            icon: "link",
        },
        {
            id: "copy-path",
            label: i18n.t("copyRepositoryPathActionLabel"),
            icon: "copy",
        },
    ];
}

function formatEntryContextSubtitle(entry: RepositoryBrowserEntryItem): string {
    const metadata = [entry.revision ? `r${entry.revision}` : undefined, entry.author]
        .filter(Boolean)
        .join(" • ");

    return metadata ? `${entry.repositoryPath}\n${metadata}` : entry.repositoryPath;
}

function isDangerousContextMenuAction(
    action: RepositoryBrowserContextMenuActionItem
): boolean {
    return action.id === "delete-directory" || action.id === "delete-reference";
}

function getTreeRowRepositoryPath(row: RepositoryBrowserTreeRow): string {
    return row.rowType === "entry" ? row.entry.repositoryPath : row.repositoryPath;
}

function matchesRepositoryBrowserTreeRow(
    row: RepositoryBrowserTreeRow,
    normalizedQuery: string
): boolean {
    const searchText =
        row.rowType === "entry"
            ? [
                  row.entry.name,
                  row.entry.repositoryPath,
                  row.entry.author,
                  row.entry.revision,
              ]
                  .filter(Boolean)
                  .join("\n")
                  .toLowerCase()
            : [row.name, row.repositoryPath].join("\n").toLowerCase();

    return searchText.includes(normalizedQuery);
}

function filterRepositoryBrowserTreeRows(
    rows: readonly RepositoryBrowserTreeRow[],
    filterValue: string
): RepositoryBrowserTreeRow[] {
    const normalizedQuery = filterValue.trim().toLowerCase();
    if (!normalizedQuery) {
        return [...rows];
    }

    const matchingPaths = new Set<string>();
    for (const row of rows) {
        if (matchesRepositoryBrowserTreeRow(row, normalizedQuery)) {
            matchingPaths.add(getTreeRowRepositoryPath(row));
        }
    }

    if (matchingPaths.size === 0) {
        return [];
    }

    return rows.filter(function (row) {
        const repositoryPath = getTreeRowRepositoryPath(row);
        if (matchingPaths.has(repositoryPath)) {
            return true;
        }

        for (const matchingPath of matchingPaths) {
            if (isSameOrChildRepositoryPath(repositoryPath, matchingPath)) {
                return true;
            }
        }

        return false;
    });
}

function resolveRepositoryBrowserNavigationPath(value: string): string | undefined {
    const normalizedValue = value.trim().replace(/\\/g, "/");
    if (!normalizedValue) {
        return undefined;
    }

    const segments = normalizedValue.replace(/^\/+/, "").split("/");
    if (
        segments.some(
            (segment) => segment.trim().length === 0 || segment === "." || segment === ".."
        )
    ) {
        return undefined;
    }

    return normalizeRepositoryPath(normalizedValue);
}

function getRepositoryBrowserPathLabel(repositoryPath: string, rootLabel: string): string {
    if (repositoryPath === "/") {
        return rootLabel;
    }

    const segments = repositoryPath.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    return segments.at(-1) ?? repositoryPath;
}

(function () {
    const vscode = acquireVsCodeApi() as VsCodeApi;
    const bootstrap: RepositoryBrowserBootstrap =
        window.__SVN_REPOSITORY_BROWSER_BOOTSTRAP__ ?? {
            repositoryLabel: "",
            rootPath: "",
            initialRepositoryPath: "/",
            locale: "en",
        };

    function RepositoryBrowserApp(): React.ReactElement {
        const entryListRef = React.useRef<HTMLDivElement | null>(null);
        const pendingDirectoryLoadPathsRef = React.useRef<Record<string, boolean>>({});
        const [state, setState] = React.useState<RepositoryBrowserState>({
            repositoryLabel: bootstrap.repositoryLabel,
            rootPath: bootstrap.rootPath,
            currentRepositoryPath: bootstrap.initialRepositoryPath,
            currentUrl: "",
            parentRepositoryPath: undefined,
            breadcrumbs: [],
            currentActions: [],
            entries: [],
            selectedRepositoryPath: undefined,
            isLoading: true,
            error: undefined,
            locale: bootstrap.locale,
            directoryDataByPath: {},
            expandedDirectoryPaths: {},
            loadingDirectoryPaths: {},
            contextMenu: undefined,
        });
        const [pathInputValue, setPathInputValue] = React.useState(
            bootstrap.initialRepositoryPath
        );
        const [pathInputError, setPathInputError] = React.useState<string | undefined>(
            undefined
        );
        const [filterValue, setFilterValue] = React.useState("");
        const deferredFilterValue = React.useDeferredValue(filterValue);
        const [virtualViewport, setVirtualViewport] = React.useState({
            scrollTop: 0,
            viewportHeight: 0,
        });
        const { menuRef, position: contextMenuPosition } = useConstrainedMenuPosition(
            state.contextMenu
        );
        const i18n = createI18n(state.locale);

        React.useEffect(function () {
            vscode.postMessage({
                type: "ready",
            } satisfies RepositoryBrowserRequestMessage);
            logRepositoryBrowserDebug("Posted initial ready message.", {
                initialRepositoryPath: bootstrap.initialRepositoryPath,
            });
        }, []);

        React.useEffect(
            function () {
                document.title = i18n.t("repositoryBrowserPanelTitle", {
                    path: state.currentRepositoryPath,
                });
                document.documentElement.lang = state.locale;
            },
            [i18n, state.currentRepositoryPath, state.locale]
        );

        React.useEffect(
            function () {
                setPathInputValue(state.currentRepositoryPath);
                setPathInputError(undefined);
            },
            [state.currentRepositoryPath]
        );

        React.useEffect(function () {
            function closeContextMenu(): void {
                setState(function (previous) {
                    if (!previous.contextMenu) {
                        return previous;
                    }

                    return {
                        ...previous,
                        contextMenu: undefined,
                    };
                });
            }

            function handleResize(): void {
                closeContextMenu();
            }

            function handleKeydown(event: KeyboardEvent): void {
                if (event.key === "Escape") {
                    closeContextMenu();
                }
            }

            window.addEventListener("resize", handleResize);
            window.addEventListener("keydown", handleKeydown);
            return function () {
                window.removeEventListener("resize", handleResize);
                window.removeEventListener("keydown", handleKeydown);
            };
        }, []);

        React.useEffect(function () {
            const entryList = entryListRef.current;
            if (!entryList) {
                return;
            }
            const measuredEntryList = entryList;

            function syncViewport(): void {
                setVirtualViewport(function (previous) {
                    const nextScrollTop = measuredEntryList.scrollTop;
                    const nextViewportHeight = measuredEntryList.clientHeight;

                    if (
                        previous.scrollTop === nextScrollTop &&
                        previous.viewportHeight === nextViewportHeight
                    ) {
                        return previous;
                    }

                    return {
                        scrollTop: nextScrollTop,
                        viewportHeight: nextViewportHeight,
                    };
                });
            }

            syncViewport();

            if (typeof ResizeObserver === "undefined") {
                window.addEventListener("resize", syncViewport);
                return function () {
                    window.removeEventListener("resize", syncViewport);
                };
            }

            const observer = new ResizeObserver(syncViewport);
            observer.observe(measuredEntryList);

            return function () {
                observer.disconnect();
            };
        }, []);

        React.useEffect(function () {
            function handleMessage(event: MessageEvent<unknown>): void {
                const data = event.data;
                if (!data || typeof data !== "object" || !("type" in data)) {
                    return;
                }

                const message = data as RepositoryBrowserResponseMessage;
                logRepositoryBrowserDebug("Received webview response.", {
                    type: message.type,
                });
                if (message.type === "browser-data") {
                    applyBrowserData(message.payload);
                    return;
                }

                if (message.type === "directory-data") {
                    applyDirectoryData(message.payload);
                    return;
                }

                if (message.type === "browser-error") {
                    applyBrowserError(message.payload);
                    return;
                }

                if (message.type === "browser-config") {
                    applyBrowserConfig(message.payload);
                }
            }

            window.addEventListener("message", handleMessage);
            return function () {
                window.removeEventListener("message", handleMessage);
            };
        }, []);

        React.useEffect(
            function () {
                for (const repositoryPath of Object.keys(state.loadingDirectoryPaths)) {
                    const shouldLoadDirectory =
                        state.loadingDirectoryPaths[repositoryPath] === true &&
                        state.expandedDirectoryPaths[repositoryPath] === true &&
                        !state.directoryDataByPath[repositoryPath] &&
                        pendingDirectoryLoadPathsRef.current[repositoryPath] !== true;

                    if (!shouldLoadDirectory) {
                        continue;
                    }

                    pendingDirectoryLoadPathsRef.current[repositoryPath] = true;
                    logRepositoryBrowserDebug("Posting deferred directory load.", {
                        repositoryPath,
                    });
                    postDirectoryLoad(repositoryPath);
                }
            },
            [
                state.directoryDataByPath,
                state.expandedDirectoryPaths,
                state.loadingDirectoryPaths,
            ]
        );

        function postDirectoryLoad(repositoryPath: string): void {
            logRepositoryBrowserDebug("Posting directory load request.", {
                repositoryPath,
            });
            vscode.postMessage({
                type: "load-directory",
                repositoryPath,
            } satisfies RepositoryBrowserRequestMessage);
        }

        function closeContextMenu(): void {
            setState(function (previous) {
                if (!previous.contextMenu) {
                    return previous;
                }

                return {
                    ...previous,
                    contextMenu: undefined,
                };
            });
        }

        function applyBrowserData(payload: RepositoryBrowserDataPayload): void {
            delete pendingDirectoryLoadPathsRef.current[payload.currentRepositoryPath];
            logRepositoryBrowserDebug("Applying browser data.", {
                repositoryPath: payload.currentRepositoryPath,
                breadcrumbCount: payload.breadcrumbs.length,
                entryCount: payload.entries.length,
            });

            setState(function (previous) {
                const nextDirectoryDataByPath = {
                    ...previous.directoryDataByPath,
                    [payload.currentRepositoryPath]: payload,
                };
                const nextExpandedDirectoryPaths = {
                    ...previous.expandedDirectoryPaths,
                };
                const nextLoadingDirectoryPaths = {
                    ...previous.loadingDirectoryPaths,
                    [payload.currentRepositoryPath]: false,
                };

                for (const breadcrumb of payload.breadcrumbs) {
                    nextExpandedDirectoryPaths[breadcrumb.repositoryPath] = true;

                    if (
                        breadcrumb.repositoryPath !== payload.currentRepositoryPath &&
                        !nextDirectoryDataByPath[breadcrumb.repositoryPath]
                    ) {
                        nextLoadingDirectoryPaths[breadcrumb.repositoryPath] = true;
                    }
                }

                return {
                    ...previous,
                    repositoryLabel: payload.repositoryLabel,
                    rootPath: payload.rootPath,
                    currentRepositoryPath: payload.currentRepositoryPath,
                    currentUrl: payload.currentUrl,
                    parentRepositoryPath: payload.parentRepositoryPath,
                    breadcrumbs: payload.breadcrumbs,
                    currentActions: payload.currentActions,
                    entries: payload.entries,
                    selectedRepositoryPath:
                        previous.selectedRepositoryPath === previous.currentRepositoryPath
                            ? undefined
                            : previous.selectedRepositoryPath,
                    isLoading: false,
                    error: undefined,
                    directoryDataByPath: nextDirectoryDataByPath,
                    expandedDirectoryPaths: nextExpandedDirectoryPaths,
                    loadingDirectoryPaths: nextLoadingDirectoryPaths,
                    contextMenu: undefined,
                };
            });
        }

        function applyDirectoryData(payload: RepositoryBrowserDataPayload): void {
            delete pendingDirectoryLoadPathsRef.current[payload.currentRepositoryPath];
            logRepositoryBrowserDebug("Applying directory data.", {
                repositoryPath: payload.currentRepositoryPath,
                entryCount: payload.entries.length,
            });
            setState(function (previous) {
                return {
                    ...previous,
                    repositoryLabel: payload.repositoryLabel,
                    rootPath: payload.rootPath,
                    error: undefined,
                    directoryDataByPath: {
                        ...previous.directoryDataByPath,
                        [payload.currentRepositoryPath]: payload,
                    },
                    loadingDirectoryPaths: {
                        ...previous.loadingDirectoryPaths,
                        [payload.currentRepositoryPath]: false,
                    },
                    contextMenu: undefined,
                };
            });
        }

        function applyBrowserError(payload: RepositoryBrowserErrorPayload): void {
            delete pendingDirectoryLoadPathsRef.current[payload.repositoryPath];
            logRepositoryBrowserDebug("Applying browser error.", {
                repositoryPath: payload.repositoryPath,
                message: payload.message,
            });
            setState(function (previous) {
                const nextExpandedDirectoryPaths = {
                    ...previous.expandedDirectoryPaths,
                };

                if (!previous.directoryDataByPath[payload.repositoryPath]) {
                    nextExpandedDirectoryPaths[payload.repositoryPath] = false;
                }

                return {
                    ...previous,
                    isLoading:
                        previous.currentRepositoryPath === payload.repositoryPath
                            ? false
                            : previous.isLoading,
                    error: payload.message,
                    loadingDirectoryPaths: {
                        ...previous.loadingDirectoryPaths,
                        [payload.repositoryPath]: false,
                    },
                    expandedDirectoryPaths: nextExpandedDirectoryPaths,
                    contextMenu: undefined,
                };
            });
        }

        function applyBrowserConfig(payload: RepositoryBrowserConfigPayload): void {
            setState(function (previous) {
                return {
                    ...previous,
                    locale: payload.locale,
                };
            });
        }

        function refreshBrowser(): void {
            const expandedLoadedDirectoryPaths = Object.keys(state.expandedDirectoryPaths).filter(
                function (repositoryPath) {
                    return (
                        repositoryPath !== state.currentRepositoryPath &&
                        state.expandedDirectoryPaths[repositoryPath] === true &&
                        state.directoryDataByPath[repositoryPath] !== undefined
                    );
                }
            );
            logRepositoryBrowserDebug("Refreshing repository browser.", {
                currentRepositoryPath: state.currentRepositoryPath,
                expandedLoadedDirectoryPaths,
            });

            setState(function (previous) {
                const nextLoadingDirectoryPaths = {
                    ...previous.loadingDirectoryPaths,
                    [previous.currentRepositoryPath]: true,
                };

                for (const repositoryPath of expandedLoadedDirectoryPaths) {
                    nextLoadingDirectoryPaths[repositoryPath] = true;
                }

                return {
                    ...previous,
                    isLoading: true,
                    error: undefined,
                    loadingDirectoryPaths: nextLoadingDirectoryPaths,
                };
            });

            vscode.postMessage({
                type: "refresh",
            } satisfies RepositoryBrowserRequestMessage);

            for (const repositoryPath of expandedLoadedDirectoryPaths) {
                postDirectoryLoad(repositoryPath);
            }
        }

        function navigateToRepositoryPath(value: string): void {
            const repositoryPath = resolveRepositoryBrowserNavigationPath(value);
            if (!repositoryPath) {
                setPathInputError(i18n.t("repositoryBrowserPathInvalid"));
                return;
            }

            if (repositoryPath === state.currentRepositoryPath) {
                setPathInputError(undefined);
                showCurrentDirectoryDetails();
                return;
            }

            closeContextMenu();
            setPathInputError(undefined);
            setState(function (previous) {
                return {
                    ...previous,
                    isLoading: true,
                    error: undefined,
                    selectedRepositoryPath: undefined,
                    contextMenu: undefined,
                };
            });
            vscode.postMessage({
                type: "navigate",
                repositoryPath,
            } satisfies RepositoryBrowserRequestMessage);
        }

        function runCurrentAction(action: RepositoryBrowserAction): void {
            closeContextMenu();
            vscode.postMessage({
                type: "run-current-action",
                action,
                repositoryPath: state.currentRepositoryPath,
            } satisfies RepositoryBrowserRequestMessage);
        }

        function runEntryAction(
            action: RepositoryBrowserEntryAction,
            entry: RepositoryBrowserEntryItem
        ): void {
            closeContextMenu();
            if (action === "open-directory" && entry.kind === "dir") {
                toggleDirectory(entry.repositoryPath);
                return;
            }

            vscode.postMessage({
                type: "run-entry-action",
                action,
                repositoryPath: entry.repositoryPath,
                kind: entry.kind,
            } satisfies RepositoryBrowserRequestMessage);
        }

        function selectEntry(entry: RepositoryBrowserEntryItem): void {
            if (entry.repositoryPath === state.currentRepositoryPath) {
                showCurrentDirectoryDetails();
                return;
            }

            setState(function (previous) {
                return previous.selectedRepositoryPath === entry.repositoryPath
                    ? previous
                    : {
                          ...previous,
                          selectedRepositoryPath: entry.repositoryPath,
                      };
            });
        }

        function showCurrentDirectoryDetails(): void {
            setState(function (previous) {
                return previous.selectedRepositoryPath === undefined
                    ? previous
                    : {
                          ...previous,
                          selectedRepositoryPath: undefined,
                      };
            });
        }

        function toggleDirectory(repositoryPath: string): void {
            const isExpanded = state.expandedDirectoryPaths[repositoryPath] === true;
            const hasDirectoryData = state.directoryDataByPath[repositoryPath] !== undefined;
            logRepositoryBrowserDebug("Toggling directory expansion.", {
                repositoryPath,
                isExpanded,
                hasDirectoryData,
            });

            setState(function (previous) {
                const wasExpanded =
                    previous.expandedDirectoryPaths[repositoryPath] === true;
                const nextIsExpanded = !wasExpanded;
                const nextExpandedDirectoryPaths = {
                    ...previous.expandedDirectoryPaths,
                    [repositoryPath]: nextIsExpanded,
                };
                const nextLoadingDirectoryPaths = {
                    ...previous.loadingDirectoryPaths,
                };
                let nextSelectedRepositoryPath = previous.selectedRepositoryPath;

                if (
                    wasExpanded &&
                    nextSelectedRepositoryPath &&
                    nextSelectedRepositoryPath !== repositoryPath &&
                    isSameOrChildRepositoryPath(repositoryPath, nextSelectedRepositoryPath)
                ) {
                    nextSelectedRepositoryPath =
                        repositoryPath === previous.currentRepositoryPath
                            ? undefined
                            : repositoryPath;
                }

                if (!nextIsExpanded) {
                    nextLoadingDirectoryPaths[repositoryPath] = false;
                } else if (!previous.directoryDataByPath[repositoryPath]) {
                    nextLoadingDirectoryPaths[repositoryPath] = true;
                }

                return {
                    ...previous,
                    error: undefined,
                    selectedRepositoryPath: nextSelectedRepositoryPath,
                    expandedDirectoryPaths: nextExpandedDirectoryPaths,
                    loadingDirectoryPaths: nextLoadingDirectoryPaths,
                };
            });
        }

        function openCurrentDirectoryContextMenu(clientX: number, clientY: number): void {
            const position = getMenuPosition(clientX, clientY);
            const currentDirectoryLabel =
                state.breadcrumbs.at(-1)?.label ??
                (state.currentRepositoryPath === "/" ? state.repositoryLabel : "/");

            setState(function (previous) {
                return {
                    ...previous,
                    selectedRepositoryPath: undefined,
                    contextMenu: {
                        x: position.x,
                        y: position.y,
                        target: {
                            kind: "current-directory",
                            title: currentDirectoryLabel,
                            subtitle: previous.currentRepositoryPath,
                            repositoryPath: previous.currentRepositoryPath,
                            actions: previous.currentActions,
                        },
                    },
                };
            });
        }

        function openEntryContextMenu(
            entry: RepositoryBrowserEntryItem,
            clientX: number,
            clientY: number
        ): void {
            const position = getMenuPosition(clientX, clientY);

            setState(function (previous) {
                const isCurrentDirectory =
                    entry.kind === "dir" &&
                    entry.repositoryPath === previous.currentRepositoryPath;

                return {
                    ...previous,
                    selectedRepositoryPath: isCurrentDirectory
                        ? undefined
                        : entry.repositoryPath,
                    contextMenu: {
                        x: position.x,
                        y: position.y,
                        target: isCurrentDirectory
                            ? {
                                  kind: "current-directory",
                                  title: entry.name,
                                  subtitle: entry.repositoryPath,
                                  repositoryPath: entry.repositoryPath,
                                  actions: previous.currentActions,
                              }
                            : {
                                  kind: "entry",
                                  title: entry.name,
                                  subtitle: formatEntryContextSubtitle(entry),
                                  repositoryPath: entry.repositoryPath,
                                  entry,
                                  actions: entry.actions,
                              },
                    },
                };
            });
        }

        function openPathContextMenu(
            pathRow: RepositoryBrowserPathTreeRow,
            pathEntry: RepositoryBrowserEntryItem | undefined,
            clientX: number,
            clientY: number
        ): void {
            if (pathEntry) {
                openEntryContextMenu(pathEntry, clientX, clientY);
                return;
            }

            const position = getMenuPosition(clientX, clientY);
            const actions = buildDirectoryPathContextActions(i18n);

            setState(function (previous) {
                return {
                    ...previous,
                    selectedRepositoryPath: pathRow.isCurrent
                        ? undefined
                        : pathRow.repositoryPath,
                    contextMenu: {
                        x: position.x,
                        y: position.y,
                        target: pathRow.isCurrent
                            ? {
                                  kind: "current-directory",
                                  title: pathRow.name,
                                  subtitle: pathRow.repositoryPath,
                                  repositoryPath: pathRow.repositoryPath,
                                  actions: previous.currentActions,
                              }
                            : {
                                  kind: "directory-path",
                                  title: pathRow.name,
                                  subtitle: pathRow.repositoryPath,
                                  repositoryPath: pathRow.repositoryPath,
                                  actions,
                              },
                    },
                };
            });
        }

        function runDirectoryPathContextAction(
            action: RepositoryBrowserEntryAction,
            repositoryPath: string,
            name: string
        ): void {
            runEntryAction(action, {
                repositoryPath,
                url: "",
                name,
                kind: "dir",
                kindLabel: i18n.formatNodeKind("dir"),
                actions: [],
            });
        }

        function renderContextMenuAction(
            action: RepositoryBrowserContextMenuActionItem
        ): React.ReactElement {
            const isDangerous = isDangerousContextMenuAction(action);

            return (
                <button
                    key={`context-action:${String(action.id)}`}
                    type="button"
                    className={`context-menu-item${isDangerous ? " danger" : ""}`}
                    onClick={function (event) {
                        event.stopPropagation();

                        if (state.contextMenu?.target.kind === "current-directory") {
                            runCurrentAction(action.id as RepositoryBrowserAction);
                            return;
                        }

                        if (state.contextMenu?.target.kind === "entry") {
                            runEntryAction(
                                action.id as RepositoryBrowserEntryAction,
                                state.contextMenu.target.entry
                            );
                            return;
                        }

                        if (state.contextMenu?.target.kind === "directory-path") {
                            runDirectoryPathContextAction(
                                action.id as RepositoryBrowserEntryAction,
                                state.contextMenu.target.repositoryPath,
                                state.contextMenu.target.title
                            );
                        }
                    }}
                >
                    <span className={`codicon codicon-${action.icon}`} aria-hidden="true" />
                    <span className="context-menu-label">{action.label}</span>
                </button>
            );
        }

        function renderInlineActionButton(
            action: RepositoryBrowserContextMenuActionItem,
            onClick: () => void,
            keyPrefix: string
        ): React.ReactElement {
            const isDangerous = isDangerousContextMenuAction(action);

            return (
                <button
                    key={`${keyPrefix}:${String(action.id)}`}
                    type="button"
                    className={`secondary browser-action-button${
                        isDangerous ? " danger" : ""
                    }`}
                    onClick={onClick}
                >
                    <span className={`codicon codicon-${action.icon}`} aria-hidden="true" />
                    <span>{action.label}</span>
                </button>
            );
        }

        function openEntry(entry: RepositoryBrowserEntryItem): void {
            if (entry.kind === "dir") {
                toggleDirectory(entry.repositoryPath);
                return;
            }

            runEntryAction("open-file", entry);
        }

        const currentDirectoryLabel =
            state.breadcrumbs.at(-1)?.label ??
            (state.currentRepositoryPath === "/" ? state.repositoryLabel : "/");
        const selectedEntry = findRepositoryBrowserEntry(
            state.directoryDataByPath,
            state.selectedRepositoryPath
        );
        const selectedDirectoryData = state.selectedRepositoryPath
            ? state.directoryDataByPath[state.selectedRepositoryPath]
            : undefined;
        const selectedPathLabel = state.selectedRepositoryPath
            ? getRepositoryBrowserPathLabel(state.selectedRepositoryPath, state.repositoryLabel)
            : undefined;
        const currentDirectoryDetails = [
            {
                label: i18n.t("infoKindLabel"),
                value: i18n.formatNodeKind("dir"),
            },
            {
                label: i18n.t("infoRepositoryPathLabel"),
                value: state.currentRepositoryPath,
            },
            state.currentUrl
                ? {
                      label: i18n.t("infoUrlLabel"),
                      value: state.currentUrl,
                  }
                : undefined,
        ].filter(Boolean) as RepositoryBrowserDetailItem[];
        const selectedDetails = selectedEntry
            ? [
                  {
                      label: i18n.t("infoKindLabel"),
                      value: selectedEntry.kindLabel,
                  },
                  {
                      label: i18n.t("infoRepositoryPathLabel"),
                      value: selectedEntry.repositoryPath,
                  },
                  selectedEntry.url
                      ? {
                            label: i18n.t("infoUrlLabel"),
                            value: selectedEntry.url,
                        }
                      : undefined,
                  selectedEntry.revision
                      ? {
                            label: i18n.t("revisionLabel"),
                            value: `r${selectedEntry.revision}`,
                        }
                      : undefined,
                  selectedEntry.author
                      ? {
                            label: i18n.t("authorDetailLabel"),
                            value: selectedEntry.author,
                        }
                      : undefined,
              ].filter(Boolean)
            : state.selectedRepositoryPath
              ? [
                    {
                        label: i18n.t("infoKindLabel"),
                        value: i18n.formatNodeKind("dir"),
                    },
                    {
                        label: i18n.t("infoRepositoryPathLabel"),
                        value: state.selectedRepositoryPath,
                    },
                    selectedDirectoryData?.currentUrl
                        ? {
                              label: i18n.t("infoUrlLabel"),
                              value: selectedDirectoryData.currentUrl,
                          }
                        : undefined,
                ].filter(Boolean)
              : [];
        const selectedDetailItems = selectedDetails as RepositoryBrowserDetailItem[];
        const selectedActions = selectedEntry
            ? selectedEntry.actions
            : state.selectedRepositoryPath
              ? buildDirectoryPathContextActions(i18n)
              : [];
        const allTreeRows = buildRepositoryBrowserTreeRows({
            directoryDataByPath: state.directoryDataByPath,
            expandedDirectoryPaths: state.expandedDirectoryPaths,
            loadingDirectoryPaths: state.loadingDirectoryPaths,
            currentRepositoryPath: state.currentRepositoryPath,
            breadcrumbs: state.breadcrumbs,
        });
        const treeRows = filterRepositoryBrowserTreeRows(
            allTreeRows,
            deferredFilterValue
        );
        const isFilterActive = deferredFilterValue.trim().length > 0;
        const shouldShowTreeLoading = allTreeRows.length === 0 && state.isLoading;
        const shouldShowNoMatches =
            !state.error &&
            !state.isLoading &&
            allTreeRows.length > 0 &&
            isFilterActive &&
            treeRows.length === 0;
        const viewportTop = Math.max(0, virtualViewport.scrollTop - browserTreeOverscanPx);
        const viewportBottom =
            virtualViewport.scrollTop +
            Math.max(virtualViewport.viewportHeight, browserTreeOverscanPx) +
            browserTreeOverscanPx;
        const totalRowsHeight = treeRows.length * browserTreeRowHeightPx;
        const visibleTreeRows: VirtualizedRepositoryBrowserRow[] = [];

        for (let index = 0; index < treeRows.length; index += 1) {
            const offsetTop = index * browserTreeRowHeightPx;
            const offsetBottom = offsetTop + browserTreeRowHeightPx;

            if (offsetBottom < viewportTop || offsetTop > viewportBottom) {
                continue;
            }

            visibleTreeRows.push({
                index,
                offsetTop,
                row: treeRows[index] as RepositoryBrowserTreeRow,
            });
        }

        return (
            <div className="page">
                <div className="card">
                    <header className="toolbar">
                        <div
                            className="browser-toolbar-title"
                            onContextMenu={function (event) {
                                event.preventDefault();
                                openCurrentDirectoryContextMenu(
                                    event.clientX,
                                    event.clientY
                                );
                            }}
                        >
                            <h1>{i18n.t("repositoryBrowserActionLabel")}</h1>
                            <small>{state.currentRepositoryPath}</small>
                        </div>
                    </header>

                    <div className="filter-panel browser-control-panel">
                        <div className="browser-control-grid">
                            <label className="filter-field">
                                <span className="filter-label">
                                    {i18n.t("repositoryBrowserPathFieldLabel")}
                                </span>
                                <div className="browser-control-actions">
                                    <input
                                        type="text"
                                        className="filter-input"
                                        value={pathInputValue}
                                        placeholder={i18n.t(
                                            "repositoryBrowserPathPlaceholder"
                                        )}
                                        onChange={function (event) {
                                            setPathInputValue(event.target.value);
                                            if (pathInputError) {
                                                setPathInputError(undefined);
                                            }
                                        }}
                                        onKeyDown={function (event) {
                                            if (event.key === "Enter") {
                                                navigateToRepositoryPath(pathInputValue);
                                            }
                                        }}
                                    />
                                    <button
                                        type="button"
                                        className="secondary browser-go-button"
                                        onClick={function () {
                                            navigateToRepositoryPath(pathInputValue);
                                        }}
                                    >
                                        {i18n.t("repositoryBrowserGoButton")}
                                    </button>
                                </div>
                            </label>
                            <label className="filter-field">
                                <span className="filter-label">
                                    {i18n.t("repositoryBrowserFilterFieldLabel")}
                                </span>
                                <input
                                    type="text"
                                    className="filter-input"
                                    value={filterValue}
                                    placeholder={i18n.t(
                                        "repositoryBrowserFilterPlaceholder"
                                    )}
                                    onChange={function (event) {
                                        setFilterValue(event.target.value);
                                    }}
                                />
                            </label>
                            <div className="toolbar-actions browser-toolbar-actions">
                                <button
                                    type="button"
                                    className="toolbar-button secondary"
                                    onClick={refreshBrowser}
                                >
                                    <span
                                        className="codicon codicon-refresh"
                                        aria-hidden="true"
                                    />
                                    <span className="toolbar-button-label">
                                        {i18n.t("refreshButton")}
                                    </span>
                                </button>
                            </div>
                        </div>
                        {pathInputError ? (
                            <div className="browser-control-error">{pathInputError}</div>
                        ) : null}
                    </div>

                    <div className="browser-layout">
                        <section className="browser-main-panel">
                            <div className="table-header browser-table-header">
                                <div>{i18n.t("filesLabel")}</div>
                                <div>{i18n.t("infoKindLabel")}</div>
                                <div>{i18n.t("revisionLabel")}</div>
                                <div>{i18n.t("authorDetailLabel")}</div>
                                <div>{i18n.t("repositoryBrowserOpenEntryColumnLabel")}</div>
                            </div>

                            <div
                                ref={entryListRef}
                                className="browser-entry-list"
                                onContextMenu={function (event) {
                                    const target = event.target;
                                    if (
                                        target instanceof HTMLElement &&
                                        target.closest(".browser-row")
                                    ) {
                                        return;
                                    }

                                    event.preventDefault();
                                    openCurrentDirectoryContextMenu(
                                        event.clientX,
                                        event.clientY
                                    );
                                }}
                                onScroll={function (event) {
                                    if (state.contextMenu) {
                                        closeContextMenu();
                                    }
                                    const nextScrollTop = event.currentTarget.scrollTop;
                                    const nextViewportHeight =
                                        event.currentTarget.clientHeight;

                                    setVirtualViewport(function (previous) {
                                        if (
                                            previous.scrollTop === nextScrollTop &&
                                            previous.viewportHeight === nextViewportHeight
                                        ) {
                                            return previous;
                                        }

                                        return {
                                            scrollTop: nextScrollTop,
                                            viewportHeight: nextViewportHeight,
                                        };
                                    });
                                }}
                            >
                                {state.error && allTreeRows.length > 0 ? (
                                    <div className="browser-error-banner">
                                        <span className="codicon codicon-error" aria-hidden="true" />
                                        <span>{state.error}</span>
                                    </div>
                                ) : null}
                                {shouldShowTreeLoading ? (
                                    <div className="empty-state">
                                        {i18n.t("repositoryBrowserLoadingState")}
                                    </div>
                                ) : state.error && allTreeRows.length === 0 ? (
                                    <div className="empty-state">
                                        <div>{i18n.t("repositoryBrowserLoadErrorState")}</div>
                                        <div className="empty-state-error">{state.error}</div>
                                        <div className="empty-state-actions">
                                            <button
                                                type="button"
                                                className="secondary"
                                                onClick={refreshBrowser}
                                            >
                                                {i18n.t("refreshButton")}
                                            </button>
                                        </div>
                                    </div>
                                ) : shouldShowNoMatches ? (
                                    <div className="empty-state">
                                        {i18n.t("repositoryBrowserNoMatchesState")}
                                    </div>
                                ) : treeRows.length === 0 ? (
                                    <div className="empty-state">
                                        {i18n.t("repositoryBrowserEmptyState")}
                                    </div>
                                ) : (
                                    <div
                                        className="browser-virtualized"
                                        style={{
                                            height: `${totalRowsHeight}px`,
                                        }}
                                    >
                                        {visibleTreeRows.map(function (item) {
                                            if (item.row.rowType === "path") {
                                                const pathRow = item.row;
                                                const pathEntry = findRepositoryBrowserEntry(
                                                    state.directoryDataByPath,
                                                    pathRow.repositoryPath
                                                );
                                                const isSelected =
                                                    state.selectedRepositoryPath ===
                                                    pathRow.repositoryPath;
                                                return (
                                                    <div
                                                        key={pathRow.key}
                                                        className={`browser-row browser-tree-row browser-tree-path-row browser-virtual-item${
                                                            isSelected ? " is-selected" : ""
                                                        }${
                                                            pathRow.isCurrent
                                                                ? " is-current-directory"
                                                                : ""
                                                        }`}
                                                        style={{
                                                            top: `${item.offsetTop}px`,
                                                        }}
                                                        onClick={function () {
                                                            if (pathRow.isCurrent) {
                                                                showCurrentDirectoryDetails();
                                                                return;
                                                            }

                                                            if (pathEntry) {
                                                                selectEntry(pathEntry);
                                                            }
                                                        }}
                                                        onDoubleClick={function () {
                                                            toggleDirectory(
                                                                pathRow.repositoryPath
                                                            );
                                                        }}
                                                        onContextMenu={function (event) {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            openPathContextMenu(
                                                                pathRow,
                                                                pathEntry,
                                                                event.clientX,
                                                                event.clientY
                                                            );
                                                        }}
                                                    >
                                                        <div
                                                            className="browser-entry-name browser-tree-name"
                                                            style={getTreeDepthStyle(pathRow.depth)}
                                                        >
                                                            <button
                                                                type="button"
                                                                className="browser-tree-toggle"
                                                                onClick={function (event) {
                                                                    event.stopPropagation();
                                                                    toggleDirectory(
                                                                        pathRow.repositoryPath
                                                                    );
                                                                }}
                                                            >
                                                                <span
                                                                    className={getDirectoryToggleIconClassName(
                                                                        pathRow.isExpanded,
                                                                        pathRow.isLoading
                                                                    )}
                                                                    aria-hidden="true"
                                                                />
                                                            </button>
                                                            <span
                                                                className={`codicon browser-entry-icon codicon-${
                                                                    pathRow.isExpanded
                                                                        ? "folder-opened"
                                                                        : "folder"
                                                                }`}
                                                                aria-hidden="true"
                                                            />
                                                            <span className="tree-label">
                                                                {pathRow.name}
                                                            </span>
                                                        </div>
                                                        <div className="cell-text muted">
                                                            {i18n.formatNodeKind("dir")}
                                                        </div>
                                                        <div className="cell-text muted" />
                                                        <div className="cell-text muted" />
                                                        <div className="browser-open-cell" />
                                                    </div>
                                                );
                                            }

                                            const row = item.row;
                                            const entry = row.entry;
                                            const isSelected =
                                                state.selectedRepositoryPath ===
                                                entry.repositoryPath;

                                            return (
                                                <div
                                                    key={row.key}
                                                    className={`browser-row browser-tree-row browser-tree-entry-row browser-virtual-item${
                                                        isSelected ? " is-selected" : ""
                                                    }${
                                                        row.isLoadingChildren ? " is-loading" : ""
                                                    }${
                                                        row.isCurrentDirectory
                                                            ? " is-current-directory"
                                                            : ""
                                                    }`}
                                                    style={{
                                                        top: `${item.offsetTop}px`,
                                                    }}
                                                    onClick={function () {
                                                        selectEntry(entry);
                                                    }}
                                                    onDoubleClick={function () {
                                                        openEntry(entry);
                                                    }}
                                                    onContextMenu={function (event) {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        openEntryContextMenu(
                                                            entry,
                                                            event.clientX,
                                                            event.clientY
                                                        );
                                                    }}
                                                >
                                                    <div
                                                        className="browser-entry-name browser-tree-name"
                                                        style={getTreeDepthStyle(row.depth)}
                                                    >
                                                        {entry.kind === "dir" ? (
                                                            <button
                                                                type="button"
                                                                className="browser-tree-toggle"
                                                                onClick={function (event) {
                                                                    event.stopPropagation();
                                                                    toggleDirectory(
                                                                        entry.repositoryPath
                                                                    );
                                                                }}
                                                            >
                                                                <span
                                                                    className={getDirectoryToggleIconClassName(
                                                                        row.isExpanded,
                                                                        row.isLoadingChildren
                                                                    )}
                                                                    aria-hidden="true"
                                                                />
                                                            </button>
                                                        ) : (
                                                            <span
                                                                className="browser-tree-spacer"
                                                                aria-hidden="true"
                                                            />
                                                        )}
                                                        <span
                                                            className={`codicon browser-entry-icon codicon-${
                                                                entry.kind === "dir"
                                                                    ? row.isExpanded
                                                                        ? "folder-opened"
                                                                        : "folder"
                                                                    : "file"
                                                            }`}
                                                            aria-hidden="true"
                                                        />
                                                        <span className="tree-label">
                                                            {entry.name}
                                                        </span>
                                                    </div>
                                                    <div className="cell-text muted">
                                                        {entry.kindLabel}
                                                    </div>
                                                    <div className="cell-text muted">
                                                        {entry.revision ? `r${entry.revision}` : ""}
                                                    </div>
                                                    <div className="cell-text muted">
                                                        {entry.author ?? ""}
                                                    </div>
                                                    <div className="browser-open-cell">
                                                        <button
                                                            type="button"
                                                            className="secondary browser-open-button"
                                                            onClick={function (event) {
                                                                event.stopPropagation();
                                                                openEntry(entry);
                                                            }}
                                                        >
                                                            <span
                                                                className={`codicon codicon-${
                                                                    entry.kind === "dir"
                                                                        ? "folder-opened"
                                                                        : "go-to-file"
                                                                }`}
                                                                aria-hidden="true"
                                                            />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </section>

                        <aside className="browser-sidebar">
                            <section className="browser-details-card">
                                <div className="section-title">
                                    {i18n.t(
                                        "repositoryBrowserCurrentDirectorySectionTitle"
                                    )}
                                </div>
                                <div className="browser-details-body">
                                    <div className="details-title-row">
                                        <div className="details-title">
                                            {currentDirectoryLabel}
                                        </div>
                                    </div>
                                    <div className="browser-detail-grid">
                                        {currentDirectoryDetails.map(function (detail) {
                                            return (
                                                <div
                                                    key={`current:${detail.label}`}
                                                    className="browser-detail-row"
                                                >
                                                    <span className="browser-detail-label">
                                                        {detail.label}
                                                    </span>
                                                    <span
                                                        className="browser-detail-value"
                                                        title={detail.value}
                                                    >
                                                        {detail.value}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="browser-action-grid">
                                        {state.currentActions.map(function (action) {
                                            return renderInlineActionButton(
                                                action,
                                                function () {
                                                    runCurrentAction(action.id);
                                                },
                                                "current"
                                            );
                                        })}
                                    </div>
                                </div>
                            </section>

                            <section className="browser-details-card">
                                <div className="section-title">
                                    {i18n.t(
                                        "repositoryBrowserSelectedEntrySectionTitle"
                                    )}
                                </div>
                                <div className="browser-details-body">
                                    {state.selectedRepositoryPath ? (
                                        <>
                                            <div className="details-title-row">
                                                <div className="details-title">
                                                    {selectedEntry?.name ?? selectedPathLabel}
                                                </div>
                                            </div>
                                            <div className="browser-detail-grid">
                                                {selectedDetailItems.map(function (detail) {
                                                    return (
                                                        <div
                                                            key={`selected:${detail.label}`}
                                                            className="browser-detail-row"
                                                        >
                                                            <span className="browser-detail-label">
                                                                {detail.label}
                                                            </span>
                                                            <span
                                                                className="browser-detail-value"
                                                                title={detail.value}
                                                            >
                                                                {detail.value}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="browser-action-grid">
                                                {selectedActions.map(function (action) {
                                                    return renderInlineActionButton(
                                                        action,
                                                        function () {
                                                            if (selectedEntry) {
                                                                runEntryAction(
                                                                    action.id as RepositoryBrowserEntryAction,
                                                                    selectedEntry
                                                                );
                                                                return;
                                                            }

                                                            if (
                                                                state.selectedRepositoryPath &&
                                                                selectedPathLabel
                                                            ) {
                                                                runDirectoryPathContextAction(
                                                                    action.id as RepositoryBrowserEntryAction,
                                                                    state.selectedRepositoryPath,
                                                                    selectedPathLabel
                                                                );
                                                            }
                                                        },
                                                        "selected"
                                                    );
                                                })}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="browser-selection-hint">
                                            {i18n.t("repositoryBrowserSelectEntryHint")}
                                        </div>
                                    )}
                                </div>
                            </section>
                        </aside>
                    </div>
                    {state.contextMenu ? (
                        <div className="context-menu-root">
                            <div
                                className="context-menu-backdrop"
                                onClick={closeContextMenu}
                                onContextMenu={function (event) {
                                    event.preventDefault();
                                    closeContextMenu();
                                }}
                            />
                            <div
                                ref={menuRef}
                                className="context-menu"
                                style={{
                                    left: `${contextMenuPosition?.x ?? state.contextMenu.x}px`,
                                    top: `${contextMenuPosition?.y ?? state.contextMenu.y}px`,
                                }}
                                onClick={function (event) {
                                    event.stopPropagation();
                                }}
                                onMouseDown={function (event) {
                                    event.stopPropagation();
                                }}
                            >
                                <div className="context-menu-header">
                                    <div
                                        className="context-menu-title"
                                        title={state.contextMenu.target.title}
                                    >
                                        {state.contextMenu.target.title}
                                    </div>
                                    <div
                                        className="context-menu-subtitle"
                                        title={state.contextMenu.target.subtitle}
                                    >
                                        {state.contextMenu.target.subtitle}
                                    </div>
                                </div>
                                <div className="context-menu-actions">
                                    {state.contextMenu.target.actions.map(
                                        renderContextMenuAction
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        );
    }

    const rootElement = document.getElementById("root");
    if (!rootElement) {
        throw new Error("Missing root element for repository browser webview.");
    }

    createRoot(rootElement).render(<RepositoryBrowserApp />);
})();
