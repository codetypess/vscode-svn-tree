import assert from "node:assert/strict";
import test from "node:test";
import type { SvnStatusEntry } from "../svn/svn-types";
import {
    isLocalChange,
    isRemoteChange,
    partitionStatusEntries,
} from "../scm/svn-repository-status-utils";

function createStatus(
    overrides: Partial<SvnStatusEntry> & Pick<SvnStatusEntry, "absolutePath" | "relativePath">
): SvnStatusEntry {
    return {
        kind: "file",
        wcStatus: "normal",
        ...overrides,
    };
}

test("partitionStatusEntries separates local, conflict artifact, unversioned, and remote states", () => {
    const statuses = [
        createStatus({
            absolutePath: "/wc/src/app.ts",
            relativePath: "src/app.ts",
            wcStatus: "conflicted",
        }),
        createStatus({
            absolutePath: "/wc/src/app.ts.mine",
            relativePath: "src/app.ts.mine",
            wcStatus: "unversioned",
        }),
        createStatus({
            absolutePath: "/wc/src/app.ts.r12",
            relativePath: "src/app.ts.r12",
            wcStatus: "unversioned",
        }),
        createStatus({
            absolutePath: "/wc/new.txt",
            relativePath: "new.txt",
            wcStatus: "unversioned",
        }),
        createStatus({
            absolutePath: "/wc/feature.ts",
            relativePath: "feature.ts",
            wcStatus: "modified",
            reposStatus: "modified",
        }),
        createStatus({
            absolutePath: "/wc/remote-only.ts",
            relativePath: "remote-only.ts",
            reposStatus: "deleted",
        }),
    ];

    const partitioned = partitionStatusEntries(statuses, true);

    assert.deepEqual(
        partitioned.changeStatuses.map((status) => status.relativePath),
        ["feature.ts", "src/app.ts"]
    );
    assert.deepEqual(
        partitioned.conflictArtifactStatuses.map((status) => status.relativePath),
        ["src/app.ts.mine", "src/app.ts.r12"]
    );
    assert.deepEqual(
        partitioned.unversionedStatuses.map((status) => status.relativePath),
        ["new.txt"]
    );
    assert.deepEqual(
        partitioned.remoteStatuses.map((status) => status.relativePath),
        ["feature.ts", "remote-only.ts"]
    );
});

test("partitionStatusEntries can skip remote states while preserving local groups", () => {
    const statuses = [
        createStatus({
            absolutePath: "/wc/feature.ts",
            relativePath: "feature.ts",
            wcStatus: "modified",
            reposStatus: "modified",
        }),
    ];

    const partitioned = partitionStatusEntries(statuses, false);

    assert.deepEqual(
        partitioned.changeStatuses.map((status) => status.relativePath),
        ["feature.ts"]
    );
    assert.deepEqual(partitioned.remoteStatuses, []);
});

test("status predicates keep SVN-specific local and remote semantics explicit", () => {
    assert.equal(
        isLocalChange(
            createStatus({
                absolutePath: "/wc/feature.ts",
                relativePath: "feature.ts",
                wcStatus: "modified",
            })
        ),
        true
    );
    assert.equal(
        isLocalChange(
            createStatus({
                absolutePath: "/wc/new.txt",
                relativePath: "new.txt",
                wcStatus: "unversioned",
            })
        ),
        false
    );
    assert.equal(
        isRemoteChange(
            createStatus({
                absolutePath: "/wc/remote-only.ts",
                relativePath: "remote-only.ts",
                reposStatus: "deleted",
            })
        ),
        true
    );
    assert.equal(
        isRemoteChange(
            createStatus({
                absolutePath: "/wc/local-only.ts",
                relativePath: "local-only.ts",
                reposStatus: "none",
            })
        ),
        false
    );
});
