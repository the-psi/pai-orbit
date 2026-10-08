---
status: accepted
date: 2026-10-01
deciders: [chetansharmapsi]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: Modes move their ticket through a setup-generated `## Mode transitions` map and a board-agnostic `transition(mode)` operation

## Context

pai-orbit modes know which document they produce but not which board column the ticket should
move to. Close-out moves were opt-in "Offer to move?" prompts with a loosely described target, so
tickets drifted (issue [#30](https://github.com/the-psi/pai-orbit/issues/30)). `/setup` already
discovers the board's columns but did not map modes to them. On GitHub Projects the board skill
told people to drag cards in the browser because `gh project item-edit` was unreliable. A team
migrating onto pai-orbit hand-wrote a `## Mode transitions` table into their own config as a
stopgap.

The new config section is a contract that lives in **consumer projects**. Once teams have
generated it, changing its shape means a migration for every one of them, so the shape is
effectively irreversible. That is why it's recorded here.

Full design: [docs/features/mode-transitions/design.md](../features/mode-transitions/design.md).

## Decision

In the context of **mode close-out on a team's board**,
facing **tickets that drift because moves are manual and targets are vague**,
we decided **to have `/setup` generate a standalone `## Mode transitions` section (board-level
IDs plus a `Mode | Target column | Column ID` table, `no move` allowed), and to give the board
skill a board-agnostic `transition(mode)` operation that runs MCP-first with a per-board CLI
fallback, uses the existing columns table for order, and never moves a ticket backwards**,
to achieve **automatic, accurate board state for groom, design, build and review without
re-deriving the column in each mode**,
accepting **stored IDs that can go stale (caught at move time and on `/setup` re-run), and
per-board fallback recipes in the board skill**.

Supporting rules:
- Setup suggests targets from per-mode synonym lists (case-insensitive substring, first match),
  falling back to the next column after the previous mode's target. A suggestion at or before
  the previous target collapses to `no move`. Every row is user-confirmed.
- Review never moves a ticket to Done by default. Review happens before merge, and Done is
  owned by the merge (`closes #N` plus the board's own merge automation). Approval moves the
  ticket only to a post-review, pre-merge column (Approved, Ready to merge) if one exists;
  otherwise review is `no move`.
- `transition()` reads the table by column position, so the requesting team's hand-written
  table (Mode | Status | Option ID) works unmodified.
- `transition()` never blocks close-out: the mode commits its document first, and every
  non-move outcome is a one-line note or a gap message pointing to `/setup`.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| **(chosen)** Standalone section + IDs; MCP-first contract; columns-table order; synonym + collapse suggestions | Purely additive to config; matches the requesting team's format; MCP and CLI both get the IDs they need; deterministic, testable suggestions (AC-13) | IDs can go stale; synonym lists need upkeep; fallback recipes per board |
| IDs added to the existing `## Agile Board → columns` table; map stores names only | Each ID stored once | Changes a table every mode reads; doesn't match the requesting team's format |
| Names only, IDs looked up on every move | Never stale on IDs | Contradicts REQ-3; extra call per move; renames caught only at move time |
| MCP-only moves | Leanest skill | No automatic moves without a board MCP; breaks the skill's shell-fallback pattern |
| Review → Done on approval | One fewer manual step on boards without merge automation | Marks unmerged work Done; duplicates the board's merge automation, too early |
| Model-judgement column suggestions | Flexible with odd names | Not deterministic across runs or adapters; untestable against AC-13 |

## Consequences

**Positive:**
- Board state follows the work without anyone remembering to move cards.
- One operation (`transition(mode)`) owns all close-out moves; modes don't re-derive columns.
- Older projects keep working: no section means the REQ-10 message, not a failure.

**Negative / trade-offs:**
- `/build` no longer closes the ticket; it closes on merge via `closes #N`. That's a visible
  workflow change, covered by the 1.10.0 migration note.
- The copilot adapter's hand-written setup step must be kept in step with core's setup by
  hand.

**Neutral:**
- Done is set by the merge, not by any mode; issue-close stays a confirmed ship action.
- ux, test, arch, domain keep their "Offer to move?" prompts; data and plan are unchanged.
- The legacy cursor adapter carries `transition()` as reference text under its documented
  lossy exception.

## Related Decisions

- [2026-09-08-groom-ticket-entry-gate.md](2026-09-08-groom-ticket-entry-gate.md) — groom's entry
  gate feeds `resolve_ticket()`.
- [2026-08-25-copilot-setup-synthesis-and-handshake.md](2026-08-25-copilot-setup-synthesis-and-handshake.md)
  — why copilot's setup step is hand-written, and why it needs its own edit here.

## Review Date

Revisit after the requesting team has run 1.10.0 for one release cycle.
