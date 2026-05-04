# Project Baseline

## Summary

`SVN Tree` is a Visual Studio Code extension that integrates Subversion workflows into the Source Control view. It targets users who already work with SVN working copies or need to bootstrap SVN repositories from local folders and want status, history, diff, merge, and repository operations without leaving the editor.

The current product supports initial repository bootstrap through checkout-from-url and local-folder import, plus day-to-day working-copy operations, history inspection, repository navigation, and targeted maintenance tasks.

## Product Goals

- Make SVN working copies feel native inside VS Code.
- Keep high-frequency operations close to SCM and context menus.
- Let users inspect history and repository structure without switching to external tools.
- Use the installed `svn` CLI rather than reimplementing Subversion behavior.
- Keep troubleshooting transparent through a dedicated output channel.

## Primary Users

- Developers working in existing SVN working copies.
- Developers bootstrapping a local project into SVN for the first time.
- Teams maintaining legacy or enterprise codebases still hosted in SVN.
- Users who want a more capable SVN workflow than the built-in editor primitives.

## Core User Workflows

### 1. Repository Acquisition

Users can start from an arbitrary SVN repository URL or a local unversioned folder and then:

- Check out `HEAD` or a specific revision to a new local folder.
- Import an existing local folder to an explicit SVN repository URL.
- Keep the current workspace intact unless they explicitly choose to open the new folder.
- Continue into normal working-copy workflows after checkout succeeds or by checking out the imported repository after import succeeds.

### 2. Working Copy Maintenance

Users open a folder that already belongs to an SVN working copy and then:

- Refresh status.
- Review changed, unversioned, conflict, and optional remote-change entries.
- Commit all or selected paths.
- Update the whole working copy or selected paths.
- Adjust working copy depth on repository roots or selected paths for sparse workflows.
- Export working-copy patches or apply patch files with a dry-run before mutating the working copy.
- Revert, add, delete, rename, ignore, lock, unlock, or clean up paths.
- Edit `svn:ignore` rules or `svn:externals` definitions through dedicated editors when a generic property prompt is too coarse.

### 3. History Inspection

Users inspect repository or file history and then:

- Filter revisions by author, message, path, and date range.
- Compare revisions with the working copy or previous revisions.
- Export revisions or files.
- Export revision-scoped patch files from history.
- Copy revision metadata.
- Revert the working copy to a revision or reverse-merge a revision.

### 4. Repository Navigation

Users browse repository paths and references, then:

- Open repository browser views.
- Import a local folder into the current repository path.
- Create, copy, move, or delete remote directories from the browser when the target path is safe to mutate.
- Export, copy, move, or delete remote files from the browser.
- Inspect path info and properties.
- Open blame output or text previews.
- Copy repository URLs or paths.
- Open revision graph views.

### 5. Reference And Merge Operations

Users manage branch and tag style workflows by:

- Switching the working copy to another repository target.
- Creating branches or tags from the working copy or from a revision.
- Deleting repository references.
- Merging or reverse-merging revisions and revision ranges.
- Running merge dry-runs before applying changes.

## Current Functional Scope

The extension currently supports:

- Global checkout from an arbitrary absolute repository URL into a new local folder.
- Depth-aware checkout and explicit working-copy `--set-depth` adjustments.
- Global import from an existing local folder into an arbitrary absolute repository URL.
- SCM integration for SVN working copies inside the active workspace.
- Status grouping for local changes, unversioned files, conflict artifacts, and optional incoming remote changes.
- Repository-level and path-level commands contributed through VS Code menus.
- Patch-oriented workflows for exporting working-copy diffs, exporting revision patches from history, and applying patch files through `svn patch` with dry-run preview.
- History webview with incremental loading and filters.
- Revision graph webview with reference comparison and mergeinfo metadata.
- Repository browser actions for current-directory local-folder import, remote directory maintenance, and selected-entry file maintenance.
- Property inspection and editing, including common built-in SVN property names.
- Specialized editor support for `svn:ignore` and `svn:externals`, including structured editing for common externals definitions.
- Conflict resolution flows based on SVN accept modes.
- Output channel logging for SVN commands and troubleshooting.
- Runtime localization in English and Simplified Chinese.

## Current Constraints

- The extension depends on the local `svn` executable being installed and available on `PATH`.
- Most advanced features still assume the user is working inside an opened SVN working copy after acquisition.
- Most operations are synchronous command wrappers around the CLI and inherit its performance and failure modes.
- Remote status and large history queries can be slow on large repositories.
- Product behavior is constrained by VS Code SCM APIs, webview APIs, and the semantics of the SVN CLI.

## Non-Goals

At the current baseline, the project is not trying to:

- Replace the SVN server or authentication model.
- Reimplement SVN protocol behavior without the CLI.
- Act as a full graphical SVN client for every repository administration workflow.
- Optimize for Git-like branch semantics; repository references remain SVN-oriented.

## Quality Bar For New Work

New work should preserve these expectations:

- Commands must feel native to the relevant VS Code surface.
- Long-running operations must provide progress feedback.
- Errors must be actionable and leave command output available for troubleshooting.
- New user-visible text must be localized.
- Specs should avoid adding duplicate entry points unless discoverability clearly improves.

## Known Product Gaps

These are useful candidates for future specs:

- More visual conflict inspection flows.

## SDD Implication

Any future feature spec should start by declaring which user workflow it extends, what gap it closes, and which baseline assumptions it changes.
