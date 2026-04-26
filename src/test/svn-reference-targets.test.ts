import test from "node:test";
import assert from "node:assert/strict";
import {
    getCurrentReferenceSuggestion,
    getReferenceLocationPath,
    getReferenceNameSuggestionForRepositoryPath,
    getReferenceNameValidationError,
    getSwitchTargetValidationError,
    resolveDeleteReferenceTarget,
    resolveSwitchTarget,
} from "../scm/svn-reference-targets";

test("reference target helpers derive location paths and suggestions", () => {
    assert.equal(
        getReferenceLocationPath("/project/trunk", "branch"),
        "/project/branches"
    );
    assert.equal(
        getReferenceNameSuggestionForRepositoryPath(
            "/project/trunk",
            "branch",
            "/project/branches/release/1.0"
        ),
        "release/1.0"
    );
    assert.equal(
        getReferenceNameSuggestionForRepositoryPath(
            "/project/trunk",
            "tag",
            "/project/branches/release/1.0"
        ),
        undefined
    );
    assert.equal(getCurrentReferenceSuggestion("/project/tags/v1.0.0"), "tags/v1.0.0");
    assert.equal(getCurrentReferenceSuggestion("/project/trunk"), undefined);
});

test("reference target helpers validate reference and switch inputs", () => {
    assert.equal(getReferenceNameValidationError(""), "required");
    assert.equal(getReferenceNameValidationError("/release"), "absolute-path");
    assert.equal(getReferenceNameValidationError("release//1.0"), "empty-segment");
    assert.equal(getReferenceNameValidationError("release/1.0"), undefined);

    assert.equal(getSwitchTargetValidationError(""), "required");
    assert.equal(getSwitchTargetValidationError("./release"), "invalid-path");
    assert.equal(getSwitchTargetValidationError("../release"), "invalid-path");
    assert.equal(
        getSwitchTargetValidationError("https://svn.example.com/repos/project/trunk"),
        undefined
    );
});

test("reference target helpers resolve delete targets from relative paths and urls", () => {
    assert.deepEqual(
        resolveDeleteReferenceTarget({
            target: "branches/release/1.0",
            repositoryRoot: "https://svn.example.com/repos",
            repositoryRelativePath: "/project/trunk",
        }),
        {
            display: "/project/branches/release/1.0",
            repositoryPath: "/project/branches/release/1.0",
            url: "https://svn.example.com/repos/project/branches/release/1.0",
        }
    );

    assert.deepEqual(
        resolveDeleteReferenceTarget({
            target: "/project/branches/release-1.0",
            repositoryRoot: "https://svn.example.com/repos",
            repositoryRelativePath: "/project/trunk",
        }),
        {
            display: "/project/branches/release-1.0",
            repositoryPath: "/project/branches/release-1.0",
            url: "https://svn.example.com/repos/project/branches/release-1.0",
        }
    );

    assert.deepEqual(
        resolveDeleteReferenceTarget({
            target: "https://svn.example.com/repos/project/tags/v1.0.0",
            repositoryRoot: "https://svn.example.com/repos",
            repositoryRelativePath: "/project/trunk",
        }),
        {
            display: "/project/tags/v1.0.0",
            repositoryPath: "/project/tags/v1.0.0",
            url: "https://svn.example.com/repos/project/tags/v1.0.0",
        }
    );

    assert.equal(
        resolveDeleteReferenceTarget({
            target: "https://other.example.com/repos/project/tags/v1.0.0",
            repositoryRoot: "https://svn.example.com/repos",
            repositoryRelativePath: "/project/trunk",
        }),
        undefined
    );
});

test("reference target helpers resolve switch targets", () => {
    assert.deepEqual(
        resolveSwitchTarget({
            target: "branches/release-1.0",
            repositoryRoot: "https://svn.example.com/repos",
            repositoryRelativePath: "/project/trunk",
        }),
        {
            display: "/project/branches/release-1.0",
            url: "https://svn.example.com/repos/project/branches/release-1.0",
        }
    );
    assert.deepEqual(
        resolveSwitchTarget({
            target: "https://svn.example.com/repos/project/tags/v1.0.0",
            repositoryRoot: "https://svn.example.com/repos",
            repositoryRelativePath: "/project/trunk",
        }),
        {
            display: "https://svn.example.com/repos/project/tags/v1.0.0",
            url: "https://svn.example.com/repos/project/tags/v1.0.0",
        }
    );
});
