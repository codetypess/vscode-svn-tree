# SVN Externals Editor

## Metadata

- Feature name: SVN Externals Editor
- Owner: codetypess
- Date: 2026-05-02
- Status: Implemented
- Related issue:

## Summary

Add a dedicated `svn:externals` editor so users can inspect and update multi-line external definitions without forcing them through the generic escaped property prompt. The feature should work from repository and path contexts, resolve to the owning versioned directory, and keep the saved property value explicit and reversible.

## Problem Statement

- `svn:externals` is already exposed as a built-in property name, but the current edit flow relies on a single-line input box with escaped newlines.
- That generic flow is awkward for a property that is naturally maintained as raw multi-line text.
- The project already introduced a specialized `svn:ignore` editor, so `svn:externals` stands out as the next obvious SVN-specific property that deserves a dedicated surface.

## Goals

- Add a dedicated command for editing `svn:externals`.
- Open a dedicated multi-line editor that targets the nearest versioned directory owning the property.
- Allow users to clear the editor to delete the property.
- Route `Edit Properties` to the dedicated editor when the selected property name is `svn:externals`.

## Non-Goals

- Building a structured parser or form-based editor for every `svn:externals` syntax variant.
- Validating repository URLs or revision flags inside each external definition.
- Resolving, previewing, or checking out externals directly from the editor.

## Affected Workflow

State which baseline workflow this feature extends:

- Working copy maintenance

## User Stories

- As a developer maintaining a working copy, I want to edit `svn:externals` as real multi-line text so I can review and update external definitions without escaping newlines by hand.
- As a developer selecting a path inside a working copy, I want the editor to resolve to the versioned directory that owns the property so I can start from the file or folder I am already working in.

## Proposed UX

### Entry Points

- Command palette: `SVN Tree: Edit SVN Externals`
- SCM title/menu: repository actions working-copy category
- Resource context menu:
  path submenu alongside `Edit Properties` and `Edit SVN Ignore Rules`
- Other:
  when `Edit Properties` selects `svn:externals`, open the dedicated editor instead of the generic input box

### Happy Path

1. The user runs `Edit SVN Externals` from a repository, directory, or file context.
2. The extension resolves the nearest versioned directory that owns the `svn:externals` property.
3. The editor opens with the raw property value as multi-line text.
4. The user edits definitions and saves.
5. The extension writes the updated property value and refreshes repository state.
6. If the editor becomes empty, the extension deletes `svn:externals` instead of saving an empty value.

### Error And Edge Cases

- Case: the command is triggered from a file path.
- Expected behavior:
  resolve the parent versioned directory and edit the property there.

- Case: the editor only contains whitespace or blank lines.
- Expected behavior:
  delete the property instead of saving an empty string.

- Case: the user enters syntactically invalid SVN externals content.
- Expected behavior:
  let the SVN CLI reject it and surface the underlying error in the normal output and error flows.

## Functional Requirements

- Add a dedicated `Edit SVN Externals` command contribution.
- Add a dedicated webview editor for `svn:externals`.
- Resolve editor targets to the nearest versioned directory inside the current working copy.
- Save the property value as raw multi-line text with normalized newlines.
- Delete `svn:externals` when the editor content is empty after normalization.
- Reuse existing progress, error, and repository refresh flows.

## Out Of Scope

- Semantic linting for externals syntax.
- A table-based or tokenized editor UI.
- Remote repository-browser editing of externals values.

## Command And Setting Impact

- New commands:
  `Edit SVN Externals`
- Updated commands:
  `Edit Properties` routes to the dedicated editor when the property name is `svn:externals`
- New settings:
  none
- Updated settings:
  none

## Localization Impact

- New i18n keys:
  editor title, labels, hints, progress, completion, and action descriptions for `svn:externals`
- Updated copy:
  README and baseline docs should mention the dedicated `svn:externals` editor

## Technical Design

### Modules Affected

- `README.md`
- `docs/sdd/project-baseline.md`
- `docs/sdd/specs/2026-05-02-svn-externals-editor/spec.md`
- `docs/sdd/specs/2026-05-02-svn-externals-editor/tasks.md`
- `package.json`
- `package.nls.json`
- `package.nls.zh-cn.json`
- `src/i18n.ts`
- `src/scm/svn-externals-editor-panel.ts`
- `src/scm/svn-externals-utils.ts`
- `src/scm/svn-repository-manager.ts`
- `src/scm/svn-repository.ts`
- `src/test/i18n.test.ts`
- `src/test/svn-externals-utils.test.ts`

### Proposed Changes

- Add a lightweight dedicated webview panel for editing `svn:externals`.
- Reuse the existing nearest-versioned-directory resolution used by specialized property editors.
- Add a small normalization helper that preserves user-entered lines while normalizing newlines and collapsing empty editor content to property deletion.
- Add a first-class command and repository action entry point.
- Route generic property editing to the specialized editor when `svn:externals` is selected.

### Data Or Message Flow

1. The user invokes `Edit SVN Externals` or selects `svn:externals` from `Edit Properties`.
2. `SvnRepositoryManager` resolves the repository or path target and calls `SvnRepository.editExternalsDefinitions(...)`.
3. `SvnRepository` resolves the owning versioned directory, loads the property, and opens `SvnExternalsEditorPanel`.
4. The panel posts save or reload requests back to the extension host.
5. `SvnRepository` writes or deletes `svn:externals`, refreshes repository state, and pushes updated editor state back to the panel.

### Alternatives Considered

- Alternative:
  keep `svn:externals` inside the generic property prompt
- Why rejected:
  multi-line externals definitions are a poor fit for escaped single-line editing and would leave an obvious usability gap beside the `svn:ignore` editor.

- Alternative:
  build a fully structured editor with parsed columns for local path, URL, and revision flags
- Why rejected:
  `svn:externals` syntax variants are broad enough that a raw multi-line editor is the safer first step.

## Testing Plan

- Unit tests:
  add focused normalization tests for the externals editor helper and extend i18n coverage for the new action label
- Integration or command-path tests:
  rely on compile coverage for command registration and repository-side wiring
- Manual verification:
  open the editor from repository and path contexts, save multi-line content, clear the editor to delete the property, and select `svn:externals` from `Edit Properties`

## Risks

- Risk:
  the editor still accepts invalid externals syntax
- Mitigation:
  keep the UI explicit that it edits raw property text and rely on the SVN CLI to validate semantics

- Risk:
  users may expect this to apply directly to a selected file
- Mitigation:
  show the owning directory clearly in the editor header and metadata section

## Rollout Notes

- Migration needed:
  none
- Backward compatibility concern:
  low; this adds a command and redirects one specific property name to a specialized editor
- Follow-up work:
  deeper externals syntax assistance, preview tooling, or repository-browser property editing

## Open Questions

- None for this change.

## Implementation Tasks

- [x] Add spec and task tracking.
- [x] Add a dedicated `svn:externals` editor panel and normalization helper.
- [x] Implement repository-side load/save/delete flows for `svn:externals`.
- [x] Add command and menu contributions.
- [x] Route `Edit Properties` for `svn:externals` to the specialized editor.
- [x] Update docs and focused tests.
