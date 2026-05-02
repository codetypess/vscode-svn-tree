# Structured SVN Externals Editor Tasks

## Status

- Spec: implemented
- Implementation: completed

## Task List

- [x] Add parser and serializer helpers for common externals definitions.
- [x] Extend the editor state with structured parse results and invalid raw lines.
- [x] Add structured row editing with local path, source, revision, and format fields.
- [x] Keep raw mode as a safe fallback.
- [x] Add tests for parse and serialize behavior.

## Acceptance Checklist

- [x] Parseable externals definitions open in structured mode.
- [x] Unparseable lines keep the editor in raw mode.
- [x] Structured mode blocks save for incomplete rows.
- [x] Saving structured rows writes the equivalent raw SVN property text.
