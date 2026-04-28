import type * as vscode from "vscode";
import type { SvnNodeKind, SvnRepositoryListEntry } from "../svn/svn-types";
import {
    buildRepositoryUrl,
    getReferenceKindForRepositoryPath,
    isSameOrChildRepositoryPath,
    normalizeRepositoryPath,
    splitRepositoryPath,
} from "./svn-repository-paths";

export type RepositoryBrowserAction =
    | "show-history"
    | "show-properties"
    | "create-directory"
    | "copy-directory"
    | "move-directory"
    | "delete-directory"
    | "copy-url"
    | "copy-path"
    | "switch-here"
    | "create-branch-from-working-copy"
    | "create-tag-from-working-copy"
    | "delete-reference";

export interface RepositoryBrowserQuickPickItem extends vscode.QuickPickItem {
    readonly itemType: "action" | "up" | "directory" | "file";
    readonly action?: RepositoryBrowserAction;
    readonly repositoryPath?: string;
    readonly url?: string;
}

export type RepositoryBrowserFileAction =
    | "show-history"
    | "show-properties"
    | "show-blame"
    | "show-blame-output"
    | "copy-blame-line"
    | "open-file"
    | "copy-url"
    | "copy-path";

export interface RepositoryBrowserFileActionQuickPickItem extends vscode.QuickPickItem {
    readonly action: RepositoryBrowserFileAction;
}

interface RepositoryBrowserStrings {
    readonly actionsSeparator: string;
    readonly openHistoryActionLabel: string;
    readonly showPropertiesActionLabel: string;
    readonly createDirectoryActionLabel: string;
    readonly copyDirectoryActionLabel: string;
    readonly moveDirectoryActionLabel: string;
    readonly deleteDirectoryActionLabel: string;
    readonly createBranchFromWorkingCopyActionLabel: string;
    readonly createTagFromWorkingCopyActionLabel: string;
    readonly copyRepositoryUrlActionLabel: string;
    readonly copyRepositoryPathActionLabel: string;
    readonly switchHereLabel: string;
    readonly deleteReferenceActionLabel: string;
    readonly entriesSeparator: string;
    readonly upLabel: string;
    readonly emptyLabel: string;
}

interface RepositoryBrowserFileActionStrings {
    readonly openHistoryActionLabel: string;
    readonly showPropertiesActionLabel: string;
    readonly showBlameActionLabel: string;
    readonly showBlameOutputActionLabel: string;
    readonly copyBlameLineActionLabel: string;
    readonly openFileLabel: string;
    readonly copyRepositoryUrlActionLabel: string;
    readonly copyRepositoryPathActionLabel: string;
}

export type RepositoryBrowserPathInputMode = "child-relative" | "sibling-or-absolute";
export type RepositoryBrowserPathValidationError =
    | "required"
    | "absolute-path"
    | "empty-segment"
    | "relative-navigation"
    | "same-path"
    | "nested-target";

export function getParentRepositoryPath(repositoryPath: string): string {
    const segments = splitRepositoryPath(repositoryPath);
    if (segments.length <= 1) {
        return "/";
    }

    return normalizeRepositoryPath(segments.slice(0, -1).join("/"));
}

