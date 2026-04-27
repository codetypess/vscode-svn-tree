import assert from "node:assert/strict";
import test from "node:test";
import { buildQuickPickActionCategories } from "../scm/quick-pick-action-utils";

test("buildQuickPickActionCategories preserves category metadata and action handlers", async () => {
    const calls: string[] = [];
    const [category] = buildQuickPickActionCategories<string>([
        {
            label: "Browse",
            description: "Repository browsing actions",
            actions: [
                {
                    label: "Open History",
                    description: "Show repository history",
                    run: async (target) => {
                        calls.push(`history:${target}`);
                    },
                },
                {
                    label: "Open Browser",
                    run: async (target) => {
                        calls.push(`browser:${target}`);
                    },
                },
            ],
        },
    ]);

    assert.equal(category?.label, "Browse");
    assert.equal(category?.description, "Repository browsing actions");
    assert.equal(category?.actions.length, 2);
    assert.equal(category?.actions[0]?.label, "Open History");
    assert.equal(category?.actions[0]?.description, "Show repository history");
    assert.equal(typeof category?.actions[1]?.run, "function");

    await category?.actions[0]?.run("repo-a");
    await category?.actions[1]?.run("repo-b");

    assert.deepEqual(calls, ["history:repo-a", "browser:repo-b"]);
});
