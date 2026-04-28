import * as nodePath from "node:path";

export type RepositoryReferenceKind = "branch" | "tag";

function posixJoin(left: string, right: string): string {
    return `${left.replace(/\/+$/, "")}/${right.replace(/\\/g, "/").replace(/^\/+/, "")}`;
}

export function buildRepositoryUrl(repositoryRoot: string, repositoryPath: string): string {
    const url = new URL(repositoryRoot);
    url.pathname = posixJoin(url.pathname || "/", repositoryPath);
    return url.toString();
}

export function resolveRepositoryPathFromWorkingCopy(
    rootPath: string,
    repositoryRelativePath: string,
    absolutePath: string
): string {
    const relativePath = nodePath.relative(rootPath, absolutePath).replace(/\\/g, "/");
    return normalizeRepositoryPath(
        relativePath.length > 0
            ? `${repositoryRelativePath}/${relativePath}`
            : repositoryRelativePath
    );
}

export function isSameOrChildWorkingCopyPath(rootPath: string, targetPath: string): boolean {
    const relativePath = nodePath.relative(rootPath, targetPath);
    return (
        relativePath === "" ||
        (relativePath !== ".." &&
            !relativePath.startsWith(`..${nodePath.sep}`) &&
            !nodePath.isAbsolute(relativePath))
    );
}

export function isUrlTarget(value: string): boolean {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

export function isSameOrChildRepositoryPath(rootPath: string, targetPath: string): boolean {
    const normalizedRootPath = normalizeRepositoryPath(rootPath);
    const normalizedTargetPath = normalizeRepositoryPath(targetPath);
    return (
        normalizedRootPath === "/" ||
        normalizedTargetPath === normalizedRootPath ||
        normalizedTargetPath.startsWith(`${normalizedRootPath}/`)
    );
}

export function normalizeRepositoryPath(value: string): string {
    const normalized = value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    return normalized ? `/${normalized}` : "/";
}

export function splitRepositoryPath(value: string): string[] {
    const normalized = normalizeRepositoryPath(value);
    return normalized === "/" ? [] : normalized.slice(1).split("/");
}

export function getRepositoryReferenceRoot(repositoryPath: string): string | undefined {
    const segments = splitRepositoryPath(repositoryPath);
    const trunkIndex = segments.indexOf("trunk");
    if (trunkIndex !== -1) {
        return normalizeRepositoryPath(segments.slice(0, trunkIndex + 1).join("/"));
    }

    const branchesIndex = segments.indexOf("branches");
    if (branchesIndex !== -1 && branchesIndex + 1 < segments.length) {
        return normalizeRepositoryPath(segments.slice(0, branchesIndex + 2).join("/"));
    }

    const tagsIndex = segments.indexOf("tags");
    if (tagsIndex !== -1 && tagsIndex + 1 < segments.length) {
        return normalizeRepositoryPath(segments.slice(0, tagsIndex + 2).join("/"));
    }

    return undefined;
}

export function getRepositoryReferenceDisplay(repositoryRelativePath: string): {
    icon: string;
    label: string;
} {
    const referenceRoot = getRepositoryReferenceRoot(repositoryRelativePath);
    const segments = splitRepositoryPath(referenceRoot ?? repositoryRelativePath);
    if (segments.length === 0) {
        return {
            icon: "repo",
            label: "/",
        };
    }

    if (segments.at(-1) === "trunk") {
        return {
            icon: "git-branch",
            label: "trunk",
        };
    }

    const branchesIndex = segments.indexOf("branches");
    if (branchesIndex !== -1 && branchesIndex + 1 < segments.length) {
        return {
            icon: "git-branch",
            label: segments.slice(branchesIndex, branchesIndex + 2).join("/"),
        };
    }

    const tagsIndex = segments.indexOf("tags");
    if (tagsIndex !== -1 && tagsIndex + 1 < segments.length) {
        return {
            icon: "tag",
            label: segments.slice(tagsIndex, tagsIndex + 2).join("/"),
        };
    }

    return {
        icon: "repo",
        label: segments.at(-1) ?? "/",
    };
}

export function getCommitTargetLabel(repositoryRelativePath: string): string {
    const segments = splitRepositoryPath(
        getRepositoryReferenceRoot(repositoryRelativePath) ?? repositoryRelativePath
    );
    if (segments.length === 0) {
        return "/";
    }

    if (segments.at(-1) === "trunk") {
        return "trunk";
    }

    const branchesIndex = segments.indexOf("branches");
    if (branchesIndex !== -1 && branchesIndex + 1 < segments.length) {
        return segments.slice(branchesIndex, branchesIndex + 2).join("/");
    }

    const tagsIndex = segments.indexOf("tags");
    if (tagsIndex !== -1 && tagsIndex + 1 < segments.length) {
        return segments.slice(tagsIndex, tagsIndex + 2).join("/");
    }

    return segments.at(-1) ?? "/";
}

export function getReferenceLayoutRoot(repositoryRelativePath: string): string {
    const segments = splitRepositoryPath(repositoryRelativePath);
    const trunkIndex = segments.indexOf("trunk");
    if (trunkIndex !== -1) {
        return normalizeRepositoryPath(segments.slice(0, trunkIndex).join("/"));
    }

    const branchesIndex = segments.indexOf("branches");
    if (branchesIndex !== -1) {
        return normalizeRepositoryPath(segments.slice(0, branchesIndex).join("/"));
    }

    const tagsIndex = segments.indexOf("tags");
    if (tagsIndex !== -1) {
        return normalizeRepositoryPath(segments.slice(0, tagsIndex).join("/"));
    }

    return "/";
}

export function getReferenceLocationLabel(kind: RepositoryReferenceKind): string {
    return kind === "branch" ? "branches" : "tags";
}

export function buildReferenceDestinationPath(
    repositoryRelativePath: string,
    kind: RepositoryReferenceKind,
    name: string
): string {
    const rootSegments = splitRepositoryPath(getReferenceLayoutRoot(repositoryRelativePath));
    const nameSegments = name
        .replace(/\\/g, "/")
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean);

    return normalizeRepositoryPath(
        [...rootSegments, getReferenceLocationLabel(kind), ...nameSegments].join("/")
    );
}

