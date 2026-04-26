import test from "node:test";
import assert from "node:assert/strict";
import type * as vscode from "vscode";
import {
    buildRepositoryBrowserFileActionItems,
    buildRepositoryBrowserItems,
    getParentRepositoryPath,
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
    assert.equal(items.find((item) => item.itemType === "up")?.repositoryPath, "/project/branches");
    assert.equal(items.find((item) => item.itemType === "directory")?.label, "assets");
    assert.equal(items.find((item) => item.itemType === "file")?.label, "b.ts");
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
