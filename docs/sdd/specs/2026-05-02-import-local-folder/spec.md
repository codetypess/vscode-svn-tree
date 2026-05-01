# Import Local Folder Into Repository

## Metadata

- Feature name: Import Local Folder Into Repository
- Owner: codetypess
- Date: 2026-05-02
- Status: Implemented
- Related issue:

## Summary

Add a global SVN import workflow that lets users publish an existing local folder to an explicit SVN repository URL from inside VS Code. The workflow should stay conservative: validate the source folder and target URL, require a commit message, confirm the remote write, and clearly explain that `svn import` does not create a working copy. On success, the extension should offer an explicit path into the existing checkout workflow.

## Problem Statement

- The extension now covers repository checkout, working-copy maintenance, history, repository browsing, and reference operations, but it still cannot publish a brand-new local project into SVN.
- Users who start from an unversioned local folder must fall back to the terminal or another SVN client for one of Subversion's most basic bootstrap workflows.
- This leaves the product boundary incomplete: users can acquire a working copy from SVN, but they cannot seed SVN from a local source tree.
- This should be solved now because it is already called out as a known product gap and it is the next most obvious SVN lifecycle workflow after checkout.

## Goals

- Add a global command that imports a selected local folder to an absolute SVN repository URL.
- Make the semantics explicit before and after execution: the source folder stays a normal local folder and is not converted into a working copy.
- Validate the source folder, target URL, and commit message before running the import.
- Offer a clear post-success action that helps the user continue into a working-copy flow by reusing checkout.

## Non-Goals

- Repository-browser entry points for importing a local folder into the currently browsed repository path.
- File-level remote operations in the repository browser.
- Importing only a subset of files from a folder.
- Automatic conversion of the imported folder into a working copy.
- Sparse checkout, depth-aware import, or authentication management beyond the installed `svn` CLI.

## Affected Workflow

State which baseline workflow this feature extends:

- Other: repository publication and initial SVN bootstrap

This feature extends the product boundary in the opposite direction from checkout: users can move from a local project into SVN without leaving the extension.

## User Stories

- As a developer with a local project that is not yet in SVN, I want to import that folder into a repository URL so that I can bootstrap the remote history without switching tools.
- As a maintainer preparing a seed tree or vendor drop, I want to publish a complete local folder to SVN with an explicit message so that the initial remote state is captured deliberately.

## Proposed UX

### Entry Points

- Command palette: new global command `SVN Tree: Import Local Folder Into SVN Repository`
- SCM title/menu: none in v1
- Resource context menu: none in v1
- Webview action: none
- Other: command should remain available even when no SVN working copy is open

### Happy Path

1. The user runs `SVN Tree: Import Local Folder Into SVN Repository`.
2. The extension validates that the `svn` CLI is available using the existing availability path.
3. The extension prompts the user to select a local source folder.
4. The extension checks whether the selected folder belongs to an existing SVN working copy.
5. The extension prompts for an absolute SVN repository URL.
6. The extension prompts for a commit message, prefilled from the selected folder name.
7. The extension shows a confirmation summary with:
   - source folder path
   - target repository URL
   - commit message
   - an explicit note that import publishes files remotely but does not create a local working copy
8. The extension runs `svn import <localFolder> <targetUrl> -m <message>`.
9. On success, the extension shows a completion message with follow-up actions:
   `Checkout Imported Repository` and `Copy Repository URL`.
10. If the user chooses `Checkout Imported Repository`, the extension launches the existing checkout workflow with the imported repository URL prefilled.

### Error And Edge Cases

- Case: `svn` is not available on `PATH`.
- Expected behavior: abort before prompting for import inputs and show the existing availability warning path.

- Case: the user cancels folder selection, URL input, commit-message input, or confirmation.
- Expected behavior: abort cleanly without side effects.

- Case: the selected folder is missing, not readable, or not a directory by the time import would run.
- Expected behavior: show a warning and abort without invoking SVN.

- Case: the selected folder belongs to an existing SVN working copy.
- Expected behavior: reject the workflow before import runs and direct the user toward normal working-copy commit or repository-copy flows instead.

- Case: the repository URL is empty or not an absolute URL.
- Expected behavior: block progression with inline validation.

- Case: the commit message is empty after trimming.
- Expected behavior: block progression with inline validation.

- Case: the target repository path already exists, the user lacks permission, or the server rejects the import.
- Expected behavior: let the SVN command fail normally, surface the error, and preserve the output-channel path for troubleshooting.

- Case: the source folder lives under the current VS Code workspace.
- Expected behavior: do not refresh repository discovery expecting a new working copy, because import does not create one.

## Functional Requirements

- Add a contributed global command ID for the workflow, available from the command palette without repository context.
- Use a folder picker to choose an existing local directory as the import source.
- Accept only absolute repository URLs for v1.
- Require a non-empty commit message.
- Default the commit message to a simple folder-based suggestion such as `Import <folderName>`.
- Reject import attempts when the selected source path is inside an SVN working copy.
- Reuse the current `svn` CLI backend by adding a dedicated SVN service wrapper for import.
- Show an explicit confirmation step before any remote write occurs.
- Explain in both the confirmation and the success notification that import does not create a working copy.
- On success, offer a checkout follow-up action that reuses the existing checkout-from-url workflow instead of duplicating it.
- Do not automatically open folders, replace the workspace, or add imported content to the current workspace.
- Do not trigger working-copy discovery refresh purely because import succeeded.

