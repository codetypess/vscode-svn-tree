import test from "node:test";
import assert from "node:assert/strict";
import type * as vscode from "vscode";
import {
    buildRepositoryBrowserBreadcrumbs,
    buildRepositoryBrowserFileActionItems,
    buildRepositoryBrowserItems,
    buildRepositoryBrowserViewModel,
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
            {
                name: "b.ts",
                kind: "file",
                revision: "11",
                author: "bob",
                size: 42,
                date: "2026-05-02T10:00:00.000Z",
            },
            {
                name: "assets",
                kind: "dir",
                revision: "10",
                author: "alice",
                date: "2026-05-01T10:00:00.000Z",
            },
        ],
        formatNodeKind: (kind) => kind,
        separatorKind: -1 as vscode.QuickPickItemKind,
        strings: {
            actionsSeparator: "actions",
            openHistoryActionLabel: "history",
            showPropertiesActionLabel: "properties",
            editPropertyActionLabel: "edit-properties",
            checkoutDirectoryActionLabel: "checkout-dir",
            exportDirectoryActionLabel: "export-dir",
            createDirectoryActionLabel: "create-dir",
            importLocalFolderHereActionLabel: "import-here",
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

    assert.equal(
        items.some((item) => item.action === "switch-here"),
        true
    );
    assert.equal(
        items.some((item) => item.action === "delete-reference"),
        true
    );
    assert.equal(
        items.some((item) => item.action === "checkout-directory"),
        true
    );
    assert.equal(
        items.some((item) => item.action === "export-directory"),
        true
    );
    assert.equal(
        items.some((item) => item.action === "create-directory"),
        true
    );
    assert.equal(
        items.some((item) => item.action === "edit-property"),
        true
    );
    assert.equal(
        items.some((item) => item.action === "import-local-folder-here"),
        true
    );
    assert.equal(
        items.some((item) => item.action === "copy-directory"),
        true
    );
    assert.equal(
        items.some((item) => item.action === "move-directory"),
        true
    );
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
            editPropertyActionLabel: "edit-properties",
            checkoutDirectoryActionLabel: "checkout-dir",
            exportDirectoryActionLabel: "export-dir",
            createDirectoryActionLabel: "create-dir",
            importLocalFolderHereActionLabel: "import-here",
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

    assert.equal(
        items.some((item) => item.action === "move-directory"),
        false
    );
    assert.equal(
        items.some((item) => item.action === "delete-directory"),
        false
    );
    assert.equal(
        items.some((item) => item.action === "checkout-directory"),
        true
    );
    assert.equal(
        items.some((item) => item.action === "export-directory"),
        true
    );
    assert.equal(
        items.some((item) => item.action === "import-local-folder-here"),
        true
    );
    assert.equal(
        items.some((item) => item.action === "copy-directory"),
        true
    );
});

test("repository browser helpers build file action items", () => {
    const items = buildRepositoryBrowserFileActionItems({
        repositoryPath: "/project/trunk/src/index.ts",
        url: "https://svn.example.com/repos/project/trunk/src/index.ts",
        strings: {
            openHistoryActionLabel: "history",
            showPropertiesActionLabel: "properties",
            editPropertyActionLabel: "edit-properties",
            showBlameActionLabel: "blame",
            showBlameOutputActionLabel: "blame-output",
            copyBlameLineActionLabel: "copy-line",
            openFileLabel: "open-file",
            exportFileActionLabel: "export-file",
            copyFileActionLabel: "copy-file",
            moveFileActionLabel: "move-file",
            deleteFileActionLabel: "delete-file",
            copyRepositoryUrlActionLabel: "copy-url",
            copyRepositoryPathActionLabel: "copy-path",
        },
    });

    assert.deepEqual(
        items.map((item) => item.action),
        [
            "show-history",
            "show-properties",
            "edit-property",
            "show-blame",
            "show-blame-output",
            "copy-blame-line",
            "open-file",
            "export-file",
            "copy-file",
            "move-file",
            "delete-file",
            "copy-url",
            "copy-path",
        ]
    );
});

test("repository browser helpers build breadcrumbs", () => {
    assert.deepEqual(buildRepositoryBrowserBreadcrumbs("/", "repo"), [
        {
            label: "repo",
            repositoryPath: "/",
        },
    ]);
    assert.deepEqual(buildRepositoryBrowserBreadcrumbs("/project/trunk/src", "repo"), [
        {
            label: "repo",
            repositoryPath: "/",
        },
        {
            label: "project",
            repositoryPath: "/project",
        },
        {
            label: "trunk",
            repositoryPath: "/project/trunk",
        },
        {
            label: "src",
            repositoryPath: "/project/trunk/src",
        },
    ]);
});

