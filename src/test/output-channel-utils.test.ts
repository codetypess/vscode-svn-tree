import assert from "node:assert/strict";
import test from "node:test";
import { buildErrorOutputLines, shouldOnlyLogErrorToOutput } from "../scm/output-channel-utils";

const errorOutputLabels = {
    timeLabel: "Time",
    messageLabel: "Message",
    stackLabel: "Stack",
    causeLabel: "Caused by",
    valueLabel: "Value",
};

test("buildErrorOutputLines formats error stacks and nested causes", () => {
    const cause = new RangeError("stdout maxBuffer length exceeded");
    cause.stack = [
        "RangeError: stdout maxBuffer length exceeded",
        "    at spawnSvn (src/svn/svn-service.ts:1:1)",
    ].join("\n");

    const error = new Error("svn status failed", { cause });
    error.stack = [
        "Error: svn status failed",
        "    at run (src/svn/svn-service.ts:2:2)",
    ].join("\n");

    assert.deepEqual(
        buildErrorOutputLines(error, errorOutputLabels, new Date("2026-04-28T12:34:56.000Z")),
        [
            "Time: 2026-04-28T12:34:56.000Z",
            "Message: svn status failed",
            "Stack:",
            "Error: svn status failed",
            "    at run (src/svn/svn-service.ts:2:2)",
            "",
            "Caused by:",
            "Message: stdout maxBuffer length exceeded",
            "Stack:",
            "RangeError: stdout maxBuffer length exceeded",
            "    at spawnSvn (src/svn/svn-service.ts:1:1)",
        ]
    );
});

test("buildErrorOutputLines formats non-Error values", () => {
    assert.deepEqual(
        buildErrorOutputLines("plain failure", errorOutputLabels, new Date("2026-04-28T00:00:00.000Z")),
        [
            "Time: 2026-04-28T00:00:00.000Z",
            "Value: plain failure",
        ]
    );
});

test("shouldOnlyLogErrorToOutput matches repository connection failures", () => {
    assert.equal(
        shouldOnlyLogErrorToOutput(
            new Error("svn: E170013: Unable to connect to a repository at URL 'https://example.test'")
        ),
        true
    );

    assert.equal(
        shouldOnlyLogErrorToOutput(
            new Error("svn: E170013: Unable to connect to a respository at URL 'https://example.test'")
        ),
        true
    );
});

test("shouldOnlyLogErrorToOutput ignores unrelated errors", () => {
    assert.equal(shouldOnlyLogErrorToOutput(new Error("svn status failed")), false);
});
