---
status: accepted
date: 2026-08-19
deciders: [Virendra S]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: Board Sync Checkpoints — a fixed lifecycle-stage vocabulary for ticket status

## Context

Teams using pai-orbit for governance reported that ticket status goes stale: work is
built, merged, and deployed to production while the card stays in `Backlog`. Project
status reporting is wrong as a result, and `/plan` — which reads board state to
prioritise — reasons from bad data.

The cause was structural, not a single missing line:

- `/release`, the deploy path, had no board interaction at all. Deploying to production
  changed nothing on the ticket.
- `/git` never referenced `/board`. Status depended entirely on `closes #N` auto-close,
  which does nothing on Jira, Linear, or Notion, does not move a card into a review or
  done column on any board, and is fragile under squash merge.
- `/build` only *read* status ("confirm it is in the right in-progress state") and its
  one card imperative before work was a prohibition ("do not just move the card").
- Seven near-identical copies of an *offer* — "Move issue #N to `<column name>`?" — were
  pasted across six mode files. All were optional, and all instructed reading "the next
  column name" from a config table that has no notion of a current position, so the
  instruction was unresolvable as written.
- `/board` could not execute what the modes asked of it: no comment command for any board
  type, a close command for GitLab only, no move for plain GitHub Issues, and GitHub
  Projects v2 documented as "CLI unreliable — instruct browser drag".

Two constraints shaped the solution. Modes must not each carry their own board logic
(`constraints.md` rule 2, author once in `core/`). And whatever we add must work on any
board type — the reporter named GitLab, GitHub, Jira, and Azure — without a mode ever
naming a column.

## Decision

In the context of **ticket status drifting out of sync with shipped reality across every
board type**,
facing **seven duplicated, optional, and unresolvable "offer to move the card"
instructions plus a `/board` skill that lacked the commands to act**,
we decided **to introduce a fixed lifecycle-stage vocabulary (`ux_defined`, `groomed`,
`designed`, `build_start`, `review_open`, `tested`, `merged`, `deployed`) bound to each
project's own columns by a `lifecycle:` map in `.claude/pai-orbit-config.md`, and one
mandatory Board Sync Checkpoint defined once in `board/SKILL.md` that every mode invokes
by stage name**,
to achieve **ticket status that tracks reality on any board without a mode ever naming a
column, and without the owner having to remember to ask**,
accepting **that updates remain confirmation-gated rather than silent, so a user who
answers `skip` at every checkpoint can still drift — and that a new config field means
existing installs must re-run `/setup` to get the map**.

Two rules make the vocabulary work:

1. **Modes name stages, never columns.** A mode says "sync at `deployed`"; `board/SKILL.md`
   resolves that to the project's column and the right CLI. This is what makes the
   mechanism board-agnostic and what lets Azure Boards drop in later as a command-matrix
   row rather than a change to eight mode files.
2. **A stage mapped to `—` is a silent no-op.** Projects only get prompted about stages
   their workflow actually has. A three-column board is never nagged about a review column
   it does not have.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) Fixed stage vocabulary + `lifecycle:` map + one mandatory checkpoint | Board-agnostic; authored once; new board types are one table row; `—` adapts to any workflow; visible, reviewable diff before every write | Confirmation-gated, so a determined user can still skip; new config field needs `/setup` re-run |
| Silent autonomous updates ("act, then report") | Strongest guarantee — status can never drift | Writes to an external system with no review; reverses `board/SKILL.md`'s existing "do not close autonomously" protection; a wrong issue resolution silently corrupts someone else's ticket |
| A `Stop` hook that blocks session end until the board is synced | Genuine enforcement independent of model compliance | Hooks cannot call board APIs (no auth guarantee, and `constraints.md` says hooks fail open); needs a ledger file to detect "already synced"; four hand-wired files per new hook and every existing install must re-run `/setup`; dropped entirely by four of six adapters |
| Fix `/release` only | Smallest change; addresses the reported symptom directly | Leaves `build_start`, `review_open`, and `merged` drifting; leaves the seven duplicated offers and the unresolvable "next column" instruction in place |
| Per-mode column names in each mode file | No new config field | Violates rule 2 (author once); breaks on every board whose columns are named differently; is the status quo that failed |

## Consequences

**Positive:**
- `/release` now closes the loop that caused the report: production deploy → checkpoint at `deployed` → status moved, comment posted with environment, timestamp, commit, and health-check result.
- Seven duplicated blurbs collapse to one-line stage calls; the unresolvable "read the next column name" instruction is gone.
- `/board` gained the primitives it was always assumed to have: read state, transition, comment, close — filled in for GitHub Issues, GitHub Projects v2, and GitLab, with verified CLI syntax.
- GitHub Projects v2 moved from "CLI unreliable, drag it in the browser" to a working `gh project item-edit` recipe with ID resolution, plus a scope preflight that surfaces `gh auth refresh -s project` instead of failing quietly.
- `/board reconcile` repairs boards that already drifted, and `/plan` runs it first, so prioritisation stops reasoning from stale cards.
- `ticket-gate` (groomed, awaiting design) can consume the read primitive rather than duplicating board dispatch, as `docs/wip/analysis-ticket-gate-2026-07-24.md` recommended.

**Negative / trade-offs:**
- Status updates are still gated on a human answer. `skip` is recorded and re-surfaced, but a user who skips everything drifts anyway. Accepted deliberately: the alternative writes to an external system unreviewed.
- Adds a config field. Per `constraints.md` rule 7 this required a version bump (1.4.0 → 1.5.0) and a migration note. Mitigated by a backward-compatible path — a missing `lifecycle:` map does not error; `/board` asks once per stage and suggests re-running `/setup`.
- `/setup` gains a question, and `board/SKILL.md` roughly doubles in length. The legacy `cursor` adapter inlines every skill into one `skills.mdc`, so that file grows.
- Jira and Linear CLI syntax could not be verified in the authoring environment (neither CLI installed). Those rows are marked **unverified** in the command matrix with an instruction to confirm via `--help` before first use, rather than asserting syntax we did not check.

**Neutral:**
- Azure Boards remains unsupported and is tracked separately in the-psi/pai-orbit#55. The stage/column split means adding it is a command-matrix row plus a config option — no mode file changes.
- No new hook was added, which avoids the worst parity problem: four of the six adapters drop
  hooks entirely. Verified after rebuilding, the checkpoint text is carried by `claude-code`,
  `cursor-plugin`, `cursor`, and `kiro-power`. It is **not** carried by `copilot` or `codex` —
  those adapters emit only a condensed mode summary and a one-row-per-skill table, so they have
  never carried any mode body. Their `/board` skill row does now read "Task management and
  ticket status sync". This is the pre-existing lossiness already recorded in the rule 6
  known-gap comment and in `system.md`'s open questions, not a regression from this change —
  but it does mean rule 6 remains unmet for those two adapters.

## Related Decisions

- `docs/decisions/2026-08-03-product-capabilities-placement-rule.md` — the shipped-but-dark marker that `/release` now clears at stage `deployed`.
- `docs/features/ticket-gate/requirements.md` — the entry gate; sibling to this exit-side work, sharing the `board/SKILL.md` read primitive.

## Review Date

Revisit if drift is still reported after adoption. The next escalation is a `Stop` hook
with a sync ledger — deliberately deferred here, and the option table above records why.
