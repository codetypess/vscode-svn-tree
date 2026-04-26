import type { CSSProperties } from "react";
import type { SvnHistoryFilters } from "../svn/svn-types";
import type {
    FileManagerPlatform,
    RuntimeI18n,
    SupportedLocale,
} from "../i18n";

export type HistoryViewStyle = "summary" | "detail";

export type ContextActionType =
    | "update-to-revision"
    | "checkout-revision"
    | "export-revision"
    | "compare-with-working-copy"
    | "compare-with-previous-revision"
    | "revert-to-revision"
    | "revert-changes-from-revision"
    | "copy-revision"
    | "copy-message"
    | "copy-changed-paths"
    | "create-branch"
    | "create-tag";

export type FileContextActionType =
    | "open-file-diff"
    | "export-file"
    | "compare-file-with-working-copy"
    | "compare-file-with-previous-revision"
    | "show-file-history"
    | "reveal-in-file-manager"
    | "copy-file-path";

export interface HistoryBootstrap {
    repositoryLabel: string;
    rootPath: string;
    locale: SupportedLocale;
    platform: FileManagerPlatform;
}

export interface HistoryChange {
    path: string;
    action: string;
    kind?: string;
    copyfromPath?: string;
    copyfromRevision?: number | string;
    textMods?: string;
    propMods?: string;
}

export interface HistoryEntry {
    revision: number;
    author: string;
    date: string;
    message: string;
    changes: HistoryChange[];
    incoming?: boolean;
}

export interface HistoryDataPayload {
    append: boolean;
    hasMore: boolean;
    currentRevision?: number;
    nextBeforeRevision?: number;
    repositoryLabel: string;
    rootPath: string;
    entries: HistoryEntry[];
}

export interface HistoryErrorPayload {
    append: boolean;
    message: string;
}

export interface HistoryConfigPayload {
    locale: SupportedLocale;
}

export interface HistoryFilterFormState {
    author: string;
    message: string;
    changedPath: string;
    dateFrom: string;
    dateTo: string;
}

export type HistoryDateFieldKey = "dateFrom" | "dateTo";

export type HistoryResponseMessage =
    | {
          type: "history-data";
          payload: HistoryDataPayload;
      }
    | {
          type: "history-error";
          payload: HistoryErrorPayload;
      }
    | {
          type: "history-config";
          payload: HistoryConfigPayload;
      };

export type HistoryRequestMessage =
    | {
          type: "ready";
          filters: SvnHistoryFilters;
      }
    | {
          type: "refresh";
          filters: SvnHistoryFilters;
      }
    | {
          type: "load-more";
          beforeRevision: number;
          filters: SvnHistoryFilters;
      }
    | {
          type:
              | "update-to-revision"
              | "checkout-revision"
              | "export-revision"
              | "revert-to-revision"
              | "revert-changes-from-revision"
              | "copy-revision"
              | "create-branch"
              | "create-tag";
          revision: number;
      }
    | {
          type:
              | "open-diff"
              | "export-file"
              | "compare-file-with-working-copy"
              | "compare-file-with-previous-revision";
          revision: number;
          path: string;
          action: string;
      }
    | {
          type: "show-file-history" | "reveal-in-file-manager";
          path: string;
      }
    | {
          type: "copy-file-path";
          revision: number;
          path: string;
      }
    | {
          type: "compare-with-working-copy" | "compare-with-previous-revision";
          revision: number;
          changes: HistoryChange[];
      }
    | {
          type: "copy-message";
          revision: number;
          message: string;
      }
    | {
          type: "copy-changed-paths";
          revision: number;
          changedPaths: string[];
      };

export interface RevisionContextMenuState {
    kind: "revision";
    revision: number;
    x: number;
    y: number;
}

export interface FileContextMenuState {
    kind: "file";
    revision: number;
    x: number;
    y: number;
    change: HistoryChange;
}

export type ContextMenuState = RevisionContextMenuState | FileContextMenuState;

export type CollapsedDirectories = Record<string, boolean>;

