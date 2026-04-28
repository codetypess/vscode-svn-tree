# Repository Browser Remote Directory Operations Tasks

## Status

- Spec: implemented
- Implementation: completed

## Task List

- [x] Add repository-browser action items for remote directory maintenance.
- [x] Add pure validation and path-resolution helpers for current-directory mutations.
- [x] Extend `SvnService` with remote `mkdir` and remote `move`.
- [x] Wire prompts, confirmations, and post-mutation refresh flows in `SvnRepository`.
- [x] Update README and SDD baseline docs.
- [x] Run compile and tests.

## Acceptance Checklist

- [x] Users can create a child directory under the current repository browser path.
- [x] Users can copy the current repository browser directory to another repository path.
- [x] Users can move or rename the current repository browser directory when it is safe to mutate.
- [x] Users can delete eligible non-reference directories from the repository browser.
- [x] The browser prevents self-targeting or descendant-targeting moves and copies before execution.