export function getReferenceNameSuggestion(
    repositoryRelativePath: string,
    revision: number
): string {
    const baseLabel = getCommitTargetLabel(repositoryRelativePath)
        .replace(/[\\/]+/g, "-")
        .replace(/\s+/g, "-");
    const normalizedBase = baseLabel && baseLabel !== "/" ? baseLabel : "revision";
    return `${normalizedBase}-r${revision}`;
}

export function getReferenceKindForRepositoryPath(
    repositoryPath: string
): RepositoryReferenceKind | undefined {
    const segments = splitRepositoryPath(repositoryPath);
    if (segments.includes("branches")) {
        return "branch";
    }

    if (segments.includes("tags")) {
        return "tag";
    }

    return undefined;
}

export function getWorkingCopyPathForRepositoryPath(
    rootPath: string,
    workingCopyRepositoryPath: string,
    repositoryPath: string
): string | undefined {
    const normalizedWorkingCopyRepositoryPath =
        normalizeRepositoryPath(workingCopyRepositoryPath);
    const targetRepositoryPath = normalizeRepositoryPath(repositoryPath);

    if (normalizedWorkingCopyRepositoryPath === "/") {
        const relativeSegments = splitRepositoryPath(targetRepositoryPath);
        return relativeSegments.length === 0
            ? rootPath
            : nodePath.join(rootPath, ...relativeSegments);
    }

    if (targetRepositoryPath === normalizedWorkingCopyRepositoryPath) {
        return rootPath;
    }

    if (!targetRepositoryPath.startsWith(`${normalizedWorkingCopyRepositoryPath}/`)) {
        return undefined;
    }

    const relativePath = targetRepositoryPath.slice(
        normalizedWorkingCopyRepositoryPath.length + 1
    );
    return nodePath.join(rootPath, ...relativePath.split("/"));
}

export function getWorkingCopyRelativePathForRepositoryPath(
    rootPath: string,
    workingCopyRepositoryPath: string,
    repositoryPath: string
): string | undefined {
    const absolutePath = getWorkingCopyPathForRepositoryPath(
        rootPath,
        workingCopyRepositoryPath,
        repositoryPath
    );
    if (!absolutePath) {
        return undefined;
    }

    const relativePath = nodePath.relative(rootPath, absolutePath).replace(/\\/g, "/");
    return relativePath.length > 0 ? relativePath : undefined;
}

export function buildHistoryFileExportName(repositoryPath: string, revision: number): string {
    const baseName = nodePath.posix.basename(repositoryPath) || "export";
    const extension = nodePath.posix.extname(baseName);
    const stem = extension ? baseName.slice(0, -extension.length) : baseName;
    return `${stem}-r${revision}${extension}`;
}
