import test from "node:test";
import assert from "node:assert/strict";
import {
    formatInlineBlameHoverTimestamp,
    formatInlineBlameLabel,
    parseBlameLines,
} from "../scm/svn-blame-utils";

test("blame helpers parse blame output lines and ignore blanks", () => {
    const parsedLines = parseBlameLines(
        [
            "   42 alice (2026-04-25 10:00:00 +0000) const answer = 42;",
            "",
            "   43 bob plain text without metadata suffix",
        ].join("\n")
    );

    assert.deepEqual(parsedLines, [
        {
            lineNumber: 1,
            revision: "42",
            author: "alice",
            content: "const answer = 42;",
            raw: "   42 alice (2026-04-25 10:00:00 +0000) const answer = 42;",
        },
        {
            lineNumber: 3,
            revision: "43",
            author: "bob",
            content: "plain text without metadata suffix",
            raw: "   43 bob plain text without metadata suffix",
        },
    ]);
});

test("blame helpers format compact inline blame labels", () => {
    assert.equal(
        formatInlineBlameLabel({
            revision: "42",
            author: "alice",
        }),
        "r42 alice"
    );
});

test("blame helpers format hover timestamps with relative and absolute time", () => {
    const english = formatInlineBlameHoverTimestamp(
        "2026-04-28T11:54:00.000Z",
        "en",
        new Date("2026-04-29T12:00:00.000Z")
    );
    const chinese = formatInlineBlameHoverTimestamp(
        "2026-04-28T11:54:00.000Z",
        "zh-CN",
        new Date("2026-04-29T12:00:00.000Z")
    );

    assert.ok(english?.startsWith("yesterday ("));
    assert.ok(english?.includes("April 28, 2026"));
    assert.ok(chinese?.startsWith("昨天 ("));
    assert.ok(chinese?.includes("2026年4月28日"));
});
