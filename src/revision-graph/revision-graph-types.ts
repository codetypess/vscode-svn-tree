import type { SupportedLocale } from "../i18n";

export type RevisionGraphNodeKind = "trunk" | "branch" | "tag" | "path";
export type RevisionGraphEdgeKind = "copy" | "mergeinfo";

export interface RevisionGraphLayoutConfig {
    trunkNames: string[];
    branchContainerNames: string[];
    tagContainerNames: string[];
}

export interface RevisionGraphFilters {
    author?: string;
    dateFrom?: string;
    dateTo?: string;
    revisionFrom?: number;
    revisionTo?: number;
}

export interface RevisionGraphQuery {
    entryBudget?: number;
    filters?: RevisionGraphFilters;
}

export interface RevisionGraphNode {
    id: string;
    repositoryPath: string;
    url: string;
    label: string;
    detail: string;
    kind: RevisionGraphNodeKind;
    current: boolean;
    selected: boolean;
    createdRevision?: number;
    createdAuthor?: string;
    createdDate?: string;
    lastSeenRevision?: number;
    localChangeCount?: number;
    incomingChangeCount?: number;
    lockOwner?: string;
    mergeSourceCount?: number;
    hoverSummary?: string[];
}

export interface RevisionGraphEdge {
    id: string;
    kind: RevisionGraphEdgeKind;
    sourceId: string;
    targetId: string;
    sourceRepositoryPath: string;
    targetRepositoryPath: string;
    revision: number;
    author?: string;
    date?: string;
    revisionRange?: string;
    hoverSummary?: string[];
}

export interface RevisionGraphData {
    scopeLabel: string;
    layoutRootPath: string;
    selectedRepositoryPath: string;
    selectedReferencePath: string;
    currentReferencePath: string;
    query: RevisionGraphQuery;
    nodes: RevisionGraphNode[];
    edges: RevisionGraphEdge[];
    scannedEntryCount: number;
    truncated: boolean;
    canLoadMore: boolean;
}

export interface RevisionGraphBootstrap {
    scopeLabel: string;
    locale: SupportedLocale;
}

export type RevisionGraphRequestMessage =
    | {
          type: "ready" | "refresh" | "load-more";
          query?: RevisionGraphQuery;
      }
    | {
          type:
              | "open-history"
              | "open-browser"
              | "open-at-head"
              | "switch-reference"
              | "copy-path"
              | "copy-url"
              | "create-branch"
              | "create-tag"
              | "delete-reference";
          repositoryPath: string;
      }
    | {
          type: "compare-references" | "diff-references";
          sourceRepositoryPath: string;
          targetRepositoryPath: string;
      }
    | {
          type: "open-edge-revision";
          revision: number;
          repositoryPath: string;
      }
    | {
          type: "copy-summary" | "export-summary";
          summary: string;
          suggestedFileName?: string;
      };

export type RevisionGraphResponseMessage =
    | {
          type: "graph-data";
          payload: RevisionGraphData;
      }
    | {
          type: "graph-error";
          payload: {
              message: string;
          };
      }
    | {
          type: "graph-config";
          payload: {
              locale: SupportedLocale;
          };
      };
