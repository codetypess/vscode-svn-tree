# Update Re-Click Output Access Tasks

## Status

- Spec: implemented
- Implementation: completed

## Task List

- [x] Add a dated SDD work item for the update notification output-action timing change.
- [x] Remove the extra update-start notification so update flows no longer split into two notifications.
- [x] Reuse a repeated `Update` click during an active update to open the output channel.
- [x] Keep the existing update progress and cancellation flow unchanged.
- [x] Update the spec index.
- [x] Run compile verification for the changed code paths.

## Acceptance Checklist

- [x] Update-backed workflows keep a single progress notification and do not add a separate output button while running.
- [x] Re-clicking `Update` during an active update opens the output channel instead of showing the generic busy message.
- [x] Successful completion notifications for those workflows no longer repeat the output action.
- [x] The repository compiles after the change.
