import type { SvnPropertyEntry } from "../svn/svn-types";
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
