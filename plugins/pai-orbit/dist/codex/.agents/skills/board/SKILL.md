---
name: board
description: Task management — check related open stories, create issues, move cards, assign work, and close on ship using the configured board. TRIGGER before creating a story or starting/resuming work tied to a ticket, and when moving or assigning work. Reads board config and team roster.
---

# Agile Board

Create, move, assign, and close tasks on the project's task board.

Reads from:
- `.codex/pai-orbit-config.md` → `## Agile Board` section — board type, URLs, label taxonomy, column flow
- `.codex/team.md` — team roster for default assignees and handoffs

## MCP vs shell

Before executing any board operation, check `.codex/pai-orbit-config.md → ## MCP → board`:

- **`github`** — prefer GitHub MCP tool calls (e.g. `create_issue`, `add_issue_comment`, `update_issue`). Fall back to `gh` CLI if MCP is unavailable.
- **`linear`** — prefer Linear MCP tool calls. Fall back to `linear` CLI if MCP is unavailable.
- **`jira`** — prefer Jira MCP tool calls. Fall back to `jira` CLI if MCP is unavailable.
- **`none` or section absent** — use CLI shell commands directly; no MCP attempt.

If an MCP call fails or the server is unreachable, fall back to the equivalent shell command and note the fallback: "MCP unavailable — using shell fallback."

## Related open-story check

Run this check before creating a new story and at the start or resumption of ticketed work in `/groom`, `/design`, `/build`, or `/test`. The goal is to catch a changed or overlapping requirement before the developer continues against stale assumptions.

1. Resolve the in-hand ticket from the user's request or active feature context. Read its title, full description, current status, assignee, and relevant comments/history. For a proposed new story, use the proposed title and requirement as the in-hand request.
2. Query the configured board/project for its open stories, including older and newer items. Do not limit the scan to items created recently, exact title matches, or items already linked to the in-hand ticket. Exclude completed/closed items. If the configured board is an issue tracker, search its open issues for the same project/repository.
3. Compare the actual behavior, constraints, and values in the requirements, not just shared keywords. Read candidate descriptions and relevant comments; inspect related `docs/features/*` artifacts when they exist.
4. Classify plausible candidates as a requirement change/conflict, a related but separate item, a possible duplicate, or unrelated. Report each candidate's issue number, title, status, assignee, evidence for the match, the concrete difference from the in-hand requirement, and confidence (high/medium/low). If no candidates match, say the scan found none.
5. If a candidate could change the in-hand requirement or scope, pause before drafting, designing, implementing, testing, or creating the proposed story. Ask the developer whether it is a change to the current story, separate related work, a duplicate, or unrelated. Do not infer the relationship from wording or chronology alone.
6. After the developer confirms the relationship, agree on the disposition: update the existing story, keep separate stories linked, or treat the new story as a duplicate. For a confirmed requirement change, identify the canonical ticket and any existing `requirements.md`, `design.md`, implementation, and `test-plan.md` that may now be stale. Route the requirement delta through `/groom` first; then update the relevant design, implementation, and test artifacts through their normal modes before resuming work against the old requirement. Do not silently treat stale artifacts as current.
7. Show proposed ticket edits and comment text before posting. With confirmation, use the board's native relationship feature where available; otherwise add reciprocal comments referencing both issue numbers. Do not close, merge, or mark a story duplicate without explicit confirmation. Do not @mention or notify an assignee unless the developer approves the notification.
8. If the board cannot be queried, report the specific limitation and ask whether to continue without the check. Never imply the board was checked when it was not.

## Procedure

### Creating an issue

1. Read `.codex/pai-orbit-config.md` to determine board type and column structure
2. Ask which board/project if there are multiple (e.g., Tech vs Ops, Engineering vs Product)
3. Run the Related open-story check against the proposed requirement before creating anything. If the developer confirms the proposed story is a change or duplicate, follow the confirmed disposition instead of opening a disconnected issue.
4. Ask issue type to determine labels and starting column (per the config)
5. Read `.codex/team.md` to propose a default assignee based on issue type and role
6. Compose:
   - **Title:** short, imperative, ≤ 72 chars — mirrors commit format
   - **Body:** what + why; link to relevant docs (`docs/features/<feature>/requirements.md`, prior issues, ADRs); for features, include sub-tasks broken down by service
7. Create the issue using the configured CLI (see board type below)
8. Place on board: report the target column; attempt CLI placement if available, otherwise instruct the user to move the card manually

### Moving a card

Read the column flow from config. Common flows:
- **GitHub Projects v2:** `gh project item-edit` is unreliable for column moves — instruct browser drag is faster
- **Linear:** `linear issue update --state <state>`
- **Jira:** `jira issue transition`
- **GitLab:** boards are label-driven — each column maps to a label (scoped like `workflow::In Progress` or standalone like `To Do`). Moving a card means removing the current column label and adding the next one. Read the column→label map from `## Agile Board → columns` in config, then run the GitLab label resolution step below before applying any label.

**GitLab label resolution (always run before applying a label):**
1. Build the match list: column→label entries from config + any label name the user stated verbatim.
2. Run `glab label list --repo <namespace>/<project>` and check whether the target label exists (case-insensitive match on name).
3. If found in the live list but not in config — use it and note that the config is stale (suggest re-running `/setup`).
4. If not found at all — show the full label list to the user and ask them to confirm the intended label before proceeding. Never guess.

### Closing on ship

When a task ships:
- Close the issue with a brief comment: what was done, date, any follow-up items created
- Use `closes #N` in the final commit (via `/git`), not here

### Handoffs and assignments

Read `.codex/team.md` for handles. Never hardcode handles in this skill — always look them up at runtime.
If a role-based assignment is requested ("assign to the mobile lead"), look up the team member in that role.

## Board-type CLI

Determined by `## Agile Board → type` in `.codex/pai-orbit-config.md`:

**GitHub Issues:**
```bash
gh issue create \
  --repo <owner>/<repo> \
  --title "<title>" \
  --body "<body>" \
  --label "<labels>" \
  --assignee "<handle>"
```

**Linear:**
```bash
linear issue create --title "<title>" --description "<body>" --team <team-id> --assignee <user-id>
```

**Jira:**
```bash
jira issue create --project <key> --summary "<title>" --description "<body>" --assignee <user-id>
```

**GitLab:**
```bash
# Create
glab issue create \
  --repo <namespace>/<project> \
  --title "<title>" \
  --description "<body>" \
  --label "<labels>" \
  --assignee "<handle>"

# Move card (swap column label — scoped or standalone)
glab issue update <issue-id> \
  --repo <namespace>/<project> \
  --remove-label "<current-column-label>" \
  --label "<next-column-label>"

# Close
glab issue close <issue-id> --repo <namespace>/<project>
```

Column→label map is read from `## Agile Board → columns` in `.codex/pai-orbit-config.md`. If the map is absent, ask the user to supply it before moving.

## Conventions (always apply)

- `refs #N` in commits during development; `closes #N` in the final shipping commit only
- One feature = one issue; sub-tasks go in the body unless they ship independently
- Do not close issues autonomously without confirming with the user
