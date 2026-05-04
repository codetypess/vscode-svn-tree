# Patch Workflows

## Metadata

- Feature name: Patch Workflows
- Owner: codetypess
- Date: 2026-05-04
- Status: Implemented
- Related issue:

## Summary

Add a first-class patch workflow so SVN Tree can move changes in and out of a working copy without forcing users back to the terminal. V1 covers three practical paths: export a patch from current working-copy changes, export a patch from a history revision scoped to the current history target, and apply a patch file to the current working copy through `svn patch`. The first version should stay conservative and reuse native text-document previews plus a dry-run summary rather than introducing a dedicated patch webview.

## Problem Statement

- The extension already covers status, diff, history, merge, repository browsing, locks, properties, and conflict handling, but it still cannot exchange changes as patch files.
- Patch files remain a common SVN workflow for review handoff, vendor drops, backports, partial code sharing, and environments where users cannot or should not switch branches or grant direct repository access.
- Without patch support, users must leave VS Code for one of Subversion's most durable day-to-day workflows.
- `docs/sdd/project-baseline.md` already lists patch-oriented workflows as a known product gap, so the feature is aligned with the current roadmap rather than expanding scope sideways.

## Goals

- Export the current working-copy diff as a patch from either the whole repository or a selected set of versioned paths.
- Export a revision patch from the history panel, scoped to the current history target path.
- Preview generated patch content before the user writes it to disk.
- Apply an existing patch file to the current working copy using `svn patch`.
- Run a patch dry-run before mutating the working copy and summarize the predicted result.
- Surface conflicts, fuzz, and rejects clearly without trying to resolve them automatically.

## Non-Goals

- Shelve or unshelve stacks, named patch shelves, or patch history management.
- Applying a patch from clipboard contents or an untitled editor.
- A dedicated patch webview or embedded merge editor.
- Revision-graph patch export in v1.
- Automatic conflict resolution, reject-file cleanup, or follow-up merge assistance after apply.
- Generic patch-tool optimization such as defaulting export to `svn diff --patch-compatible`.

## Affected Workflow

State which baseline workflow this feature extends:

- Working copy maintenance
- History inspection

## User Stories

- As a developer with uncommitted SVN changes, I want to export a patch for selected files so that I can send a narrow change set for review or handoff.
- As a maintainer inspecting history, I want to export revision `rN` as a patch so that I can backport or audit the exact change without leaving VS Code.
- As a developer receiving a patch file, I want to dry-run and then apply it to my working copy so that I can catch path or context problems before the patch mutates local files.

## Proposed UX

### Entry Points

- Command palette:
  `SVN Tree: Export Patch`
  `SVN Tree: Apply Patch To Working Copy`
- SCM title/menu:
  repository actions under the existing changes submenu for repository-scoped export and apply
- Resource context menu:
  `Export Patch` for selected SCM change resources that map to versioned paths
- Webview action:
  history panel revision action `Export Patch`
- Other:
  none in v1

### Happy Path

1. The user triggers `Export Patch` from a repository action, SCM resource selection, or history revision.
2. The extension resolves the patch scope:
   - working copy root when launched from repository actions
   - selected versioned paths when launched from SCM resources
   - current history target plus selected revision when launched from history
3. The repository generates patch text through the SVN CLI.
4. If the patch is empty, the workflow stops with a `no changes` warning.
5. The extension opens a preview text document using diff syntax so the user can inspect the patch content.
6. The extension offers `Save Patch...` as an explicit follow-up action.
7. If the user chooses to save, the extension opens a save dialog with a suggested `.patch` filename and writes the exact previewed content.

8. The user triggers `Apply Patch To Working Copy`.
9. The extension verifies that the current SVN client supports `svn patch`.
10. The extension prompts for a patch file and gathers minimal apply options:
    - strip count, default `0`
    - normal apply or reverse apply
11. The extension runs `svn patch --dry-run` with those options against the repository root.
12. The extension opens a summary preview that includes:
    - patch file path
    - working-copy root
    - selected options
    - per-file result lines and detected warning indicators such as `C` or `>`
13. The user confirms `Apply Patch`.
14. The extension runs the real `svn patch` command with the same options.
15. The repository refreshes status and shows a completion message. If the output indicates conflicts, fuzz, or reject files, the message becomes a warning and directs the user to inspect the working copy.

