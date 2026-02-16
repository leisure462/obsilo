# Feature: Workflow Engine & Skills
Priority: P1
Related Epic: `requirements/epics/EPIC-core-engine.md`

## Description
A system for chaining prompts and tools into reusable "Skills" or "Workflows." This allows users to save a sequence (e.g., "Summarize -> Extract Tasks -> Update Todo") as a single command they can trigger again.

## Benefits Hypothesis
- Repetitive knowledge work is a major pain point; automation increases user "stickiness."
- Skills provide a clear mental model for "what the agent can do."

## User Stories
- As a user, I want to define a "Meeting Cleanup" skill that I can run on every meeting note.
- As a user, I want skills to be simple markdown files with instructions (prompts) the agent follows.
- As a user, I want to edit skills easily if I don't like the output.

## Acceptance Criteria
- [ ] **Skill Definition:** A standard format (e.g., YAML frontmatter + prompt text) for defining a skill in a dedicated folder (`.kilonote/skills`).
- [ ] **Execution:** The agent can load a skill by name and execute its prompt instructions.
- [ ] **Discovery:** The UI lists available skills for the user to select.
- [ ] **Parameters:** Skills can accept inputs (e.g., "target file").

## Success Criteria
- SC-01: User can create a new hello-world skill in < 5 minutes.
- SC-02: Skills execute reliably with consistent output format (LLM variance permitting).

## NFRs (quantified)
- **Loading Time:** Skills load instantly (< 50ms) from disk.

## ASRs
None.

## Dependencies
- Prompt templating logic.
