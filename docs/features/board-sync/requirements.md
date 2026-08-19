## Epic
<!-- Standalone — no parent epic -->

## Purpose
Keep ticket status on the project's board true to what has actually happened, so that a
ticket built, merged, and deployed to production is never still sitting in `Backlog` —
regardless of board type (GitHub Issues, GitHub Projects v2, GitLab, Jira, Linear, Notion)
and without the ticket owner having to remember to ask for the update.

## Scenarios in scope
1. A developer deploys to production via `/release`; the shipped tickets move to the project's done column and receive a deploy comment.
2. A developer starts work via `/build`; the ticket moves out of the backlog into the project's in-progress column.
3. A developer opens a PR via `/git`; the ticket moves to the review column and the PR URL lands on the ticket thread.
4. A project whose workflow has no review column is never prompted about one.
5. A team lead runs `/board reconcile` on a board that already drifted; mismatches are reported and corrected in bulk.
6. A project that installed an earlier version and has not re-run `/setup` continues to work.

## User stories / use cases
- As a **team lead**, I want a ticket that shipped to production to show as done without anyone asking, so that project status reporting is accurate.
- As a **developer**, I want to see exactly which status change and which comment will be applied before it happens, in one small block I can answer in one word.
- As a **developer** on a three-column board, I want no prompts about stages my workflow does not have.
- As a **team lead**, I want to repair a board that has already drifted in one pass rather than card by card.
- As a **developer on GitLab / Jira / Azure**, I want the same behaviour as GitHub users get, not a GitHub-shaped feature with gaps elsewhere.

## Functional requirements
1. REQ-1 (Scenario 1–3): pai-orbit must define a fixed set of workflow stages — `ux_defined`, `groomed`, `designed`, `build_start`, `review_open`, `tested`, `merged`, `deployed` — and modes must reference a ticket transition only by stage name, never by a column name.
2. REQ-2 (Scenario 4): `.claude/pai-orbit-config.md → ## Agile Board → lifecycle` must map each stage to a column of this project's board, or to `—` meaning the project has no such stage.
3. REQ-3 (Scenario 4): A stage mapped to `—` must be a silent no-op — no prompt, no ticket write, no output.
4. REQ-4 (Scenario 1–3): At each stage, the calling mode must render the Board Sync Checkpoint, showing the ticket, the current column, the target column, whether the ticket will be closed, and the full pre-filled comment text. It must not proceed until answered.
5. REQ-5 (Scenario 1–3): The current column shown must be read live from the board at checkpoint time, never assumed or reused from earlier in the session.
6. REQ-6: The checkpoint must accept `yes` (apply), `edit` (amend comment or target column, then re-render), and `skip` (write nothing).
7. REQ-7: A `skip` must be recorded and re-surfaced as a one-line reminder at the next checkpoint in the session.
8. REQ-8 (Scenario 1): `/release` must, after post-deploy health checks pass, resolve every ticket in the deployed commit range and run the checkpoint at stage `deployed` for each.
9. REQ-9 (Scenario 1): `/release` must clear the shipped-but-dark markers in `docs/domain/product-capabilities.md` for capabilities the deploy made live.
10. REQ-10: `/board` must provide four primitives for every supported board type: read current state, transition status, post a comment, close. A board type without a usable CLI must render the checkpoint and then print the change as an explicit manual step — never report it applied.
11. REQ-11: A comment-only variant must post to a ticket thread without moving the card, for work that is not a workflow stage (domain capture, ADR links, already-complete findings).
12. REQ-12 (Scenario 5): `/board reconcile` must compare each open issue against git reality (branch exists, open PR, merged PR, `closes #N` on the main branch), report every mismatch in one table, and apply the corrections the user confirms.
13. REQ-13 (Scenario 5): Reconcile must only advance a card forward through the `lifecycle:` order. A card further along than git reality suggests must be reported as informational and left untouched.
14. REQ-14 (Scenario 5): `/plan` must run reconcile before any prioritisation call.
15. REQ-15 (Scenario 6): When the `lifecycle:` table is absent, `/board` must ask once per stage which column to use, apply it for the session, and advise re-running `/setup`. It must not error and must not skip the sync.
16. REQ-16: `/setup` must write the `lifecycle:` table from the columns it already discovered, proposing a default mapping inferred from the column names. It must not run a second discovery pass or ask for column names again.
17. REQ-17: A failed write must report the exact error and the permission or scope it needs, keep the stage recorded as unsynced, and re-surface it like a `skip`. Success must never be reported for a write that did not land.

