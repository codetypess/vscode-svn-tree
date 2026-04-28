# Checkout From URL

## Metadata

- Feature name: Checkout From URL
- Owner: codetypess
- Date: 2026-04-28
- Status: Implemented
- Related issue:

## Summary

Add a global SVN checkout workflow that lets users check out any repository URL into a new local folder from inside VS Code. This closes the largest onboarding gap in the current product, which otherwise assumes the user already opened an existing SVN working copy. The feature should be deliberate and low-risk: explicit command entry, validated inputs, no automatic workspace replacement, and clear success actions.

## Problem Statement

- The extension currently works best after a user already has a local SVN working copy.
- Users cannot start from an arbitrary repository URL without falling back to the terminal or another SVN client.
- This breaks the product boundary between repository acquisition and repository maintenance, and it leaves the most basic “get the code locally” workflow outside the extension.
- This should be solved now because it is the clearest product gap in the current baseline and an obvious first feature to exercise the new SDD workflow.

## Goals

- Add a global command that can start a checkout without requiring an existing `SvnRepository`.
- Support checking out either `HEAD` or a user-specified numeric revision.
- Keep the UX explicit and safe: validate inputs, avoid destination collisions, and avoid abrupt workspace replacement.
- Provide post-success actions that help the user continue from the created working copy.

## Non-Goals

- Importing local folders into an SVN repository.
- Sparse checkout or `--depth` support.
- Authentication management beyond what the installed `svn` CLI already handles.
- Batch checkout of multiple URLs in one command.
- Automatic workspace switching immediately after checkout completes.

## Affected Workflow

State which baseline workflow this feature extends:

- Other: repository acquisition and initial local setup.

This feature also changes a current project-baseline assumption: the extension will no longer be limited to already-opened working copies for its first useful action.

## User Stories

- As a developer without a local working copy, I want to check out a repository URL from inside VS Code so that I do not need to switch to another SVN client first.
- As a developer investigating a historical state, I want to check out a specific revision so that I can inspect or build that snapshot in isolation.

## Proposed UX

### Entry Points

- Command palette: new global command `SVN Tree: Checkout SVN Repository URL`
- SCM title/menu: none in v1
- Resource context menu: none
- Webview action: none
- Other: command should remain available even when no SVN working copy is open

### Happy Path

1. The user runs `SVN Tree: Checkout SVN Repository URL`.
2. The extension prompts for an absolute SVN repository URL.
3. The extension prompts for a revision value with `HEAD` as the default; the user may keep `HEAD` or enter a positive integer revision.
4. The extension prompts the user to select a parent folder on disk.
5. The extension prompts for a destination folder name, prefilled from the repository URL and revision.
6. The extension validates that the destination path does not already exist.
7. The extension runs `svn checkout -r <revision> <url> <destination>`.
8. On success, the extension shows a completion message with explicit follow-up actions:
   `Open Folder` and `Reveal In File Manager`.
9. If the user chooses `Open Folder`, the extension opens the checked-out folder in a new VS Code window.

### Error And Edge Cases

- Case: `svn` is not available on `PATH`.
- Expected behavior: abort before collecting checkout inputs and show the existing SVN availability warning path.

- Case: the entered URL is empty or not a valid absolute URL.
- Expected behavior: block progression with inline validation.

- Case: the entered revision is neither `HEAD` nor a positive integer.
- Expected behavior: block progression with inline validation.

- Case: the selected destination path already exists.
- Expected behavior: show a warning and abort without running checkout.

- Case: checkout fails because of SVN, network, permission, or authentication issues.
- Expected behavior: show an error notification and preserve the output-channel path for troubleshooting.

- Case: the user checks out into a folder located inside the current workspace tree.
- Expected behavior: the extension should refresh repository discovery after success so the new working copy can appear without requiring a reload when feasible.

## Functional Requirements

- Add a contributed command ID for the workflow, available from the command palette without repository context.
- Accept only absolute repository URLs for v1.
- Accept revision input as either `HEAD` or a positive integer string.
- Default revision input to `HEAD`.
- Derive the default destination folder name from the final non-empty URL path segment.
- Append `-r<revision>` to the default folder name when the revision is numeric.
- Fallback to `svn-checkout` if no usable folder name can be derived from the URL.
- Refuse to overwrite an existing destination path.
- Reuse the current `svn` CLI backend rather than shelling out through ad hoc logic.
- On success, provide explicit follow-up actions rather than automatically opening the checked-out folder.
- If the created folder lands under an existing workspace folder, trigger repository discovery or refresh so the new working copy can become visible.

