import {
    buildRepositoryUrl,
    getCommitTargetLabel,
    getReferenceKindForRepositoryPath,
    getReferenceLayoutRoot,
    getReferenceLocationLabel,
    isUrlTarget,
    normalizeRepositoryPath,
    type RepositoryReferenceKind,
} from "./svn-repository-paths";

export type ReferenceNameValidationError =
    | "required"
    | "absolute-path"
    | "empty-segment";
export type SwitchTargetValidationError = "required" | "invalid-path";

export interface ResolvedRepositoryReferenceTarget {
    readonly display: string;
    readonly repositoryPath: string;
    readonly url: string;
}

export interface ResolvedSwitchTarget {
    readonly display: string;
    readonly url: string;
}

export function getReferenceLocationPath(
    repositoryRelativePath: string,
    kind: RepositoryReferenceKind
): string {
    const layoutRoot = getReferenceLayoutRoot(repositoryRelativePath);
    return normalizeRepositoryPath(
        [layoutRoot, getReferenceLocationLabel(kind)]
            .filter((segment) => segment !== "/")
            .join("/")
    );
}

export function getReferenceNameSuggestionForRepositoryPath(
    repositoryRelativePath: string,
    kind: RepositoryReferenceKind,
    suggestedRepositoryPath?: string
): string | undefined {
    if (!suggestedRepositoryPath) {
        return undefined;
    }

    const locationRootPath = getReferenceLocationPath(repositoryRelativePath, kind);
    const normalizedPath = normalizeRepositoryPath(suggestedRepositoryPath);

    if (normalizedPath === locationRootPath) {
        return undefined;
    }

    if (!normalizedPath.startsWith(`${locationRootPath}/`)) {
        return undefined;
    }

    return normalizedPath.slice(locationRootPath.length + 1);
}

export function getReferenceNameValidationError(
    value: string
): ReferenceNameValidationError | undefined {
    const normalizedValue = value.trim().replace(/\\/g, "/");
    if (!normalizedValue) {
        return "required";
    }

    if (normalizedValue.startsWith("/")) {
        return "absolute-path";
    }

    if (normalizedValue.split("/").some((segment) => segment.trim().length === 0)) {
        return "empty-segment";
    }

    return undefined;
}

export function resolveDeleteReferenceTarget(options: {
    readonly target: string;
    readonly repositoryRoot: string;
    readonly repositoryRelativePath: string;
}): ResolvedRepositoryReferenceTarget | undefined {
    let repositoryPath: string;

    if (isUrlTarget(options.target)) {
        const rootUrl = new URL(options.repositoryRoot);
        const targetUrl = new URL(options.target);
        const sameRepository =
            rootUrl.protocol === targetUrl.protocol &&
            rootUrl.username === targetUrl.username &&
            rootUrl.password === targetUrl.password &&
            rootUrl.host === targetUrl.host;
        if (!sameRepository) {
            return undefined;
        }

        const normalizedRootPath = normalizePathname(rootUrl.pathname);
        const normalizedTargetPath = normalizePathname(targetUrl.pathname);
        if (normalizedTargetPath === normalizedRootPath) {
            repositoryPath = "/";
        } else if (normalizedTargetPath.startsWith(`${normalizedRootPath}/`)) {
            repositoryPath = normalizeRepositoryPath(
                decodeURI(normalizedTargetPath.slice(normalizedRootPath.length))
            );
        } else {
            return undefined;
        }
    } else if (options.target.startsWith("/")) {
        repositoryPath = normalizeRepositoryPath(options.target);
    } else {
        repositoryPath = normalizeRepositoryPath(
            [getReferenceLayoutRoot(options.repositoryRelativePath), options.target]
                .filter((segment) => segment !== "/")
                .join("/")
        );
    }

    if (!getReferenceKindForRepositoryPath(repositoryPath)) {
        return undefined;
    }

    return {
        display: repositoryPath,
        repositoryPath,
        url: buildRepositoryUrl(options.repositoryRoot, repositoryPath),
    };
}

export function getCurrentReferenceSuggestion(
    repositoryRelativePath: string
): string | undefined {
    if (!getReferenceKindForRepositoryPath(repositoryRelativePath)) {
        return undefined;
    }

    return getCommitTargetLabel(repositoryRelativePath);
}

export function getSwitchTargetValidationError(
    value: string
): SwitchTargetValidationError | undefined {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
        return "required";
    }

    if (isUrlTarget(trimmedValue)) {
        return undefined;
    }

    const segments = trimmedValue.replace(/\\/g, "/").split("/").filter(Boolean);
    if (segments.some((segment) => segment === "." || segment === "..")) {
        return "invalid-path";
    }

    return undefined;
}

export function resolveSwitchTarget(options: {
    readonly target: string;
    readonly repositoryRoot: string;
    readonly repositoryRelativePath: string;
}): ResolvedSwitchTarget {
    if (isUrlTarget(options.target)) {
        return {
            display: options.target,
            url: options.target,
        };
    }

    const layoutRoot = getReferenceLayoutRoot(options.repositoryRelativePath);
    const repositoryPath = options.target.startsWith("/")
        ? normalizeRepositoryPath(options.target)
        : normalizeRepositoryPath(
              [layoutRoot, options.target].filter((segment) => segment !== "/").join("/")
          );

    return {
        display: repositoryPath,
        url: buildRepositoryUrl(options.repositoryRoot, repositoryPath),
    };
}

function normalizePathname(value: string): string {
    return value.replace(/\/+$/, "") || "/";
}
