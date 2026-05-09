# Commit Picker Hide Unknown Kind Tasks

## Status

- Spec: implemented
- Implementation: completed

## Task List

- [x] Add a dated SDD work item for the commit picker unknown-kind display bug.
- [x] Extract commit quick-pick item mapping into a pure helper.
- [x] Suppress `detail` for `unknown` node kinds while preserving status descriptions and default selection.
- [x] Add regression coverage for commit quick-pick item formatting.
- [x] Update the spec index.
- [x] Run compile verification for the changed code paths.

## Acceptance Checklist

- [x] Commit quick-pick items no longer show `unknown` / `未知` as a detail line when SVN status omitted node-kind metadata.
- [x] Commit quick-pick items still show localized node-kind detail for concrete `file` and `dir` values.
- [x] The repository compiles after the change.
