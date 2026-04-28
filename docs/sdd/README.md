# SDD

This repository will use SDD as its default delivery model.

In this project, SDD means Specification-Driven Development:

- Define the problem before changing code.
- Agree on scope, UX, and technical boundaries before implementation.
- Keep specs close to the codebase so decisions remain auditable.
- Update the baseline documents when product scope or architecture changes.

## Baseline Documents

- [Project Baseline](./project-baseline.md): current product scope, user workflows, constraints, and gaps.
- [Architecture Baseline](./architecture-baseline.md): current runtime structure, module boundaries, and technical risks.
- [Feature Spec Template](./templates/feature-spec-template.md): template for all new features and major refactors.
- [Specs Directory Guide](./specs/README.md): how to add new feature specs to this repository.

## Workflow

1. Create or update a spec before implementation.
2. Review the requested change against the project and architecture baselines.
3. Split the work into explicit implementation tasks.
4. Implement only the approved scope.
5. Verify with tests and manual checks.
6. Update the spec and baseline docs if the delivered behavior changed the product or architecture.

## When A Spec Is Required

A new spec is required for:

- New user-facing features.
- New commands, settings, or webviews.
- Non-trivial UX changes.
- Architectural refactors.
- Changes that affect SVN command behavior, state management, or performance characteristics.

A full spec is usually not required for:

- Small bug fixes with obvious behavior.
- Pure refactors with no behavior or interface changes.
- Test-only changes.
- Documentation-only edits outside the SDD baseline.

For borderline cases, default to writing the spec.

## Required Spec Sections

Every feature spec should cover:

- Problem statement and user value.
- Scope and non-goals.
- User flows and UI entry points.
- Command, setting, and localization impact.
- Architecture and module impact.
- Testing and verification plan.
- Open questions, risks, and rollout notes.

## Repository Convention

Place each new spec under `docs/sdd/specs/` using a dated folder:

```text
docs/sdd/specs/
  2026-04-28-checkout-from-url/
    spec.md
    tasks.md
    notes.md
```

Recommended file roles:

- `spec.md`: the authoritative feature definition.
- `tasks.md`: concrete implementation checklist.
- `notes.md`: optional research notes, tradeoffs, or follow-up items.

## Review Standard

Before code is considered ready:

- The spec must match the implemented behavior.
- Tests must cover changed logic where practical.
- User-visible copy must be included in i18n if needed.
- Command placement and discoverability must be intentional.
- Output, progress, and error behavior must be defined rather than incidental.

## Current Assumption

These documents assume the project is a VS Code extension that provides an SVN-focused SCM workflow, with the `svn` CLI as the execution backend. If that architecture changes materially, update the baseline documents first.
