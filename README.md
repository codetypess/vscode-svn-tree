# SVN Graph

SVN Graph brings a lightweight SVN workflow into Visual Studio Code with a native SCM view, quick diffs, incoming change visibility, and a focused history panel for browsing revisions.

## Features

- Detects SVN working copies in the current workspace and registers them in the Source Control view.
- Shows local changes and optional incoming remote changes with counts and inline actions.
- Opens working copy, incoming, and revision-to-revision diffs inside the built-in VS Code diff editor.
- Includes a compact history panel with revision metadata, changed file trees, and direct diff access per file.
- Supports common SVN actions: refresh, update, commit, add, revert, and delete.

## Requirements

- The `svn` command-line client must be installed and available on your `PATH`.
- Open a workspace folder that is inside an SVN working copy.

If `svn` is not available, the extension will show a warning and stay inactive until it is installed.

## Getting Started

1. Open a folder that belongs to an SVN working copy.
2. Open the Source Control view.
3. Use the repository actions to refresh, update, commit, or open history.
4. Expand **Changes** or **Remote Changes** to inspect files and open diffs.
5. Open **History** to browse revisions and inspect file-level changes for any commit.

## Commands

- `SVN Graph: Refresh SVN Status`
- `SVN Graph: Update SVN Working Copy`
- `SVN Graph: Commit SVN Changes`
- `SVN Graph: Open SVN History`

## Settings

- `svn-graph.enable-remote-status`: Fetch incoming changes with `svn status -u`.
- `svn-graph.remote-status-interval-seconds`: Interval between automatic incoming-status refreshes.
- `svn-graph.max-log-entries`: Maximum number of revisions loaded into the history panel.

## Notes

- The extension uses VS Code's built-in diff editor for all comparisons.
- Large repositories can make `svn log -v` and `svn status -u` slower, so remote status can be disabled if needed.
- Command output is written to the `SVN Graph` output channel for troubleshooting.

## Support

Need help or want to report a bug?

- Issues: https://github.com/codetypess/vscode-svn-graph/issues
- Repository: https://github.com/codetypess/vscode-svn-graph

## License

MIT
