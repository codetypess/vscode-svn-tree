# Checkout From URL Tasks

## Status

- Spec: implemented
- Implementation: completed

## Task List

- [x] Add `svn-tree.checkout-from-url` to `package.json`.
- [x] Add localized command title and workflow strings in `src/i18n.ts` and `package.nls*.json` if required by the command contribution path.
- [x] Add a manager-level command handler that does not depend on resolving an existing repository.
- [x] Implement prompts for:
  repository URL, revision, parent folder, destination folder name.
- [x] Reuse `SvnService.checkout(...)` for the actual checkout call.
- [x] Implement destination existence validation before running checkout.
- [x] Implement success actions:
  `Open Folder`, `Reveal In File Manager`.
- [x] Decide and implement repository refresh behavior after successful checkout into the active workspace tree.
- [x] Add tests for new helper logic.
- [x] Run compile and tests.

## Acceptance Checklist

- [x] The command is available from the command palette with no SVN working copy open.
- [x] Invalid URLs are rejected before checkout runs.
- [x] Invalid revisions are rejected before checkout runs.
- [x] Existing destination paths are rejected.
- [x] Successful checkout does not automatically replace the current workspace.
- [x] The success notification offers follow-up actions.
- [x] Errors remain diagnosable through the output channel.
