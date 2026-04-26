import type { SupportedLocale } from "../i18n";

export type RevisionGraphNodeKind = "trunk" | "branch" | "tag" | "path";

export interface RevisionGraphNode {
    id: string;
    repositoryPath: string;
    label: string;
    detail: string;
    kind: RevisionGraphNodeKind;
    current: boolean;
    selected: boolean;
    createdRevision?: number;
    createdAuthor?: string;
    createdDate?: string;
    lastSeenRevision?: number;
}

export interface RevisionGraphEdge {
    id: string;
    sourceId: string;
    targetId: string;
    sourceRepositoryPath: string;
    targetRepositoryPath: string;
    revision: number;
    author?: string;
    date?: string;
}

export interface RevisionGraphData {
    scopeLabel: string;
    layoutRootPath: string;
    selectedRepositoryPath: string;
    selectedReferencePath: string;
    currentReferencePath: string;
    nodes: RevisionGraphNode[];
    edges: RevisionGraphEdge[];
    scannedEntryCount: number;
    truncated: boolean;
}

export interface RevisionGraphBootstrap {
    scopeLabel: string;
    locale: SupportedLocale;
}

export type RevisionGraphRequestMessage =
    | {
          type: "ready" | "refresh";
      }
    | {
          type:
              | "open-history"
              | "open-browser"
              | "switch-reference"
              | "copy-path"
              | "copy-url";
          repositoryPath: string;
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
