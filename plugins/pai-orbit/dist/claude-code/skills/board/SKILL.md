---
name: board
description: Task management and ticket status sync — create issues, transition status, post comments, close on ship — on the project's configured board. Reads board config from .claude/pai-orbit-config.md and team roster from .claude/team.md. TRIGGER when creating a task or issue, when a workflow stage completes and the ticket needs updating, when reconciling stale board state, assigning work, or asking about what's on the board. SKIP read-only board browsing (just use the browser or CLI directly).
---

# Agile Board

Create issues, keep ticket status true to reality, and close on ship.

Reads from:
- `.claude/pai-orbit-config.md` → `## Agile Board` section — board type, URLs, label taxonomy, column flow, `lifecycle:` stage map
- `.claude/team.md` — team roster for default assignees and handoffs

## MCP vs shell

Before executing any board operation, check `.claude/pai-orbit-config.md → ## MCP → board`:

- **`github`** — prefer GitHub MCP tool calls (e.g. `create_issue`, `add_issue_comment`, `update_issue`). Fall back to `gh` CLI if MCP is unavailable.
- **`linear`** — prefer Linear MCP tool calls. Fall back to `linear` CLI if MCP is unavailable.
- **`jira`** — prefer Jira MCP tool calls. Fall back to `jira` CLI if MCP is unavailable.
- **`none` or section absent** — use CLI shell commands directly; no MCP attempt.

If an MCP call fails or the server is unreachable, fall back to the equivalent shell command and note the fallback: "MCP unavailable — using shell fallback."

---

## Board Sync Checkpoint

The mechanism that keeps ticket status from drifting. Modes call it by stage name at
each point where reality changes — see `## Lifecycle stages` below for the callers.

**This is a mandatory step, not an offer.** When a mode reaches a sync point, render the
checkpoint and do not proceed to the next step until it is answered. Never update a
ticket silently, and never skip the checkpoint because the user did not ask for it —
the whole point is that they should not have to.

### Procedure

1. **Resolve the issue.** Use the issue linked to the current work (from the branch name,
   the commit trailer `refs #N` / `closes #N`, the PR body, or the session context). If no
   issue can be resolved, say so in one line and continue the mode — do not block, and do
   not guess an issue number.
2. **Resolve the target.** Read `## Agile Board → lifecycle` and find the row for this
   stage. That row gives the target Column and whether to close the issue.
3. **Apply the no-op rules** (below). If any applies, render nothing and continue silently.
4. **Read the current state** via `### Read an issue's current state` — the checkpoint must
   show the real current column, never an assumed one.
5. **Render the checkpoint** exactly in the form below, with the comment pre-filled.
6. **Act on the answer.**

### The checkpoint

```
── Board sync ──────────────────────────────
  Issue    #41  Add retry to webhook sender
  Status   Backlog  →  Done
  Close    yes
  Comment  Deployed to production
           2026-08-19 14:02 UTC · commit 3f2a1c9
           Health check: 200 OK
────────────────────────────────────────────
  Apply? (yes / edit / skip)
```

Keep it to this shape — no extra prose above or below it. The user should be able to
answer in one word without reading anything else.

- `Status` always shows **current → target**. If they are already equal, show
  `Status   Done (already correct)` and drop the arrow.
- `Close` line appears only when the `lifecycle:` row says `yes`.
- `Comment` is pre-filled from the stage's template (see `## Lifecycle stages`). Facts in
  it — commit SHA, PR URL, timestamp, environment, health-check result — must be real
  values gathered from the session, never placeholders.

### Answers

- **`yes`** — apply in this order: post the comment, transition the status, close if the
  row says so. Report one line per action taken. If a step fails, surface the exact error
  and the permission it needs (see `### Auth preflight`) — never report success on a
  failed write, and never silently drop the remaining steps.
- **`edit`** — let the user change the comment text or the target column, then re-render
  the checkpoint with their edit and ask again.
