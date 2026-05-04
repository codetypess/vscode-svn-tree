import test from "node:test";
import assert from "node:assert/strict";
import {
    deriveRevisionPatchFileName,
    deriveWorkingCopyPatchFileName,
    normalizePatchExportPaths,
    normalizePatchStripCount,
    summarizeSvnPatchOutput,
} from "../scm/svn-patch-utils";

test("deriveWorkingCopyPatchFileName builds repository and selection based names", () => {
    assert.equal(
        deriveWorkingCopyPatchFileName("/workspace/project"),
        "project-working-copy.patch"
    );
    assert.equal(
        deriveWorkingCopyPatchFileName("/workspace/project", ["/workspace/project/src/app.ts"]),
        "app.ts-changes.patch"
    );
    assert.equal(
        deriveWorkingCopyPatchFileName("/workspace/project", [
            "/workspace/project/src/app.ts",
            "/workspace/project/src/lib/util.ts",
        ]),
        "project-selected-changes.patch"
    );
});

test("deriveRevisionPatchFileName derives names from repository paths and urls", () => {
    assert.equal(deriveRevisionPatchFileName("/project/trunk/src/app.ts", 42), "app.ts-r42.patch");
    assert.equal(
        deriveRevisionPatchFileName("https://svn.example.com/project/branches/release-1.0", 17),
        "release-1.0-r17.patch"
    );
    assert.equal(deriveRevisionPatchFileName(undefined, 7), "revision-r7.patch");
});

test("normalizePatchExportPaths collapses nested selections", () => {
    assert.deepEqual(
        normalizePatchExportPaths([
            "/workspace/project/src",
            "/workspace/project/src/app.ts",
            "/workspace/project/src/lib/util.ts",
            "/workspace/project/docs/readme.md",
            "/workspace/project/docs/readme.md",
        ]),
        ["/workspace/project/src", "/workspace/project/docs/readme.md"]
    );
});

test("normalizePatchStripCount accepts zero and positive integers", () => {
    assert.equal(normalizePatchStripCount("0"), 0);
    assert.equal(normalizePatchStripCount(" 12 "), 12);
    assert.equal(normalizePatchStripCount(4), 4);
});

test("normalizePatchStripCount rejects invalid values", () => {
    assert.equal(normalizePatchStripCount(undefined), undefined);
    assert.equal(normalizePatchStripCount(""), undefined);
    assert.equal(normalizePatchStripCount("-1"), undefined);
    assert.equal(normalizePatchStripCount("2.5"), undefined);
    assert.equal(normalizePatchStripCount(Number.NaN), undefined);
});

test("summarizeSvnPatchOutput counts actions and warnings", () => {
    const summary = summarizeSvnPatchOutput(
        [
            "U src/app.ts",
            "C src/conflicted.ts",
            "G src/merged.ts",
            ">         applied hunk #1 with offset 2",
            "Rejected hunk saved to src/conflicted.ts.svnpatch.rej",
        ].join("\n")
    );

    assert.deepEqual(summary.actionCounts, {
        A: 0,
        D: 0,
        U: 1,
        C: 1,
        G: 1,
    });
    assert.equal(summary.hasConflicts, true);
    assert.equal(summary.hasOffsets, true);
    assert.equal(summary.hasRejects, true);
    assert.equal(summary.hasWarnings, true);
    assert.equal(summary.lines.length, 5);
});
