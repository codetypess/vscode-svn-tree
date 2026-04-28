# Delete Working Copy Files From SCM Tasks

## Status

- Spec: implemented
- Implementation: completed

## Task List

- [x] Update the `Delete Resource` SCM menu contribution so it appears for tracked changes.
- [x] Extend the delete-resource command handler to support both tracked and unversioned resources.
- [x] Route tracked deletes through `repository.delete(...)`.
- [x] Preserve disk deletion for unversioned resources.
- [x] Add helper logic to collapse nested selections and avoid redundant deletes.
- [x] Add unit tests for the helper.
- [x] Run compile and tests.

## Acceptance Checklist

- [x] `Delete Resource` is available from the SCM context menu for tracked changes.
- [x] Tracked deletes produce SVN delete state instead of only removing files from disk.
- [x] Unversioned deletes still remove files from disk.
- [x] Mixed selections do not double-delete nested paths.
- [x] Errors still surface through the standard output-channel-backed notification flow.
