# Repository Browser Webview Tasks

## Status

- Spec: proposed
- Implementation: pending

## Task List

- [ ] Add `RepositoryBrowserPanel` and typed webview message contracts.
- [ ] Build the repository browser webview UI with persistent navigation state.
- [ ] Match the history panel's visual language for layout, controls, and state styling.
- [ ] Expose current-directory and per-entry action groups inside the panel.
- [ ] Reuse existing repository-side file, history, property, switch, and remote directory workflows.
- [ ] Replace the quick-pick repository browser path behind `openRepositoryBrowser`.
- [ ] Add tests for browser-model shaping and path/action gating.
- [ ] Update architecture and product docs after implementation.

## Suggested Delivery Order

1. Build panel scaffolding and the browser data model.
2. Ship read-only navigation first: breadcrumbs, entry list, refresh, open history or properties.
   Styling should already align with the history panel in this phase.
3. Port current-directory actions next.
4. Port file-specific actions.
5. Remove or retire the quick-pick implementation after parity.

## Acceptance Checklist

- [ ] Opening repository browser creates or reuses a retained panel for the repository.
- [ ] Navigating between directories does not reopen modal prompts.
- [ ] The panel styling is recognizably consistent with the history panel.
- [ ] The panel can run existing current-directory and file actions without leaving broken state.
- [ ] Remote directory mutations refresh the focused path in place.
- [ ] User-visible copy is localized and the browser works in both supported locales.
