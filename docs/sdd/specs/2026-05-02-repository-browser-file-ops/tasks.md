# Repository Browser File Operations And Local Import Tasks

## Status

- Spec: implemented
- Implementation: completed

## Task List

- [x] Add repository-browser current action support for importing a local folder into the current repository path.
- [x] Add repository-browser file actions for export, copy, move, and delete.
- [x] Reuse existing browser path-validation helpers for file copy and move targets.
- [x] Reuse the existing SVN service import, export, copy, move, and delete wrappers.
- [x] Add browser-specific prompts, confirmations, and success messages.
- [x] Refresh browser state after import, file copy, file move, and file delete.
- [x] Update repository-browser helper tests.
- [x] Run compile and tests.

## Acceptance Checklist

- [x] The browser exposes `Import Local Folder Here` for the current repository path.
- [x] Browser import rejects source folders that already belong to an SVN working copy.
- [x] Browser import states that it does not create a local working copy.
- [x] File entries expose export, copy, move, and delete actions.
- [x] File copy and move validate destination repository paths before SVN commands run.
- [x] File export warns before overwriting an existing local destination.
- [x] Browser refreshes after remote import and remote file mutations.
- [x] Errors remain diagnosable through the output channel.
