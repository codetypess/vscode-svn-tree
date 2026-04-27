import assert from "node:assert/strict";
import test from "node:test";
import type { RevisionGraphData } from "../revision-graph/revision-graph-types";
import {
    buildRevisionGraphStatusMetadata,
    enrichRevisionGraphHoverState,
    formatRevisionGraphChangedPaths,
    isRepositoryPathWithinScope,
    mapRevisionGraphTargetPath,
} from "../scm/svn-repository-revision-graph-state";

test("buildRevisionGraphStatusMetadata counts local and incoming changes by scope", () => {
    const metadata = buildRevisionGraphStatusMetadata({
        repositoryPaths: ["/project/trunk", "/project/branches/release-1.0"],
        localStatuses: [
            {
                absolutePath: "/wc/project/trunk/src/app.ts",
                relativePath: "src/app.ts",
                kind: "file",
                wcStatus: "modified",
            },
        ],
        remoteStatuses: [
            {
                absolutePath: "/wc/project/branches/release-1.0/README.md",
                relativePath: "README.md",
                kind: "file",
                wcStatus: "normal",
                reposStatus: "modified",
            },
        ],
        resolveRepositoryPath: (absolutePath) =>
            absolutePath.replace("/wc", "").replace(/\\/g, "/"),
    });

    assert.deepEqual(metadata, {
        "/project/trunk": {
            localChangeCount: 1,
            incomingChangeCount: 0,
        },
        "/project/branches/release-1.0": {
            localChangeCount: 0,
            incomingChangeCount: 1,
        },
    });
});

test("revision graph repository path helpers preserve selected subpaths across references", () => {
    assert.equal(
        isRepositoryPathWithinScope("/project/trunk/src/app.ts", "/project/trunk"),
        true
    );
    assert.equal(
        isRepositoryPathWithinScope(
            "/project/branches/release-1.0/src/app.ts",
            "/project/trunk"
        ),
        false
    );
    assert.equal(
        mapRevisionGraphTargetPath(
            "/project/branches/release-1.0",
            "/project/trunk/src/app.ts",
            "/project/trunk"
        ),
        "/project/branches/release-1.0/src/app.ts"
    );
});

test("revision graph formatting helpers keep summaries deterministic", () => {
    assert.deepEqual(
        formatRevisionGraphChangedPaths(
            {
                revision: 42,
                author: "alice",
                date: "2026-04-27T08:00:00.000Z",
                message: "Create release branch",
                changes: [
                    {
                        action: "A",
                        kind: "dir",
                        path: "/project/branches/release-1.0",
                        copyfromPath: "/project/trunk",
                    },
                ],
            },
            {
                noChangedPathsReportedLabel: "No changed paths",
                formatCopiedFrom: (path) => `copied from ${path}`,
            }
        ),
        ["A /project/branches/release-1.0 (copied from /project/trunk)"]
    );

    const graph: RevisionGraphData = {
        scopeLabel: "project",
        layoutRootPath: "/project",
        selectedRepositoryPath: "/project/trunk",
        selectedReferencePath: "/project/trunk",
        currentReferencePath: "/project/trunk",
        query: {},
        scannedEntryCount: 1,
        truncated: false,
        canLoadMore: false,
        edges: [],
        nodes: [
            {
                id: "trunk",
                repositoryPath: "/project/trunk",
                url: "https://example.test/svn/project/trunk",
                label: "trunk",
                detail: "",
                kind: "trunk",
                current: true,
                selected: true,
                localChangeCount: 2,
                incomingChangeCount: 1,
                lockOwner: "alice",
                lastSeenRevision: 42,
                hoverSummary: ["Existing"],
            },
        ],
    };

    assert.deepEqual(enrichRevisionGraphHoverState(graph).nodes[0]?.hoverSummary, [
        "Existing",
        "URL: https://example.test/svn/project/trunk",
        "Local changes: 2",
        "Incoming changes: 1",
        "Locked by alice",
        "Last seen in r42",
    ]);
});