- **`skip`** — do not write anything. Record the skipped stage and issue for the session,
  and re-surface it at the next checkpoint as a one-line reminder:
  `Note: board sync for #41 at stage review_open was skipped earlier.`
  A skip stays visible; it never disappears quietly.

### No-op rules

Render nothing and continue silently when:
- The stage's Column in `lifecycle:` is `—` — this project's workflow has no such stage.
- `## Agile Board → Type` is `none`.
- No issue could be resolved for the current work.

### When the `lifecycle:` map is missing

A project set up before this map existed will not have it. Do not error and do not skip
the sync. Instead: list the columns from the `columns:` table, ask once which one this
stage maps to, use that answer for the rest of the session, and note:
"`lifecycle:` map missing — re-run `/setup` to make this permanent."

---

## Lifecycle stages

Stage names are pai-orbit's fixed vocabulary. The Column each maps to is the project's
own, read from `## Agile Board → lifecycle`. Callers pass a stage name; they never name
a column directly.

| Stage | Called by | Pre-filled comment |
|-------|-----------|--------------------|
| `ux_defined` | `/ux` after the flow is written | UX defined · link to `ux.md` |
| `groomed` | `/groom` after requirements are written | Requirements groomed · link to `requirements.md` · any open questions |
| `designed` | `/design` after the design doc is approved; `/arch` after an ADR lands | Design resolved · link to `design.md` / ADR |
| `build_start` | `/build` once the branch is established | Build started on branch `<branch>` |
| `review_open` | `/git` after the PR is created | PR opened · `<pr-url>` |
| `tested` | `/test` after test sign-off | Tests passed · link to `test-plan.md` · pass/fail counts |
| `merged` | `/git` after merge to the base branch | Merged to `<base>` as `<sha>` |
| `deployed` | `/release` after post-deploy health checks pass | Deployed to `<env>` · timestamp · commit `<sha>` · health-check result |

### Comment-only sync

Some work belongs on a ticket's thread without moving its card — capturing domain
knowledge, landing an ADR, recording an "already complete" finding. Callers request a
comment-only sync for these. Render the checkpoint with the `Status` and `Close` lines
omitted:

```
── Board sync ──────────────────────────────
  Issue    #41  Add retry to webhook sender
  Comment  Domain knowledge captured
           docs/domain/webhook-delivery.md
────────────────────────────────────────────
  Apply? (yes / edit / skip)
```

Callers: `/domain` after writing a domain doc, `/arch` when an ADR is linked to a ticket,
`/build` when it finds work already complete, and the ADR rule in `.claude/rules/decisions.md`.

---

## Procedure

### Creating an issue

1. Read `.claude/pai-orbit-config.md` to determine board type and column structure
2. Ask which board/project if there are multiple (e.g., Tech vs Ops, Engineering vs Product)
3. Ask issue type to determine labels and starting column (per the config)
4. Read `.claude/team.md` to propose a default assignee based on issue type and role
5. Compose:
   - **Title:** short, imperative, ≤ 72 chars — mirrors commit format
   - **Body:** what + why; link to relevant docs (`docs/features/<feature>/requirements.md`, prior issues, ADRs); for features, include sub-tasks broken down by service
6. Create the issue using the configured CLI (see `## Board-type commands`)
7. Place on board: report the target column; attempt CLI placement if available, otherwise instruct the user to move the card manually

### Read an issue's current state

Returns title, body, current column/state, labels, assignees, open/closed. Required by
the checkpoint (to show the real current column) and by `### Reconcile the board`.
Always read live — never reuse a value cached earlier in the session, because the user
may have moved the card by hand in the meantime.

See `## Board-type commands` for the per-type command.

### Transition an issue

1. Resolve the target Column for the stage from `## Agile Board → lifecycle`.
2. For **GitLab**, run the label-resolution step below before applying any label.
3. For **GitHub Projects v2**, resolve the three IDs as described below.
4. Execute the move via the per-type command in `## Board-type commands`.
5. Verify: re-read the issue state and confirm the column actually changed. A command
   that exits 0 without moving the card (a common Projects v2 failure when the option ID
   is wrong) must be reported as a failure, not a success.

