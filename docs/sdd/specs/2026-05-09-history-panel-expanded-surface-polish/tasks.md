# History Panel Expanded Surface Polish Tasks

## Status

- Spec: completed
- Implementation: completed
- Verification: compile completed

## Task List

- [x] Add a dated SDD work item for the history panel expanded-surface styling change.
- [x] Remove the bordered rounded-card treatment from expanded history details.
- [x] Keep the expanded history surface on the default background and separate the details area with borders.
- [x] Run compile verification for the history panel styling change.
- [x] Update the spec index.

## Acceptance Checklist

- [x] Expanded history details no longer render inside a bordered rounded inner card.
- [x] Expanded history entries use the default background rather than a custom filled expanded surface.
- [x] The details area is separated by borders.
- [x] The summary/file split remains readable in the existing responsive layouts.
- [x] The repository compiles after the change.

## Verification

- `npm run compile`: passed
