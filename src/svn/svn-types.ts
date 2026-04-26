export type SvnNodeKind = "dir" | "file" | "unknown";

export type SvnWorkingCopyStatus =
    | "added"
    | "conflicted"
    | "deleted"
    | "external"
    | "ignored"
    | "incomplete"
    | "missing"
    | "modified"
    | "normal"
    | "none"
    | "obstructed"
    | "replaced"
    | "unversioned";

export type SvnRepositoryStatus = "added" | "deleted" | "modified" | "none" | "replaced";

export interface SvnWorkingCopyInfo {
    rootPath: string;
    workingCopyRoot: string;
    url: string;
    repositoryRoot: string;
    repositoryRelativePath: string;
    revision?: string;
}

export interface SvnNodeInfo {
    absolutePath: string;
    kind: SvnNodeKind;
    url: string;
    repositoryRoot: string;
    repositoryRelativePath: string;
    workingCopyRoot?: string;
    revision?: string;
    committedRevision?: string;
    author?: string;
    date?: string;
    lockOwner?: string;
    lockComment?: string;
    lockCreated?: string;
}

export interface SvnStatusEntry {
    absolutePath: string;
    relativePath: string;
    kind: SvnNodeKind;
    wcStatus: SvnWorkingCopyStatus;
    changelist?: string;
    conflictArtifact?: boolean;
    reposStatus?: SvnRepositoryStatus;
    revision?: string;
    committedRevision?: string;
    author?: string;
    date?: string;
}

export interface SvnLogPathChange {
    action: "A" | "D" | "M" | "R";
    kind: SvnNodeKind;
    path: string;
    copyfromPath?: string;
    copyfromRevision?: string;
    textMods?: string;
    propMods?: string;
}

export interface SvnLogEntry {
    revision: number;
    author: string;
    date: string;
    message: string;
    changes: SvnLogPathChange[];
    incoming?: boolean;
}

export interface SvnLogPage {
    entries: SvnLogEntry[];
    hasMore: boolean;
    currentRevision?: number;
}