## Out Of Scope

- Importing through the repository browser or revision graph.
- Supporting drag-and-drop from the Explorer into repository targets.
- In-place checkout into the original imported folder.
- Server-side preview or dry-run support for import.
- Remembering recent import targets.

## Command And Setting Impact

- New commands:
  `svn-tree.import-local-folder`
- Updated commands:
  `svn-tree.checkout-from-url` may need an internal refactor so it can accept a prefilled URL when launched from import follow-up
- New settings:
  none
- Updated settings:
  none

## Localization Impact

- New i18n keys:
  import command title, folder-selection prompt text, URL prompt and validation, commit-message prompt and validation, confirmation copy, progress text, success text, working-copy warning copy, and follow-up action labels
- Updated copy:
  README and project baseline should mention repository import once the feature ships

## Technical Design

### Modules Affected

- `README.md`
- `docs/sdd/project-baseline.md`
- `package.json`
- `package.nls.json`
- `package.nls.zh-cn.json`
- `src/i18n.ts`
- `src/scm/svn-checkout-utils.ts`
- `src/scm/svn-repository-manager.ts`
- `src/svn/svn-service.ts`
- `src/test/svn-checkout-utils.test.ts`
- `src/test/*`

### Proposed Changes

- Add a new global command contribution and localized command title in `package.json` and `package.nls*`.
- Implement the workflow in `SvnRepositoryManager`, because import must work before any `SvnRepository` instance exists.
- Reuse the existing absolute-URL normalization helper from `src/scm/svn-checkout-utils.ts` rather than duplicating repository-URL parsing logic.
- Add a small pure helper for deriving the default import commit message from the selected folder name and test it directly.
- Add a manager-level preflight check that rejects source folders already inside an SVN working copy by reusing `SvnService.getWorkingCopyInfo(...)`.
- Add `SvnService.importToUrl(sourcePath, targetUrl, message)` as the backend wrapper for `svn import`.
- Add a confirmation helper that renders the source path, target URL, and no-working-copy warning before execution.
- Refactor the existing checkout-from-url manager workflow so import success can relaunch it with the imported URL prefilled.
- Reuse existing progress and error-surfacing conventions so failures still route users to the output channel.
- Skip repository-discovery refresh after import because the source folder remains unversioned.

### Data Or Message Flow

1. VS Code invokes `svn-tree.import-local-folder`.
2. `SvnRepositoryManager` validates CLI availability, gathers the source folder, checks for working-copy membership, then gathers the repository URL and commit message.
3. The manager shows an explicit confirmation that the operation writes remotely and does not create a working copy.
4. The manager calls `SvnService.importToUrl(sourcePath, targetUrl, message)`.
5. The manager shows success actions for checkout and URL copy.
6. If the user chooses checkout, the manager launches the existing checkout flow with the imported URL prefilled.

### Alternatives Considered

- Alternative: add import only as a repository-browser action.
- Why rejected: import should work from an empty or unrelated workspace, and coupling it to repository browsing would force a repository-context dependency onto a global bootstrap workflow.

- Alternative: automatically run checkout after import succeeds.
- Why rejected: automatic checkout obscures the fact that import does not create a working copy and forces destination-path decisions into a flow that should stay explicit.

- Alternative: allow importing folders that already belong to an SVN working copy.
- Why rejected: the semantics are too easy to misunderstand in v1 and overlap with existing commit, copy, and branch workflows.

## Testing Plan

- Unit tests:
  add coverage for default import commit-message derivation and any shared repository-URL normalization touched during the refactor
- Integration or command-path tests:
  add targeted coverage where practical for new manager-side helper logic and prefilled checkout reuse
- Manual verification:
  import a normal local folder, reject a folder inside an SVN working copy, reject an invalid URL, reject an empty commit message, verify failure output for a bad target, and verify that the success notification can chain into checkout with the URL prefilled

## Risks

- Risk:
  users may confuse import with checkout and expect the selected folder to become a working copy
- Mitigation:
  state the non-working-copy behavior explicitly before execution and again after success

- Risk:
  importing a large folder can take time and fail for server-side reasons outside the extension
- Mitigation:
  rely on existing progress reporting and preserve raw SVN output for diagnosis

- Risk:
  rejecting working-copy-backed folders may feel restrictive for advanced users
- Mitigation:
  keep the rule explicit in copy, and treat broader import semantics as follow-up design work rather than letting v1 become ambiguous

## Rollout Notes

- Migration needed:
  none
- Backward compatibility concern:
  low; this adds a new global command and does not alter existing working-copy behavior
- Follow-up work:
  repository-browser import entry points, file-level remote operations, and richer bootstrap workflows that combine import with guided checkout

## Open Questions

- None for v1.

## Implementation Tasks

- [x] Add the new command contribution and localized command title.
- [x] Implement the global import workflow in `SvnRepositoryManager`.
- [x] Add or refactor pure helpers for repository-URL reuse and default import commit-message generation.
- [x] Add working-copy membership preflight for the selected source folder.
- [x] Add `SvnService.importToUrl(...)`.
- [x] Add confirmation and success follow-up actions, including checkout chaining.
- [x] Update README and baseline docs when the feature ships.
- [x] Add tests for helper logic and run compile plus tests.
