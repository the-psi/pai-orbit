## Epic
<!-- None — standalone feature, tracked as issue #30 -->

## Purpose
When a pai-orbit mode finishes its work, it moves the ticket to the right next column on the board by itself, using a mode→column map that `/setup` builds. This serves teams that run their work through a pai-orbit board, so the board always shows where each ticket really is — without anyone having to remember to move it.

## Scope
What this delivers, as concrete changes:
- `core/modes/setup.md` — after the existing board column discovery, `/setup` builds a mode→column map for whichever board type it detects. It only suggests columns that exist on that board: first a column whose name matches the step (Design, Build, In review, and for review a post-review pre-merge column such as Approved or Ready to merge), otherwise the next real column in board order. If the wanted column is missing, it offers another real column or "no move". The user confirms every row; setup saves the real column names and IDs.
- `.claude/pai-orbit-config.md` → new `## Mode transitions` section, and the same section in `core/templates/pai-orbit-config.md.template`.
- `core/skills/board/SKILL.md` — new `transition(mode)` operation that reads the map and moves the ticket. Modes call this one step instead of re-deriving the column.
- `core/modes/groom.md`, `design.md`, `build.md`, `review.md` — session close moves the ticket automatically via `transition(mode)`, with no "Offer to move?" prompt.
- `core/modes/build.md` — build no longer closes the ticket on finish (today: [build.md "After shipping"](../../../plugins/pai-orbit/core/modes/build.md)).
- Missing or unresolved map → the mode surfaces the gap and points to re-running `/setup`; it never silently skips. Projects set up before this change keep working.
- Push and issue-close remain confirmed with the user.
- Release work: rebuild all 5 adapters, version bump + migration note, update `docs/capabilities.md`, ADR.

What this does NOT include:
- ux, test, arch, domain, data, plan modes — unchanged; they keep today's behaviour (ux/test/arch/domain keep their "Offer to move?" prompt).
- Other card moves — `/plan` reprioritisation and manual `/board` moves are unchanged. The existing board-skill advice to drag GitHub Projects cards in the browser is replaced only for mode close-out moves.
- Upstream doc reconciliation at close-out (e.g. design marking resolved questions back in `requirements.md`) — proposed in issue #30 but separate work.
- An incident fast-path column — `core/modes/incident.md` creates and runs its own ticket flow.
- Creating missing columns on the team's board — pai-orbit never changes a board's layout.
- Worktree isolation and model tiering for build sub-agents — issue #32.
<!-- `## Scope` lists implementation items (what gets built). `## Out of scope` below lists
     scenarios deliberately excluded from this feature. They are different lists — do not merge them. -->

