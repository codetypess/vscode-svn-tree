import test from "node:test";
import assert from "node:assert/strict";
import { normalizeExternalsEditorValue } from "../scm/svn-externals-utils";

test("normalizeExternalsEditorValue preserves definitions and normalizes newlines", () => {
    assert.equal(
        normalizeExternalsEditorValue(
            "vendor/lib-a https://example.com/svn/lib-a/trunk\r\nvendor/lib-b ../lib-b\r\n\r\n"
        ),
        "vendor/lib-a https://example.com/svn/lib-a/trunk\nvendor/lib-b ../lib-b"
    );
});

test("normalizeExternalsEditorValue removes empty editor content", () => {
    assert.equal(normalizeExternalsEditorValue(" \r\n\t\r\n"), undefined);
});
