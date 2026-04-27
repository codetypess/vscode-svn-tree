import test from "node:test";
import assert from "node:assert/strict";
import {
    buildRevisionGraph,
    buildRevisionGraphSummary,
    hasInvalidRevisionGraphFilters,
    matchesRevisionGraphFilters,
    parseRevisionGraphMergeInfo,
} from "../revision-graph/revision-graph-utils";

test("buildRevisionGraph extracts standard svn reference nodes and copy edges", () => {
    const graph = buildRevisionGraph({
        repositoryRoot: "https://example.test/svn",
        currentRepositoryPath: "/project/branches/release-1.0/src/app.ts",
        entries: [
            {
                revision: 130,
                author: "alice",
                date: "2026-04-26T10:00:00.000Z",
                message: "Fix release branch",
                changes: [
                    {
                        action: "M",
                        kind: "file",
                        path: "/project/branches/release-1.0/src/app.ts",
                    },
                ],
            },
            {
                revision: 120,
                author: "bob",
                date: "2026-04-20T10:00:00.000Z",
                message: "Create tag",
                changes: [
                    {
                        action: "A",
                        kind: "dir",
                        path: "/project/tags/v1.0.0",
                        copyfromPath: "/project/branches/release-1.0",
                        copyfromRevision: "119",
                    },
                ],
            },
            {
                revision: 110,
                author: "alice",
                date: "2026-04-10T10:00:00.000Z",
                message: "Create release branch",
                changes: [
                    {
                        action: "A",
                        kind: "dir",
                        path: "/project/branches/release-1.0",
                        copyfromPath: "/project/trunk",
                        copyfromRevision: "109",
                    },
                ],
            },
        ],
    });

    assert.equal(graph.currentReferencePath, "/project/branches/release-1.0");
    assert.equal(graph.selectedReferencePath, "/project/branches/release-1.0");
    assert.deepEqual(
        graph.nodes.map((node) => ({
            path: node.repositoryPath,
            kind: node.kind,
            current: node.current,
            selected: node.selected,
            createdRevision: node.createdRevision,
            lastSeenRevision: node.lastSeenRevision,
        })),
        [
            {
                path: "/project/branches/release-1.0",
                kind: "branch",
                current: true,
                selected: true,
                createdRevision: 110,
                lastSeenRevision: 130,
            },
            {
                path: "/project/trunk",
                kind: "trunk",
                current: false,
                selected: false,
                createdRevision: undefined,
                lastSeenRevision: undefined,
            },
            {
                path: "/project/tags/v1.0.0",
                kind: "tag",
                current: false,
                selected: false,
                createdRevision: 120,
                lastSeenRevision: 120,
            },
        ]
    );
    assert.deepEqual(
        graph.edges.map((edge) => ({
            source: edge.sourceRepositoryPath,
            target: edge.targetRepositoryPath,
            revision: edge.revision,
        })),
        [
            {
                source: "/project/branches/release-1.0",
                target: "/project/tags/v1.0.0",
                revision: 120,
            },
            {
                source: "/project/trunk",
                target: "/project/branches/release-1.0",
                revision: 110,
            },
        ]
    );
});

test("buildRevisionGraph supports custom layouts and mergeinfo metadata", () => {
    const graph = buildRevisionGraph({
        repositoryRoot: "https://example.test/svn",
        currentRepositoryPath: "/project/releases/current/app.ts",
        selectedRepositoryPath: "/project/releases/current/app.ts",
        layout: {
            trunkNames: ["mainline"],
            branchContainerNames: ["releases"],
            tagContainerNames: ["snapshots"],
        },
        nodeMetadata: {
            "/project/releases/current": {
                mergeSources: [
                    {
                        sourceRepositoryPath: "/project/mainline",
                        revisionRange: "10-20",
                        revision: 20,
                    },
                ],
            },
        },
        entries: [],
    });

    assert.equal(graph.currentReferencePath, "/project/releases/current");
    assert.equal(graph.nodes[0]?.repositoryPath, "/project/releases/current");
    assert.equal(graph.edges[0]?.kind, "mergeinfo");
});

test("revision graph filters validate and match log entries", () => {
    const entry = {
        revision: 150,
        author: "alice",
        date: "2026-04-20T10:00:00.000Z",
        message: "message",
        changes: [],
    };

    assert.equal(
        hasInvalidRevisionGraphFilters({
            revisionFrom: 20,
            revisionTo: 10,
        }),
        true
    );
    assert.equal(
        matchesRevisionGraphFilters(entry, {
            author: "ali",
            revisionFrom: 100,
            revisionTo: 200,
            dateFrom: "2026-04-01",
            dateTo: "2026-04-30",
        }),
        true
    );
});

test("parseRevisionGraphMergeInfo normalizes sources and summary includes metadata", () => {
    const mergeSources = parseRevisionGraphMergeInfo(
        "/project/branches/release-1.0: 100-110\n/project/trunk: 90-95",
        {
            trunkNames: ["trunk"],
            branchContainerNames: ["branches"],
            tagContainerNames: ["tags"],
        }
    );

    assert.deepEqual(mergeSources, [
        {
            sourceRepositoryPath: "/project/branches/release-1.0",
            revisionRange: "100-110",
            revision: 110,
        },
        {
            sourceRepositoryPath: "/project/trunk",
            revisionRange: "90-95",
            revision: 95,
        },
    ]);

    const summary = buildRevisionGraphSummary(
        buildRevisionGraph({
            repositoryRoot: "https://example.test/svn",
            currentRepositoryPath: "/project/trunk",
            entries: [],
            nodeMetadata: {
                "/project/trunk": {
                    localChangeCount: 2,
                    incomingChangeCount: 1,
                },
            },
        })
    );

    assert.match(summary, /local:2/);
    assert.match(summary, /incoming:1/);
});
