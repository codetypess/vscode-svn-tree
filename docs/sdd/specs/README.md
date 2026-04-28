# Specs Directory

Store all future feature specs under this directory.

## Naming

Use a dated folder name:

```text
YYYY-MM-DD-short-feature-name
```

Examples:

- `2026-04-28-checkout-from-url`
- `2026-04-28-conflict-merge-editor`

## Minimum Structure

```text
docs/sdd/specs/<folder>/
  spec.md
  tasks.md
```

Optional files:

- `notes.md`
- `screens.md`
- `open-questions.md`

## Suggested Flow

1. Copy the feature spec template into `spec.md`.
2. Write `tasks.md` as a concrete implementation checklist.
3. Review and lock scope before code changes.
4. Keep the spec updated if implementation details change materially.

## Ownership Rule

`spec.md` is the source of truth for the feature.

If code and spec diverge, either:

- update the implementation to match the spec, or
- update the spec as part of the same change.
