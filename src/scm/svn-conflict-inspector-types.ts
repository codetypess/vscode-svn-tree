import type { SvnNodeKind } from "../svn/svn-types";

export type ConflictInspectorArtifactRole =
    | "mine"
    | "base"
    | "incoming"
    | "property"
    | "revision"
    | "related";

export type ConflictInspectorDiffAction =
    | "base-working"
    | "mine-working"
    | "working-incoming"
    | "mine-incoming";

export type ConflictInspectorResolutionAction =
    | "working"
    | "mine-full"
    | "base"
    | "mine-conflict"
    | "theirs-conflict"
    | "theirs-full"
    | "postpone";

export interface ConflictInspectorArtifact {
    readonly path: string;
    readonly relativePath: string;
    readonly role: ConflictInspectorArtifactRole;
    readonly revision?: string;
}

export interface ConflictInspectorView {
    readonly conflictPath: string;
    readonly conflictRelativePath: string;
    readonly repositoryPath: string;
    readonly kind: SvnNodeKind;
    readonly revision?: string;
    readonly author?: string;
    readonly date?: string;
    readonly resolved: boolean;
    readonly artifacts: readonly ConflictInspectorArtifact[];
}
