import test from "node:test";
import assert from "node:assert/strict";
import {
    getSuggestedIgnoreEntry,
    normalizeIgnoreEditorValue,
    parseIgnoreEntries,
    serializeIgnoreEntries,
} from "../scm/svn-ignore-utils";

test("parseIgnoreEntries trims, de-duplicates, and sorts ignore rules", () => {
    assert.deepEqual(parseIgnoreEntries(" dist \nnode_modules\n\n dist\n.tmp "), [
        ".tmp",
        "dist",
        "node_modules",
    ]);
});

test("serializeIgnoreEntries returns sorted multiline output or undefined", () => {
    assert.equal(
        serializeIgnoreEntries(["node_modules", " dist ", "", "node_modules", ".tmp"]),
        ".tmp\ndist\nnode_modules"
    );
    assert.equal(serializeIgnoreEntries(["", "   "]), undefined);
});

test("normalizeIgnoreEditorValue normalizes raw editor text", () => {
    assert.equal(
        normalizeIgnoreEditorValue("node_modules\n dist \n\n.tmp\nnode_modules"),
        ".tmp\ndist\nnode_modules"
    );
});

test("getSuggestedIgnoreEntry returns the immediate child name for nested paths", () => {
    assert.equal(
        getSuggestedIgnoreEntry("/workspace/project", "/workspace/project/tmp/generated/file.txt"),
        "tmp"
    );
    assert.equal(
        getSuggestedIgnoreEntry("/workspace/project/src", "/workspace/project/src/component.ts"),
        "component.ts"
    );
    assert.equal(
        getSuggestedIgnoreEntry("/workspace/project/src", "/workspace/project/src"),
        undefined
    );
});
