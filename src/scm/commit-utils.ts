import type { RuntimeI18n } from "../i18n";
import type { SvnStatusEntry, SvnWorkingCopyStatus } from "../svn/svn-types";

export interface CommitQuickPickItemData {
    readonly label: string;
    readonly description: string;
    readonly detail?: string;
    readonly picked: true;
    readonly absolutePath: string;
}

export function isCommittableStatus(status: SvnWorkingCopyStatus): boolean {
    switch (status) {
        case "added":
        case "deleted":
        case "missing":
        case "modified":
        case "replaced":
            return true;
        default:
            return false;
    }
}

export function buildCommitQuickPickItems(
    i18n: Pick<RuntimeI18n, "formatNodeKind" | "formatSvnStatus">,
    statuses: readonly Pick<SvnStatusEntry, "absolutePath" | "kind" | "relativePath" | "wcStatus">[]
): CommitQuickPickItemData[] {
    return statuses.map((status) => ({
        label: status.relativePath,
        description: i18n.formatSvnStatus(status.wcStatus),
        ...(status.kind === "unknown" ? {} : { detail: i18n.formatNodeKind(status.kind) }),
        picked: true,
        absolutePath: status.absolutePath,
    }));
}
