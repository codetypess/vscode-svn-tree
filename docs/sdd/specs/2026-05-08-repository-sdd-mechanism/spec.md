# Repository SDD Mechanism

Status: Done
Date: 2026-05-08
Owner: Repository maintainers
Scope: Establish repository-wide SDD workflow entry points, guide documents, and templates
Related issue: N/A

## 1. Context

This repository already has baseline SDD material under `docs/sdd/`, but it does not yet have the stronger workflow hooks and routing documents used in the reference repository `vscode-xlsx-diff`. That leaves the process discoverable only if contributors already know to browse `docs/sdd/`.

The repository needs an explicit, project-specific SDD mechanism that:

- routes coding agents and contributors into the workflow before non-trivial implementation work
- defines a single detailed workflow guide instead of spreading process rules across multiple partial docs
- keeps the existing `docs/sdd/` directory structure rather than replacing it with another repository's layout

## 2. Goals

- Make SDD a visible repository-level workflow rather than a hidden documentation island.
- Preserve the current project's `docs/sdd/` structure and baseline documents.
- Add a clear spec index and stronger template so future work items are easier to start and review.

## 3. Non-Goals

- Reorganize existing feature specs into a different directory model.
- Rewrite `docs/sdd/project-baseline.md` or `docs/sdd/architecture-baseline.md` in this change.
- Add automation, CI enforcement, or custom tooling for SDD validation.

## 4. Current Behavior

- User-facing behavior: contributors can find `docs/sdd/`, but there is no repository-root instruction file steering them there.
- Technical behavior: the repository has a baseline README, a specs README, and a template, but no single workflow guide comparable to the reference project.
- Known gap or failure mode: future contributors or coding agents may skip the SDD process because the entry points are weak and the workflow rules are distributed.

## 5. Proposed Behavior

### Entry Points

- Command palette: N/A
- SCM title or menus: N/A
- Resource context menu: N/A
- Webview or panel action: N/A
- Other: repository-root `AGENTS.md` and `CLAUDE.md`, plus README development links

### Happy Path

1. A contributor starts non-trivial work in the repository.
2. The repository-root agent instructions route them to `docs/spec-driven-development.md`.
3. The workflow guide sends them to the existing baselines, template, and spec index under `docs/sdd/`.
4. They create or update a dated work-item folder under `docs/sdd/specs/` and keep `spec.md` and `tasks.md` synchronized with the implementation.

### Edge Cases

- Case:
  A contributor opens `docs/sdd/` directly instead of the root instructions.
- Expected behavior:
  `docs/sdd/README.md` still points them to the authoritative workflow guide and supporting documents.

- Case:
  A contributor needs an example of a completed work item.
- Expected behavior:
  `docs/sdd/specs/README.md` provides a done index with links to prior shipped specs.

## 6. Commands, Settings, Output, And Localization Impact

- New commands: None
- Updated commands: None
- New settings: None
- Updated settings: None
- Output or progress behavior: None
- New i18n keys: None
- Updated copy: README development links and SDD documentation copy

## 7. Design

### Modules Affected

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/spec-driven-development.md`
- `docs/sdd/README.md`
- `docs/sdd/specs/README.md`
- `docs/sdd/templates/feature-spec-template.md`

### Key Decisions

- Decision:
  Add repository-root routing files, matching the reference project's discoverability pattern.
- Decision:
  Keep the authoritative workflow guide at `docs/spec-driven-development.md`, but retain all project-specific baselines and specs inside `docs/sdd/`.
- Decision:
  Convert `docs/sdd/specs/README.md` from a generic directory note into an active/done index for future work items.

### Data Or Message Flow

1. Contributor or agent hits root-level instructions.
2. Root instructions route into the detailed workflow guide.
3. The workflow guide routes into baseline docs, template, and spec index.
4. A dated spec folder becomes the work item's source of truth.

### Alternatives Considered

- Alternative:
  Copy the reference repository's `docs/spec/` file-per-spec layout directly.
- Why rejected:
  This repository already has a workable `docs/sdd/specs/<date-folder>/` convention, so replacing it would create churn without improving project fit.

## 8. Testing Plan

- Unit tests: None; documentation-only process change.
- Integration or command-path tests: None.
- Manual verification:
  Confirm all new links resolve within the repository and the index reflects the current shipped specs.

## 9. Acceptance Criteria

- `AGENTS.md` and `CLAUDE.md` route non-trivial work to the SDD workflow guide.
- `docs/spec-driven-development.md` defines when SDD is required, where documents live, how status flows work, and how work is reviewed in this repository.
- `docs/sdd/README.md`, `docs/sdd/specs/README.md`, and `docs/sdd/templates/feature-spec-template.md` align with the new workflow.
- The repository README exposes the SDD workflow entry point for contributors.

## 10. Risks And Follow-Up

- Risk:
  The workflow guide and the `docs/sdd/` entry docs could drift over time.
- Mitigation:
  Make `docs/spec-driven-development.md` the authoritative process guide and keep `docs/sdd/README.md` intentionally short.
- Follow-up:
  Consider CI or review automation later if the team wants to enforce SDD mechanically.

## 11. Baseline Updates

- Project baseline changes required: None
- Architecture baseline changes required: None