### Comment on an issue

Post to the issue's own thread so the ticket carries its own history. Keep comments
short and factual — what happened, when, and the link or SHA that proves it. No
narration of the session, no restating the ticket body.

### Close an issue

Only close when the `lifecycle:` row for the stage says `Close issue? yes`, or when the
user asks directly. On boards where a terminal column *is* the closed state (Jira, Linear),
the transition already closes it — do not issue a second close call.

### Reconcile the board

Invoked as `/board reconcile`. Repairs boards that have already drifted, and runs at the
start of `/plan` so prioritisation is not based on stale state.

1. List open issues on the board.
2. For each, establish git reality:
   - `closes #N` present in a commit on the main branch → should be at least `deployed`
   - a merged PR references it → at least `merged`
   - an open PR references it → at least `review_open`
   - a branch exists for it, no PR → at least `build_start`
   - no branch, no PR, no commit → leave it alone
3. Compare against the issue's current column, ordered by the `lifecycle:` table's row
   order. Report every mismatch in one table:

```
── Board reconcile ─────────────────────────────────────────────
  #41  Backlog      →  Done         merged 3f2a1c9, closes #41
  #38  Backlog      →  In review    PR #52 open
  #44  In progress     ok
  #45  Done            ok
────────────────────────────────────────────────────────────────
  Apply? (all / select / cancel)
```

4. **Only ever advance a card forward** through the `lifecycle:` order. Never move one
   backwards — a human may have moved it deliberately, and reconcile must not fight them.
   Report backward mismatches as informational lines only.
5. On `all` or `select`, apply each via `### Transition an issue` plus a comment recording
   why reconcile moved it (`Status corrected by /board reconcile — merged 3f2a1c9`).

### Handoffs and assignments

Read `.claude/team.md` for handles. Never hardcode handles in this skill — always look them up at runtime.
If a role-based assignment is requested ("assign to the mobile lead"), look up the team member in that role.

---

## Board-type commands

Determined by `## Agile Board → type` in `.claude/pai-orbit-config.md`. Where a command
below is marked **unverified**, run its `--help` once before first use in a session and
correct the invocation if the CLI differs — do not retry a guessed flag against a live board.

### GitHub Issues

Status lives in labels plus open/closed — there are no columns. Treat the `lifecycle:`
Column value as a label name.

```bash
# Create
gh issue create --repo <owner>/<repo> --title "<title>" --body "<body>" \
  --label "<labels>" --assignee "<handle>"

# Read current state
gh issue view <N> --repo <owner>/<repo> --json number,title,state,labels,assignees,body

# Transition (swap the column label)
gh issue edit <N> --repo <owner>/<repo> \
  --remove-label "<current-column-label>" --add-label "<target-column-label>"

# Comment
gh issue comment <N> --repo <owner>/<repo> --body "<text>"

# Close
gh issue close <N> --repo <owner>/<repo>
```

### GitHub Projects v2

The card's column is the project's `Status` single-select field. `gh project item-edit`
handles this reliably, but it takes opaque node IDs rather than names, so resolve them
first. Comments and closure act on the underlying issue, not the project item.

```bash
# Resolve the Status field ID and the target option's ID
gh project field-list <number> --owner <owner> --format json \
  | jq -r '.fields[] | select(.name == "Status")
           | .id as $f | .options[] | select(.name == "<target-column>")
           | "field=\($f) option=\(.id)"'

# Resolve the project's node ID and this issue's item ID
gh project view <number> --owner <owner> --format json | jq -r '.id'
gh project item-list <number> --owner <owner> --format json \
  | jq -r '.items[] | select(.content.number == <N>) | .id'

# Transition
gh project item-edit --id <item-id> --project-id <project-node-id> \
  --field-id <status-field-id> --single-select-option-id <option-id>

# Read current state (column comes from the item's Status)
gh project item-list <number> --owner <owner> --format json \
  | jq -r '.items[] | select(.content.number == <N>) | .status'

# Comment / close — on the issue itself
gh issue comment <N> --repo <owner>/<repo> --body "<text>"
gh issue close <N> --repo <owner>/<repo>
```

