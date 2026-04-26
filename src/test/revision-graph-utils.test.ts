import test from "node:test";
import assert from "node:assert/strict";
import { buildRevisionGraph } from "../revision-graph/revision-graph-utils";

test("buildRevisionGraph extracts standard svn reference nodes and copy edges", () => {
    const graph = buildRevisionGraph({
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

test("buildRevisionGraph falls back to the selected path for non-standard layouts", () => {
    const graph = buildRevisionGraph({
        currentRepositoryPath: "/project/releases/current/app.ts",
        selectedRepositoryPath: "/project/releases/current",
        entries: [],
    });

    assert.equal(graph.currentReferencePath, "/project/releases/current/app.ts");
    assert.equal(graph.selectedReferencePath, "/project/releases/current");
    assert.deepEqual(
        graph.nodes.map((node) => ({
            path: node.repositoryPath,
            kind: node.kind,
            current: node.current,
            selected: node.selected,
        })),
        [
            {
                path: "/project/releases/current/app.ts",
                kind: "path",
                current: true,
                selected: false,
            },
            {
                path: "/project/releases/current",
                kind: "path",
                current: false,
                selected: true,
            },
        ]
    );
});
