# SVN Ignore Editor Tasks

## Status

- Spec: implemented
- Implementation: completed

## Task List

- [x] Add `svn-tree.edit-ignore` to commands and menus.
- [x] Add pure ignore normalization helpers.
- [x] Add a dedicated webview editor for `svn:ignore`.
- [x] Reuse SVN property APIs for load, save, and delete flows.
- [x] Refresh repository state after saves.
- [x] Update README and SDD baseline docs.
- [x] Run compile and tests.

## Acceptance Checklist

- [x] Users can open the `svn:ignore` editor from repository and path contexts.
- [x] The editor shows the current rule set as one entry per line.
- [x] Empty saves delete the property instead of writing an empty value.
- [x] Nested unversioned paths resolve to the nearest versioned directory with a useful suggested entry.
- [x] SCM state refreshes after saving.