export function buildRepositoryBrowserItems(options: {
    readonly currentRepositoryPath: string;
    readonly currentUrl: string;
    readonly repositoryRoot: string;
    readonly currentWorkingCopyRepositoryPath: string;
    readonly entries: readonly SvnRepositoryListEntry[];
    readonly formatNodeKind: (kind: SvnNodeKind) => string;
    readonly separatorKind: vscode.QuickPickItemKind;
    readonly strings: RepositoryBrowserStrings;
}): RepositoryBrowserQuickPickItem[] {
    const canCopyCurrentDirectory = normalizeRepositoryPath(options.currentRepositoryPath) !== "/";
    const canMoveOrDeleteCurrentDirectory = canMutateCurrentRepositoryPath(
        options.currentRepositoryPath,
        options.currentWorkingCopyRepositoryPath
    );
    const items: RepositoryBrowserQuickPickItem[] = [
        {
            label: options.strings.actionsSeparator,
            kind: options.separatorKind,
            itemType: "action",
        },
        {
            label: options.strings.openHistoryActionLabel,
            description: options.currentRepositoryPath,
            itemType: "action",
            action: "show-history",
            repositoryPath: options.currentRepositoryPath,
            url: options.currentUrl,
        },
        {
            label: options.strings.showPropertiesActionLabel,
            description: options.currentRepositoryPath,
            itemType: "action",
            action: "show-properties",
            repositoryPath: options.currentRepositoryPath,
            url: options.currentUrl,
        },
        {
            label: options.strings.createDirectoryActionLabel,
            description: options.currentRepositoryPath,
            itemType: "action",
            action: "create-directory",
            repositoryPath: options.currentRepositoryPath,
            url: options.currentUrl,
        },
        {
            label: options.strings.createBranchFromWorkingCopyActionLabel,
            description: options.currentRepositoryPath,
            itemType: "action",
            action: "create-branch-from-working-copy",
            repositoryPath: options.currentRepositoryPath,
            url: options.currentUrl,
        },
        {
            label: options.strings.createTagFromWorkingCopyActionLabel,
            description: options.currentRepositoryPath,
            itemType: "action",
            action: "create-tag-from-working-copy",
            repositoryPath: options.currentRepositoryPath,
            url: options.currentUrl,
        },
    ];

    if (canCopyCurrentDirectory) {
        items.push({
            label: options.strings.copyDirectoryActionLabel,
            description: options.currentRepositoryPath,
            itemType: "action",
            action: "copy-directory",
            repositoryPath: options.currentRepositoryPath,
            url: options.currentUrl,
        });
    }

    if (canMoveOrDeleteCurrentDirectory) {
        items.push({
            label: options.strings.moveDirectoryActionLabel,
            description: options.currentRepositoryPath,
            itemType: "action",
            action: "move-directory",
            repositoryPath: options.currentRepositoryPath,
            url: options.currentUrl,
        });
    }

    if (
        normalizeRepositoryPath(options.currentRepositoryPath) !==
        normalizeRepositoryPath(options.currentWorkingCopyRepositoryPath)
    ) {
        items.push({
            label: options.strings.switchHereLabel,
            description: options.currentRepositoryPath,
            itemType: "action",
            action: "switch-here",
            repositoryPath: options.currentRepositoryPath,
            url: options.currentUrl,
        });
    }

    items.push(
        {
            label: options.strings.copyRepositoryUrlActionLabel,
            description: options.currentUrl,
            itemType: "action",
            action: "copy-url",
            repositoryPath: options.currentRepositoryPath,
            url: options.currentUrl,
        },
        {
            label: options.strings.copyRepositoryPathActionLabel,
            description: options.currentRepositoryPath,
            itemType: "action",
            action: "copy-path",
            repositoryPath: options.currentRepositoryPath,
            url: options.currentUrl,
        }
    );

    if (getReferenceKindForRepositoryPath(options.currentRepositoryPath)) {
        items.push({
            label: options.strings.deleteReferenceActionLabel,
            description: options.currentRepositoryPath,
            itemType: "action",
            action: "delete-reference",
            repositoryPath: options.currentRepositoryPath,
            url: options.currentUrl,
        });
    } else if (canMoveOrDeleteCurrentDirectory) {
        items.push({
            label: options.strings.deleteDirectoryActionLabel,
            description: options.currentRepositoryPath,
            itemType: "action",
            action: "delete-directory",
            repositoryPath: options.currentRepositoryPath,
            url: options.currentUrl,
        });
    }

    items.push({
        label: options.strings.entriesSeparator,
        kind: options.separatorKind,
        itemType: "action",
    });

    if (options.currentRepositoryPath !== "/") {
        const parentRepositoryPath = getParentRepositoryPath(options.currentRepositoryPath);
        items.push({
            label: options.strings.upLabel,
            description: parentRepositoryPath,
            itemType: "up",
            repositoryPath: parentRepositoryPath,
            url: buildRepositoryUrl(options.repositoryRoot, parentRepositoryPath),
        });
    }

    const sortedEntries = [...options.entries].sort((left, right) => {
        if (left.kind !== right.kind) {
            return left.kind === "dir" ? -1 : 1;
        }

        return left.name.localeCompare(right.name);
    });

    if (sortedEntries.length === 0) {
        items.push({
            label: options.strings.emptyLabel,
            description: options.currentRepositoryPath,
            itemType: "action",
            repositoryPath: options.currentRepositoryPath,
            url: options.currentUrl,
        });
        return items;
    }

    for (const entry of sortedEntries) {
        const repositoryPath = normalizeRepositoryPath(
            [options.currentRepositoryPath, entry.name]
                .filter((segment) => segment !== "/")
                .join("/")
        );
        items.push({
            label: entry.name,
            description: options.formatNodeKind(entry.kind),
            detail: entry.revision
                ? `r${entry.revision}${entry.author ? ` | ${entry.author}` : ""}`
                : undefined,
            itemType: entry.kind === "dir" ? "directory" : "file",
            repositoryPath,
            url: buildRepositoryUrl(options.repositoryRoot, repositoryPath),
        });
    }

    return items;
}