## Non-functional requirements
- **NFR-1 (Maintainability):** The checkpoint, the stage vocabulary, and the per-board command matrix are defined once in `core/skills/board/SKILL.md`. Opting a new mode into a stage is a one-line change; adding a board type is one row in the command matrix.
- **NFR-2 (Board agnosticism):** No mode file may contain a board-type conditional or a column name. All board-type dispatch happens inside `/board`.
- **NFR-3 (Backward compatibility):** Per `docs/architecture/constraints.md` rule 7, an install on an earlier version that has not re-run `/setup` must keep working. New config field ⇒ version bump plus migration note.
- **NFR-4 (Adapter parity):** Per rule 6, the change must be carried by all six adapters. Authoring only mode/skill/template text (no new hook) means `claude-code`, `cursor-plugin`, `cursor`, and `kiro-power` carry it in full. `copilot` and `codex` emit only condensed mode summaries and a one-row-per-skill table, so they carry the `/board` description but not the checkpoint itself — the pre-existing gap recorded in the rule 6 known-gap comment, not something this change introduces.
- **NFR-5 (Signal quality):** The checkpoint is the only user-visible output of a sync. It must be readable in one glance and answerable in one word.

## Context
- pai-orbit is a Claude Code plugin — enforcement lives in markdown mode and skill files, not compiled code.
- Board type is resolved at runtime from `.claude/pai-orbit-config.md`; MCP is preferred over CLI when `## MCP → board` names a server, with shell always the fallback.
- `closes #N` in a commit is a text convention only. It auto-closes on GitHub and GitLab, does nothing on Jira/Linear/Notion, never moves a card into a column, and is fragile under squash merge. It cannot be the status mechanism.
- Shares the board read primitive with `docs/features/ticket-gate/requirements.md`, the entry-side gate. `board/SKILL.md` owns the primitive; `ticket-gate` consumes it rather than duplicating board dispatch — per `docs/wip/analysis-ticket-gate-2026-07-24.md`.

## Out of scope
- **Azure Boards support** — tracked separately in the-psi/pai-orbit#55. The stage/column split means adding it is a command-matrix row plus a config option, with no mode file changes.
- Silent autonomous status updates with no confirmation — considered and rejected; see `docs/decisions/2026-08-19-board-sync-checkpoints.md`.
- Hook-based enforcement (a `Stop` hook blocking session end on an unsynced ticket) — deferred as the next escalation if drift persists.
- Creating tickets, grooming their content, or validating their completeness (that is `/board` create and `ticket-gate`).
- Reconciling epic/feature status in `requirements.md` headers against board state — a second, separate drift problem.

## Open questions
<!-- None — all resolved during scoping 2026-08-19. -->
<!-- Q: Autonomous or confirmed? → A: Confirmed, but the checkpoint is mandatory and pre-filled, not an optional offer. -->
<!-- Q: Which transitions? → A: Whatever the project's own workflow declares; `—` makes a stage a no-op. -->
<!-- Q: Azure Boards now? → A: No — separate ticket. -->
<!-- Q: Fix already-drifted boards? → A: Yes, /board reconcile. -->

## Acceptance criteria
- AC-1 (Scenario 1): Given a production deploy whose commit range contains `closes #41`, when health checks pass, `/release` renders a checkpoint for #41 at stage `deployed` showing the real current column, the target column, `Close: yes`, and a comment containing environment, timestamp, commit SHA, and health-check result.
- AC-2 (Scenario 1): Answering `yes` moves the card, posts the comment, and closes the ticket; the run report states the outcome per ticket. A production deploy that resolved no tickets says so explicitly.
- AC-3 (Scenario 2): Given `/build` on a linked ticket in `Backlog`, once the branch is established a checkpoint renders showing `Backlog → <the project's in-progress column>`.
- AC-4 (Scenario 3): Given `/git` creates a PR, a checkpoint renders at stage `review_open` with the PR URL in the pre-filled comment; on `yes` the comment is present on the ticket.
- AC-5 (Scenario 4): Given a `lifecycle:` row whose Column is `—`, reaching that stage produces no prompt and no output.
- AC-6 (REQ-5): Given a card moved by hand in the board UI mid-session, the next checkpoint shows the hand-moved column as current, not the value from earlier in the session.
- AC-7 (REQ-7): Given `skip` at one checkpoint, the next checkpoint in that session includes a one-line reminder naming the skipped issue and stage.
- AC-8 (Scenario 5): Given an issue whose `closes #N` is merged to main but whose card is in `Backlog`, `/board reconcile` lists it with the correct target and its evidence, and applies the move on confirmation.
- AC-9 (REQ-13): Given a card in `Done` with no merged PR, reconcile reports it as informational and does not move it backwards.
- AC-10 (Scenario 6): Given `.claude/pai-orbit-config.md` with no `lifecycle:` table, reaching a sync point asks once which column to use and advises re-running `/setup` — it does not error and does not skip.
- AC-11 (REQ-17): Given a GitHub Projects v2 write attempted without the `project` OAuth scope, the failure is reported with the remedy `gh auth refresh -s project`, the stage is kept unsynced, and no success is claimed.
- AC-12 (NFR-2): `grep` across `plugins/pai-orbit/core/modes/` returns no board-type conditional and no board column name.

---
Status: Built — shipped in 1.5.0
