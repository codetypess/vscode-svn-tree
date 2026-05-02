# SVN Depth Workflows Tasks

## Status

- Spec: implemented
- Implementation: completed

## Task List

- [x] Extend checkout and update service methods with depth-aware options.
- [x] Add shared depth quick-pick option definitions.
- [x] Prompt for depth in checkout flows.
- [x] Add `Set SVN Depth` command routing for repository and path contexts.
- [x] Refresh repository state after depth changes.
- [x] Update docs and localization.

## Acceptance Checklist

- [x] Checkout flows can choose a non-default SVN depth.
- [x] Working-copy users can run `Set SVN Depth` on the repository root or a path.
- [x] `exclude` is not offered for the working copy root.
- [x] Depth changes refresh SCM state after execution.