## Scenarios in scope
Confirmed scenarios this feature must handle:
1. Setup on a board that has all expected columns — setup suggests a column for groom, design, build and review, the team confirms each row, and the map is saved with real names and IDs.
2. Setup on a board where a wanted column is missing (e.g. no review column) — setup names the gap, suggests the next real column or "no move", the team confirms, and the map is saved.
3. Groom, design, build or review finishes on a linked ticket with a mapped column — the ticket moves automatically with no prompt; build moves it (e.g. to In review) and no longer closes it; push and issue-close still ask.
4. A mode finishes and its map entry is "no move" — the ticket is untouched, with a one-line note and no error.
5. A mode finishes but the map is missing (older project) or the mapped column no longer exists — the mode names the gap and points to `/setup`; the doc is still saved and committed.
6. A mode finishes but the move itself fails (no permission, no network, no CLI) — the mode shows the error and the fix needed; the doc is still saved and committed.
7. A mode finishes with no ticket linked to the session — the move is skipped quietly; the doc is saved and committed as normal.
8. Setup is re-run on a project that already has a map — setup compares the map to the live board, flags changed or broken rows, suggests updates, and keeps untouched rows.
9. A mode finishes but the ticket is already at or past the target column — the ticket is never moved backwards; the mode notes the skip in one line.
10. Review finishes. Approval moves the ticket only to a post-review, pre-merge column (e.g. Approved, Ready to merge) if the board has one; otherwise the ticket stays where it is. "Request changes" never moves it. Review never moves a ticket to Done by default — Done comes from the merge (`closes #N` plus the board's own merge automation).

## User stories / use cases
- S1: As a team lead running `/setup`, I want it to build the mode→column map from my real board, so that tickets move to the right place without guessing.
- S2: As a team lead whose board is missing a column, I want setup to suggest a real column or "no move", so that the map never points at something that does not exist.
- S3: As a developer, I want the ticket to move by itself when I finish a mode, so that the board stays accurate without me remembering.
- S4: As a developer, I want a "no move" mode to finish quietly, so that I am not bothered by irrelevant warnings.
- S5: As a developer on an older or changed project, I want to be told when the map is missing or stale, so that the ticket is not silently left in the wrong place.
- S6: As a developer, I want a failed move to show the error and the fix, so that I can sort out permissions and move on.
- S7: As a developer doing exploratory work, I want modes to work normally without a ticket, so that I am not blocked.
- S8: As a team lead whose board changed, I want re-running setup to update only what changed, so that I do not redo the whole map.
- S9: As a developer re-running a mode, I want the ticket never to move backwards, so that the board does not lose progress.
- S10: As a reviewer, I want approval to leave the ticket short of Done until the PR merges, and "request changes" to leave it in review, so that Done really means merged.

## Functional requirements
1. REQ-1 (Scenario 1): `/setup` must read the live columns of the board it detects (any supported board type) and suggest a target column for groom, design, build and review.
2. REQ-2 (Scenario 1): Setup must show the full map and get confirmation of each row before saving.
3. REQ-3 (Scenario 1): The saved map must hold real column names and IDs — never placeholders — in `.claude/pai-orbit-config.md → ## Mode transitions`. The config template must contain this section.
4. REQ-4 (Scenario 2): Setup must only suggest columns that exist on the board.
5. REQ-5 (Scenario 2): If a wanted column is missing, setup must name it, suggest the next real column in board order, and allow the team to pick another real column or "no move".
6. REQ-6 (Scenario 3): When groom, design, build or review finishes on a linked ticket, the mode must move it to the mapped column through the board skill's `transition(mode)` operation, without an "Offer to move?" prompt, and report the move in one line.
7. REQ-7 (Scenario 3): Build must no longer close the ticket on finish.
8. REQ-8 (Scenario 3): Pushing code and closing the ticket must still require user confirmation.
9. REQ-9 (Scenario 4): A mode mapped to "no move" must leave the ticket untouched and show a one-line note — no error, no warning.
10. REQ-10 (Scenario 5): If the map is missing, or the mapped column no longer exists on the board, the mode must name the problem and ask the user to re-run `/setup`. It must never silently skip.
11. REQ-11 (Scenarios 5, 6, 7): A move that does not happen, for any reason, must not stop the rest of the close-out — the doc is still saved and committed.
12. REQ-12 (Scenario 6): If the move fails, the mode must show the error and the permission or fix needed (e.g. `gh auth refresh -s project` for GitHub Projects).
13. REQ-13 (Scenario 7): With no linked ticket, the move must be skipped quietly.
14. REQ-14 (Scenario 8): Re-running setup must compare the saved map with the live board, flag changed or broken rows, suggest updates, and keep rows the team does not change.
15. REQ-15 (Scenarios 1, 2): Setup must first suggest a column whose name matches the step (Design, Build, In review; for review: Approved, Ready to merge, Ready for release), and fall back to the next column in board order only when none matches.
16. REQ-16 (Scenario 9): A mode must never move a ticket backwards. If the ticket is already at or past the target column, the mode skips the move and notes why in one line.
17. REQ-17 (Scenario 10): Review may move the ticket only on approval ("approve" or "approve with comments"), and only to a post-review, pre-merge column. Setup must not suggest Done for review; with no such column it suggests "no move". The team may still pick Done by hand at setup. On "request changes" the ticket is not moved.

## Non-functional requirements
- **Adapter parity:** all 5 adapters must fully support the new board operation and the updated close-outs (`docs/architecture/constraints.md` rule 6).
- **Backward compatibility:** a project set up before this change, with no `## Mode transitions` section, must not break — it gets the REQ-10 message (`docs/architecture/constraints.md` rule 7). Requires a `plugin.json` version bump and a migration note.

## Context
- Requested by a team migrating a multi-repo project onto pai-orbit, who hand-wrote a `## Mode transitions` table into their own config as a stopgap (issue #30 comment). Companion issues #31 and #33 are closed (2026-07-24); #32 remains open.
- `docs/domain/` is empty and `docs/domain/product-capabilities.md` does not exist, so overlap was checked against `docs/features/*` (weaker coverage). No existing feature, epic or plan covers mode close-out transitions.
- Board consulted: issue #30 sits in **Ready** on the-psi Projects board #3 (columns: Backlog, Ready, In progress, In review, Done).
- `/setup` already discovers column names (`core/modes/setup.md` Step 2b) but not option IDs, and records no mode mapping.
- Today the board skill advises dragging GitHub Projects cards in the browser because CLI moves are unreliable; this feature requires reliable automatic moves for mode close-out.
- Expected map for this repo's own board: groom → Ready, design → no move, build → In review, review → no move.
- Review precedes merge on this team, and board #3 has its "Pull request merged" and "Item closed" workflows enabled, so Done is set by the merge, not by `/review` (decision revised 2026-10-01 after design review).

## Out of scope
- Automatic moves for ux, test, arch, domain, data and plan modes.
- Moves made outside a mode close-out (`/plan`, manual `/board`).
- Upstream doc reconciliation at close-out.
- Incident fast-path column.
- Creating missing columns on a board.
- Moving a ticket backwards on the board.
- Moving a ticket to Done from `/review` by default — Done is owned by the merge.

## Open questions
Design questions deferred to `/design` (no functional gaps remain):
- [x] D1: Exact layout of `## Mode transitions` and how IDs are stored per board type — **Resolved:** standalone section, board-IDs header + `Mode | Target column | Column ID` table (design ①)
- [x] D2: How to make GitHub Projects v2 moves reliable (field/option IDs, resolving an issue's project item) — **Resolved:** board-agnostic `transition()` contract, MCP-first with per-board CLI fallback (design ②)
- [x] D3: How `transition(mode)` determines board order to detect a backwards move — **Resolved:** row order of the existing columns table (design ③)
- [x] D4: How the name matching for setup's suggestions works — **Resolved:** per-mode synonym lists + board-order fallback + collapse rule (design ⑥)
- [x] D5: How each adapter (copilot, legacy cursor, and the others) carries the new operation at full parity — **Resolved:** core + rebuild all dists, plus one copilot adapter edit (design ⑦)
- [x] D6: Version number and migration-note wording — **Resolved:** 1.10.0 minor, migration note in design ⑧
- [x] D7: Whether to align with the requesting team's hand-written `## Mode transitions` format for compatibility — **Resolved:** yes, positional read keeps their table working (design ①)

## Acceptance criteria
- AC-1 (Scenario 1): After `/setup` on a board with matching columns, the config contains `## Mode transitions` with real column names and IDs for groom, design, build and review — no placeholders.
- AC-2 (Scenario 1): Nothing is saved until the user has confirmed every row.
- AC-3 (Scenario 2): On a board with no review column, setup names the missing column, suggests only real columns or "no move", and the saved map contains no column absent from the board.
- AC-4 (Scenario 3): Finishing groom, design, build or review on a linked ticket moves it to the mapped column with no "Offer to move?" prompt; only the push and issue-close prompts appear.
- AC-5 (Scenario 3): Finishing build leaves the ticket open, in its mapped column.
- AC-6 (Scenario 4): A mode mapped to "no move" leaves the ticket untouched and shows no error.
- AC-7 (Scenario 5): With no map, or a mapped column that was deleted, the mode names the problem and points to `/setup`; the ticket is not moved and the doc is still committed.
- AC-8 (Scenario 6): When the move fails for missing board permission, the mode shows the error and the fix command; the doc is still committed.
- AC-9 (Scenario 7): With no linked ticket, the mode finishes normally with no move and no error.
- AC-10 (Scenario 8): Re-running setup after a column is added or renamed flags only the affected rows and keeps unchanged rows as they were.
- AC-11 (Scenario 9): Re-running groom on a ticket in In review leaves it in In review, with a one-line note.
- AC-12 (Scenario 10): Review with "request changes" leaves the ticket in In review. Review with approval moves it to the mapped post-review column if one exists, otherwise leaves it in In review; in neither case is it moved to Done.
- AC-13 (Scenarios 1, 2): On this repo's board, setup suggests groom → Ready, design → no move, build → In review, review → no move.
- AC-14 (NFR): Every adapter's `dist/` contains the new board operation and the updated close-outs, and a project without the map gets the AC-7 message instead of breaking.

Status: Designed — ready for /build ([design.md](./design.md))
