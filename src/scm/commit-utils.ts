import type { SvnWorkingCopyStatus } from "../svn/svn-types";

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
