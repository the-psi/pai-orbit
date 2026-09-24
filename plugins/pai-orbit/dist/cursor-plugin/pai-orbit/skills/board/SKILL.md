---
name: board
description: Task management — create issues, move cards, assign work, close on ship — using the project's configured board. Reads board config from .cursor/pai-orbit-config.md and team roster from .cursor/team.md. TRIGGER when creating a task or issue, moving a card, assigning work, closing a completed item, or asking about what's on the board. SKIP read-only board browsing (just use the browser or CLI directly).
---

# Agile Board

Create, move, assign, and close tasks on the project's task board.

Reads from:
- `.cursor/pai-orbit-config.md` → `## Agile Board` section — board type, URLs, label taxonomy, column flow
- `.cursor/team.md` — team roster for default assignees and handoffs

## MCP vs shell

Before executing any board operation, check `.cursor/pai-orbit-config.md → ## MCP → board`:

- **`github`** — prefer GitHub MCP tool calls (e.g. `create_issue`, `add_issue_comment`, `update_issue`). Fall back to `gh` CLI if MCP is unavailable.
- **`linear`** — prefer Linear MCP tool calls. Fall back to `linear` CLI if MCP is unavailable.
- **`jira`** — prefer Jira MCP tool calls. Fall back to `jira` CLI if MCP is unavailable.
- **`none` or section absent** — use CLI shell commands directly; no MCP attempt.

If an MCP call fails or the server is unreachable, fall back to the equivalent shell command and note the fallback: "MCP unavailable — using shell fallback."

## Procedure

### Creating an issue

1. Read `.cursor/pai-orbit-config.md` to determine board type and column structure
2. Ask which board/project if there are multiple (e.g., Tech vs Ops, Engineering vs Product)
3. Ask issue type to determine labels and starting column (per the config)
4. Read `.cursor/team.md` to propose a default assignee based on issue type and role
5. Compose:
   - **Title:** short, imperative, ≤ 72 chars — mirrors commit format
   - **Body:** what + why; link to relevant docs (`docs/features/<feature>/requirements.md`, prior issues, ADRs); for features, include sub-tasks broken down by service
6. Create the issue using the configured CLI (see board type below)
7. Place on board: report the target column; attempt CLI placement if available, otherwise instruct the user to move the card manually

### Moving a card

Read the column flow from config. Common flows:
- **GitHub Projects v2:** `gh project item-edit` is unreliable for column moves — instruct browser drag is faster
- **Linear:** `linear issue update --state <state>`
- **Jira:** `jira issue transition`
- **GitLab:** boards are label-driven — each column maps to a label (scoped like `workflow::In Progress` or standalone like `To Do`). Moving a card means removing the current column label and adding the next one. Read the column→label map from `## Agile Board → columns` in config, then run the GitLab label resolution step below before applying any label.
- **Azure DevOps:** `az boards work-item update --id <N> --state "<state>"` — read the column→state map from `## Agile Board → columns` in config first; run the Azure CLI availability check below before the first call of the session.

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

Read `.cursor/team.md` for handles. Never hardcode handles in this skill — always look them up at runtime.
If a role-based assignment is requested ("assign to the mobile lead"), look up the team member in that role.

## Board-type CLI

Determined by `## Agile Board → type` in `.cursor/pai-orbit-config.md`:

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

Column→label map is read from `## Agile Board → columns` in `.cursor/pai-orbit-config.md`. If the map is absent, ask the user to supply it before moving.

**Azure DevOps:**

Unlike the other board types, Azure Boards has no MCP path here and the `az boards` command group lives in an extension rather than `az` core — check it's present before the first call of the session:

```bash
az extension show --name azure-devops >/dev/null 2>&1 \
  || echo "MISSING: azure-devops extension — run 'az extension add --name azure-devops'"
```

```bash
# Create — flags confirmed against the az boards work-item create reference
az boards work-item create \
  --title "<title>" \
  --type "<work-item-type>" \
  --org https://dev.azure.com/<org> \
  --project <project> \
  --description "<body>" \
  --assigned-to "<handle>"

# Read current state — flags confirmed against the az boards work-item show reference
az boards work-item show --id <N> --org https://dev.azure.com/<org>

# Move card (transition) — flags confirmed against the az boards work-item update reference
az boards work-item update --id <N> --state "<next-column-state>" --org https://dev.azure.com/<org>

# Comment
az boards work-item update --id <N> --discussion "<text>" --org https://dev.azure.com/<org>

# Close — Azure has no dedicated close verb; transition to the process's terminal state instead.
# The terminal state name varies by process template (e.g. "Closed" for Agile, "Done" for Scrum) —
# use whatever the column→state map names as the closing state, never hardcode "Closed".
az boards work-item update --id <N> --state "<terminal-state-from-config>" --org https://dev.azure.com/<org>
```

Column→state map is read from `## Agile Board → columns` in `.cursor/pai-orbit-config.md`. If the map is absent, ask the user to supply it before moving.

## Auth preflight

**Azure DevOps:** before the first board operation in a session, confirm the DevOps PAT is actually usable — `az account show` only checks ARM login and says nothing about the `az devops login`/`AZURE_DEVOPS_EXT_PAT` credential the `azure-devops` extension needs, so probe with a real, cheap DevOps call instead:

```bash
az devops project list --org https://dev.azure.com/<org> -o none \
  || echo "Not authenticated to Azure DevOps — run 'az devops login' or set AZURE_DEVOPS_EXT_PAT, then retry."
```

If the PAT is missing or expired, report the exact remedy above and stop — never report a create/transition/comment/close as applied without confirming the command's exit code.

## Conventions (always apply)

- `refs #N` in commits during development; `closes #N` in the final shipping commit only
- One feature = one issue; sub-tasks go in the body unless they ship independently
- Do not close issues autonomously without confirming with the user