## Out Of Scope

- Checking out URLs by browsing the repository graph or repository browser.
- Remembering recent checkout URLs.
- Defaulting the parent folder from a user setting.
- Auto-adding the checked-out folder to a multi-root workspace.

## Command And Setting Impact

- New commands:
  `svn-tree.checkout-from-url`
- Updated commands:
  none
- New settings:
  none
- Updated settings:
  none

## Localization Impact

- New i18n keys:
  prompts, placeholders, validation errors, progress messages, success messages, and post-success action labels for checkout-from-url
- Updated copy:
  none expected outside command registration and new workflow text

## Technical Design

### Modules Affected

- `package.json`
- `src/scm/svn-repository-manager.ts`
- `src/svn/svn-service.ts`
- `src/i18n.ts`
- `src/test/*`

### Proposed Changes

- Add a new global command registration in `package.json` and wire it through `SvnRepositoryManager`.
- Implement the workflow at the manager layer because this operation must work before a repository instance exists.
- Reuse `SvnService.checkout(target, revision, destinationPath)` for the actual SVN operation.
- Add manager-level prompt helpers for:
  repository URL, revision string, parent folder selection, destination folder name, and post-success actions.
- Add a small pure helper for deriving the default checkout folder name from a URL and revision so it can be tested directly.
- Reuse existing output-channel behavior and error handling conventions.
- After success, optionally call into repository discovery refresh logic if the destination is under the current workspace.

### Data Or Message Flow

1. VS Code invokes `svn-tree.checkout-from-url`.
2. `SvnRepositoryManager` validates CLI availability and gathers user inputs.
3. The manager calls `SvnService.checkout(url, revision, destinationPath)`.
4. The manager shows a success notification with `Open Folder` and `Reveal In File Manager` actions.
5. If relevant, the manager refreshes working-copy discovery for the current workspace.

### Alternatives Considered

- Alternative: expose checkout only from repository-specific menus.
- Why rejected: the feature is specifically meant to work before any working copy exists.

- Alternative: open the checked-out folder automatically on success.
- Why rejected: automatic workspace replacement is too aggressive and violates the project’s preference for explicit follow-up actions.

- Alternative: support only `HEAD` in v1.
- Why rejected: explicit revision checkout is already supported elsewhere in the product and adds little additional complexity here.

## Testing Plan

- Unit tests:
  add coverage for folder-name derivation and revision input normalization helpers
- Integration or command-path tests:
  add targeted coverage where practical for new helper logic in the manager layer
- Manual verification:
  run checkout with `HEAD`, run checkout with numeric revision, validate invalid URL input, validate invalid revision input, validate existing destination rejection, validate success actions, and validate discovery refresh when checking out under the active workspace

## Risks

- Risk:
  VS Code folder-opening behavior can be disruptive if the success action is implemented carelessly.
- Mitigation:
  keep folder opening explicit and user-initiated.

- Risk:
  checkout failures may vary across operating systems and authentication setups.
- Mitigation:
  keep error handling simple, preserve output access, and avoid hiding CLI behavior behind custom abstractions.

- Risk:
  destination naming derived from URLs may be surprising for unusual repository roots.
- Mitigation:
  always let the user edit the destination folder name before checkout runs.

## Rollout Notes

- Migration needed:
  none
- Backward compatibility concern:
  low; this adds a new command and does not change existing repository workflows
- Follow-up work:
  repository import, sparse checkout, recent-target history, and workspace-add/open refinements

## Open Questions

- None for v1.

## Implementation Tasks

- [x] Add the new command contribution and localized title.
- [x] Implement the global checkout-from-url workflow in `SvnRepositoryManager`.
- [x] Add reusable helpers for URL validation, revision normalization, and default folder-name derivation.
- [x] Add success follow-up actions for opening the folder and revealing it in the file manager.
- [x] Refresh repository discovery after successful checkout when appropriate.
- [x] Add tests for the new pure helper logic.
- [x] Update user-facing documentation if the command is exposed beyond command palette discovery.
