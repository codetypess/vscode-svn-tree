# Architecture Baseline

## Runtime Overview

The extension has a thin activation layer and a centralized repository-management core:

1. `src/extension.ts` activates the extension and constructs `SvnRepositoryManager`.
2. `SvnRepositoryManager` discovers and tracks SVN working copies in the workspace, registers commands, owns shared services, and coordinates UI surfaces.
3. Each `SvnRepository` instance owns one working copy and implements most user-facing repository logic.
4. `SvnService` wraps the `svn` CLI and converts command output into typed data structures.
5. Webview panels provide rich history and revision-graph experiences on top of repository data.

## Main Modules

### Activation

- `src/extension.ts`

Responsibility:

- Register the extension lifetime with VS Code.
- Construct and dispose the repository manager.

### Repository Coordination

- `src/scm/svn-repository-manager.ts`

Responsibility:

- Initialize shared services and UI surfaces.
- Register repository and path commands.
- Handle global workflows that can run before any `SvnRepository` exists.
- Resolve command arguments into repository-aware targets.
- Coordinate workspace listeners, refresh cycles, localization updates, and output behavior.

### Repository Domain Logic

- `src/scm/svn-repository.ts`

Responsibility:

- Represent one SVN working copy.
- Bridge SCM resources, user prompts, command flows, repository mutations, and webview interactions.
- Implement higher-level workflows such as commit, update, switch, merge, history, property editing, diff, and conflict handling.

### SVN Command Backend

- `src/svn/svn-service.ts`
- `src/svn/svn-xml-parser.ts`
- `src/svn/svn-types.ts`

Responsibility:

- Execute SVN CLI commands.
- Parse XML responses from `info`, `status`, `log`, `proplist`, and `list`.
- Expose typed data to higher layers.
- Handle retry and timeout behavior for history queries.

### SCM Presentation Helpers

- `src/scm/*`

Responsibility:

- Convert SVN status into SCM resource groups.
- Provide repository-path utilities.
- Format blame and property output.
- Support changelist, property, repository browser, and revision-graph helper logic.

### History Webview

- `src/history/history-panel.ts`
- `src/history/history-panel-webview.tsx`
- `src/history/history-webview-*.tsx`

Responsibility:

- Render history entries in a retained webview.
- Handle filters, pagination, context menus, and revision/file actions.
- Forward interaction events back to repository logic.

### Revision Graph Webview

- `src/revision-graph/revision-graph-panel.ts`
- `src/revision-graph/revision-graph-webview.tsx`
- `src/revision-graph/revision-graph-*.ts`

Responsibility:

- Build and render repository reference graphs.
- Surface compare, diff, switch, create-reference, and delete-reference actions.
- Enrich graph nodes with mergeinfo and lock metadata.

### Localization

- `src/i18n.ts`
- `src/vscode-i18n.ts`

Responsibility:

- Centralize user-visible text.
- Resolve runtime language selection.
- Keep command prompts, statuses, and webviews consistent across locales.

### Tests

- `src/test/*`

Responsibility:

- Cover utility behavior and parser logic.
- Protect repository-path handling, history filtering, revision-graph processing, and other critical pure logic.

## Data And Control Flow

### Command Flow

1. VS Code invokes a contributed command.
2. `SvnRepositoryManager` resolves the command target.
3. The manager delegates to the relevant `SvnRepository`.
4. The repository may prompt the user, call `SvnService`, update SCM state, and refresh webviews.
5. Output and user notifications are emitted through VS Code UI APIs.

### History Flow

1. The history webview sends a message such as `ready`, `refresh`, `load-more`, or an action request.
2. `HistoryPanel` validates the payload and delegates to repository methods.
3. `SvnRepository` queries `SvnService` for history or file content.
4. The panel receives normalized entries and renders them incrementally.

### Revision Graph Flow

1. The revision graph webview requests graph data.
2. `RevisionGraphPanel` delegates to `SvnRepository`.
3. Repository logic gathers log entries, repository metadata, and mergeinfo.
4. Graph data is computed and posted back to the webview.

## Architectural Constraints

- The `svn` CLI is the system of record for Subversion behavior.
- Repository logic is centralized in `SvnRepository`; avoid duplicating workflow rules in panels or utility modules.
- Webviews should remain presentation-driven and delegate business operations back to the repository layer.
- User-visible text must pass through the i18n layer.
- New SVN command wrappers belong in `SvnService` before they are consumed by higher layers.

## Change Guidelines

When adding a feature:

- Add or extend the low-level CLI wrapper in `SvnService` if new SVN behavior is required.
- Keep parsing and data normalization out of UI layers.
- Prefer repository methods as the orchestration point for multi-step user workflows.
- Add helper modules only when the logic is reused or meaningfully separable.
- Update tests around pure utilities and parsers whenever behavior changes.

## Current Risks

- `SvnRepository` is the dominant orchestration class and may continue to grow if new workflows are added without extracting stable subdomains.
- CLI latency can directly affect UX, especially for remote status, log scanning, and graph construction.
- Webview feature growth can fragment behavior if message contracts are not specified clearly in future specs.
- Localization coverage can drift if new copy is added outside the existing i18n pathway.

## Spec Impact Checklist

Each new feature spec should explicitly answer:

- Which module owns the orchestration?
- Does `SvnService` need a new command wrapper?
- Is there new webview messaging?
- Are new settings, commands, or context menu placements required?
- What tests can cover the changed logic?
