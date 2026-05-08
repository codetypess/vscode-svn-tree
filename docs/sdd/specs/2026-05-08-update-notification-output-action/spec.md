# Update Re-Click Output Access

Status: Done
Date: 2026-05-08
Owner: codetypess
Scope: Keep a single update progress notification and use repeated update clicks to open output during update-backed workflows
Related issue:

## 1. Context

Recent update workflow changes exposed `Show SVN Output` only after an update-backed operation finished. That misses the main troubleshooting case: users need fast access to the output channel while `svn update` is still running or appears stuck.

The first attempt to address that added a second information notification at update start. That solved timing, but it split the UX into two stacked notifications, which is noisy during an already visible progress flow.

The second attempt moved output access into a temporary SCM status bar command. That kept one notification, but still added a parallel UI affordance the user did not want to keep.

This change touches shipped working-copy behavior, so it follows the repository SDD workflow and references:

- `docs/sdd/project-baseline.md`
- `docs/sdd/architecture-baseline.md`

The relevant architectural constraint is that repository workflow orchestration stays inside `src/scm/svn-repository.ts`, while user-visible copy stays in `src/i18n.ts`.

## 2. Goals

- Expose SVN output access while an update-backed workflow is running, not only after it completes.
- Keep the existing progress notification and cancellation behavior for long-running updates.
- Avoid showing a second companion notification or a temporary extra status bar command just to expose output access.

## 3. Non-Goals

- Change SVN command execution, parsing, or output-channel formatting.
- Add new commands, settings, or webviews.
- Redesign every repository operation notification; this scope is limited to update-backed flows.

## 4. Current Behavior

- User-facing behavior:
  update, update-to-revision, selected-path update-to-revision, and set-depth flows surface `Show SVN Output` only from the completion information message.
- Technical behavior:
  `SvnRepository.runRepositoryOperation(...)` owns the busy-state branch for repository workflows and can intercept repeated `update` invocations while an update is already active.
- Known gap or failure mode:
  if `svn update` is slow, blocked, or producing diagnostics the user wants to inspect, the completion-time action appears too late, and extra helper UI surfaces are noisier than the progress notification they accompany.

## 5. Proposed Behavior

### Entry Points

- Command palette:
  existing update-related commands only
- SCM title or menus:
  existing update entry points only
- Resource context menu:
  existing selected-path update entry points only
- Webview or panel action:
  none
- Other:
  invoking `Update` again while an update-backed workflow is already active

### Happy Path

1. The user starts an update-backed workflow such as update, update-to-revision, selected-path update-to-revision, or set depth.
2. The normal progress notification appears and remains cancellable where applicable.
3. If the user invokes `Update` again while the update-backed workflow is still active, the extension opens the `SVN Tree` output channel instead of showing the generic `already running` message.
4. When the update completes successfully, the completion notification remains informational only.

### Edge Cases

- Case:
  the user clicks `Update` again while the update is still running.
- Expected behavior:
  the extension opens the output channel immediately and does not queue another update or show the generic busy notification.

- Case:
  the update is cancelled or fails.
- Expected behavior:
  the started output action remains valid if the user wants to inspect logs, and existing cancellation/error flows remain unchanged.

- Case:
  the update-backed operation is a set-depth change rather than a plain update.
- Expected behavior:
  it still opens the output channel on repeated `Update` invocation because it runs through `svn update`.

## 6. Commands, Settings, Output, And Localization Impact

- New commands: None
- Updated commands: repeated `Update` invocations during active update-backed workflows open the output channel
- New settings: None
- Updated settings: None
- Output or progress behavior:
  update progress still uses `withProgress(Notification)`; re-invoking `Update` during an active update opens the output channel because VS Code progress notifications only expose cancel buttons
- New i18n keys: None
- Updated copy:
  none

## 7. Design

### Modules Affected

- `docs/sdd/specs/2026-05-08-update-notification-output-action/spec.md`
- `docs/sdd/specs/2026-05-08-update-notification-output-action/tasks.md`
- `docs/sdd/specs/README.md`
- `src/scm/svn-repository.ts`

### Key Decisions

- Decision:
  use the existing update command as the only in-progress affordance: clicking it again means `show me what's happening`.
- Decision:
  treat a repeated `Update` invocation during an active update as an intent to inspect logs, and open the output channel instead of surfacing the generic `already running` message.
- Decision:
  apply the behavior to all update-backed workflows that already shared the old completion-time output action behavior.

### Data Or Message Flow

1. An update workflow sets `activeOperation` to `update` through `runRepositoryOperation(...)`.
2. If `runRepositoryOperation(...)` receives another `update` request while `activeOperation` is already `update`, it opens the output channel and returns early.
3. The update completes through the existing repository mutation finalization and refresh path.
4. Clearing `activeOperation` restores the normal SCM status bar commands, while success ends with a plain completion notification.

### Alternatives Considered

- Alternative:
  keep the output action on the success notification only
- Why rejected:
  it does not help while the update is actively running, which is the time the logs are most useful.

- Alternative:
  add the action directly onto the progress notification
- Why rejected:
  the VS Code progress notification API supports cancellation but not custom action buttons.

- Alternative:
  show a second information notification during update
- Why rejected:
  it achieves the timing goal, but duplicates the visible notification surface and feels heavier than the active progress notification itself.

- Alternative:
  keep a temporary `Show SVN Output` status bar command during update
- Why rejected:
  it adds another transient UI entry point when the existing `Update` command can carry the same intent more directly.

- Alternative:
  keep showing the generic `already running` message on repeated `Update` clicks
- Why rejected:
  a repeated click during update is a reasonable user signal that they want immediate access to the running operation's logs.

## 8. Testing Plan

- Unit tests:
  none added; the change only adjusts repository busy-state routing
- Integration or command-path tests:
  rely on `npm run compile` coverage for repository operation wiring
- Manual verification:
  start update-backed workflows, confirm only one progress notification appears, no extra status bar output button appears, re-clicking `Update` opens the output channel, and completion remains informational only

Verification note:

- `npm test` currently still hits an unrelated existing runtime failure in `out/test/svn-service.test.js` because the `vscode` module is not present in the plain Node test environment, so this work item uses compile as its automated gate.

## 9. Acceptance Criteria

- Starting a working-copy update keeps a single progress notification on screen with no extra output button added beside it.
- Re-clicking `Update` while an update-backed workflow is already running opens the output channel instead of showing the generic busy notification.
- Successful update completion no longer includes `Show SVN Output` in the final information notification.
- Update-to-revision, selected-path update-to-revision, and set-depth flows follow the same timing.
- `npm run compile` succeeds after the change.

## 10. Risks And Follow-Up

- Risk:
  users may not realize repeated `Update` clicks now mean `open logs` while an update is active.
- Mitigation:
  keep this behavior scoped only to active `update` operations so it remains predictable and tied to the visible progress notification.
- Follow-up:
  if VS Code later adds action support to progress notifications, move this back into the notification surface directly.

## 11. Baseline Updates

- Project baseline changes required: None
- Architecture baseline changes required: None
