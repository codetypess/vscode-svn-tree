import test from "node:test";
import assert from "node:assert/strict";
import { constrainMenuPosition } from "../history/history-menu-position";

test("constrainMenuPosition keeps menus inside the viewport", () => {
    assert.deepEqual(
        constrainMenuPosition(
            { x: 350, y: 250 },
            240,
            100,
            400,
            300
        ),
        { x: 152, y: 192 }
    );
});

test("constrainMenuPosition pins oversized menus to the viewport margin", () => {
    assert.deepEqual(
        constrainMenuPosition(
            { x: 160, y: 140 },
            600,
            500,
            400,
            300
        ),
        { x: 8, y: 8 }
    );
});
