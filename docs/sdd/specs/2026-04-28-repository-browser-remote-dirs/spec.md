# Repository Browser Remote Directory Operations

## Metadata

- Feature name: Repository Browser Remote Directory Operations
- Owner: codetypess
- Date: 2026-04-28
- Status: Implemented
- Related issue:

## Summary

Extend the repository browser so users can perform common remote directory maintenance without leaving VS Code. The browser should support creating a child directory under the current repository path, copying the current directory, moving or renaming the current directory, and deleting the current directory when the target is safe to mutate.

## Problem Statement

- The current repository browser is read-heavy: users can browse, inspect history, inspect properties, switch, and create branch or tag references.
- Users still have to leave the extension for ordinary remote repository maintenance such as creating or renaming a directory.
- This is one of the most visible remaining SVN workflow gaps because repository browsing is already present, but it cannot yet maintain ordinary repository structure.

## Goals

- Add current-directory remote maintenance actions to the repository browser.
- Support remote `mkdir`, copy, move or rename, and delete flows through the existing SVN CLI backend.
- Keep the browser navigation model intact: users navigate into a directory first, then act on that directory.
- Refresh repository-derived UI state after mutations.

## Non-Goals

- Importing a local folder into the repository.
- File-level remote move, copy, or delete operations from the browser.
- Arbitrary drag-and-drop repository reorganization.
- Multi-select remote operations.

## Affected Workflow

State which baseline workflow this feature extends:

- Repository navigation

## User Stories

- As a developer browsing a repository, I want to create a remote directory in-place so I can prepare new structure without switching tools.
- As a developer reviewing an existing repository subtree, I want to copy or move the current directory so I can reorganize branches, modules, or assets from the browser.
- As a developer maintaining unused remote paths, I want to delete a remote directory from the browser so I can clean the repository structure quickly.

## Proposed UX

### Entry Points

- Command palette: none
- SCM title/menu: none
- Resource context menu: none
- Webview action: none
- Other: repository browser action list for the currently browsed directory

### Happy Path

1. The user opens the repository browser and navigates to a repository directory.
2. The browser action list exposes:
   - `Create Remote Directory Here`
   - `Copy This Directory`
   - `Move / Rename This Directory`
   - `Delete Remote Directory` when the current directory is eligible
3. The user chooses an action and enters a relative or repository-absolute destination as appropriate.
4. The extension validates the input before submission.
5. The extension runs the matching SVN repository operation.
6. The browser re-lists the current or resulting repository path and related history or graph views refresh.

### Error And Edge Cases

- Case: the user attempts to move or copy a directory into itself or one of its descendants.
- Expected behavior: reject the input before any SVN command runs.

- Case: the current repository browser directory is `/`.
- Expected behavior: do not offer move, copy, or delete for the repository root.

- Case: the current repository browser directory is the same as, or an ancestor of, the currently opened working copy repository path.
- Expected behavior: do not offer the generic move or delete actions for that directory.

- Case: the current directory is a branch or tag root.
- Expected behavior: existing branch or tag deletion remains available; generic remote directory deletion is not duplicated.

## Functional Requirements

- Add repository browser actions for creating a child directory, copying the current directory, and moving or renaming the current directory.
- Add generic remote directory deletion for eligible non-reference directories.
- Reuse the existing browser quick pick rather than introducing a new webview.
- Validate relative and absolute repository paths before executing SVN operations.
- Reject move or copy targets that resolve to the source directory or a descendant of it.
- Refresh repository history, revision graph caches, and incoming-status state after remote mutations.

## Out Of Scope

- Remote repository import from a local folder.
- Specialized permissions or policy checks beyond SVN command failures.

## Command And Setting Impact

- New commands:
  none
- Updated commands:
  none
- New settings:
  none
- Updated settings:
  none

## Localization Impact

- New i18n keys:
  repository-browser remote directory action labels, prompts, validation, progress, confirmations, and completion messages
- Updated copy:
  README and project baseline should mention remote directory maintenance in the repository browser

## Technical Design

### Modules Affected

- `docs/sdd/project-baseline.md`
- `docs/sdd/specs/2026-04-28-repository-browser-remote-dirs/spec.md`
- `docs/sdd/specs/2026-04-28-repository-browser-remote-dirs/tasks.md`
- `README.md`
- `src/i18n.ts`
- `src/scm/svn-repository-browser.ts`
- `src/scm/svn-repository-paths.ts`
- `src/scm/svn-repository.ts`
- `src/svn/svn-service.ts`
- `src/test/svn-repository-browser.test.ts`
- `src/test/svn-repository-paths.test.ts`

### Proposed Changes

- Extend repository-browser helper logic with current-directory remote action items.
- Add pure path-resolution and validation helpers for child-directory creation and sibling-or-absolute destination inputs.
- Add SVN service helpers for remote `mkdir` and remote `move`.
- Add repository-side prompts, confirmations, and mutation flows that feed back into the browser loop.
- Refresh repository state after remote repository mutations so browser, history, and incoming status remain coherent.

### Data Or Message Flow

1. User selects a current-directory repository browser action.
2. `SvnRepository` prompts for path input and validates it using pure helper logic.
3. `SvnService` executes the remote SVN command against repository URLs.
4. `SvnRepository` finalizes mutation side effects and returns the next browser path if navigation should shift.
5. The repository browser loop lists the resulting path again.

### Alternatives Considered

- Alternative: add remote operations as separate top-level commands.
- Why rejected: these operations are most discoverable and contextual inside the repository browser itself.

- Alternative: support directory entry action menus before current-directory actions.
- Why rejected: current-directory actions preserve the existing browser navigation model and reduce UX churn.

## Testing Plan

- Unit tests:
  cover repository path containment, remote-target validation, destination resolution, and browser action item construction
- Integration or command-path tests:
  rely on compile coverage for repository browser action plumbing
- Manual verification:
  create a directory in the browser, copy a non-working-copy directory, move a non-working-copy directory, and delete a non-reference directory while confirming the browser refreshes

## Risks

- Risk:
  users can accidentally mutate a repository path that is closely related to the active working copy
- Mitigation:
  hide generic move and delete actions for the current working copy repository path and its ancestors

- Risk:
  destination-path UX can become ambiguous
- Mitigation:
  use separate prompts for child creation versus sibling-or-absolute move or copy targets

## Rollout Notes

- Migration needed:
  none
- Backward compatibility concern:
  low; this only adds repository browser actions
- Follow-up work:
  support local-folder import and file-level remote operations

## Open Questions

- None for this change.

## Implementation Tasks

- [x] Add spec and task tracking.
- [x] Extend repository browser actions and validation helpers.
- [x] Add remote directory `mkdir` and `move` support in `SvnService`.
- [x] Wire repository browser prompts and mutation flows.
- [x] Update docs and localization.
- [x] Run tests.
