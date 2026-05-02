# Structured SVN Externals Editor

## Metadata

- Feature name: Structured SVN Externals Editor
- Owner: codetypess
- Date: 2026-05-02
- Status: Implemented
- Related issue:

## Summary

Extend the dedicated `svn:externals` editor with a structured editing mode for common externals definitions while preserving a raw-text fallback for lines that cannot be parsed safely. This keeps the editor useful for everyday externals maintenance without pretending the SVN externals grammar is smaller than it is.

## Problem Statement

- The dedicated `svn:externals` editor already removed the worst UX problem of escaped newlines, but it still forced users to hand-edit raw text for every change.
- Most common externals definitions follow simple two-token patterns with an optional `-r` revision and can be edited more safely through structured fields.
- SVN externals syntax still has edge cases, so the editor cannot assume every line is safely representable as a rigid form.

## Goals

- Add a structured mode that parses and edits common `svn:externals` definitions.
- Preserve the existing raw-text mode as a safe fallback.
- Detect lines that cannot be parsed safely and keep them in raw mode.
- Reuse one parser/serializer for editor state and tests.

## Non-Goals

- Full semantic validation of all SVN externals syntax variants.
- Resolving repository URLs, branches, or peg revisions during editing.
- A repository-browser editor for remote `svn:externals` properties.

## Affected Workflow

State which baseline workflow this feature extends:

- Working copy maintenance

## User Stories

- As a developer maintaining externals, I want common definitions to appear as editable fields so I can update local path, source, and revision without rewriting whole lines.
- As a developer with unusual externals syntax, I want a raw mode fallback so the editor never blocks legitimate SVN syntax that the structured parser does not understand.

## Proposed UX

### Entry Points

- Command palette: existing `SVN Tree: Edit SVN Externals`
- SCM title/menu: existing working-copy action entry
- Resource context menu: existing path action entry
- Other:
  the existing dedicated externals editor opens in structured mode when the current property value is parseable

### Happy Path

1. The user opens `Edit SVN Externals`.
2. If the current property value only contains common parseable definitions, the editor opens in structured mode.
3. The user edits local path, source, row order format, or optional revision per definition.
4. The editor serializes the structured rows back into raw SVN property text on save.
5. If the user needs a syntax variant the structured form cannot represent, they switch to raw mode and save the raw text directly.

### Error And Edge Cases

- Case: the property contains lines the parser cannot safely represent.
- Expected behavior:
  keep the editor in raw mode and show which lines blocked structured parsing.

- Case: the user leaves a structured row incomplete.
- Expected behavior:
  disable save until the row has both local path and source.

- Case: the property is empty.
- Expected behavior:
  allow structured mode with zero rows and let save delete the property as before.

## Functional Requirements

- Add a parser for common externals lines covering source-first and local-first forms with optional `-r` revisions.
- Add a serializer that preserves row order and the parsed line format.
- Extend the editor state with structured parse results and invalid raw lines.
- Add structured and raw editor modes with safe switching behavior.
- Do not discard unparseable lines silently.

## Out Of Scope

- Parsing externals definitions with spaces inside path tokens.
- Row reordering via drag and drop.
- Source browsing, completion, or validation against the repository.

## Localization Impact

- New i18n keys:
  mode labels, structured field labels, warnings, row actions, and depth-independent editor copy

## Technical Design

### Modules Affected

- `docs/sdd/specs/2026-05-02-structured-externals-editor/spec.md`
- `docs/sdd/specs/2026-05-02-structured-externals-editor/tasks.md`
- `src/i18n.ts`
- `src/scm/svn-externals-editor-panel.ts`
- `src/scm/svn-externals-utils.ts`
- `src/scm/svn-repository.ts`
- `src/test/svn-externals-utils.test.ts`

### Proposed Changes

- Expand the externals utility module with parse and serialize helpers.
- Extend the dedicated editor panel with dual-mode state and structured row editing.
- Keep repository save and reload flows centered on raw SVN property text, with structured state derived from that source of truth.

## Testing Plan

- Unit tests:
  cover parsing and serialization for source-first and local-first definitions plus invalid lines
- Integration or command-path tests:
  rely on compile coverage for repository wiring and panel state integration
- Manual verification:
  edit parseable externals rows in structured mode, switch to raw mode, and verify unparseable lines stay raw

## Risks

- Risk:
  the structured parser may accept too few valid lines
- Mitigation:
  raw mode remains available and structured mode only activates when parsing is safe

- Risk:
  structured serialization could rewrite definitions in unexpected order or format
- Mitigation:
  preserve row order and line format explicitly in the parsed state

## Implementation Tasks

- [x] Add externals parse and serialize helpers.
- [x] Extend the editor panel with structured mode and raw fallback.
- [x] Prevent silent loss of unparseable lines.
- [x] Add focused parser tests and localization coverage.
