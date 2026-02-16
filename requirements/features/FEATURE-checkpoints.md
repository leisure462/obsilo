# Feature: Local Checkpoints & Restore
Priority: P0
Related Epic: `requirements/epics/EPIC-governance.md`

## Description
Every approved write tool execution triggers a pre-write "snapshot" using a local isomorphic-git shadow repository (`.kilonote/checkpoints`). This creates a per-action commit history, enabling users to:
1. Preview the diff (before/after) of the proposed change if desired.
2. Revert the file to its state before the tool execution if the result is bad.

## Benefits Hypothesis
- Provides "Undo" for AI, which is usually missing in generic chat interfaces.
- Users can experiment freely knowing they have a fast rollback path in the sidebar.

## User Stories
- As a user, I want the system to automatically save a version of my file before the agent overwrites it.
- As a user, I want to see a "Revert Change" button in the chat history next to a completed tool call.
- As a user, I want this checkpointing to be invisible to my main git repo (if I use one).

## Acceptance Criteria
- [ ] **Shadow Repo:** A valid git repository exists in `.kilonote/checkpoints`.
- [ ] **Commit per Action:** Every successful write tool execution results in a commit with a descriptive message (e.g., "Agent: Updated Project.md").
- [ ] **Isolation:** The shadow repo ignores `.git` and other critical system folders to avoid nested repo issues.
- [ ] **Restore Action:** A UI action allows reverting a specific file to the previous commit hash for that file.
- [ ] **Diff View:** (Optional for MVP P0, essential for P1) A way to see what changed (additions/deletions).

## Success Criteria
- SC-01: 100% of write actions are recoverable via the restore function.
- SC-02: Checkpoint operations add < 100ms perceivable delay to the tool execution.
- SC-03: No corruption of the user's primary git repository (if present).

## NFRs (quantified)
- **Repo Size:** The checkpoint repo should use efficient packing (standard git gc) to not bloat disk usage excessively (target < 2x the vault size for text).
- **Performance:** Commit time for single file < 500ms.

## ASRs
🔴 **ASR-01: Isomorphic-Git Integration**
- Must use `isomorphic-git` (JS implementation) to run entirely within the plugin process without external git binaries.

## Dependencies
- `isomorphic-git` library.
- Node `fs` access.