export function buildRepositoryBrowserFileActionItems(options: {
    readonly repositoryPath: string;
    readonly url: string;
    readonly strings: RepositoryBrowserFileActionStrings;
}): RepositoryBrowserFileActionQuickPickItem[] {
    return [
        {
            label: options.strings.openHistoryActionLabel,
            description: options.repositoryPath,
            action: "show-history",
        },
        {
            label: options.strings.showPropertiesActionLabel,
            description: options.repositoryPath,
            action: "show-properties",
        },
        {
            label: options.strings.showBlameActionLabel,
            description: options.repositoryPath,
            action: "show-blame",
        },
        {
            label: options.strings.showBlameOutputActionLabel,
            description: options.repositoryPath,
            action: "show-blame-output",
        },
        {
            label: options.strings.copyBlameLineActionLabel,
            description: options.repositoryPath,
            action: "copy-blame-line",
        },
        {
            label: options.strings.openFileLabel,
            description: options.repositoryPath,
            action: "open-file",
        },
        {
            label: options.strings.copyRepositoryUrlActionLabel,
            description: options.url,
            action: "copy-url",
        },
        {
            label: options.strings.copyRepositoryPathActionLabel,
            description: options.repositoryPath,
            action: "copy-path",
        },
    ];
}

export function canMutateCurrentRepositoryPath(
    currentRepositoryPath: string,
    currentWorkingCopyRepositoryPath: string
): boolean {
    const normalizedCurrentPath = normalizeRepositoryPath(currentRepositoryPath);
    if (normalizedCurrentPath === "/") {
        return false;
    }

    return !isSameOrChildRepositoryPath(normalizedCurrentPath, currentWorkingCopyRepositoryPath);
}

export function getRepositoryBrowserPathValidationError(
    value: string,
    mode: RepositoryBrowserPathInputMode
): RepositoryBrowserPathValidationError | undefined {
    const normalizedValue = value.trim().replace(/\\/g, "/");
    if (!normalizedValue) {
        return "required";
    }

    if (mode === "child-relative" && normalizedValue.startsWith("/")) {
        return "absolute-path";
    }

    const segments = normalizedValue.replace(/^\/+/, "").split("/");
    if (segments.some((segment) => segment.trim().length === 0)) {
        return "empty-segment";
    }

    if (segments.some((segment) => segment === "." || segment === "..")) {
        return "relative-navigation";
    }

    return undefined;
}

export function resolveRepositoryBrowserChildPath(
    currentRepositoryPath: string,
    value: string
): string {
    return normalizeRepositoryPath(
        [currentRepositoryPath, value.trim().replace(/\\/g, "/")]
            .filter((segment) => segment !== "/")
            .join("/")
    );
}

export function resolveRepositoryBrowserSiblingOrAbsolutePath(
    currentRepositoryPath: string,
    value: string
): string {
    const normalizedValue = value.trim().replace(/\\/g, "/");
    if (normalizedValue.startsWith("/")) {
        return normalizeRepositoryPath(normalizedValue);
    }

    return normalizeRepositoryPath(
        [getParentRepositoryPath(currentRepositoryPath), normalizedValue]
            .filter((segment) => segment !== "/")
            .join("/")
    );
}

export function getRepositoryBrowserMutationTargetValidationError(
    sourceRepositoryPath: string,
    destinationRepositoryPath: string
): RepositoryBrowserPathValidationError | undefined {
    const normalizedSourcePath = normalizeRepositoryPath(sourceRepositoryPath);
    const normalizedDestinationPath = normalizeRepositoryPath(destinationRepositoryPath);

    if (normalizedDestinationPath === normalizedSourcePath) {
        return "same-path";
    }

    if (isSameOrChildRepositoryPath(normalizedSourcePath, normalizedDestinationPath)) {
        return "nested-target";
    }

    return undefined;
}
