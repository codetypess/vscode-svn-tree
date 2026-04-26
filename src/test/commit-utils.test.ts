import test from "node:test";
import assert from "node:assert/strict";
import { isCommittableStatus } from "../scm/commit-utils";

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
