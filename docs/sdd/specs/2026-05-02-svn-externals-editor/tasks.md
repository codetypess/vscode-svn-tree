# SVN Externals Editor Tasks

## Status

- Spec: implemented
- Implementation: completed

## Task List

- [x] Add a dedicated `Edit SVN Externals` command.
- [x] Add a dedicated webview editor for `svn:externals`.
- [x] Reuse nearest-versioned-directory target resolution for directory-owned properties.
- [x] Normalize editor newlines while preserving raw definition lines.
- [x] Delete `svn:externals` when the editor is cleared.
- [x] Route `Edit Properties` for `svn:externals` to the dedicated editor.
- [x] Update docs and localization.
- [x] Run compile and tests.

## Acceptance Checklist

- [x] Users can open `Edit SVN Externals` from repository and path contexts.
- [x] The editor shows the owning versioned directory clearly.
- [x] Saving writes the raw multi-line property value.
- [x] Clearing the editor deletes `svn:externals`.
- [x] Generic `Edit Properties` no longer forces `svn:externals` through escaped single-line input.
- [x] Errors remain diagnosable through the output channel.
