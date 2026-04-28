import test from "node:test";
import assert from "node:assert/strict";
import type * as vscode from "vscode";
import {
    buildRepositoryBrowserFileActionItems,
    buildRepositoryBrowserItems,
    canMutateCurrentRepositoryPath,
    getRepositoryBrowserMutationTargetValidationError,
    getRepositoryBrowserPathValidationError,
    getParentRepositoryPath,
    resolveRepositoryBrowserChildPath,
    resolveRepositoryBrowserSiblingOrAbsolutePath,
} from "../scm/svn-repository-browser";

test("repository browser helpers build parent paths", () => {
    assert.equal(getParentRepositoryPath("/project/trunk/src"), "/project/trunk");
    assert.equal(getParentRepositoryPath("/project"), "/");
    assert.equal(getParentRepositoryPath("/"), "/");
});

test("repository browser helpers build actions and sorted entries", () => {
    const items = buildRepositoryBrowserItems({
        currentRepositoryPath: "/project/branches/release-1.0",
        currentUrl: "https://svn.example.com/repos/project/branches/release-1.0",
        repositoryRoot: "https://svn.example.com/repos",
        currentWorkingCopyRepositoryPath: "/project/trunk",
        entries: [
            { name: "b.ts", kind: "file", revision: "11", author: "bob" },
            { name: "assets", kind: "dir", revision: "10", author: "alice" },
        ],
        formatNodeKind: (kind) => kind,
        separatorKind: -1 as vscode.QuickPickItemKind,
        strings: {
            actionsSeparator: "actions",
            openHistoryActionLabel: "history",
            showPropertiesActionLabel: "properties",
            createDirectoryActionLabel: "create-dir",
            copyDirectoryActionLabel: "copy-dir",
            moveDirectoryActionLabel: "move-dir",
            deleteDirectoryActionLabel: "delete-dir",
            createBranchFromWorkingCopyActionLabel: "branch",
            createTagFromWorkingCopyActionLabel: "tag",
            copyRepositoryUrlActionLabel: "copy-url",
            copyRepositoryPathActionLabel: "copy-path",
            switchHereLabel: "switch-here",
            deleteReferenceActionLabel: "delete-reference",
            entriesSeparator: "entries",
            upLabel: "up",
            emptyLabel: "empty",
        },
    });

    assert.equal(items.some((item) => item.action === "switch-here"), true);
    assert.equal(items.some((item) => item.action === "delete-reference"), true);
    assert.equal(items.some((item) => item.action === "create-directory"), true);
    assert.equal(items.some((item) => item.action === "copy-directory"), true);
    assert.equal(items.some((item) => item.action === "move-directory"), true);
    assert.equal(items.find((item) => item.itemType === "up")?.repositoryPath, "/project/branches");
    assert.equal(items.find((item) => item.itemType === "directory")?.label, "assets");
    assert.equal(items.find((item) => item.itemType === "file")?.label, "b.ts");
});

test("repository browser helpers gate destructive current-directory actions", () => {
    const items = buildRepositoryBrowserItems({
        currentRepositoryPath: "/project/trunk",
        currentUrl: "https://svn.example.com/repos/project/trunk",
        repositoryRoot: "https://svn.example.com/repos",
        currentWorkingCopyRepositoryPath: "/project/trunk",
        entries: [],
        formatNodeKind: (kind) => kind,
        separatorKind: -1 as vscode.QuickPickItemKind,
        strings: {
            actionsSeparator: "actions",
            openHistoryActionLabel: "history",
            showPropertiesActionLabel: "properties",
            createDirectoryActionLabel: "create-dir",
            copyDirectoryActionLabel: "copy-dir",
            moveDirectoryActionLabel: "move-dir",
            deleteDirectoryActionLabel: "delete-dir",
            createBranchFromWorkingCopyActionLabel: "branch",
            createTagFromWorkingCopyActionLabel: "tag",
            copyRepositoryUrlActionLabel: "copy-url",
            copyRepositoryPathActionLabel: "copy-path",
            switchHereLabel: "switch-here",
            deleteReferenceActionLabel: "delete-reference",
            entriesSeparator: "entries",
            upLabel: "up",
            emptyLabel: "empty",
        },
    });

    assert.equal(items.some((item) => item.action === "move-directory"), false);
    assert.equal(items.some((item) => item.action === "delete-directory"), false);
    assert.equal(items.some((item) => item.action === "copy-directory"), true);
});

test("repository browser helpers build file action items", () => {
    const items = buildRepositoryBrowserFileActionItems({
        repositoryPath: "/project/trunk/src/index.ts",
        url: "https://svn.example.com/repos/project/trunk/src/index.ts",
        strings: {
            openHistoryActionLabel: "history",
            showPropertiesActionLabel: "properties",
            showBlameActionLabel: "blame",
            showBlameOutputActionLabel: "blame-output",
            copyBlameLineActionLabel: "copy-line",
            openFileLabel: "open-file",
            copyRepositoryUrlActionLabel: "copy-url",
            copyRepositoryPathActionLabel: "copy-path",
        },
    });

    assert.deepEqual(
        items.map((item) => item.action),
        [
            "show-history",
            "show-properties",
            "show-blame",
            "show-blame-output",
            "copy-blame-line",
            "open-file",
            "copy-url",
            "copy-path",
        ]
    );
});

test("repository browser helpers validate and resolve remote directory targets", () => {
    assert.equal(
        getRepositoryBrowserPathValidationError("release/1.0", "child-relative"),
        undefined
    );
    assert.equal(
        getRepositoryBrowserPathValidationError("/release/1.0", "child-relative"),
        "absolute-path"
    );
    assert.equal(
        getRepositoryBrowserPathValidationError("../release", "sibling-or-absolute"),
        "relative-navigation"
    );
    assert.equal(resolveRepositoryBrowserChildPath("/project/trunk", "docs/api"), "/project/trunk/docs/api");
    assert.equal(
        resolveRepositoryBrowserSiblingOrAbsolutePath("/project/trunk/docs", "docs-v2"),
        "/project/trunk/docs-v2"
    );
    assert.equal(
        resolveRepositoryBrowserSiblingOrAbsolutePath(
            "/project/trunk/docs",
            "/project/branches/docs-v2"
        ),
        "/project/branches/docs-v2"
    );
    assert.equal(
        getRepositoryBrowserMutationTargetValidationError(
            "/project/trunk/docs",
            "/project/trunk/docs"
        ),
        "same-path"
    );
    assert.equal(
        getRepositoryBrowserMutationTargetValidationError(
            "/project/trunk/docs",
            "/project/trunk/docs/archive"
        ),
        "nested-target"
    );
    assert.equal(
        getRepositoryBrowserMutationTargetValidationError(
            "/project/trunk/docs",
            "/project/branches/docs"
        ),
        undefined
    );
    assert.equal(
        canMutateCurrentRepositoryPath("/project/branches/release", "/project/trunk"),
        true
    );
    assert.equal(canMutateCurrentRepositoryPath("/project", "/project/trunk"), false);
});
