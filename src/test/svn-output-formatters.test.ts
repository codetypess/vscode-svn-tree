import assert from "node:assert/strict";
import test from "node:test";
import {
    buildBlameOutputLines,
    buildBlamePreviewContent,
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
