import assert from "node:assert/strict";
import test from "node:test";
import type * as vscode from "vscode";
import { SvnService } from "../svn/svn-service";
import type { SvnUpdateOptions } from "../svn/svn-types";

function createOutputChannel(): vscode.OutputChannel {
    return {
        name: "SVN",
        append: () => {},
        appendLine: () => {},
        replace: () => {},
        clear: () => {},
        show: () => {},
        hide: () => {},
        dispose: () => {},
    };
}

function buildUpdateArgs(
    options: {
        rootPath?: string;
        paths?: string[];
        update?: SvnUpdateOptions;
    } = {}
): string[] {
    const service = new SvnService(createOutputChannel()) as unknown as {
        buildUpdateArgs: (
            rootPath: string,
            paths?: string[],
            update?: SvnUpdateOptions
        ) => string[];
    };

    return service.buildUpdateArgs(
        options.rootPath ?? "/workspace/project",
        options.paths,
        options.update
    );
}

test("buildUpdateArgs postpones conflicts for working copy updates by default", () => {
    assert.deepEqual(buildUpdateArgs(), ["update", "--accept", "postpone", "."]);
});

test("buildUpdateArgs keeps explicit update options alongside conflict handling", () => {
    assert.deepEqual(
        buildUpdateArgs({
            paths: ["/workspace/project/src/app.ts"],
            update: {
                revision: "42",
                depth: "files",
                accept: "theirs-full",
            },
        }),
        ["update", "--accept", "theirs-full", "-r", "42", "--depth", "files", "src/app.ts"]
    );
});
