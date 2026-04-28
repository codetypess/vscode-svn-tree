# Respect Workspace Subfolder Scope For SVN Repositories Tasks

## Status

- Spec: implemented
- Implementation: completed

## Task List

- [x] Preserve `rootPath` from `svn info`.
- [x] Stop deduplicating repositories solely by `workingCopyRoot`.
- [x] Scope SCM repositories, refreshes, and watchers by the workspace folder path.
- [x] Add test coverage for nested folder info parsing.
- [x] Run compile and tests.

## Acceptance Checklist

- [x] Adding `C` from `A/B/C` does not collapse to `A` in repository registration.
- [x] Incoming-change calculation scopes to the dragged-in folder.
- [x] Actual working copy root metadata remains available separately.
- [x] Full-root workspaces continue to behave normally.
