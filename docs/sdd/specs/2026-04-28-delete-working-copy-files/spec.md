# Delete Working Copy Files From SCM

## Metadata

- Feature name: Delete Working Copy Files From SCM
- Owner: codetypess
- Date: 2026-04-28
- Status: Implemented
- Related issue:

## Summary

Add right-click delete support for both tracked working copy changes and unversioned files in the SCM view. Unversioned resources should continue to delete from disk, while tracked resources should use `svn delete` so the deletion is reflected in SVN status and can be committed. The workflow should also handle mixed multi-selection without double-deleting nested paths.

## Problem Statement

- The SCM view already supports deleting unversioned resources, but tracked changes do not offer a matching delete action.
- This forces users to leave the extension and delete tracked files from Explorer or the terminal, then come back to refresh SVN status.
- The current resource-delete implementation is also specialized to disk-only deletion, so it cannot be safely reused for tracked files as-is.
- This should be solved now because delete is a basic working-copy maintenance action and the missing parity is obvious in the SCM context menu.

## Goals

- Add `Delete Resource` to tracked change entries in the SCM resource context menu.
- Route tracked resource deletion through `svn delete --force`.
- Preserve disk deletion behavior for unversioned resources.
- Support mixed selections without duplicate or conflicting deletes.

## Non-Goals

- Adding delete actions for remote changes.
- Adding delete actions for conflict artifact helper files.
- Changing the existing group-level delete-all-unversioned workflow.

## Affected Workflow

State which baseline workflow this feature extends:

- Working copy maintenance

## User Stories

- As a developer reviewing local changes, I want to delete a tracked file directly from the SCM view so that SVN records the removal without leaving the extension.
- As a developer cleaning up generated files, I want unversioned files to remain deletable from the same context menu so that the workflow stays consistent.

## Proposed UX

### Entry Points

- Command palette: existing `SVN Tree: Delete Resource`
- SCM title/menu: none
- Resource context menu: add support for `svn-change` alongside the existing `svn-unversioned`
- Webview action: none
- Other: none

### Happy Path

1. The user right-clicks one or more SCM resources under `Changes` or `Unversioned`.
2. The user selects `Delete Resource`.
3. The extension shows a confirmation dialog that explains whether the selection will be removed from disk, scheduled for SVN deletion, or both.
4. For tracked resources, the extension runs `svn delete --force`.
5. For unversioned resources, the extension deletes them from disk using the existing trash-aware VS Code filesystem API.
6. The SCM view refreshes and reflects the new working copy state.

### Error And Edge Cases

- Case: the selection contains both tracked and unversioned resources.
- Expected behavior: tracked paths use `svn delete`; unversioned paths use disk deletion; nested paths should not be deleted twice.

- Case: the selection contains a tracked directory and an unversioned child inside it.
- Expected behavior: deleting the tracked directory should cover the child and the extension should skip a redundant second delete.

- Case: the delete operation fails because of filesystem or SVN errors.
- Expected behavior: show the standard error notification and preserve output-channel access.

## Functional Requirements

- Show `Delete Resource` for SCM resources with `scmResourceState == svn-change`.
- Continue showing `Delete Resource` for `svn-unversioned`.
- Use `SvnRepository.delete(...)` for tracked SCM resources.
- Continue using `vscode.workspace.fs.delete(...)` for unversioned SCM resources.
- Collapse nested selections so parent deletes win over child deletes.
- Refresh affected repositories after any disk-only deletion path completes.

## Out Of Scope

- Bulk delete at the SCM group level for tracked changes.
- Special-case UI for conflict states.

## Command And Setting Impact

- New commands:
  none
- Updated commands:
  `svn-tree.delete-resource`
- New settings:
  none
- Updated settings:
  none

## Localization Impact

- New i18n keys:
  delete confirmation detail text for tracked, unversioned, and mixed selections
- Updated copy:
  make the resource delete confirmation text generic so it works for both tracked and unversioned selections

## Technical Design

### Modules Affected

- `package.json`
- `src/scm/svn-repository-manager.ts`
- `src/scm/svn-delete-utils.ts`
- `src/i18n.ts`
- `src/test/svn-delete-utils.test.ts`

### Proposed Changes

- Broaden the SCM resource menu contribution so `Delete Resource` appears for tracked changes.
- Update the manager command handler to inspect the selected SCM resources, confirm once, and dispatch tracked versus unversioned deletes correctly.
- Add a small pure helper that partitions selected delete targets, collapses nested paths, and prevents redundant deletes when tracked parents already cover unversioned descendants.
- Add unit tests for the helper logic.

### Data Or Message Flow

1. VS Code invokes `svn-tree.delete-resource` from the SCM resource context menu.
2. `SvnRepositoryManager` resolves the selected `svn-change` and `svn-unversioned` resources.
3. The manager confirms the action and partitions the selected paths by delete mode.
4. The manager calls `repository.delete(...)` for tracked paths and `workspace.fs.delete(...)` for remaining unversioned paths.
5. The manager refreshes the affected repository state.

### Alternatives Considered

- Alternative: keep tracked delete out of the SCM menu and rely on Explorer deletes.
- Why rejected: it breaks the SCM workflow and forces users outside the extension for a basic action.

- Alternative: route both tracked and unversioned deletes through `workspace.fs.delete(...)`.
- Why rejected: tracked deletes must be represented in SVN metadata, not only on disk.

## Testing Plan

- Unit tests:
  add coverage for path partitioning, nested-path collapse, and mixed tracked/unversioned selections
- Integration or command-path tests:
  rely on existing manager command wiring plus compile coverage
- Manual verification:
  delete a tracked file, delete an unversioned file, and delete a mixed selection containing a tracked directory plus unversioned descendants

## Risks

- Risk:
  overlapping tracked and unversioned selections can cause duplicate deletes or noisy filesystem errors.
- Mitigation:
  collapse and partition selected paths before executing either delete mode.

- Risk:
  delete confirmation text may become ambiguous when one command serves multiple modes.
- Mitigation:
  keep the headline generic and use mode-specific detail text.

## Rollout Notes

- Migration needed:
  none
- Backward compatibility concern:
  low; this extends an existing command rather than replacing a workflow
- Follow-up work:
  decide whether conflict resources should expose the same delete action

## Open Questions

- None for this change.

## Implementation Tasks

- [x] Update the SCM resource menu contribution for tracked changes.
- [x] Extend `svn-tree.delete-resource` to support tracked and mixed selections.
- [x] Add a helper that partitions nested tracked and unversioned delete targets.
- [x] Add tests for the helper.
- [x] Run compile and tests.
