# Repository Browser Webview

## Metadata

- Feature name: Repository Browser Webview
- Owner: codetypess
- Date: 2026-04-28
- Status: Proposed
- Related issue:

## Summary

Replace the current quick-pick-based repository browser with a retained webview panel that can browse deep repository trees and expose context-aware remote actions inline. The new UI should keep navigation state, show repository entries and current-path actions at the same time, and reuse existing repository workflows for history, properties, blame, switching, and remote directory maintenance.
The panel should intentionally match the visual style and interaction language of the existing history panel rather than introducing a separate design system.

## Problem Statement

- The current repository browser is implemented as a loop of `QuickPick` prompts.
- That model is workable for short navigation hops, but it becomes clumsy for deep repositories because users lose context on every step.
- Recent remote directory actions made the browser more powerful, but the current interaction model is now the bottleneck: actions, navigation, and result state are fragmented across repeated prompt cycles.
- This should be solved now because repository-browser capability has outgrown quick-pick ergonomics and there is already proven webview infrastructure in history and revision graph.

## Goals

- Introduce a dedicated retained webview panel for repository browsing.
- Keep navigation context visible through a persistent path bar and directory listing.
- Surface current-directory and selected-entry actions inline inside the panel.
- Reuse existing repository-side operations rather than duplicating workflow logic in the webview.
- Preserve support for remote directory maintenance that was just added to the browser.
- Match the existing history panel's visual language, spacing, control styling, and state presentation so the browser feels like part of the same product surface.

## Non-Goals

- Multi-select repository operations.
- Drag-and-drop repository reorganization in the first version.
- Local-folder import into the repository.
- Editing file content or properties directly inside the browser panel.
- Replacing history or revision graph with the same panel.

## Affected Workflow

State which baseline workflow this feature extends:

- Repository navigation

## User Stories

- As a developer browsing a large SVN repository, I want a persistent browser view so I can move across directories without losing context.
- As a developer maintaining repository structure, I want actions for the current directory and selected entry to stay visible so I can browse and mutate remote paths in one place.
- As a developer jumping between repository inspection tasks, I want to open history, properties, blame, and switch actions from the browser without falling back to a series of modal prompts.

## Proposed UX

### Entry Points

- Command palette: existing `Open Repository Browser`
- SCM title/menu: existing repository browser entry
- Resource context menu: existing repository browser entry points
- Webview action: toolbar actions inside the browser panel
- Other: revision graph and other repository-path surfaces can continue opening the browser at a focused repository path

### Happy Path

1. The user opens `Repository Browser`.
2. A retained panel opens for the repository and loads the requested repository path.
3. The panel uses the same overall visual language as the history panel: shared typography, spacing rhythm, toolbar treatment, and empty/loading/error state styling.
4. The header shows the current repository path and breadcrumb navigation.
5. The main body shows repository entries with directory-first ordering and per-entry context actions.
6. A side or top action area shows current-directory actions such as history, properties, switch, create branch or tag, create directory, copy, move, and delete when allowed.
7. The user navigates, runs an action, and the panel refreshes in place without losing context.

### Error And Edge Cases

- Case: a remote mutation succeeds and changes the current directory path, such as move or rename.
- Expected behavior: the panel updates its selected path to the resulting repository path and reloads entries there.

- Case: the user opens the browser for the same repository from another command.
- Expected behavior: reuse the existing panel for that repository and navigate it to the requested path.

- Case: the webview loses state after reload or extension host restart.
- Expected behavior: restore the last opened repository path for the panel session and request data again from repository logic.

- Case: the selected path cannot be listed or no longer exists after a mutation.
- Expected behavior: show an inline error state and fall back to the nearest parent path the repository can still open.

## Functional Requirements

- Add a retained repository-browser webview panel keyed by repository root.
- Replace the quick-pick browser loop as the primary implementation behind `openRepositoryBrowser`.
- Show:
  - current repository path and breadcrumbs
  - current-directory actions
  - repository entry list with file or directory metadata
  - per-entry actions for directories and files
- Reuse the history panel's visual conventions for:
  - toolbar and header layout
  - button styling and density
  - typography scale
  - loading, empty, and error states
  - panel spacing and content framing
- Support current-directory actions already available in the quick-pick browser:
  - open history
  - show properties
  - switch here
  - create branch from working copy
  - create tag from working copy
  - create remote directory
  - copy directory
  - move or rename directory
  - delete branch or tag
  - delete eligible remote directory
- Support file actions already available in the quick-pick browser:
  - open history
  - show properties
  - show blame
  - show blame in output
  - open file
  - copy repository URL
  - copy repository path
- Keep business logic in `SvnRepository`; the webview should send structured requests and render structured responses.

## Out Of Scope

- Revision graph embedding inside the browser panel.
- Full keyboard command palette parity for every action within the first implementation.
- Tree virtualization for extremely large directories unless performance requires it during implementation.

## Command And Setting Impact

- New commands:
  none
