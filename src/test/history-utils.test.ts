import test from "node:test";
import assert from "node:assert/strict";
import {
    markIncomingHistoryEntries,
    toRevisionNumber,
} from "../history/history-utils";

test("toRevisionNumber normalizes valid revisions", () => {
    assert.equal(toRevisionNumber("42"), 42);
    assert.equal(toRevisionNumber(19.8), 19);
    assert.equal(toRevisionNumber(undefined), undefined);
    assert.equal(toRevisionNumber("0"), undefined);
    assert.equal(toRevisionNumber("not-a-revision"), undefined);
});

test("markIncomingHistoryEntries flags revisions newer than the working copy", () => {
    const entries = markIncomingHistoryEntries(
        [
            {
                revision: 108,
                author: "bob",
                date: "2026-04-24T02:03:04.000000Z",
                message: "Incoming",
                changes: [],
            },
            {
                revision: 107,
                author: "alice",
                date: "2026-04-23T02:03:04.000000Z",
                message: "Local",
                changes: [],
            },
        ],
        "107"
    );

    assert.equal(entries[0].incoming, true);
    assert.equal(entries[1].incoming, false);
});