If the option name in `lifecycle:` matches no option in `field-list`, stop and show the
live option names — the config is stale. Do not pick the closest match.

### GitLab

Boards are label-driven — each column maps to a label (scoped like `workflow::In Progress`
or standalone like `To Do`). Moving a card means removing the current column label and
adding the target one. Always run the label-resolution step below first.

```bash
# Create
glab issue create --repo <namespace>/<project> --title "<title>" --description "<body>" \
  --label "<labels>" --assignee "<handle>"

# Read current state
glab issue view <issue-id> --repo <namespace>/<project> --output json

# Transition (swap column label — scoped or standalone)
glab issue update <issue-id> --repo <namespace>/<project> \
  --remove-label "<current-column-label>" --label "<target-column-label>"

# Comment
glab issue note <issue-id> --repo <namespace>/<project> --message "<text>"

# Close
glab issue close <issue-id> --repo <namespace>/<project>
```

**GitLab label resolution (always run before applying a label):**
1. Build the match list: column→label entries from config + any label name the user stated verbatim.
2. Run `glab label list --repo <namespace>/<project>` and check whether the target label exists (case-insensitive match on name).
3. If found in the live list but not in config — use it and note that the config is stale (suggest re-running `/setup`).
4. If not found at all — show the full label list to the user and ask them to confirm the intended label before proceeding. Never guess.

### Jira

The terminal column is a workflow status, so transitioning to it closes the issue — no
separate close call. Column values come from `## Agile Board → Workflow`.

```bash
# Create
jira issue create --project <key> --summary "<title>" --description "<body>" --assignee <user-id>

# Read current state                                          # unverified
jira issue view <key>-<N> --raw

# Transition                                                  # unverified
jira issue move <key>-<N> "<target-status>"

# Comment                                                     # unverified
jira issue comment add <key>-<N> "<text>"
```

`jira-cli` subcommand names have changed across releases. Confirm `jira issue --help`
once per session before the first write; if the invocation differs, use the corrected one
and tell the user the config note is stale. Prefer the Jira MCP when `## MCP → board` is `jira`.

### Linear

State transitions close the issue implicitly — no separate close call.

```bash
# Create
linear issue create --title "<title>" --description "<body>" --team <team-id> --assignee <user-id>

# Transition
linear issue update <issue-id> --state "<target-state>"

# Read current state / Comment                                # unverified
linear issue view <issue-id>
linear comment create <issue-id> --body "<text>"
```

Prefer the Linear MCP when `## MCP → board` is `linear` — it covers comments and reads
that the CLI may not. If neither is available, render the checkpoint, then print the exact
change as a manual step for the user rather than reporting it applied.

### Notion

No CLI. Use the Notion MCP if `## MCP → docs` is `notion`; the column is a page property.
If no MCP is configured, still render the checkpoint, then print the change as a manual
step ("set Status to Done on <page-url> and add this comment") — never report it applied.

### Auth preflight

Board writes fail on missing scope more often than on wrong syntax, and a scope error
must never be mistaken for "nothing to do". Before the first write of a session:

- **GitHub Projects v2** — a default `gh auth login` does **not** grant project access.
  If any `gh project` call returns `missing required scopes`, stop and surface the exact
  remedy: `gh auth refresh -s project`. Do not fall back to "move it in the browser" and
  do not report the transition as done.
- **GitLab / Jira / Linear** — surface the raw auth error and the token or scope it names.

In all cases: report the failure at the checkpoint, keep the stage recorded as unsynced,
and re-surface it like a `skip`.

---

## Conventions (always apply)

- `refs #N` in commits during development; `closes #N` in the final shipping commit only
- One feature = one issue; sub-tasks go in the body unless they ship independently
- **Never update a ticket silently.** Every status change and comment goes through the Board Sync Checkpoint — render it, then act on the answer
- Never report a write as applied without confirming it landed
