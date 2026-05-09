# Commit Picker Hide Unknown Kind

Status: Done
Date: 2026-05-09
Owner: codetypess
Scope: Remove misleading `unknown` node-kind copy from the SCM commit file picker when SVN status data does not include a node kind
Related issue:

## 1. Context

The SCM commit flow lets users choose which changed files to include in a commit through a multi-select quick pick. The current implementation renders the SVN working-copy status as the item description and the parsed SVN node kind as the item detail.

For working-copy status data returned by `svn status --xml`, Subversion does not provide a `kind` attribute on each `<entry>`. Our XML parser therefore falls back to `unknown`, and the commit picker surfaces that fallback literally as localized UI copy (`未知` in Simplified Chinese).

This change adjusts shipped working-copy behavior, so it follows the repository SDD workflow and references:

- `docs/sdd/project-baseline.md`
- `docs/sdd/architecture-baseline.md`

The relevant product baseline is Working Copy Maintenance, specifically commit-all and commit-selected flows. The relevant architectural constraint is that SVN parsing remains in `src/svn/*`, while repository orchestration stays in `src/scm/svn-repository.ts`.

## 2. Goals

- Stop showing a misleading `unknown` node-kind label in the commit file picker.
- Preserve the existing commit file picker title, placeholder, default selection, and status descriptions.
- Keep the change scoped to the commit picker UI rather than redefining how SVN status parsing models missing node kinds globally.

## 3. Non-Goals

- Change `svn status --xml` parsing or invent synthetic node kinds for all status consumers.
- Add new commands, settings, prompts, or localization keys.
- Redesign the commit picker layout beyond suppressing the misleading detail line.

## 4. Current Behavior

- User-facing behavior:
  committable resources in the commit quick pick show a second line with the localized node kind, which becomes `unknown` / `未知` when SVN status entries do not include kind metadata.
- Technical behavior:
  `SvnRepository.pickPathsToCommit()` maps each `ScmResource` directly into a quick-pick item and always assigns `detail` from `i18n.formatNodeKind(resource.status.kind)`.
- Known gap or failure mode:
  users see `未知` even for normal files because the underlying SVN status payload omitted kind metadata rather than because the item itself is truly unknown.

## 5. Proposed Behavior

### Entry Points

- Command palette:
  existing `SVN Tree: Commit` flows only
- SCM title or menus:
  existing commit entry points only
- Resource context menu:
  existing commit-selected entry points only
- Webview or panel action:
  none
- Other:
  none

### Happy Path

1. The user starts a commit flow that opens the commit file picker.
2. Each committable resource still shows its relative path and localized SVN status.
3. If the resource node kind is `file` or `dir`, the picker may show the localized node-kind detail as before.
4. If the resource node kind is `unknown`, the picker omits the detail line instead of rendering `unknown`.

### Edge Cases

- Case:
  the parsed status entry has `kind: "unknown"` because `svn status --xml` omitted the attribute.
- Expected behavior:
  the quick-pick item has no `detail` text.

- Case:
  other repository surfaces still use `formatNodeKind("unknown")`.
- Expected behavior:
  they remain unchanged because this fix is intentionally scoped to the commit picker.

## 6. Commands, Settings, Output, And Localization Impact

- New commands: None
- Updated commands: commit flows keep the same entry points but no longer show `unknown` node-kind detail in the file picker
- New settings: None
- Updated settings: None
- Output or progress behavior: None
- New i18n keys: None
- Updated copy: None

## 7. Design

### Modules Affected

- `docs/sdd/specs/2026-05-09-commit-picker-hide-unknown-kind/spec.md`
- `docs/sdd/specs/2026-05-09-commit-picker-hide-unknown-kind/tasks.md`
- `docs/sdd/specs/README.md`
- `src/scm/commit-utils.ts`
- `src/scm/svn-repository.ts`
- `src/test/commit-utils.test.ts`

### Key Decisions

- Decision:
  keep `unknown` as the parser fallback in shared SVN types because other code may still rely on an explicit sentinel value.
- Decision:
  move commit quick-pick item mapping into a small pure helper so the display rule can be tested without instantiating `SvnRepository` or VS Code UI objects.
- Decision:
  suppress only the `unknown` node-kind detail; keep file and directory labels available when the status source actually provides them.

### Data Or Message Flow

1. `SvnRepository.pickPathsToCommit()` gathers committable `ScmResource` entries.
2. A commit utility helper maps the underlying status entries into quick-pick item data.
3. The helper formats the status label normally and omits `detail` when the node kind is `unknown`.
4. `showQuickPick(...)` renders those items without the misleading extra line.

### Alternatives Considered

- Alternative:
  change `toNodeKind(...)` so missing status-entry kinds default to `file`
- Why rejected:
  it would be an incorrect global inference for directories and could mislead other SVN status consumers.

- Alternative:
  perform a filesystem stat for each commit-picker entry to recover `file` or `dir`
- Why rejected:
  it adds avoidable I/O to a lightweight picker flow and still would not help deleted or missing entries consistently.

- Alternative:
  leave the current behavior because `unknown` is technically accurate
- Why rejected:
  it is accurate only about parser fallback state, not helpful to users choosing commit paths.

## 8. Testing Plan

- Unit tests:
  extend `src/test/commit-utils.test.ts` to cover commit quick-pick item mapping, including omission of `detail` for `unknown`
- Integration or command-path tests:
  rely on TypeScript compile coverage for repository wiring, plus a focused `node --test ./out/test/commit-utils.test.js` run after compile
- Manual verification:
  open the commit picker for modified and added files and confirm the `未知` line is gone when SVN status lacks kind metadata

Verification note:

- `npm test` still hits the repository's pre-existing plain-Node `vscode` module failure in `out/test/svn-service.test.js`, so this work item treats compile plus the focused commit-utils test file as the automated gate for the changed behavior.

## 9. Acceptance Criteria

- The commit file picker still shows committable paths pre-selected with their localized SVN status descriptions.
- Commit quick-pick items omit the detail line when the parsed node kind is `unknown`.
- Commit quick-pick items still show localized node-kind detail for `file` and `dir` inputs.
- `npm run compile` succeeds after the change.

## 10. Risks And Follow-Up

- Risk:
  users lose one line of metadata in the commit picker for status entries whose kind is unknown.
- Mitigation:
  the hidden detail is only the misleading fallback label; the primary path and change status remain visible.
- Follow-up:
  if another workflow needs reliable file-vs-directory labels from status entries, design that as a separate spec with explicit data-source rules.

## 11. Baseline Updates

- Project baseline changes required: None
- Architecture baseline changes required: None
