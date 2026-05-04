import type { SupportedLocale } from "../i18n";
import type { SvnNodeKind, SvnPropertyEntry } from "../svn/svn-types";
import type {
    RepositoryBrowserAction,
    RepositoryBrowserBreadcrumbItem,
    RepositoryBrowserEntryAction,
    RepositoryBrowserEntryItem,
    RepositoryBrowserViewActionItem,
    RepositoryBrowserViewModel,
} from "../scm/svn-repository-browser";

export interface RepositoryBrowserBootstrap {
    repositoryLabel: string;
    rootPath: string;
    initialRepositoryPath: string;
    currentWorkingCopyRepositoryPath: string;
    locale: SupportedLocale;
}

export interface RepositoryBrowserDataPayload extends RepositoryBrowserViewModel {
    repositoryLabel: string;
    rootPath: string;
    selectedRepositoryPath?: string;
}

export interface RepositoryBrowserErrorPayload {
    repositoryPath: string;
    message: string;
}

export interface RepositoryBrowserPropertiesPayload {
    repositoryPath: string;
    properties: readonly SvnPropertyEntry[];
}

export interface RepositoryBrowserPropertiesErrorPayload {
    repositoryPath: string;
    message: string;
}

export interface RepositoryBrowserConfigPayload {
    locale: SupportedLocale;
}

export type RepositoryBrowserPropertyMutationAction = "set" | "delete";

export type RepositoryBrowserResponseMessage =
    | {
          type: "browser-data";
          payload: RepositoryBrowserDataPayload;
      }
    | {
          type: "directory-data";
          payload: RepositoryBrowserDataPayload;
      }
    | {
          type: "browser-error";
          payload: RepositoryBrowserErrorPayload;
      }
    | {
          type: "properties-data";
          payload: RepositoryBrowserPropertiesPayload;
      }
    | {
          type: "properties-error";
          payload: RepositoryBrowserPropertiesErrorPayload;
      }
    | {
          type: "browser-config";
          payload: RepositoryBrowserConfigPayload;
      };

export type RepositoryBrowserRequestMessage =
    | {
          type: "ready";
      }
    | {
          type: "refresh";
      }
    | {
          type: "navigate";
          repositoryPath: string;
      }
    | {
          type: "load-directory";
          repositoryPath: string;
      }
    | {
          type: "load-properties";
          repositoryPath: string;
      }
    | {
          type: "run-current-action";
          action: RepositoryBrowserAction;
          repositoryPath: string;
      }
    | {
          type: "run-entry-action";
          action: RepositoryBrowserEntryAction;
          repositoryPath: string;
          kind: SvnNodeKind;
      }
    | {
          type: "edit-property";
          repositoryPath: string;
          kind: SvnNodeKind;
          propertyName?: string;
          propertyAction?: RepositoryBrowserPropertyMutationAction;
      };

declare global {
    interface Window {
        __SVN_REPOSITORY_BROWSER_BOOTSTRAP__?: RepositoryBrowserBootstrap;
    }
}

export type RepositoryBrowserCurrentActionItem =
    RepositoryBrowserViewActionItem<RepositoryBrowserAction>;
export type RepositoryBrowserEntryActionItem =
    RepositoryBrowserViewActionItem<RepositoryBrowserEntryAction>;
export type RepositoryBrowserViewEntry = RepositoryBrowserEntryItem;
export type RepositoryBrowserBreadcrumb = RepositoryBrowserBreadcrumbItem;
