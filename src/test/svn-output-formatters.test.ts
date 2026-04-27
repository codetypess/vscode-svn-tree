import assert from "node:assert/strict";
import test from "node:test";
import type { SvnNodeInfo } from "../svn/svn-types";
import {
    buildBlameOutputLines,
    buildBlamePreviewContent,
    buildPathInfoOutputLines,
    buildPropertyOutputLines,
} from "../scm/svn-output-formatters";

const repositoryTargetLabels = {
    infoPathLabel: "Path",
    infoRepositoryPathLabel: "Repository Path",
    infoUrlLabel: "URL",
};

test("buildBlamePreviewContent keeps preview text assembly in one place", () => {
    const content = buildBlamePreviewContent(repositoryTargetLabels, {
        displayPath: "src/app.ts",
        repositoryPath: "/project/trunk/src/app.ts",
        url: "https://example.test/svn/project/trunk/src/app.ts",
        blameOutput: "1 alice line one",
    });

    assert.equal(
        content,
        [
            "Path: src/app.ts",
            "Repository Path: /project/trunk/src/app.ts",
            "URL: https://example.test/svn/project/trunk/src/app.ts",
            "",
            "1 alice line one",
        ].join("\n")
    );
});

test("buildBlameOutputLines and buildPropertyOutputLines reuse shared repository metadata", () => {
    assert.deepEqual(
        buildBlameOutputLines(repositoryTargetLabels, {
            displayPath: "src/app.ts",
            repositoryPath: "/project/trunk/src/app.ts",
            url: "https://example.test/svn/project/trunk/src/app.ts",
            blameOutput: "1 alice line one",
        }),
        [
            "Path: src/app.ts",
            "Repository Path: /project/trunk/src/app.ts",
            "URL: https://example.test/svn/project/trunk/src/app.ts",
            "",
            "1 alice line one",
        ]
    );

    assert.deepEqual(
        buildPropertyOutputLines(
            {
                ...repositoryTargetLabels,
                propertiesHeaderLabel: "Properties",
                noPropertiesFoundLabel: "No properties",
            },
            {
                displayPath: "src/app.ts",
                repositoryPath: "/project/trunk/src/app.ts",
                url: "https://example.test/svn/project/trunk/src/app.ts",
                properties: [
                    {
                        name: "svn:keywords",
                        value: "Id\nAuthor",
                    },
                ],
            }
        ),
        [
            "Path: src/app.ts",
            "Repository Path: /project/trunk/src/app.ts",
            "URL: https://example.test/svn/project/trunk/src/app.ts",
            "",
            "Properties:",
            "svn:keywords:",
            "  Id",
            "  Author",
        ]
    );
});

test("buildPathInfoOutputLines keeps optional node info fields ordered and compact", () => {
    const nodeInfo: SvnNodeInfo = {
        absolutePath: "/wc/src/app.ts",
        kind: "file",
        repositoryRelativePath: "/project/trunk/src/app.ts",
        url: "https://example.test/svn/project/trunk/src/app.ts",
        repositoryRoot: "https://example.test/svn",
        workingCopyRoot: "/wc",
        revision: "42",
        committedRevision: "40",
        author: "alice",
        date: "2026-04-27T08:00:00.000Z",
        lockOwner: "bob",
        lockCreated: "2026-04-27T09:00:00.000Z",
        lockComment: "editing",
    };

    const lines = buildPathInfoOutputLines(nodeInfo, {
        labels: {
            infoPathLabel: "Path",
            infoKindLabel: "Kind",
            infoRepositoryPathLabel: "Repository Path",
            infoUrlLabel: "URL",
            infoRepositoryRootLabel: "Repository Root",
            infoWorkingCopyRootLabel: "Working Copy Root",
            infoRevisionLabel: "Revision",
            infoLastChangedRevisionLabel: "Last Changed Revision",
            infoLastChangedAuthorLabel: "Last Changed Author",
            infoLastChangedDateLabel: "Last Changed Date",
            infoLockOwnerLabel: "Lock Owner",
            infoLockCreatedLabel: "Lock Created",
            infoLockCommentLabel: "Lock Comment",
        },
        formatNodeKind: (kind) => kind.toUpperCase(),
    });

    assert.deepEqual(lines, [
        "Path: /wc/src/app.ts",
        "Kind: FILE",
        "Repository Path: /project/trunk/src/app.ts",
        "URL: https://example.test/svn/project/trunk/src/app.ts",
        "Repository Root: https://example.test/svn",
        "Working Copy Root: /wc",
        "Revision: r42",
        "Last Changed Revision: r40",
        "Last Changed Author: alice",
        "Last Changed Date: 2026-04-27T08:00:00.000Z",
        "Lock Owner: bob",
        "Lock Created: 2026-04-27T09:00:00.000Z",
        "Lock Comment: editing",
    ]);
});