### Error And Edge Cases

- Case: the current SVN client does not support `svn patch`.
- Expected behavior: `Apply Patch To Working Copy` aborts before file selection with a clear warning. Export still remains available.

- Case: `Export Patch` is launched from SCM selections that do not include any versioned diffable paths.
- Expected behavior: abort with a warning instead of generating an empty or misleading patch.

- Case: generated patch text is empty.
- Expected behavior: show a `no local differences` or `no revision differences` warning and do not open a preview.

- Case: the patch file path is missing, unreadable, or no longer exists when apply starts.
- Expected behavior: abort cleanly and surface an actionable error.

- Case: the dry-run fails because of malformed patch content, strip mismatch, or context mismatch.
- Expected behavior: open the dry-run output in a summary document, do not run the real apply, and direct the user to adjust options or patch contents.

- Case: the real apply succeeds but reports `C` conflict lines or creates `.svnpatch.rej` files.
- Expected behavior: refresh repository status, show a warning-level completion message, and do not attempt automatic resolution.

- Case: the patch is large.
- Expected behavior: use normal editor previews and save dialogs; avoid custom rendering or eager secondary analysis beyond a lightweight result summary.

## Functional Requirements

- Contribute a repository-scoped `svn-tree.export-patch` command.
- Contribute a repository-scoped `svn-tree.apply-patch` command.
- Contribute a history action that exports the selected revision as a patch for the current history target.
- Allow working-copy export from:
  whole repository
  selected SCM change resources that resolve to versioned paths
- Generate working-copy export using `svn diff` without forcing `--patch-compatible`, so SVN property diffs remain round-trippable through `svn patch`.
- Generate history export using a revision-scoped SVN diff for the current history target.
- Open generated patches in a preview text document using `diff` language mode.
- Offer an explicit save step after preview rather than writing a file immediately.
- Suggest a sensible default save name for working-copy and revision patches.
- Detect patch-command support before any apply-specific prompts that imply success is possible.
- Apply patches at the working-copy root so SVN can resolve relative patch paths consistently.
- Support `--strip N` and `--reverse-diff` in v1.
- Always run `svn patch --dry-run` before the real apply.
- Summarize dry-run and apply output by recognizing Subversion's per-file action letters:
  `A`, `D`, `U`, `C`, `G`
  and advisory `>` lines for fuzz or offset application
- Refresh SCM state after a successful real apply.
- Preserve raw CLI output in the existing output channel for troubleshooting.
- Keep all user-visible copy localized through the existing i18n pathway.

## Out Of Scope

- A new patch shelf data model or on-disk patch registry.
- Multi-repository patch apply from a single command.
- Apply options beyond `strip` and `reverse` in v1, such as `--ignore-whitespace`.
- Exporting revision-graph compare diffs directly as patch files.
- Auto-opening reject files or conflict inspectors after patch apply.

## Command And Setting Impact

- New commands:
  `svn-tree.export-patch`
  `svn-tree.apply-patch`
- Updated commands:
  history revision actions gain `Export Patch`
- New settings:
  none
- Updated settings:
  none

## Localization Impact

- New i18n keys:
  command titles, no-diff warnings, patch preview titles, save labels, patch support warning, patch-file picker prompts, strip-count prompts and validation, reverse-apply labels, dry-run summary headings, apply result messages, and conflict/reject warnings
- Updated copy:
  README and `docs/sdd/project-baseline.md` should mention patch workflows after implementation lands

## Technical Design

### Modules Affected

- `README.md`
- `docs/sdd/project-baseline.md`
- `package.json`
- `package.nls.json`
- `package.nls.zh-cn.json`
- `src/history/history-panel.ts`
- `src/history/history-panel-webview.tsx`
- `src/history/history-webview-context-menu.tsx`
- `src/history/history-webview-types.tsx`
- `src/scm/svn-repository-manager.ts`
- `src/scm/svn-repository.ts`
- `src/scm/svn-patch-utils.ts`
- `src/svn/svn-service.ts`
- `src/test/history-webview-utils.test.ts`
- `src/test/svn-patch-utils.test.ts`

