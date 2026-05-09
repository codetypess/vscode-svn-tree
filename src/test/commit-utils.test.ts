import test from "node:test";
import assert from "node:assert/strict";
import { createI18n } from "../i18n";
import { buildCommitQuickPickItems, isCommittableStatus } from "../scm/commit-utils";

test("isCommittableStatus only allows tracked change states that SVN can commit", () => {
    assert.equal(isCommittableStatus("added"), true);
    assert.equal(isCommittableStatus("modified"), true);
    assert.equal(isCommittableStatus("replaced"), true);
    assert.equal(isCommittableStatus("deleted"), true);
    assert.equal(isCommittableStatus("missing"), true);

    assert.equal(isCommittableStatus("conflicted"), false);
    assert.equal(isCommittableStatus("external"), false);
    assert.equal(isCommittableStatus("normal"), false);
    assert.equal(isCommittableStatus("unversioned"), false);
});

test("buildCommitQuickPickItems omits detail for unknown node kinds", () => {
    const english = createI18n("en");
    const [item] = buildCommitQuickPickItems(english, [
        {
            absolutePath: "/workspace/project/.vscode/settings.json",
            relativePath: ".vscode/settings.json",
            kind: "unknown",
            wcStatus: "modified",
        },
    ]);

    assert.equal(item.label, ".vscode/settings.json");
    assert.equal(item.description, english.formatSvnStatus("modified"));
    assert.equal(item.picked, true);
    assert.equal(item.absolutePath, "/workspace/project/.vscode/settings.json");
    assert.equal("detail" in item, false);
});

test("buildCommitQuickPickItems keeps localized details for concrete node kinds", () => {
    const chinese = createI18n("zh-CN");
    const items = buildCommitQuickPickItems(chinese, [
        {
            absolutePath: "/workspace/project/src/app.ts",
            relativePath: "src/app.ts",
            kind: "file",
            wcStatus: "modified",
        },
        {
            absolutePath: "/workspace/project/src",
            relativePath: "src",
            kind: "dir",
            wcStatus: "added",
        },
    ]);

    assert.equal(items[0].description, chinese.formatSvnStatus("modified"));
    assert.equal(items[0].detail, chinese.formatNodeKind("file"));
    assert.equal(items[1].description, chinese.formatSvnStatus("added"));
    assert.equal(items[1].detail, chinese.formatNodeKind("dir"));
});
