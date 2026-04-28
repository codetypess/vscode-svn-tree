import test from "node:test";
import assert from "node:assert/strict";
import { partitionDeleteTargets } from "../scm/svn-delete-utils";

test("partitionDeleteTargets separates tracked and unversioned paths", () => {
    const partitioned = partitionDeleteTargets([
        {
            absolutePath: "/workspace/project/src/app.ts",
            kind: "versioned",
        },
        {
            absolutePath: "/workspace/project/tmp/output.log",
            kind: "unversioned",
        },
    ]);

    assert.deepEqual(partitioned.versionedPaths, ["/workspace/project/src/app.ts"]);
    assert.deepEqual(partitioned.unversionedPaths, ["/workspace/project/tmp/output.log"]);
});

test("partitionDeleteTargets collapses nested paths within the same delete mode", () => {
    const partitioned = partitionDeleteTargets([
        {
            absolutePath: "/workspace/project/tmp",
            kind: "unversioned",
        },
        {
            absolutePath: "/workspace/project/tmp/output.log",
            kind: "unversioned",
        },
        {
            absolutePath: "/workspace/project/src",
            kind: "versioned",
        },
        {
            absolutePath: "/workspace/project/src/app.ts",
            kind: "versioned",
        },
    ]);

    assert.deepEqual(partitioned.versionedPaths, ["/workspace/project/src"]);
    assert.deepEqual(partitioned.unversionedPaths, ["/workspace/project/tmp"]);
});

test("partitionDeleteTargets skips unversioned descendants already covered by tracked deletes", () => {
    const partitioned = partitionDeleteTargets([
        {
            absolutePath: "/workspace/project/assets",
            kind: "versioned",
        },
        {
            absolutePath: "/workspace/project/assets/generated",
            kind: "unversioned",
        },
        {
            absolutePath: "/workspace/project/assets/generated/sprite.png",
            kind: "unversioned",
        },
        {
            absolutePath: "/workspace/project/docs/draft.md",
            kind: "unversioned",
        },
    ]);

    assert.deepEqual(partitioned.versionedPaths, ["/workspace/project/assets"]);
    assert.deepEqual(partitioned.unversionedPaths, ["/workspace/project/docs/draft.md"]);
});
