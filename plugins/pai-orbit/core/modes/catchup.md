You are now in CATCHUP MODE.

This is a read-only session-start briefing: orient yourself in the project, report what moved recently, and propose what the developer should pick up next.

Two outcomes from one run:

1. **You become ready to work** — you have read the conventions, architecture, rules, and recent movement, so you can start any ticket without re-reading from scratch.
2. **The developer gets a briefing** — a short, skimmable "here's where things stand and what's on your plate" report, ending with a suggested next action.

This mode is **read-only**. Do not edit, commit, push, create branches, or move board items. Do not start implementing anything — CATCHUP ends by _proposing_ what to pick, then waits for the developer to choose.

Usage:
- `/catchup` — whole picture
- `/catchup yesterday` — bias the report to the last day
- `/catchup me` — skip the project-wide pulse; focus on the developer's own work + next pick

Switch out when:
- The developer picks a ticket to implement → `/build` (it establishes the branch — CATCHUP never does)
- The picked item is not groomed → `/groom`
- The picked item has an unresolved design question → `/design`
- The briefing surfaces a prioritisation problem (stale items, conflicting sprint) → `/plan`
- An epic needs deeper context before choosing → `/epic load <name>`

---

## Reads from

- `CLAUDE.md` — stack, module map, commands, constraints pointer
- `.claude/rules/*` — ADR rules and any other standing rules
- `.claude/pai-orbit-config.md` — board type, branching model, main/development branch, protected branches, MCP preferences, System Docs pointer
- `.claude/team.md` — roster; maps git identity to board handle
- `docs/architecture/constraints.md`, `docs/architecture/system.md` — hard rules a change must not break
- `docs/decisions/` — ADR list (titles + dates); read any added or changed in the last ~2 weeks in full
- `docs/plans/` — current sprint plan and roadmap
- `docs/epics/` — epic status and feature tables
- `docs/domain/` — skim `product-capabilities.md` and any index/overview doc; read the module doc(s) relevant to what the developer is likely to pick up
- `docs/wip/session-capture-*.md` — the most recent handoff note (written by `/build` before a mode switch); this is the primary "where did I stop" signal
- `docs/ops/`, `docs/backlog/` — human-owned; read for context only
- Git history and the task board (live, via the commands below)

**Writes:** nothing. No doc output — the briefing is printed to the conversation only.

---

## Procedure

### Phase 1 — Orient yourself (silent; do not narrate the file list)

Read enough to hold the project in context. Prefer breadth over depth; skim, don't deep-read.

- Read `.claude/pai-orbit-config.md` first. If a `## System Docs` section is present, resolve `system_docs_repo` the same way `/build` and `/plan` do (relative path → check the directory exists; git URL → check for a local clone; warn once and continue if unreachable) and add `<system_docs_repo>/<system_docs_path>` to the read set.
- Read the files listed under **Reads from** above. Any other file this project needs for orientation (`docs/standards/`, `docs/features/<active>/`, CI config) — read it if it helps; the list is the baseline, not the ceiling.
- If a file is missing, note it once and continue — do not block. If `docs/architecture/constraints.md` is absent, mention once that `/arch init` has not been run.

**This reading is a baseline, not a cap.** Once the developer picks a ticket and you leave CATCHUP, read (or re-read) whatever that task requires — the same files in depth, more `docs/domain/` module docs, the feature's `requirements.md`/`design.md`, source, ADRs. Phase 1 is the minimum shared context to be _ready_, not the maximum you are _allowed_.

### Phase 2 — Project pulse (skip if `/catchup me`)

Report what has happened, at three horizons. Use git and the board; **do not** rely on memory.

Resolve `<main>` from `.claude/pai-orbit-config.md → ## Git`: the `Main branch` for GitHub Flow / trunk-based, or the `Development branch` for GitFlow. Fetch first (`git fetch --prune`) so remote refs are current.

- **Overall (where the project is):** current phase/sprint from `docs/plans/`, epic progress from `docs/epics/`. One or two sentences, not a history dump.
- **Recent (last ~7 days):** merges to `<main>`, notable ADRs, new/changed docs:
  - `git log --since="7 days ago" --first-parent origin/<main> --pretty=format:'%h %ad %s' --date=short`
  - `git log --since="7 days ago" --first-parent origin/<main> --name-only --pretty=format:'%h %s' -- docs/` for doc and ADR changes
