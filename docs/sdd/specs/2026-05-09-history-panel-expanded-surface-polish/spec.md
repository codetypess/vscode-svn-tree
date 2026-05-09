# History Panel Expanded Surface Polish

Status: Done
Date: 2026-05-09
Owner: codetypess
Scope: Remove the framed card treatment from expanded history entries, keep the default panel background, and use border-based separation for the expanded details area
Related issue:

## 1. Context

The history webview is part of the product's History Inspection workflow in `docs/sdd/project-baseline.md`. Its structure and ownership are described in `docs/sdd/architecture-baseline.md`, which keeps history rendering inside the history webview modules and presentation styling in the webview assets.

Today, expanding a revision renders the details area inside a visually distinct surface. In dense dark-theme usage, a custom filled background behind the expanded section can feel heavier than necessary. The requested polish is visual only: keep the expanded metadata and changed-path tree, but let the expanded section use the default panel background and rely on borders to define the details area.

## 2. Goals

- Remove the bordered rounded-card frame from expanded history details.
- Use the default history background for the expanded surface instead of a custom filled background.
- Separate the expanded details area with borders rather than a colored fill.
- Let the bordered details area run flush across the available width without rounded corners.
- Let the bordered details area start flush from the timeline gutter with no extra outer horizontal padding.
- Preserve the current expanded content structure, timeline graph, and responsive layout behavior.

## 3. Non-Goals

- Change history loading, filtering, context menus, or revision actions.
- Redesign the expanded metadata content or changed-path tree structure.
- Add new commands, settings, localization keys, or persistence behavior.

## 4. Current Behavior

- User-facing behavior:
  expanding a history row shows the revision details inside a distinct expanded section beneath the summary row.
- Technical behavior:
  `media/history-panel.css` applies a custom background to `.commit.expanded` and an emphasized row background to `.commit.expanded > .commit-row`.
- Known gap or failure mode:
  the extra filled surface behind the expanded content is visually heavier than needed and competes with the details content itself.

## 5. Proposed Behavior

### Entry Points

- Command palette:
  existing history entry points only
- SCM title or menus:
  existing history entry points only
- Resource context menu:
  existing show-history entry points only
- Webview or panel action:
  expanding a revision row in the history panel
- Other:
  none

### Happy Path

1. The user opens the history panel and expands a revision.
2. The expanded revision keeps the default background instead of switching to a filled alternate surface.
3. The metadata summary and changed-path tree are grouped by borders around the details area rather than by a custom background fill.
4. The bordered details area runs flush to the available width with square corners and no extra outer horizontal padding, and the summary/file split remains readable through borders and spacing.

### Edge Cases

- Case:
  the panel is shown on a narrow viewport where the details layout collapses to a single column.
  Expected behavior:
  the stacked layout still uses the default background, and the summary/file split remains readable with border-based separation.

- Case:
  the expanded row is also marked as incoming or current.
  Expected behavior:
  the graph dot, stems, badges, and current-revision ring remain visually intact on top of the adjusted background.

## 6. Commands, Settings, Output, And Localization Impact

- New commands: None
- Updated commands: None
- New settings: None
- Updated settings: None
- Output or progress behavior: None
- New i18n keys: None
- Updated copy: None

## 7. Design

### Modules Affected

- `docs/sdd/specs/2026-05-09-history-panel-expanded-surface-polish/spec.md`
- `docs/sdd/specs/2026-05-09-history-panel-expanded-surface-polish/tasks.md`
- `docs/sdd/specs/README.md`
- `media/history-panel.css`

### Key Decisions

- Decision:
  keep the change CSS-only because the request is a visual treatment change and does not require new history webview state or markup.
- Decision:
  keep the expanded row on the default background and move emphasis to a bordered details container rather than a filled expanded surface.
- Decision:
  retain a subtle internal divider between the summary and file tree panes so the information hierarchy remains clear after the background fill is removed.
- Decision:
  keep the bordered details container square-edged and bias the internal split slightly toward the left so the file tree gets more room.
- Decision:
  remove extra outer horizontal padding around the expanded details row so the border visually aligns with the surrounding list region.
- Decision:
  use full-width top and bottom borders on the expanded details row, while keeping the content area's right vertical border for the outer edge.
- Decision:
  keep the expanded details rail aligned with the main commit-row graph, but omit the content area's left vertical border so the rail gutter does not show a duplicate line.
- Decision:
  give the summary pane additional left padding so its text does not sit too close to the timeline gutter.

### Data Or Message Flow

1. The history webview toggles the expanded revision exactly as it does today.
2. The same markup for `.commit.expanded`, `.details-row`, and `.details-panel` renders.
3. Updated CSS keeps the expanded surface on the default background and uses borders around the details area without changing any webview messaging or repository orchestration.

### Alternatives Considered

- Alternative:
  keep the filled expanded background and only add a stronger border
  Why rejected:
  the user explicitly asked to remove the background fill and rely on borders instead.

- Alternative:
  change the React structure to render separate summary and tree containers without `.details-panel`
  Why rejected:
  markup changes are unnecessary for a pure styling adjustment and would widen the change surface.

## 8. Testing Plan

- Unit tests:
  none; the change is limited to static history webview CSS
- Integration or command-path tests:
  `npm run compile`
- Manual verification:
  open the history panel, expand a revision, confirm the custom background fill is gone, the details area is separated by borders, and the narrow-layout stack remains readable

Verification note:

- `npm run compile` passed.

## 9. Acceptance Criteria

- Expanded history entries no longer render their details inside a bordered rounded inner card.
- Expanded history entries use the default history background rather than a custom filled expanded surface.
- The details area is separated with borders rather than relying on a custom background fill.
- The summary/file split remains readable in both wide and narrow history panel layouts.
- `npm run compile` succeeds after the styling change.

## 10. Risks And Follow-Up

- Risk:
  removing the filled expanded background could reduce separation from nearby rows in some themes.
  Mitigation:
  keep a visible bordered details container and preserve a slightly emphasized expanded header row.
- Follow-up:
  if future polish is needed, evaluate whether the revision graph and repository browser should share a more formal expanded-surface token set.

## 11. Baseline Updates

- Project baseline changes required: None
- Architecture baseline changes required: None
