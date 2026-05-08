# SDD Spec Index

This directory contains work-item specifications for the repository's SDD workflow.

Follow [../../spec-driven-development.md](../../spec-driven-development.md) for the default process. Use [../project-baseline.md](../project-baseline.md) and [../architecture-baseline.md](../architecture-baseline.md) before changing shipped behavior or structure.

## Naming

Use a dated folder name:

```text
YYYY-MM-DD-short-feature-name
```

Examples:

- `2026-04-28-checkout-from-url`
- `2026-05-08-update-notification-output-action`

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

## Index Rules

- Put active in-flight work under `Active`.
- Move shipped work to `Done`.
- Keep links pointed at `spec.md`; that file is the behavioral source of truth.

## Active

- None currently.

## Done

- [Scoped Working Copy Root](./2026-04-28-scoped-working-copy-root/spec.md)
- [Checkout From URL](./2026-04-28-checkout-from-url/spec.md)
- [Delete Working Copy Files](./2026-04-28-delete-working-copy-files/spec.md)
- [Ignore Editor](./2026-04-28-ignore-editor/spec.md)
- [Repository Browser Remote Directories](./2026-04-28-repository-browser-remote-dirs/spec.md)
- [Repository Browser Webview](./2026-04-28-repository-browser-webview/spec.md)
- [Depth Workflows](./2026-05-02-depth-workflows/spec.md)
- [Import Local Folder](./2026-05-02-import-local-folder/spec.md)
- [Repository Browser File Operations](./2026-05-02-repository-browser-file-ops/spec.md)
- [Structured Externals Editor](./2026-05-02-structured-externals-editor/spec.md)
- [SVN Externals Editor](./2026-05-02-svn-externals-editor/spec.md)
- [Patch Workflows](./2026-05-04-patch-workflows/spec.md)
- [Repository SDD Mechanism](./2026-05-08-repository-sdd-mechanism/spec.md)