- **Open PRs (team-wide):** list every open PR against `<main>` using the project's git host, following `/git`'s MCP-vs-shell rule (`## MCP → git`: prefer the configured MCP, otherwise the host's CLI). Summarise who has what open, what is approved-but-unmerged, what is waiting on review. Flag anything stale (open more than a few days). If no PR listing is available for this host, say so and skip the bullet.
- **Recently merged PRs (last ~7 days):** same source — the PR view of the merge log above; cross-check the two. Call out who shipped what. If `## Git → Protected branches` implies review is required, flag any PR that merged without an approving review as a governance gap.
- **Yesterday (bias here if `/catchup yesterday`):** `git log --all --since="yesterday" --until="today" --pretty=format:'%h %an %ad %s' --date=short` — call out what merged and what is mid-flight.

Keep each horizon to a few bullets. Reference commits as `hash` and PRs as `#N`.

### Phase 3 — The developer (who + their work + what to pick)

1. **Identify the developer** from git identity — `git config user.name` / `user.email` — and match to a row in `.claude/team.md` to get their board handle (GitHub / Linear / Jira column, per the configured board type). If no confident match, ask once: "Which team member are you?" and list the names from `team.md`. If `team.md` is missing, use the git identity as-is.
2. **What they did recently:** `git log --all --author="<name-or-email>" --since="7 days ago" --pretty=format:'%h %ad %s' --date=short`, plus their local branches: `git branch --sort=-committerdate`. Summarise, don't dump.
3. **Their PR status** — from the open-PR list in Phase 2, split out the two sets that need _this_ developer:
   - **Raised by them, still open** — needs their action: chase a reviewer, address comments, or merge once approved. Note approved-but-unmerged ones (ready to merge).
   - **Review requested of them, not yet voted** — **their review is blocking someone else**; surface these prominently so they unblock teammates first.
   - Others' open PRs stay in the Phase 2 team-wide view.
   - If `/catchup me` skipped Phase 2, run the open-PR listing now, filtered to this developer.
4. **What is assigned to them — board first, degrade gracefully.** Query the board configured in `## Agile Board` for open items (not in a done column) assigned to their handle, following `/board`'s MCP-vs-shell rule (`## MCP → board`) and `/board`'s per-type CLI reference. Capture status, priority, sprint/milestone, and points where the board tracks them.
   - If the board is unreachable, MCP tools are not loaded, or the query returns nothing, **fall back to local**: `docs/plans/` (current sprint), `docs/epics/*/EPIC.md` feature tables, and `docs/features/*/requirements.md` open questions with this developer as owner. **State which source you used** in the briefing.
5. **What to pick next (a recommendation, not an action).** Order by:
   - (a) an open PR of theirs that is approved-but-unmerged or has review comments — finish what is in flight first;
   - (b) a review requested of them — unblock a teammate;
   - (c) the most recent `docs/wip/session-capture-*.md` if it names an in-progress step for this developer — resume it;
   - (d) then from the assigned set: current sprint first, then priority, then unblocked (check dependencies noted in the epic or `requirements.md`), then smaller-first for momentum.
   - If a branch is already in flight (uncommitted work — `git status --short` — or an open PR), surface that as "resume this first".
   - Note the readiness of each suggestion: `/build` only accepts items that are groomed and design-resolved. If the top pick lacks `requirements.md` or has open design questions, say so and name the mode to enter first (`/groom` or `/design`).

---

## Output — the briefing

Print a compact report (Markdown, skimmable). Shape:

```
## Catchup — <developer name> · <YYYY-MM-DD>

**Project:** <one line: phase/sprint + headline status>

**Recent (7d):** <3–5 bullets: merges to <main>, notable ADRs, doc changes>
**Merged PRs (7d):** <#N title — by <who>, <date> — or "none">
**Open PRs (team):** <#N title — by <who> — approved / waiting-review / stale — or "none open">
**Yesterday:** <what merged / what is mid-flight>   ← only if relevant or `/catchup yesterday`

**Your recent work:** <2–4 bullets from git>
**Your open PRs:** <#N title — waiting-review / approved-ready-to-merge / comments-to-address — or "none">
**Reviews requested of you:** <#N title — by <who>, awaiting your vote — or "none">   ← unblock these first
**Assigned to you (<source: board | local docs>):**
- <KEY-n> <title> — <status> · <priority> · <sprint> · <points, if tracked>
**In flight:** <uncommitted branch / open PR / session-capture step to resume — or "nothing open">

**Suggested next:** <1–3 items, why this order, readiness of each>. Say the word and I'll switch to `/build` (or `/groom` / `/design` if the item isn't ready).
```

Then stop and wait. **Do not** create a branch or begin work until the developer picks.

---

## Notes

- Read-only means **no writes** (no commits, no board writes, no branch creation, no doc files) during CATCHUP itself — it does **not** limit reading. Read as many files as orientation needs, and read more freely once work begins.
- Branch creation and the protected-branch rule belong to `/build` and `/git` — they apply the moment the developer picks a ticket and you leave CATCHUP.
- Convert any relative dates you surface to absolute (e.g. "yesterday" → the date) so the briefing reads correctly if pasted somewhere later.
- If git identity maps to no one in `team.md`, still deliver Phases 1–2; ask who they are for Phase 3.
- This mode contains no host- or board-specific commands. Git host and board access go through `/git` and `/board`; every project specific (handles, project keys, org URLs) is resolved at runtime from `.claude/pai-orbit-config.md` and `.claude/team.md`.
