# SDD

This directory contains the repository's SDD baselines, templates, and spec index.

Use [../spec-driven-development.md](../spec-driven-development.md) as the authoritative workflow guide for when SDD is required, how specs should move through status changes, and what must be verified before work is considered complete.

## Core Documents

- [Workflow Guide](../spec-driven-development.md): repository-wide SDD rules and review checklist.
- [Project Baseline](./project-baseline.md): current product scope, workflows, constraints, and known gaps.
- [Architecture Baseline](./architecture-baseline.md): runtime structure, module boundaries, and technical risks.
- [Feature Spec Template](./templates/feature-spec-template.md): starting point for new `spec.md` files.
- [Spec Index](./specs/README.md): current active and completed work-item specifications.

## Repository Convention

Store each non-trivial work item under `docs/sdd/specs/` using a dated folder:

```text
docs/sdd/specs/
  2026-05-08-short-feature-name/
    spec.md
    tasks.md
```

Optional companion files such as `notes.md` or `open-questions.md` are allowed when they help execution, but `spec.md` remains the behavioral source of truth.

## Local Rules

- Start from the workflow guide before broad code changes.
- Update the project baseline when shipped product behavior changes materially.
- Update the architecture baseline when module ownership, state flow, or runtime structure changes materially.
- Keep `tasks.md` synchronized with the actual implementation instead of treating it as a throwaway checklist.
