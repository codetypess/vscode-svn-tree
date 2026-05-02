import test from "node:test";
import assert from "node:assert/strict";
import {
    normalizeExternalsEditorValue,
    parseExternalsDefinitions,
    serializeExternalsDefinitions,
} from "../scm/svn-externals-utils";

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

test("parseExternalsDefinitions parses source-first and local-first definitions", () => {
    const parsed = parseExternalsDefinitions(
        [
            "-r 120 https://example.com/svn/lib-a/trunk vendor/lib-a",
            "vendor/lib-b ^/shared/lib-b/trunk",
        ].join("\n")
    );

    assert.deepEqual(parsed, {
        definitions: [
            {
                localPath: "vendor/lib-a",
                source: "https://example.com/svn/lib-a/trunk",
                revision: "120",
                format: "source-first",
            },
            {
                localPath: "vendor/lib-b",
                source: "^/shared/lib-b/trunk",
                revision: undefined,
                format: "local-first",
            },
        ],
        invalidLines: [],
    });
});

test("parseExternalsDefinitions reports invalid lines without dropping valid ones", () => {
    const parsed = parseExternalsDefinitions(
        ["vendor/lib-a https://example.com/svn/lib-a/trunk", "not enough parts"].join("\n")
    );

    assert.deepEqual(parsed.invalidLines, ["not enough parts"]);
    assert.equal(parsed.definitions.length, 1);
});

test("serializeExternalsDefinitions preserves order and row formats", () => {
    assert.equal(
        serializeExternalsDefinitions([
            {
                localPath: "vendor/lib-a",
                source: "https://example.com/svn/lib-a/trunk",
                revision: "120",
                format: "source-first",
            },
            {
                localPath: "vendor/lib-b",
                source: "^/shared/lib-b/trunk",
                format: "local-first",
            },
        ]),
        ["-r 120 https://example.com/svn/lib-a/trunk vendor/lib-a", "vendor/lib-b ^/shared/lib-b/trunk"].join(
            "\n"
        )
    );
});
