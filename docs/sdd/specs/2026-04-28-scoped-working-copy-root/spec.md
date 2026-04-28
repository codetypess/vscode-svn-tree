# Respect Workspace Subfolder Scope For SVN Repositories

## Metadata

- Feature name: Respect Workspace Subfolder Scope For SVN Repositories
- Owner: codetypess
- Date: 2026-04-28
- Status: Implemented
- Related issue:

## Summary

When the user adds a nested folder inside a larger SVN working copy to the workspace, the extension should treat that nested folder as the repository scope for status, incoming-change counts, and workspace-facing actions. The actual SVN working copy root must still be preserved separately for metadata and diagnostics. This prevents subtree workspaces from inheriting remote-change counts from their parent working copy root.

## Problem Statement

- `svn info` exposes both the requested path and the actual working copy root.
- The extension currently discards the requested path and normalizes every repository instance to `workingCopyRoot`.
- As a result, adding `C` from `A/B/C` into the workspace still scopes status and incoming changes to `A`.
- This makes SCM state noisy and incorrect for subtree workspaces.

## Goals

- Keep the workspace-added path as the repository scope root.
- Keep the actual SVN working copy root available separately.
- Scope local and remote status refreshes to the repository scope root.
- Allow nested workspace folders inside the same SVN working copy to register independently.

## Non-Goals

- Reworking SVN metadata parsing.
- Changing repository URL or repository-relative-path resolution semantics.
- Introducing special-case UI just for subtree workspaces.

## Affected Workflow

State which baseline workflow this feature extends:

- Working copy maintenance

## User Stories

- As a user who adds `C` from `A/B/C` to the workspace, I want incoming-change counts to reflect only `C` so that the SCM view matches the folder I opened.
- As a user with both `A` and `C` in the workspace, I want each scope to be tracked separately so that nested workspaces do not collapse into a single repository view.

## Proposed UX

### Entry Points

- Command palette: none
- SCM title/menu: existing repository entries should reflect the scoped folder label
- Resource context menu: unchanged
- Webview action: unchanged
- Other: repository discovery from workspace folders and checkout destinations

### Happy Path

1. The user adds a nested SVN-tracked folder `C` to the workspace.
2. The extension resolves `svn info` for `C` and stores both `rootPath = C` and `workingCopyRoot = A`.
3. The extension creates an SCM repository scoped to `C`.
4. Status refresh runs from `C`, so local and remote changes are limited to that subtree.
5. If the user also has `A` open, it remains a separate repository entry.

### Error And Edge Cases

- Case: the scope root is also the working copy root.
- Expected behavior: behavior stays unchanged.

- Case: multiple workspace folders belong to the same underlying working copy.
- Expected behavior: each workspace folder remains independently registered by scope root.

## Functional Requirements

- `SvnRepository.rootPath` must represent the workspace scope root, not always `workingCopyRoot`.
- `SvnRepositoryManager` must key discovered repositories by scope root.
- Repository watchers and URI-to-repository resolution must prefer the longest matching scope root.
- The actual `workingCopyRoot` must remain available in repository info and node info output.

## Out Of Scope

- Migrating already-opened panels between old and new scope identifiers.

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

- None.

## Technical Design

### Modules Affected

- `src/scm/svn-repository-manager.ts`
- `src/scm/svn-repository.ts`
- `src/test/svn-xml-parser.test.ts`

### Proposed Changes

- Preserve `info.rootPath` instead of overwriting it with `workingCopyRoot`.
- Use `info.rootPath` for repository registration keys, labels, source-control root URIs, refresh scope, and watcher scope.
- Continue storing `info.workingCopyRoot` separately for SVN metadata consumers.
- Add parser coverage that distinguishes the requested path from the actual working copy root.

### Data Or Message Flow

1. `svn info` returns both `rootPath` and `workingCopyRoot`.
2. The manager registers repositories by `rootPath`.
3. Repository refresh and repository resolution use `rootPath`.
4. UI and incoming-change counts now reflect the scoped workspace folder.

### Alternatives Considered

- Alternative: keep one repository per working copy root and only special-case remote counts.
- Why rejected: local and remote status scoping should stay consistent, and keyed deduplication would still collapse nested workspace folders.

## Testing Plan

- Unit tests:
  cover `parseInfoXml` with a nested workspace folder path
- Integration or command-path tests:
  compile coverage for repository registration and refresh scope changes
- Manual verification:
  open `A/B/C` as a workspace folder inside working copy `A` and confirm incoming changes scope to `C`

## Risks

- Risk:
  some repository operations now scope to the workspace folder rather than the full working copy root
- Mitigation:
  this is consistent with the user-selected workspace scope and matches status behavior

## Rollout Notes

- Migration needed:
  none
- Backward compatibility concern:
  low; full-root workspaces behave as before
- Follow-up work:
  add explicit tests around nested workspace folder discovery if manager-level test coverage is introduced later

## Open Questions

- None.

## Implementation Tasks

- [x] Preserve repository scope root from `svn info`.
- [x] Register repositories by scope root instead of working copy root.
- [x] Update repository UI/root getters to use the scope root.
- [x] Add parser coverage for nested workspace folder info.
- [x] Run compile and tests.