### Proposed Changes

- Add command contributions and menu placement for repository-level export/apply and SCM resource export.
- Extend history actions so a selected revision can request patch export for the current history target.
- Add a focused helper module for:
  default patch file naming
  selected-resource scope normalization
  patch output summarization for `svn patch`
- Extend `SvnService` with dedicated patch helpers instead of overloading the current two-target diff wrapper:
  one helper for working-copy diff export
  one helper for history revision diff export
  one helper to detect patch support
  one helper to run `svn patch` with dry-run or real-apply options
- Keep orchestration in `SvnRepository`, because patch export and apply are repository-scoped workflows that need prompts, previews, CLI calls, and refresh behavior.
- Reuse plain text editor previews instead of adding a new webview or custom virtual-document protocol.
- Reuse existing output-channel and notification conventions so failures stay diagnosable.

### Data Or Message Flow

1. VS Code invokes `svn-tree.export-patch` or `svn-tree.apply-patch`, or the history panel posts an `export-patch` action.
2. `SvnRepositoryManager` resolves the repository target and delegates to `SvnRepository`.
3. `SvnRepository` resolves scope and options, then calls the appropriate `SvnService` helper.
4. For export, the repository opens a preview document and optionally writes the file after explicit user confirmation.
5. For apply, the repository runs dry-run first, opens a result summary, then conditionally runs the real apply and refreshes status.
6. Output and errors flow through the existing output channel and notification paths.

### Alternatives Considered

- Alternative:
  export patch files directly to disk without a preview step
- Why rejected:
  the feature should let users inspect exactly what will be written, and the project already favors visible, user-confirmed workflows for impactful operations

- Alternative:
  default export to `svn diff --patch-compatible`
- Why rejected:
  preserving SVN property diffs is more important in v1 than maximizing generic third-party patch-tool compatibility

- Alternative:
  run `svn patch` immediately without dry-run
- Why rejected:
  it increases surprise, reject files, and support load for a workflow that often fails because of path or context drift

- Alternative:
  build a dedicated patch webview
- Why rejected:
  native editor previews already fit patch text well, keep scope smaller, and avoid adding another message-driven UI surface

## Testing Plan

- Unit tests:
  cover patch save-name derivation, selected-scope normalization, strip-count validation, and patch output summary parsing
- Integration or command-path tests:
  cover history-action routing, manager command resolution, and repository helper branching for export versus apply
- Manual verification:
  export a repository patch with local edits, export a selected-path patch, export a history revision patch, dry-run a clean patch, dry-run a patch with strip mismatch, apply a reverse patch, and verify warning behavior when dry-run or real apply reports conflicts or rejects

## Risks

- Risk:
  `svn patch` support varies across installed SVN client versions
- Mitigation:
  gate the apply workflow behind an explicit capability check and keep export independent from apply support

- Risk:
  dry-run and apply output may vary slightly across platforms or SVN minor versions
- Mitigation:
  parse only the stable leading action markers and preserve the full raw output in the output channel and preview summary

- Risk:
  patch export from selected SCM resources can become ambiguous when the selection mixes versioned and unversioned files
- Mitigation:
  normalize to versioned diffable paths only and warn when nothing exportable remains

## Rollout Notes

- Migration needed:
  none
- Backward compatibility concern:
  low; the feature adds commands and history actions without changing existing diff, history, or merge behavior
- Follow-up work:
  shelve workflows, revision-graph patch export, generic patch-compatibility export mode, richer patch-apply options, and conflict-aware post-apply guidance

## Open Questions

- None for v1.

## Implementation Tasks

- [ ] Add new command contributions and localized titles for patch export and apply.
- [ ] Add history action wiring for revision patch export.
- [ ] Add `SvnService` helpers for working-copy diff export, revision diff export, patch support detection, and patch apply.
- [ ] Add patch utility helpers for file naming, scope normalization, and apply-output parsing.
- [ ] Implement repository workflows for patch export preview, save, dry-run summary, and real apply.
- [ ] Refresh SCM state and surface warning-level completion when apply output includes conflicts, fuzz, or rejects.
- [ ] Update README and project baseline after implementation lands.
- [ ] Add targeted tests and run compile plus tests.
