# SVN Ignore Editor

## Metadata

- Feature name: SVN Ignore Editor
- Owner: codetypess
- Date: 2026-04-28
- Status: Implemented
- Related issue:

## Summary

Add a dedicated `svn:ignore` editor so users can inspect and manage ignore rules without dropping down to the generic property editor. The feature should work from repository, explorer, and SCM entry points and should write normalized ignore rules back to the relevant versioned directory. This closes one of the most obvious SVN-specific workflow gaps in the current product.

## Problem Statement

- The extension currently supports generic property editing and one-click ignore or unignore flows.
- Those flows are useful for single names, but they are awkward for reviewing or maintaining a directory's full `svn:ignore` rule set.
- `svn:ignore` is one of the most frequently edited SVN properties and deserves a focused editor.
- This should be solved now because it is already identified as a known product gap and it improves both discoverability and correctness for ignore maintenance.

## Goals

- Add a dedicated command for editing `svn:ignore`.
- Provide a text-editor-like UI that treats ignore rules as one entry per line.
- Support opening the editor from repository-level, explorer, and SCM path contexts.
- Normalize, save, and refresh SCM state after edits.

## Non-Goals

- Editing `svn:externals` in this change.
- Implementing full glob validation or repository-specific ignore linting.
- Replacing the existing one-click ignore or unignore commands.

## Affected Workflow

State which baseline workflow this feature extends:

- Working copy maintenance

## User Stories

- As a developer maintaining a versioned directory, I want to edit all `svn:ignore` rules in one place so that I can review and clean up them as a set.
- As a developer working from an unversioned file entry, I want the editor to suggest the immediate child name that can be ignored so that I can turn an ad hoc ignore into an explicit rule set.

## Proposed UX

### Entry Points

- Command palette: `SVN Tree: Edit SVN Ignore Rules`
- SCM title/menu: repository working-copy actions
- Resource context menu: tracked and unversioned resources
- Webview action: none
- Other: explorer context menu for local files and folders

### Happy Path

1. The user runs `Edit SVN Ignore Rules` from a repository or path context.
2. The extension resolves the versioned directory that owns the `svn:ignore` property.
3. The extension opens a dedicated webview editor with the current ignore rules shown as one entry per line.
4. If the command came from a child path, the editor shows a suggested entry that can be added with one click.
5. The user edits the rules and clicks `Save`.
6. The extension normalizes and writes the `svn:ignore` property, deleting it if the rule set becomes empty.
7. The repository refreshes and SCM state updates.

### Error And Edge Cases

- Case: the command is run on a file path.
- Expected behavior: edit the parent versioned directory's `svn:ignore`.

- Case: the command is run on an unversioned nested path whose direct parent is also unversioned.
- Expected behavior: walk up to the nearest versioned directory and suggest the first child segment that can be ignored there.

- Case: the saved rule set is empty.
- Expected behavior: delete the `svn:ignore` property instead of writing an empty value.

## Functional Requirements

- Add a dedicated `Edit SVN Ignore Rules` command contribution.
- Support repository-level invocation against the repository root.
- Support path-level invocation against files and directories.
- Normalize saved entries by trimming, dropping blank lines, de-duplicating, and sorting.
- Delete `svn:ignore` when the normalized entry set is empty.
- Refresh SCM state after saving.
- Keep errors diagnosable through the existing output-channel-backed error flow.

## Out Of Scope

- Multiple-property editing in the same editor.
- Auto-generating ignore rules from Git-style templates.

## Command And Setting Impact

- New commands:
  `svn-tree.edit-ignore`
- Updated commands:
  none
- New settings:
  none
- Updated settings:
  none

## Localization Impact

- New i18n keys:
  command title, action labels, progress text, panel text, and saved status for the ignore editor
- Updated copy:
  README and baseline docs should mention the specialized `svn:ignore` editor

## Technical Design

### Modules Affected

- `package.json`
- `package.nls*.json`
- `src/scm/svn-repository-manager.ts`
- `src/scm/svn-repository.ts`
- `src/scm/svn-ignore-utils.ts`
- `src/scm/svn-ignore-editor-panel.ts`
- `src/i18n.ts`
- `src/test/svn-ignore-utils.test.ts`

### Proposed Changes

- Add a small ignore utility module for parsing, normalizing, serializing, and suggesting ignore entries.
- Add a lightweight dedicated webview panel for editing `svn:ignore`.
- Add a repository workflow that resolves the correct versioned directory, loads the current property value, and saves updates back through `SvnService`.
- Add manager command wiring and menu contributions for repository, explorer, and SCM contexts.
- Update docs to reflect that `svn:ignore` now has a specialized editor.

### Data Or Message Flow

1. VS Code invokes `svn-tree.edit-ignore`.
2. `SvnRepositoryManager` resolves the repository and optional path target.
3. `SvnRepository` resolves the property-owning directory and loads `svn:ignore`.
4. `SvnIgnoreEditorPanel` renders the current entries and handles save or reload requests.
5. Repository logic writes the normalized property value and refreshes SCM state.

### Alternatives Considered

- Alternative: reuse the generic property prompt flow.
- Why rejected: it is not workable for reviewing multiline ignore rules or editing them as a coherent list.

- Alternative: use an untitled text document plus ad hoc save commands.
- Why rejected: a dedicated webview gives explicit save semantics without relying on document-save interception.

## Testing Plan

- Unit tests:
  cover ignore entry normalization, serialization, and suggested-entry resolution
- Integration or command-path tests:
  rely on compile coverage for manager, repository, and panel integration
- Manual verification:
  open the editor from repository root, from a tracked file, and from an unversioned resource; save updated rules; clear all rules and confirm the property is deleted

## Risks

- Risk:
  unversioned nested paths can map to the wrong ignore directory.
- Mitigation:
  explicitly resolve the nearest versioned ancestor and derive the suggested child entry from that directory.

- Risk:
  the editor can drift from the actual property format.
- Mitigation:
  keep the normalization logic in a pure helper with direct tests.

## Rollout Notes

- Migration needed:
  none
- Backward compatibility concern:
  low; existing ignore and unignore commands remain available
- Follow-up work:
  add a matching specialized editor for `svn:externals`

## Open Questions

- None for this change.

## Implementation Tasks

- [x] Add the new command and menu contributions.
- [x] Add ignore-rule helper utilities and tests.
- [x] Implement a dedicated `svn:ignore` editor panel.
- [x] Wire save or reload flows through repository logic and SCM refresh.
- [x] Update docs and localization.
- [x] Run compile and tests.
