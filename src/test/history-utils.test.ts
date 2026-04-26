import test from "node:test";
import assert from "node:assert/strict";
import {
    areHistoryFiltersEqual,
    hasActiveHistoryFilters,
    hasInvalidHistoryDateRange,
    markIncomingHistoryEntries,
    matchesHistoryFilters,
    normalizeHistoryFilters,
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

test("normalizeHistoryFilters trims values and drops empty fields", () => {
    assert.deepEqual(
        normalizeHistoryFilters({
            author: " alice ",
            message: "  fix bug  ",
            changedPath: " /trunk/src ",
            dateFrom: "2026-04-01",
            dateTo: "invalid-date",
        }),
        {
            author: "alice",
            message: "fix bug",
            changedPath: "/trunk/src",
            dateFrom: "2026-04-01",
            dateTo: undefined,
        }
    );
});

test("history filter helpers compare and detect active filters", () => {
    assert.equal(
        areHistoryFiltersEqual(
            { author: "alice", changedPath: "src" },
            { author: " alice ", changedPath: "src " }
        ),
        true
    );
    assert.equal(hasActiveHistoryFilters({}), false);
    assert.equal(hasActiveHistoryFilters({ message: "fix" }), true);
});

test("hasInvalidHistoryDateRange rejects inverted dates", () => {
    assert.equal(
        hasInvalidHistoryDateRange({
            dateFrom: "2026-04-10",
            dateTo: "2026-04-09",
        }),
        true
    );
    assert.equal(
        hasInvalidHistoryDateRange({
            dateFrom: "2026-04-09",
            dateTo: "2026-04-10",
        }),
        false
    );
});

test("matchesHistoryFilters checks author, message, path, and inclusive date range", () => {
    const entryDate = new Date("2026-04-24T12:00:00").toISOString();
    const entry = {
        revision: 42,
        author: "Alice",
        date: entryDate,
        message: "Fix history pagination",
        changes: [
            {
                action: "M" as const,
                kind: "file" as const,
                path: "/trunk/src/history/history-panel.tsx",
            },
        ],
    };

    assert.equal(
        matchesHistoryFilters(entry, {
            author: "ali",
            message: "pagination",
            changedPath: "history-panel",
            dateFrom: "2026-04-24",
            dateTo: "2026-04-24",
        }),
        true
    );
    assert.equal(matchesHistoryFilters(entry, { author: "bob" }), false);
    assert.equal(matchesHistoryFilters(entry, { message: "merge" }), false);
    assert.equal(matchesHistoryFilters(entry, { changedPath: "branches" }), false);
    assert.equal(matchesHistoryFilters(entry, { dateFrom: "2026-04-25" }), false);
    assert.equal(matchesHistoryFilters(entry, { dateTo: "2026-04-23" }), false);
});
