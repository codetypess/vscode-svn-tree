# Repository Browser File Operations And Local Import

## Metadata

- Feature name: Repository Browser File Operations And Local Import
- Owner: codetypess
- Date: 2026-05-02
- Status: Implemented
- Related issue:

## Summary

Extend the repository browser so it can do two missing maintenance jobs without leaving VS Code: import a local folder into the currently browsed repository path, and perform common remote file operations on selected repository files. This closes the last obvious gap between the browser's existing directory maintenance flows and the day-to-day SVN operations users expect when navigating repository content.

## Problem Statement

- The repository browser already supports remote directory creation, copy, move, and delete, but it still cannot publish a local folder into the current repository context.
- File entries in the browser were inspection-only apart from blame and metadata actions, which forced users back to the terminal or another client for basic remote file maintenance.
- These gaps were especially visible after the global import workflow shipped, because users could import into SVN in general but not into the path they were already browsing.

## Goals

- Add a current-directory browser action for importing a local folder into a child repository path under the currently browsed directory.
- Add selected-entry browser actions for exporting, copying, moving, and deleting remote files.
- Reuse existing repository browser interaction patterns, validation, progress reporting, and mutation finalization flows.
- Keep import semantics explicit: repository-browser import publishes remotely and does not create a local working copy.

## Non-Goals

- Drag-and-drop import into the repository browser.
- Multi-select remote file operations.
- Importing directly into an existing repository directory without choosing a child destination path.
- Editing or diffing remote files directly in place from the browser.

## Affected Workflow

State which baseline workflow this feature extends:

- Repository navigation

## User Stories

- As a developer browsing a repository subtree, I want to import a local folder under the current path so I can publish new content exactly where I am already working.
- As a developer reviewing repository files, I want to export, copy, move, or delete a selected file from the browser so I can maintain remote content without switching tools.

## Proposed UX

### Entry Points

- Command palette: none
- SCM title/menu: none
- Resource context menu: none
- Webview action:
  - current-directory browser action `Import Local Folder Here`
  - selected-file actions `Export File`, `Copy This File`, `Move / Rename This File`, `Delete Remote File`
- Other:
  browser quick-pick parity for current-path actions and file action menus

### Happy Path

1. The user opens the repository browser and navigates to a directory.
2. For folder import, the browser action list exposes `Import Local Folder Here`.
3. The extension prompts for a local source folder, a child destination path under the current repository path, and a commit message.
4. The extension shows a confirmation that the import publishes files remotely and does not create a local working copy.
5. The extension runs `svn import` against the resolved repository URL and refreshes the browser to the imported destination path.
6. For file maintenance, the user opens a file entry action menu and chooses `Export File`, `Copy This File`, `Move / Rename This File`, or `Delete Remote File`.
7. The extension prompts as needed, executes the SVN command, and refreshes browser state after remote mutations.

### Error And Edge Cases

- Case: the chosen local folder for browser import is inside an existing SVN working copy.
- Expected behavior:
  reject the import before execution and direct the user toward normal working-copy flows.

- Case: the import destination path is empty, absolute, or contains `.` or `..`.
- Expected behavior:
  reject the input with the existing repository-path validation rules for child-relative inputs.

- Case: the file move or copy destination resolves to the same repository path or a descendant-like invalid path.
- Expected behavior:
  reject the input with existing repository mutation target validation.

- Case: the user exports a file and chooses an existing local destination path.
- Expected behavior:
  abort with the existing destination-exists warning.

- Case: the remote file delete fails because the path no longer exists or permissions changed.
- Expected behavior:
  surface the SVN error and preserve output-channel troubleshooting.

## Functional Requirements

- Add a current-directory repository browser action for importing a local folder into a child path under the current repository path.
- Reuse the same source-folder and commit-message semantics as the global import workflow.
- Add file entry actions for export, copy, move or rename, and delete.
- Reuse the existing repository browser path validation for file copy and move destinations.
- Refresh browser state after browser import, file copy, file move, and file delete.
- Do not refresh browser state after pure file export beyond any success notification.
- Preserve the existing browser action model instead of introducing a second browser-specific command surface.

## Out Of Scope

- File-level blame diff or remote patch application from the browser.
- Browser actions for importing arbitrary file subsets from a local folder.
- Automatic checkout after browser import without an explicit user choice.

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
  repository-browser import-here labels, file operation labels, prompts, confirmations, progress, and completion messages
- Updated copy:
  README and project baseline should describe repository-browser local import and file operations

## Technical Design

### Modules Affected

- `README.md`
- `docs/sdd/project-baseline.md`
- `docs/sdd/specs/2026-05-02-repository-browser-file-ops/spec.md`
- `docs/sdd/specs/2026-05-02-repository-browser-file-ops/tasks.md`
- `src/i18n.ts`
- `src/repository-browser/repository-browser-panel.ts`
- `src/scm/svn-checkout-utils.ts`
- `src/scm/svn-repository-browser.ts`
- `src/scm/svn-repository.ts`
- `src/test/svn-repository-browser.test.ts`

### Proposed Changes

- Extend repository browser action types and action builders with one current-directory import action and four file-entry actions.
- Add repository-side browser handlers for local-folder import under the current repository path.
- Reuse `SvnService.importToUrl(...)`, `copy(...)`, `moveUrl(...)`, `deleteUrl(...)`, and `export(...)` for browser file and import workflows.
- Reuse existing path-validation helpers and mutation finalization flows so browser refresh behavior stays consistent.
- Add local export destination prompts and repository-path destination prompts tailored for files.

### Data Or Message Flow

1. The repository browser dispatches a current-action or entry-action message.
2. `RepositoryBrowserPanel` decides whether the action should trigger a refresh after it completes.
3. `SvnRepository` gathers local or repository-path inputs, validates them, and invokes the matching SVN service call.
4. `SvnRepository` finalizes repository mutation side effects and returns the imported destination path when the browser should navigate there.
5. The panel refreshes browser data and keeps the visible repository state coherent.

### Alternatives Considered

- Alternative:
  add browser import as a separate global command with repository-path arguments
- Why rejected:
  the user is already inside the precise repository context, so the browser is the most natural place to launch the import.

- Alternative:
  limit file actions to export only
- Why rejected:
  export alone would still leave routine remote maintenance split across tools while directory maintenance was already in-browser.

## Testing Plan

- Unit tests:
  update repository-browser helper tests for the new current action and file entry actions
- Integration or command-path tests:
  rely on compile coverage for repository-side action plumbing
- Manual verification:
  import a local folder under the current repository path, export a file, copy a file, move a file, and delete a file while confirming browser refresh behavior

## Risks

- Risk:
  browser import could be mistaken for creating a local working copy
- Mitigation:
  keep explicit confirmation and success copy that states no local working copy is created

- Risk:
  adding more inline file actions can clutter the browser UI
- Mitigation:
  keep actions limited to common maintenance operations and reuse the existing icon-based action model

## Rollout Notes

- Migration needed:
  none
- Backward compatibility concern:
  low; this only adds repository-browser actions
- Follow-up work:
  drag-and-drop import, bulk remote file operations, and richer conflict-aware remote file inspection

## Open Questions

- None for this change.

## Implementation Tasks

- [x] Add spec and task tracking.
- [x] Extend repository browser action models for import-here and file operations.
- [x] Implement repository-side import-here, file export, file copy, file move, and file delete flows.
- [x] Add i18n strings and browser refresh rules for the new actions.
- [x] Update helper tests and run compile plus tests.
- [x] Update README and project baseline.