test("repository browser helpers build webview view model", () => {
    const model = buildRepositoryBrowserViewModel({
        currentRepositoryPath: "/project/branches/release-1.0",
        currentUrl: "https://svn.example.com/repos/project/branches/release-1.0",
        repositoryRoot: "https://svn.example.com/repos",
        currentWorkingCopyRepositoryPath: "/project/trunk",
        entries: [
            {
                name: "b.ts",
                kind: "file",
                revision: "11",
                author: "bob",
                size: 42,
                date: "2026-05-02T10:00:00.000Z",
            },
            {
                name: "assets",
                kind: "dir",
                revision: "10",
                author: "alice",
                date: "2026-05-01T10:00:00.000Z",
            },
        ],
        formatNodeKind: (kind) => kind,
        strings: {
            rootBreadcrumbLabel: "repo",
            openDirectoryActionLabel: "open-dir",
            openHistoryActionLabel: "history",
            showPropertiesActionLabel: "properties",
            editPropertyActionLabel: "edit-properties",
            checkoutDirectoryActionLabel: "checkout-dir",
            exportDirectoryActionLabel: "export-dir",
            showBlameActionLabel: "blame",
            showBlameOutputActionLabel: "blame-output",
            copyBlameLineActionLabel: "copy-line",
            openFileLabel: "open-file",
            createDirectoryActionLabel: "create-dir",
            importLocalFolderHereActionLabel: "import-here",
            copyDirectoryActionLabel: "copy-dir",
            moveDirectoryActionLabel: "move-dir",
            deleteDirectoryActionLabel: "delete-dir",
            exportFileActionLabel: "export-file",
            copyFileActionLabel: "copy-file",
            moveFileActionLabel: "move-file",
            deleteFileActionLabel: "delete-file",
            createBranchFromWorkingCopyActionLabel: "branch",
            createTagFromWorkingCopyActionLabel: "tag",
            copyRepositoryUrlActionLabel: "copy-url",
            copyRepositoryPathActionLabel: "copy-path",
            switchHereLabel: "switch-here",
            deleteReferenceActionLabel: "delete-reference",
        },
    });

    assert.equal(model.parentRepositoryPath, "/project/branches");
    assert.equal(model.repositoryRootUrl, "https://svn.example.com/repos");
    assert.deepEqual(
        model.breadcrumbs.map((item) => item.label),
        ["repo", "project", "branches", "release-1.0"]
    );
    assert.equal(model.currentWorkingCopyRepositoryPath, "/project/trunk");
    assert.equal(
        model.currentActions.some((item) => item.id === "switch-here"),
        true
    );
    assert.equal(
        model.currentActions.some((item) => item.id === "checkout-directory"),
        true
    );
    assert.equal(
        model.currentActions.some((item) => item.id === "edit-property"),
        true
    );
    assert.equal(
        model.currentActions.some((item) => item.id === "export-directory"),
        true
    );
    assert.equal(
        model.currentActions.some((item) => item.id === "import-local-folder-here"),
        true
    );
    assert.equal(model.entries[0]?.name, "assets");
    assert.equal(model.entries[0]?.actions[0]?.id, "open-directory");
    assert.equal(
        model.entries[0]?.actions.some((item) => item.id === "create-directory"),
        true
    );
    assert.equal(
        model.entries[0]?.actions.some((item) => item.id === "checkout-directory"),
        true
    );
    assert.equal(
        model.entries[0]?.actions.some((item) => item.id === "edit-property"),
        true
    );
    assert.equal(
        model.entries[0]?.actions.some((item) => item.id === "export-directory"),
        true
    );
    assert.equal(
        model.entries[0]?.actions.some((item) => item.id === "copy-directory"),
        true
    );
    assert.equal(
        model.entries[0]?.actions.some((item) => item.id === "move-directory"),
        true
    );
    assert.equal(
        model.entries[0]?.actions.some((item) => item.id === "switch-here"),
        true
    );
    assert.equal(
        model.entries[0]?.actions.some((item) => item.id === "delete-reference"),
        true
    );
    assert.equal(model.entries[1]?.name, "b.ts");
    assert.equal(model.entries[1]?.size, 42);
    assert.equal(model.entries[1]?.date, "2026-05-02T10:00:00.000Z");
    assert.equal(
        model.entries[1]?.actions.some((item) => item.id === "show-blame"),
        true
    );
    assert.equal(
        model.entries[1]?.actions.some((item) => item.id === "edit-property"),
        true
    );
    assert.equal(
        model.entries[1]?.actions.some((item) => item.id === "export-file"),
        true
    );
    assert.equal(
        model.entries[1]?.actions.some((item) => item.id === "copy-file"),
        true
    );
    assert.equal(
        model.entries[1]?.actions.some((item) => item.id === "move-file"),
        true
    );
    assert.equal(
        model.entries[1]?.actions.some((item) => item.id === "delete-file"),
        true
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
    assert.equal(
        resolveRepositoryBrowserChildPath("/project/trunk", "docs/api"),
        "/project/trunk/docs/api"
    );
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
