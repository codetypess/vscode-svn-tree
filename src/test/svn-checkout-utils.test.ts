import test from "node:test";
import assert from "node:assert/strict";
import {
    deriveCheckoutDestinationName,
    deriveImportSourceFolderName,
    normalizeCheckoutRepositoryUrl,
    normalizeCheckoutRevision,
} from "../scm/svn-checkout-utils";

test("normalizeCheckoutRepositoryUrl accepts absolute svn urls", () => {
    assert.equal(
        normalizeCheckoutRepositoryUrl(" https://svn.example.com/project/trunk "),
        "https://svn.example.com/project/trunk"
    );
    assert.equal(
        normalizeCheckoutRepositoryUrl("svn+ssh://svn.example.com/project/branches/feature-x"),
        "svn+ssh://svn.example.com/project/branches/feature-x"
    );
    assert.equal(
        normalizeCheckoutRepositoryUrl("file:///Users/example/repository"),
        "file:///Users/example/repository"
    );
});

test("normalizeCheckoutRepositoryUrl rejects empty or relative values", () => {
    assert.equal(normalizeCheckoutRepositoryUrl(undefined), undefined);
    assert.equal(normalizeCheckoutRepositoryUrl("  "), undefined);
    assert.equal(normalizeCheckoutRepositoryUrl("/project/trunk"), undefined);
    assert.equal(normalizeCheckoutRepositoryUrl("trunk"), undefined);
});

test("normalizeCheckoutRevision accepts HEAD and positive integers", () => {
    assert.equal(normalizeCheckoutRevision("HEAD"), "HEAD");
    assert.equal(normalizeCheckoutRevision(" head "), "HEAD");
    assert.equal(normalizeCheckoutRevision("0042"), "42");
    assert.equal(normalizeCheckoutRevision(19), "19");
});

test("normalizeCheckoutRevision rejects invalid revisions", () => {
    assert.equal(normalizeCheckoutRevision(undefined), undefined);
    assert.equal(normalizeCheckoutRevision(""), undefined);
    assert.equal(normalizeCheckoutRevision("0"), undefined);
    assert.equal(normalizeCheckoutRevision("-4"), undefined);
    assert.equal(normalizeCheckoutRevision("4.2"), undefined);
    assert.equal(normalizeCheckoutRevision("not-a-revision"), undefined);
    assert.equal(normalizeCheckoutRevision(9.5), undefined);
});

test("deriveCheckoutDestinationName uses the final url segment", () => {
    assert.equal(
        deriveCheckoutDestinationName(
            "https://svn.example.com/project/trunk",
            "HEAD"
        ),
        "trunk"
    );
    assert.equal(
        deriveCheckoutDestinationName(
            "https://svn.example.com/project/branches/feature-x",
            "42"
        ),
        "feature-x-r42"
    );
});

test("deriveCheckoutDestinationName sanitizes unsafe names and falls back when needed", () => {
    assert.equal(
        deriveCheckoutDestinationName(
            "https://svn.example.com/project/%3Afeature%3Fname%2A",
            "HEAD"
        ),
        "-feature-name-"
    );
    assert.equal(
        deriveCheckoutDestinationName("https://svn.example.com", "HEAD"),
        "svn-checkout"
    );
});

test("deriveImportSourceFolderName returns the selected folder name", () => {
    assert.equal(
        deriveImportSourceFolderName("/Users/example/project/seed-content"),
        "seed-content"
    );
    assert.equal(
        deriveImportSourceFolderName("/Users/example/project/seed-content/"),
        "seed-content"
    );
});

test("deriveImportSourceFolderName falls back when the basename is not usable", () => {
    assert.equal(deriveImportSourceFolderName(""), undefined);
    assert.equal(deriveImportSourceFolderName("/"), undefined);
    assert.equal(deriveImportSourceFolderName("   /   "), undefined);
});
