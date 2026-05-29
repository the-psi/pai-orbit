---
name: epic
description: Epic lifecycle management — create, load, update, and list epics in docs/epics/. TRIGGER when creating a new epic, loading epic context before planning, updating an epic after a session, or listing all epics. SKIP individual feature requirements (use /groom) and roadmap sequencing (use /plan).
---

# Epic Skill

Manages product epics stored in `docs/epics/`. An epic is a named container for related features that share a goal and success metric.

## Operations

### `create`
Usage: `/epic create <name>`

1. Validate name is kebab-case (e.g., `epic-payments`)
2. Ask: **"Who is the epic owner?"** and **"Describe the epic in 1-2 sentences"**
3. Create `docs/epics/<name>/EPIC.md` from `templates/docs/epics/EPIC.md`
4. Replace all placeholders with the user-provided values and today's date
5. Open a board item via `/board` — create an Epic-type issue titled with the epic name, assign to the declared owner, and place it in the Backlog column
6. Confirm what was created and suggest: `/groom` to start the first feature, `/plan` to sequence this epic

### `load`
Usage: `/epic load <name>`

1. Read `docs/epics/<name>/EPIC.md`
2. Scan `docs/features/*/requirements.md` for lines matching `Epic: <name>`
3. For each match, read the feature's status from its requirements.md header
4. Propose a diff that refreshes the Features table in EPIC.md with current statuses — write only after user confirms
5. Print a summary: Status, Requirements count, Features table, Open Questions

If the epic is not found, list available epics from `docs/epics/` and prompt to create one with `/epic create`.

### `update`
Usage: `/epic update <name>`

1. Read `docs/epics/<name>/EPIC.md`
2. Review conversation history for new decisions, resolved questions, and requirement changes
3. Scan `docs/features/*/requirements.md` to rebuild the Features table from current state
4. Propose a numbered diff of all changes
5. Ask for confirmation before writing
6. Set `Last Updated` to today's date on write

### `list`
Usage: `/epic list`

1. Scan all `docs/epics/*/EPIC.md`
2. Extract name, Status, Owner, and Last Updated from each
3. Print a markdown table: Epic | Status | Owner | Last Updated

## Rules

- Never write to EPIC.md without showing a diff and getting confirmation first
- Always set `Last Updated` to today's date when writing
- After `/epic create`, always open a board item via `/board` — this is not optional
- Do not create epics in subdirectories — only `docs/epics/<name>/EPIC.md`
