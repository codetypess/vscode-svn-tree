import test from "node:test";
import assert from "node:assert/strict";
import {
    buildHistoryFileExportName,
    buildReferenceDestinationPath,
    buildRepositoryUrl,
    getCommitTargetLabel,
    getReferenceKindForRepositoryPath,
    getReferenceLayoutRoot,
    getReferenceNameSuggestion,
    getRepositoryReferenceDisplay,
    getWorkingCopyPathForRepositoryPath,
    getWorkingCopyRelativePathForRepositoryPath,
    isUrlTarget,
    normalizeRepositoryPath,
    resolveRepositoryPathFromWorkingCopy,
    splitRepositoryPath,
} from "../scm/svn-repository-paths";

test("repository path helpers normalize and split repository paths", () => {
    assert.equal(normalizeRepositoryPath("branches\\feature-x/"), "/branches/feature-x");
    assert.deepEqual(splitRepositoryPath("/branches/feature-x"), ["branches", "feature-x"]);
    assert.deepEqual(splitRepositoryPath("/"), []);
});

test("repository path helpers derive labels and layout roots from standard svn layouts", () => {
    assert.equal(getCommitTargetLabel("/project/trunk"), "trunk");
    assert.equal(getCommitTargetLabel("/project/branches/feature-x"), "branches/feature-x");
    assert.equal(getReferenceLayoutRoot("/project/trunk/src"), "/project");
    assert.deepEqual(getRepositoryReferenceDisplay("/project/tags/v1.0.0"), {
        icon: "tag",
        label: "tags/v1.0.0",
    });
});

test("repository path helpers build reference destinations and suggestions", () => {
    assert.equal(
        buildReferenceDestinationPath("/project/trunk", "branch", " release / 1.0 "),
        "/project/branches/release/1.0"
    );
    assert.equal(getReferenceNameSuggestion("/project/branches/feature-x", 42), "branches-feature-x-r42");
    assert.equal(getReferenceKindForRepositoryPath("/project/branches/feature-x"), "branch");
    assert.equal(getReferenceKindForRepositoryPath("/project/tags/v1.0.0"), "tag");
    assert.equal(getReferenceKindForRepositoryPath("/project/trunk"), undefined);
});

test("repository path helpers build repository urls and detect url targets", () => {
    assert.equal(
        buildRepositoryUrl("https://svn.example.com/repos/project", "/branches/feature-x"),
        "https://svn.example.com/repos/project/branches/feature-x"
    );
    assert.equal(isUrlTarget("https://svn.example.com/repos/project/trunk"), true);
    assert.equal(isUrlTarget("/project/trunk"), false);
});

test("repository path helpers map between repository and working copy paths", () => {
    assert.equal(
        resolveRepositoryPathFromWorkingCopy(
            "/workspace/project",
            "/project/trunk",
            "/workspace/project/src/index.ts"
        ),
        "/project/trunk/src/index.ts"
    );
    assert.equal(
        getWorkingCopyPathForRepositoryPath(
            "/workspace/project",
            "/project/trunk",
            "/project/trunk/src/index.ts"
        ),
        "/workspace/project/src/index.ts"
    );
    assert.equal(
        getWorkingCopyPathForRepositoryPath(
            "/workspace/project",
            "/project/trunk",
            "/project/branches/release-1.0/src/index.ts"
        ),
        undefined
    );
    assert.equal(
        getWorkingCopyRelativePathForRepositoryPath(
            "/workspace/project",
            "/project/trunk",
            "/project/trunk/src/index.ts"
        ),
        "src/index.ts"
    );
});

test("repository path helpers build history export file names", () => {
    assert.equal(
        buildHistoryFileExportName("/project/trunk/src/archive.tar.gz", 42),
        "archive.tar-r42.gz"
    );
    assert.equal(buildHistoryFileExportName("/project/trunk/README", 7), "README-r7");
});