- Updated commands:
  `svn-tree.open-repository-browser` changes implementation from quick pick to webview
- New settings:
  none
- Updated settings:
  none

## Localization Impact

- New i18n keys:
  panel title, breadcrumb labels, loading and empty states, browser toolbar and entry action labels, and inline error copy
- Updated copy:
  README and baseline docs should describe the browser as a dedicated panel rather than a prompt-driven browser

## Technical Design

### Modules Affected

- `README.md`
- `docs/sdd/project-baseline.md`
- `docs/sdd/architecture-baseline.md`
- `docs/sdd/specs/2026-04-28-repository-browser-webview/spec.md`
- `docs/sdd/specs/2026-04-28-repository-browser-webview/tasks.md`
- `src/i18n.ts`
- `src/scm/svn-repository.ts`
- `src/scm/svn-repository-browser.ts`
- `src/repository-browser/repository-browser-panel.ts`
- `src/repository-browser/repository-browser-webview.tsx`
- `src/repository-browser/repository-browser-types.ts`
- `src/repository-browser/repository-browser-utils.ts`
- `src/test/*` for pure helper coverage

### Proposed Changes

- Extract a new retained `RepositoryBrowserPanel` similar in role to `HistoryPanel` and `RevisionGraphPanel`.
- Use the history panel as the primary visual reference so browser UI primitives align with existing list, toolbar, and state styling.
- Keep `SvnRepository` as the orchestration owner for loading directory data and executing actions.
- Convert current repository-browser helper output from quick-pick items into webview-oriented structured data:
  - current directory model
  - action availability
  - entry list
  - file and directory action menus
- Add a typed message contract for:
  - `ready`
  - `navigate`
  - `refresh`
  - `run-directory-action`
  - `run-entry-action`
  - `open-breadcrumb`
- Reuse existing remote directory mutation helpers and validation logic in repository-side handlers.
- Maintain one webview panel per repository root path to avoid panel duplication.

### Data Or Message Flow

1. VS Code command or repository-path surface calls `repository.openRepositoryBrowser(path?)`.
2. `SvnRepository` delegates to a new `RepositoryBrowserPanel`.
3. The panel opens or reuses a retained webview keyed by repository root and focused path.
4. The webview sends `ready` or `navigate` with the focused repository path.
5. Repository logic loads directory entries and browser action state, then posts a structured payload.
6. The webview renders the new state and forwards user actions back through typed messages.
7. Repository logic executes the requested operation, refreshes state, and pushes the next browser model.

### Alternatives Considered

- Alternative: keep quick pick and only add more actions.
- Why rejected: the current pain point is state loss and modal navigation, not missing commands alone.

- Alternative: add a simple HTML wrapper around the same list semantics without panel state.
- Why rejected: it would preserve most of the current UX limitations while adding webview complexity.

- Alternative: merge repository browser into revision graph.
- Why rejected: browsing directory trees and inspecting reference topology are separate tasks with different information density and interaction patterns.

## Testing Plan

- Unit tests:
  cover browser model shaping, breadcrumb construction, action availability, and request validation
- Integration or command-path tests:
  compile coverage for panel wiring and repository action dispatch
- Manual verification:
  open the browser from repository root and nested paths, navigate across directories, run file and directory actions, and confirm mutations refresh the focused path in place

## Risks

- Risk:
  `SvnRepository` continues to accumulate UI orchestration logic
- Mitigation:
  keep webview message handling and browser-model shaping in a dedicated panel or helper layer, with repository methods focused on action execution

- Risk:
  webview state and message handling diverge from the existing quick-pick browser behavior
- Mitigation:
  reuse existing repository-browser helper logic and path validation where possible, then retire the quick-pick path only after parity is reached

- Risk:
  the browser panel drifts visually from the history panel and feels like a separate product surface
- Mitigation:
  treat the history panel as the default styling baseline and reuse its layout and state patterns wherever practical

- Risk:
  very large repository directories could make the first render heavy
- Mitigation:
  ship with straightforward pagination or deferred rendering hooks in the browser model if profiling shows the need

## Rollout Notes

- Migration needed:
  none
- Backward compatibility concern:
  medium; the command stays the same but the interaction model changes materially
- Follow-up work:
  local-folder import, multi-select actions, drag and drop, and richer inline property editors

## Open Questions

- Should the first version include a two-pane layout with entry details, or keep actions in a single toolbar plus contextual menus?
- Should the panel remember the last visited path per repository across VS Code sessions, or only within the current extension session?

## Implementation Tasks

- [ ] Add spec and task tracking.
- [ ] Design the browser panel state model and message contract.
- [ ] Scaffold a retained repository-browser panel and React webview entry.
- [ ] Keep the browser panel's styling aligned with the history panel.
- [ ] Adapt current quick-pick browser helpers into structured browser-view models.
- [ ] Wire repository actions and path navigation through the webview.
- [ ] Migrate existing file and directory browser actions into the panel.
- [ ] Update docs, i18n, and architecture baseline.
- [ ] Run tests and manual verification.
