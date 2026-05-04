# Patch Workflows Tasks

## Status

- Spec: implemented
- Implementation: completed

## Task List

- [x] Add `svn-tree.export-patch` and `svn-tree.apply-patch` to `package.json`.
- [x] Add localized command titles and prompt text in `package.nls.json` and `package.nls.zh-cn.json`.
- [x] Add repository-action and SCM-resource menu placement for patch export and apply.
- [x] Add a history revision action for `Export Patch`.
- [x] Add `src/scm/svn-patch-utils.ts` for:
  patch save-name derivation
  selected-resource scope normalization
  patch apply output summarization
- [x] Add `SvnService` helpers for:
  working-copy patch export
  history revision patch export
  patch support detection
  dry-run and real `svn patch`
- [x] Implement `SvnRepository` workflows for:
  repository export
  selected-resource export
  history revision export
  patch apply dry-run
  confirmed patch apply
- [x] Wire the new commands through `SvnRepositoryManager`.
- [x] Refresh repository state after real patch apply and warn when output indicates conflicts, fuzz, or rejects.
- [x] Update README and `docs/sdd/project-baseline.md` when the feature ships.
- [x] Add unit tests for patch helpers and any history-action routing touched by the feature.
- [x] Run compile and tests.

## Acceptance Checklist

- [x] `Export Patch` is available from repository actions and SCM path context where a versioned diff scope exists.
- [x] `Apply Patch To Working Copy` is available for repository-scoped workflows.
- [x] Exporting a patch previews the generated content before any file is written.
- [x] Empty patch results do not open a preview and instead show a clear warning.
- [x] History revision export respects the current history target path.
- [x] Patch apply checks client capability before prompting for apply details.
- [x] Patch apply always runs a dry-run before the real apply.
- [x] Dry-run results clearly show whether files are updated, merged, conflicted, or likely to produce reject files.
- [x] Successful real apply refreshes SCM status.
- [x] Raw SVN command output remains available in the output channel for troubleshooting.
