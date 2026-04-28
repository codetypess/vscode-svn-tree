import test from "node:test";
import assert from "node:assert/strict";
import * as nodePath from "node:path";
import {
    buildHistoryFileExportName,
    buildReferenceDestinationPath,
    buildRepositoryUrl,
    getCommitTargetLabel,
    getReferenceKindForRepositoryPath,
    getReferenceLayoutRoot,
    getReferenceNameSuggestion,
    getRepositoryReferenceRoot,
    getRepositoryReferenceDisplay,
    getWorkingCopyPathForRepositoryPath,
    getWorkingCopyRelativePathForRepositoryPath,
    isSameOrChildRepositoryPath,
    isSameOrChildWorkingCopyPath,
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
    assert.equal(getCommitTargetLabel("/project/trunk/src/app.ts"), "trunk");
    assert.equal(getCommitTargetLabel("/project/branches/feature-x"), "branches/feature-x");
    assert.equal(
        getCommitTargetLabel("/project/branches/feature-x/src/app.ts"),
        "branches/feature-x"
    );
    assert.equal(getReferenceLayoutRoot("/project/trunk/src"), "/project");
    assert.equal(
        getRepositoryReferenceRoot("/project/trunk/src/components/button.ts"),
        "/project/trunk"
    );
    assert.equal(
        getRepositoryReferenceRoot("/project/branches/feature-x/src/index.ts"),
        "/project/branches/feature-x"
    );
    assert.equal(
        getRepositoryReferenceRoot("/project/tags/v1.0.0/src/index.ts"),
        "/project/tags/v1.0.0"
    );
    assert.equal(getRepositoryReferenceRoot("/project/releases/current"), undefined);
    assert.deepEqual(getRepositoryReferenceDisplay("/project/tags/v1.0.0"), {
        icon: "tag",
        label: "tags/v1.0.0",
    });
    assert.deepEqual(getRepositoryReferenceDisplay("/project/branches/feature-x/src/index.ts"), {
        icon: "git-branch",
        label: "branches/feature-x",
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

test("repository path helpers detect repository path containment", () => {
    assert.equal(isSameOrChildRepositoryPath("/project/trunk", "/project/trunk"), true);
    assert.equal(isSameOrChildRepositoryPath("/project/trunk", "/project/trunk/src"), true);
    assert.equal(isSameOrChildRepositoryPath("/project/trunk", "/project/branches/release"), false);
    assert.equal(isSameOrChildRepositoryPath("/", "/project/trunk"), true);
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
        nodePath.join("/workspace/project", "src", "index.ts")
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

test("working copy path containment handles equivalent Windows paths", () => {
    if (process.platform !== "win32") {
        return;
    }

    assert.equal(
        isSameOrChildWorkingCopyPath(
            "D:/Users/bite/Desktop/github/subversion",
            "d:\\Users\\bite\\Desktop\\github\\subversion"
        ),
        true
    );
    assert.equal(
        isSameOrChildWorkingCopyPath(
            "D:/Users/bite/Desktop/github/subversion",
            "d:\\Users\\bite\\Desktop\\github\\subversion\\src\\index.ts"
        ),
        true
    );
    assert.equal(
        isSameOrChildWorkingCopyPath(
            "D:/Users/bite/Desktop/github/subversion",
            "d:\\Users\\bite\\Desktop\\github\\subversion-other"
        ),
        false
    );
});

test("repository path helpers build history export file names", () => {
    assert.equal(
        buildHistoryFileExportName("/project/trunk/src/archive.tar.gz", 42),
        "archive.tar-r42.gz"
    );
    assert.equal(buildHistoryFileExportName("/project/trunk/README", 7), "README-r7");
});