export interface HistoryState {
    entries: HistoryEntry[];
    hasMore: boolean;
    isLoading: boolean;
    currentRevision?: number;
    nextBeforeRevision?: number;
    loadMoreError?: string;
    expandedRevision?: number;
    collapsedDirectories: CollapsedDirectories;
    contextMenu?: ContextMenuState;
    localQuery: string;
    appliedFilters: SvnHistoryFilters;
    draftFilters: HistoryFilterFormState;
    filtersOpen: boolean;
    filterError?: string;
    activeDatePicker?: HistoryDateFieldKey;
    repositoryLabel: string;
    rootPath: string;
    locale: SupportedLocale;
    platform: FileManagerPlatform;
}

export interface ChangeTreeDirectory {
    type: "dir";
    name: string;
    fullPath: string;
    children: ChangeTreeNodeModel[];
}

export interface ChangeTreeFile {
    type: "file";
    name: string;
    fullPath: string;
    change: HistoryChange;
}

export type ChangeTreeNodeModel = ChangeTreeDirectory | ChangeTreeFile;

export interface ChangeTreeNodeProps {
    i18n: RuntimeI18n;
    node: ChangeTreeNodeModel;
    depth: number;
    revision: number;
    rootPath: string;
    searchQuery: string;
    collapsedDirectories: CollapsedDirectories;
    onToggleDirectory: (revision: number, fullPath: string) => void;
    onOpenFileContextMenu: (
        revision: number,
        change: HistoryChange,
        clientX: number,
        clientY: number
    ) => void;
}

export interface CommitDetailsProps {
    i18n: RuntimeI18n;
    entry: HistoryEntry;
    rootPath: string;
    searchQuery: string;
    collapsedDirectories: CollapsedDirectories;
    onToggleDirectory: (revision: number, fullPath: string) => void;
    onOpenFileContextMenu: (
        revision: number,
        change: HistoryChange,
        clientX: number,
        clientY: number
    ) => void;
}

export interface CommitItemProps {
    entry: HistoryEntry;
    i18n: RuntimeI18n;
    rootPath: string;
    searchQuery: string;
    collapsedDirectories: CollapsedDirectories;
    currentRevision?: number;
    expandedRevision?: number;
    isFirstInList: boolean;
    isLastInList: boolean;
    topStemIncoming: boolean;
    bottomStemIncoming: boolean;
    layoutKey: string;
    layoutStyle: CSSProperties;
    onToggleDirectory: (revision: number, fullPath: string) => void;
    onOpenRevisionContextMenu: (revision: number, clientX: number, clientY: number) => void;
    onOpenFileContextMenu: (
        revision: number,
        change: HistoryChange,
        clientX: number,
        clientY: number
    ) => void;
    onToggleExpandedRevision: (revision: number) => void;
    onHeightChange: (revision: number, layoutKey: string, height: number) => void;
}

export interface ContextMenuProps {
    i18n: RuntimeI18n;
    platform: FileManagerPlatform;
    menu?: ContextMenuState;
    entry?: HistoryEntry;
    onClose: () => void;
    onAction: (type: ContextActionType, entry: HistoryEntry) => void;
    onFileAction: (type: FileContextActionType, revision: number, change: HistoryChange) => void;
}

export interface MenuPosition {
    x: number;
    y: number;
}

export interface HistoryFooterProps {
    i18n: RuntimeI18n;
    hasMore: boolean;
    isLoading: boolean;
    loadMoreError?: string;
    layoutStyle?: CSSProperties;
    onRequestMore: () => void;
    onHeightChange?: (height: number) => void;
}

export interface VirtualizedHistoryLayoutItem {
    entry: HistoryEntry;
    index: number;
    height: number;
    offsetTop: number;
    layoutKey: string;
}

export interface MeasuredHistoryItemSize {
    height: number;
    layoutKey: string;
}

export interface VsCodeApi {
    postMessage(message: HistoryRequestMessage): void;
    getState(): unknown;
    setState(state: unknown): void;
}

declare global {
    function acquireVsCodeApi(): VsCodeApi;

    interface Window {
        __SVN_HISTORY_BOOTSTRAP__?: HistoryBootstrap;
    }
}
