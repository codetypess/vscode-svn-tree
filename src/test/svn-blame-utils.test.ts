import test from "node:test";
import assert from "node:assert/strict";
import { parseBlameLines } from "../scm/svn-blame-utils";

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
