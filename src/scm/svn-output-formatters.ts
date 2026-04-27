import type { SvnNodeInfo, SvnPropertyEntry } from "../svn/svn-types";
import { formatPropertyEntries } from "./svn-property-utils";

interface RepositoryTargetLabels {
    readonly infoPathLabel: string;
    readonly infoRepositoryPathLabel: string;
    readonly infoUrlLabel: string;
}

interface RepositoryTargetDetails {
    readonly displayPath: string;
    readonly repositoryPath: string;
    readonly url: string;
}

export interface BlamePreviewOptions extends RepositoryTargetDetails {
    readonly blameOutput: string;
}

export interface PropertyOutputOptions extends RepositoryTargetDetails {
    readonly properties: readonly SvnPropertyEntry[];
}

export interface PropertyOutputLabels extends RepositoryTargetLabels {
    readonly propertiesHeaderLabel: string;
    readonly noPropertiesFoundLabel: string;
}

export interface PathInfoLabels {
    readonly infoPathLabel: string;
    readonly infoKindLabel: string;
    readonly infoRepositoryPathLabel: string;
    readonly infoUrlLabel: string;
    readonly infoRepositoryRootLabel: string;
    readonly infoWorkingCopyRootLabel: string;
    readonly infoRevisionLabel: string;
    readonly infoLastChangedRevisionLabel: string;
    readonly infoLastChangedAuthorLabel: string;
    readonly infoLastChangedDateLabel: string;
    readonly infoLockOwnerLabel: string;
    readonly infoLockCreatedLabel: string;
    readonly infoLockCommentLabel: string;
}

function buildRepositoryTargetLines(
    labels: RepositoryTargetLabels,
    options: RepositoryTargetDetails
): string[] {
    return [
        `${labels.infoPathLabel}: ${options.displayPath}`,
        `${labels.infoRepositoryPathLabel}: ${options.repositoryPath}`,
        `${labels.infoUrlLabel}: ${options.url}`,
    ];
}

export function buildBlamePreviewContent(
    labels: RepositoryTargetLabels,
    options: BlamePreviewOptions
): string {
    return [
        ...buildRepositoryTargetLines(labels, options),
        "",
        options.blameOutput,
    ].join("\n");
}

export function buildBlameOutputLines(
    labels: RepositoryTargetLabels,
    options: BlamePreviewOptions
): string[] {
    return [
        ...buildRepositoryTargetLines(labels, options),
        "",
        options.blameOutput,
    ];
}

export function buildPropertyOutputLines(
    labels: PropertyOutputLabels,
    options: PropertyOutputOptions
): string[] {
    return [
        ...buildRepositoryTargetLines(labels, options),
        "",
        `${labels.propertiesHeaderLabel}:`,
        ...formatPropertyEntries(options.properties, labels.noPropertiesFoundLabel),
    ];
}

export function buildPathInfoOutputLines(
    nodeInfo: SvnNodeInfo,
    options: {
        readonly labels: PathInfoLabels;
        readonly formatNodeKind: (kind: SvnNodeInfo["kind"]) => string;
    }
): string[] {
    const { labels } = options;
    const lines = [
        `${labels.infoPathLabel}: ${nodeInfo.absolutePath}`,
        `${labels.infoKindLabel}: ${options.formatNodeKind(nodeInfo.kind)}`,
        `${labels.infoRepositoryPathLabel}: ${nodeInfo.repositoryRelativePath}`,
        `${labels.infoUrlLabel}: ${nodeInfo.url}`,
        `${labels.infoRepositoryRootLabel}: ${nodeInfo.repositoryRoot}`,
    ];

    if (nodeInfo.workingCopyRoot) {
        lines.push(`${labels.infoWorkingCopyRootLabel}: ${nodeInfo.workingCopyRoot}`);
    }

    if (nodeInfo.revision) {
        lines.push(`${labels.infoRevisionLabel}: r${nodeInfo.revision}`);
    }

    if (nodeInfo.committedRevision) {
        lines.push(
            `${labels.infoLastChangedRevisionLabel}: r${nodeInfo.committedRevision}`
        );
    }

    if (nodeInfo.author) {
        lines.push(`${labels.infoLastChangedAuthorLabel}: ${nodeInfo.author}`);
    }

    if (nodeInfo.date) {
        lines.push(`${labels.infoLastChangedDateLabel}: ${nodeInfo.date}`);
    }

    if (nodeInfo.lockOwner) {
        lines.push(`${labels.infoLockOwnerLabel}: ${nodeInfo.lockOwner}`);
    }

    if (nodeInfo.lockCreated) {
        lines.push(`${labels.infoLockCreatedLabel}: ${nodeInfo.lockCreated}`);
    }

    if (nodeInfo.lockComment) {
        lines.push(`${labels.infoLockCommentLabel}: ${nodeInfo.lockComment}`);
    }

    return lines;
}
