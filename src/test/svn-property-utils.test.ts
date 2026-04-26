import test from "node:test";
import assert from "node:assert/strict";
import {
    decodePropertyValue,
    encodePropertyValue,
    formatPropertyEntries,
} from "../scm/svn-property-utils";

test("property helpers encode and decode escaped values", () => {
    const original = "line1\nline2\\folder";
    assert.equal(encodePropertyValue(original), "line1\\nline2\\\\folder");
    assert.equal(decodePropertyValue("line1\\nline2\\\\folder"), original);
});

test("property helpers format single and multi-line properties", () => {
    assert.deepEqual(
        formatPropertyEntries(
            [
                { name: "svn:eol-style", value: "LF" },
                { name: "svn:externals", value: "lib-a\nlib-b" },
            ],
            "none"
        ),
        [
            "svn:eol-style: LF",
            "svn:externals:",
            "  lib-a",
            "  lib-b",
        ]
    );
    assert.deepEqual(formatPropertyEntries([], "none"), ["none"]);
});
