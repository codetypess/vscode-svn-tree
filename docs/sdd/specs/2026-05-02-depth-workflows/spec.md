# SVN Depth Workflows

## Metadata

- Feature name: SVN Depth Workflows
- Owner: codetypess
- Date: 2026-05-02
- Status: Implemented
- Related issue:

## Summary

Add depth-aware checkout prompts and a dedicated `Set SVN Depth` command so sparse SVN workflows can stay inside VS Code. This closes a practical gap for large repositories where fully recursive checkouts and updates are too heavy by default.

## Problem Statement

- Checkout already worked from URLs, history revisions, and the repository browser, but every checkout was implicitly fully recursive.
- Once a working copy existed, there was no in-product way to run `svn update --set-depth` on the root or a selected path.
- Large repositories need explicit sparse workflows to avoid over-fetching and to let users expand only the subtrees they actually need.

## Goals

- Let every checkout flow choose a checkout depth.
- Add a command for adjusting working-copy depth on the repository root or a selected path.
- Reuse the existing update progress and mutation finalization patterns.
- Keep the command surface small and consistent with the existing working-copy action model.

## Non-Goals

- Persisting preferred depth settings across sessions.
- Visual tree coverage or sparse-state overlays in the repository browser.
- Depth-aware export flows.

## Affected Workflow

State which baseline workflow this feature extends:

- Working copy maintenance

## User Stories

- As a developer checking out a large repository, I want to choose checkout depth up front so I can start with a sparse working copy.
- As a developer already inside a working copy, I want to expand or exclude paths by setting SVN depth so I can fetch only what I need.

## Proposed UX

### Entry Points

- Command palette: existing checkout command plus new `SVN Tree: Set SVN Depth`
- SCM title/menu: working-copy action entry for `Set SVN Depth`
- Resource context menu:
  path action entry for `Set SVN Depth`
- Other:
  checkout from history and repository-browser checkout now prompt for depth too

### Happy Path

1. The user starts a checkout flow.
2. The extension prompts for revision and then checkout depth.
3. The extension runs `svn checkout --depth ...`.
4. Later, the user invokes `Set SVN Depth` on the repository root or a selected path.
5. The extension prompts for the target depth and runs `svn update --set-depth ...`.
6. The working copy refreshes and the new sparse state is reflected in SCM.

### Error And Edge Cases

- Case: the user runs `Set SVN Depth` on the repository root.
- Expected behavior:
  do not offer `exclude`, because excluding the working copy root is not a meaningful workflow here.

- Case: the user runs `Set SVN Depth` on selected paths.
- Expected behavior:
  apply the chosen depth to the selected paths in one SVN command.

- Case: the SVN CLI rejects the requested depth change.
- Expected behavior:
  surface the CLI error through the existing output and error flows.

## Functional Requirements

- Add checkout depth prompts for global checkout, history checkout, and repository-browser directory checkout.
- Add a `Set SVN Depth` command.
- Allow depth values `empty`, `files`, `immediates`, and `infinity` for checkout.
- Allow `exclude` in `Set SVN Depth` when the target is not the working copy root.
- Refresh working-copy state after depth changes.

## Out Of Scope

- Depth badges or sparse-state visualization.
- Repository-browser depth mutation against remote repository paths.
- Automatic recent-depth memory or presets.

## Localization Impact

- New i18n keys:
  depth labels, depth descriptions, prompts, action labels, and progress messages
- Updated copy:
  README and baseline docs should mention depth-aware checkout and set-depth workflows

## Technical Design

### Modules Affected

- `README.md`
- `docs/sdd/project-baseline.md`
- `docs/sdd/specs/2026-05-02-depth-workflows/spec.md`
- `docs/sdd/specs/2026-05-02-depth-workflows/tasks.md`
- `package.json`
- `package.nls.json`
- `package.nls.zh-cn.json`
- `src/i18n.ts`
- `src/scm/svn-depth-utils.ts`
- `src/scm/svn-repository-manager.ts`
- `src/scm/svn-repository.ts`
- `src/svn/svn-service.ts`
- `src/svn/svn-types.ts`
- `src/test/i18n.test.ts`

### Proposed Changes

- Extend `SvnService.checkout(...)` and `SvnService.update(...)` with depth-aware options.
- Add shared depth option metadata for quick-pick prompts.
- Add a repository command for `svn update --set-depth`.
- Prompt checkout depth in every existing checkout flow.

## Testing Plan

- Unit tests:
  cover localization for the new depth action and labels
- Integration or command-path tests:
  rely on compile coverage for checkout and update call-site rewiring
- Manual verification:
  run sparse checkout with non-default depth, expand a subtree with `Set SVN Depth`, and exclude a selected path

## Risks

- Risk:
  another prompt could make ordinary checkout feel heavier
- Mitigation:
  keep the depth quick pick short and place the fully recursive option first

- Risk:
  `exclude` could be used too aggressively
- Mitigation:
  only offer it for non-root targets and keep the command explicit

## Implementation Tasks

- [x] Add depth-aware SVN service options and shared depth definitions.
- [x] Prompt for checkout depth in existing checkout flows.
- [x] Add the `Set SVN Depth` command and menu entries.
- [x] Refresh working-copy state after depth changes.
- [x] Update docs and localization.
