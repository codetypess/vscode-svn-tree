# Specification-Driven Development Workflow

SDD means Specification-Driven Development in this repository. For any non-trivial feature, bug fix, refactor, architecture change, performance change, or product behavior change, write or update the relevant specification before implementation.

The goal is to make scope, expected behavior, technical trade-offs, tests, and acceptance criteria explicit before code starts drifting.

## When To Use SDD

Use SDD for:

- New user-facing features, commands, settings, views, panels, or context actions
- Behavior changes in working copy updates, commits, diffs, history, repository browsing, revision graph flows, patch workflows, or conflict handling
- Architecture, state-management, output-channel, progress-reporting, localization, build, or performance changes
- Bug fixes where the intended behavior is ambiguous or the change may affect nearby workflows
- Test changes that redefine expected behavior rather than simply extending coverage

An SDD is optional for tiny mechanical changes such as typo fixes, comment-only edits, or narrow metadata bumps. If a small change grows during implementation, add an SDD before continuing.

## Document Locations

- Workflow guide: `docs/spec-driven-development.md`
- Work-item specs: `docs/sdd/specs/YYYY-MM-DD-short-feature-name/`
- Spec index: `docs/sdd/specs/README.md`
- Current product baseline: `docs/sdd/project-baseline.md`
- Current architecture baseline: `docs/sdd/architecture-baseline.md`
- Spec template: `docs/sdd/templates/feature-spec-template.md`

Use dated, lowercase kebab-case folder names such as `2026-05-08-update-notification-output-action`.

## Status Flow

Each work-item specification should carry an explicit status.

- `Draft`: scope and decisions are still being shaped
- `Approved`: ready for implementation
- `Implementing`: code is being changed against this SDD
- `Verifying`: implementation is complete and checks are running
- `Done`: accepted and complete
- `Superseded`: replaced by another SDD

Do not treat the SDD as frozen. If implementation reveals a better decision, update the SDD first or in the same change so the document remains the source of truth.

## Default SDD Process

1. Define the problem, current behavior, desired behavior, and non-goals.
2. Check `docs/sdd/project-baseline.md` for the affected user workflows, commands, settings, and product constraints.
3. Check `docs/sdd/architecture-baseline.md` when the change touches ownership boundaries, data flow, module layering, output behavior, persistence, or webviews.
4. Create or update a dated spec folder under `docs/sdd/specs/` and write `spec.md` plus `tasks.md`.
5. Make design decisions explicit, including rejected alternatives when they matter.
6. Implement against the SDD and keep both `spec.md` and `tasks.md` synchronized with the actual work.
7. Verify against the acceptance criteria before marking the SDD `Done`.
8. Update the baseline documents in the same change when shipped behavior or architecture changes materially.

## Required Spec Package

Each non-trivial work item should have at least:

```text
docs/sdd/specs/YYYY-MM-DD-short-feature-name/
  spec.md
  tasks.md
```

Optional companion files are allowed when useful:

- `notes.md`
- `screens.md`
- `open-questions.md`

`spec.md` is the source of truth for behavior and design. `tasks.md` is the execution checklist.

## Required Sections For `spec.md`

Use the repository template unless the task is truly small. A normal `spec.md` should cover:

- Metadata: name, date, status, scope, and owner if relevant
- Context and current behavior
- Goals and non-goals
- Proposed behavior, including user flow and edge cases
- Command, setting, panel, output, and localization impact
- Technical design and affected modules
- Testing plan
- Acceptance criteria
- Risks, follow-up work, and any baseline document updates

## Expectations For `tasks.md`

`tasks.md` should translate the SDD into concrete implementation phases.

- Use checklists with observable exit criteria
- Keep tasks scoped to the approved behavior
- Mark completed work as the implementation lands
- Record deferred work explicitly instead of silently widening scope

## Acceptance Criteria Rules

Acceptance criteria should be observable. Prefer statements like:

- Running `npm run compile` succeeds.
- The new command appears in the intended command palette and SCM entry points.
- Updating a working copy shows the expected notification action and opens the `SVN Tree` output channel.
- Errors still surface through the standard output-backed notification flow.

Avoid vague criteria such as:

- The implementation is clean.
- Performance is good.
- UX feels better.

If performance or UX polish matters, name the flow and the validation method.

## Implementation Rules

- Start from the SDD before broad code changes.
- Keep implementation scoped to the SDD unless the user explicitly expands the task.
- Update the SDD when scope, behavior, or design decisions change.
- Add or update tests in the same change when acceptance criteria depend on them.
- Keep user-visible copy localized when the feature touches prompts, notifications, quick picks, or panels.
- Preserve output-channel, progress, and error behavior intentionally; do not leave them as incidental side effects.

## Review Checklist

Before considering SDD-based work complete, verify:

- The SDD status and scope match the implemented change.
- Goals, non-goals, and acceptance criteria are still accurate.
- `tasks.md` reflects what actually shipped.
- Tests and manual checks map back to the acceptance criteria.
- Product or architecture baseline documents were updated when required.
- Any deferred work is explicit and does not hide a broken acceptance criterion.
