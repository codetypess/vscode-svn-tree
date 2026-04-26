import test from "node:test";
import assert from "node:assert/strict";
import { isConflictArtifactStatus } from "../scm/conflict-artifact";

test("isConflictArtifactStatus detects svn text conflict helper files", () => {
    const conflictedPaths = new Set([
        "/workspace/project/.vscode/settings.json",
        "/workspace/project/design/avatar.xlsx",
    ]);

    assert.equal(
        isConflictArtifactStatus(
            {
                absolutePath: "/workspace/project/.vscode/settings.json.mine",
                relativePath: ".vscode/settings.json.mine",
                kind: "file",
                wcStatus: "unversioned",
            },
            conflictedPaths
        ),
        true
    );

    assert.equal(
        isConflictArtifactStatus(
            {
                absolutePath: "/workspace/project/design/avatar.xlsx.r13442",
                relativePath: "design/avatar.xlsx.r13442",
                kind: "file",
                wcStatus: "unversioned",
            },
            conflictedPaths
        ),
        true
    );
});

test("isConflictArtifactStatus ignores ordinary unversioned files", () => {
    const conflictedPaths = new Set<string>([
        "/workspace/project/.vscode/settings.json",
    ]);

    assert.equal(
        isConflictArtifactStatus(
            {
                absolutePath: "/workspace/project/test.txt",
                relativePath: "test.txt",
                kind: "file",
                wcStatus: "unversioned",
            },
            conflictedPaths
        ),
        false
    );

    assert.equal(
        isConflictArtifactStatus(
            {
                absolutePath: "/workspace/project/readme.mine",
                relativePath: "readme.mine",
                kind: "file",
                wcStatus: "unversioned",
            },
            conflictedPaths
        ),
        false
    );
});
