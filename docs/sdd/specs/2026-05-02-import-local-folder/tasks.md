# Import Local Folder Into Repository Tasks

## Status

- Spec: implemented
- Implementation: completed

## Task List

- [x] Add `svn-tree.import-local-folder` to `package.json`.
- [x] Add localized command title text in `package.nls.json` and `package.nls.zh-cn.json`.
- [x] Implement a manager-level command handler that does not depend on resolving an existing repository.
- [x] Add folder-selection, repository-URL, commit-message, and confirmation prompts for import.
- [x] Reuse or refactor the existing absolute SVN URL normalization helper for the import workflow.
- [x] Add a pure helper for default import commit-message generation and test it directly.
- [x] Detect and reject source folders that already belong to an SVN working copy.
- [x] Add `SvnService.importToUrl(sourcePath, targetUrl, message)` and route the workflow through it.
- [x] Refactor checkout-from-url flow so import success can launch checkout with the imported URL prefilled.
- [x] Add success actions:
  `Checkout Imported Repository`, `Copy Repository URL`.
- [x] Update README and `docs/sdd/project-baseline.md` when implementation lands.
- [x] Add tests for the new helper logic and any touched checkout helper behavior.
- [x] Run compile and tests.

## Acceptance Checklist

- [x] The command is available from the command palette with no SVN working copy open.
- [x] The workflow only accepts an existing local folder as the import source.
- [x] Source folders that belong to an SVN working copy are rejected before import runs.
- [x] Invalid repository URLs are rejected before import runs.
- [x] Empty commit messages are rejected before import runs.
- [x] The confirmation step states that import does not create a working copy.
- [x] Successful import does not automatically replace the workspace or open a checkout destination.
- [x] Successful import offers an explicit checkout follow-up action.
- [x] Errors remain diagnosable through the output channel.
