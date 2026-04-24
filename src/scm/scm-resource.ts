import * as nodePath from "node:path";
import * as vscode from "vscode";
import type { SvnRepository } from "./svn-repository";
import type { SvnStatusEntry } from "../svn/svn-types";

export type ScmResourceKind = "change" | "remote-change";

function toColor(kind: ScmResourceKind, status: string | undefined): vscode.ThemeColor {
    if (status === "added" || status === "unversioned") {
        return new vscode.ThemeColor("gitDecoration.addedResourceForeground");
    }

    if (status === "deleted" || status === "missing") {
        return new vscode.ThemeColor("gitDecoration.deletedResourceForeground");
    }

    if (status === "conflicted") {
        return new vscode.ThemeColor("gitDecoration.conflictingResourceForeground");
    }

    if (kind === "remote-change") {
        return new vscode.ThemeColor("gitDecoration.submoduleResourceForeground");
    }

    return new vscode.ThemeColor("gitDecoration.modifiedResourceForeground");
}

function toIcon(kind: ScmResourceKind, status: string | undefined): vscode.ThemeIcon {
    if (status === "added" || status === "unversioned") {
        return new vscode.ThemeIcon("diff-added", toColor(kind, status));
    }

    if (status === "deleted" || status === "missing") {
        return new vscode.ThemeIcon("diff-removed", toColor(kind, status));
    }

    if (status === "conflicted") {
        return new vscode.ThemeIcon("warning", toColor(kind, status));
    }

    if (kind === "remote-change") {
        return new vscode.ThemeIcon("cloud-download", toColor(kind, status));
    }

    return new vscode.ThemeIcon("diff-modified", toColor(kind, status));
}

export class ScmResource implements vscode.SourceControlResourceState {
    public readonly resourceUri: vscode.Uri;
    public readonly command?: vscode.Command;
    public readonly decorations: vscode.SourceControlResourceDecorations;
    public readonly contextValue: string;

    public constructor(
        public readonly repository: SvnRepository,
        public readonly status: SvnStatusEntry,
        public readonly kind: ScmResourceKind
    ) {
        this.resourceUri = vscode.Uri.file(status.absolutePath);
        this.command = {
            command: "svn-graph.open-diff",
            title: "Open Diff",
            arguments: [this],
        };
        this.contextValue =
            kind === "remote-change"
                ? "svn-remote-change"
                : status.wcStatus === "unversioned"
                  ? "svn-unversioned"
                  : "svn-change";
        this.decorations = {
            strikeThrough: status.wcStatus === "deleted" || status.reposStatus === "deleted",
            faded: status.wcStatus === "missing",
            tooltip: this.tooltip,
            iconPath: toIcon(kind, kind === "remote-change" ? status.reposStatus : status.wcStatus),
        };
    }

    public get tooltip(): string {
        const segments = [
            this.kind === "remote-change" ? "Incoming change" : "Working copy change",
            this.status.relativePath,
            `Status: ${this.kind === "remote-change" ? (this.status.reposStatus ?? "none") : this.status.wcStatus}`,
        ];

        if (this.status.author) {
            segments.push(`Author: ${this.status.author}`);
        }

        if (this.status.committedRevision) {
            segments.push(`Committed revision: r${this.status.committedRevision}`);
        }

        return segments.join("\n");
    }

    public get label(): string {
        return nodePath.basename(this.status.absolutePath);
    }
}
