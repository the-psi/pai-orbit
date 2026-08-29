---
status: accepted
date: 2026-08-29
deciders: [Harshit Soni]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: Add `/catchup` as a read-only session-start mode

## Context

pai-orbit preserves context *across* mode switches (`/build` writes
`docs/wip/session-capture-<date>.md` before switching and re-reads it on re-entry) but has no
command for the start of a work session: what did the team ship since I last looked, what is
open, what is assigned to me, and what should I pick up next. Developers either re-read docs
by hand or start `/build` on a ticket without knowing whether a teammate's PR is waiting on
their review.

A project-specific `/catchup` command already existed in a consuming repo. It hardcoded that
project's board, git host, issue-id mappings, and team identities. Contributing it upstream
required deciding how to generalise it and where it fits in the mode/skill taxonomy.

## Decision

In the context of **adding a session-start orientation command to pai-orbit**,
facing **the choice between a mode and a skill, and between hardcoded and configured
project data**,
we decided **to add `/catchup` as a core mode that is strictly read-only (no doc output, no
board writes, no branch creation), contains no host- or board-specific commands, and resolves
every project specific — board type, git host, main branch, team handles, MCP preference — at
runtime from `.claude/pai-orbit-config.md` and `.claude/team.md`, delegating board and PR
access to `/board` and `/git` rather than embedding its own**,
to achieve **one briefing command that works on any pai-orbit project, whose sole exit is a
handoff to an existing mode (`/build`, `/groom`, `/design`, `/plan`)**,
accepting **that the briefing lives only in the conversation — the one deliberate exception
to "nothing important lives only in chat", because the briefing is fully derived from git,
the board, and existing docs and can be regenerated at any time**.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) Core mode, read-only, config-driven | Fits "each command = one headspace"; auto-picked up by every adapter's `modes/*.md` glob; consistent with `/arch view` (read-only sub-mode) | Adds a 15th mode to the listing |
| Skill (`core/skills/catchup/SKILL.md`) | Callable from any mode | Skills are procedures invoked *inside* a headspace; `/catchup` is the entry point *before* one — and its stop-and-wait contract is a headspace, not a procedure |
| Mode that also writes `docs/wip/catchup-<date>.md` | Honours "written outputs" literally | Pure derivation of git + board + docs; a daily file per developer is noise in `docs/wip/` with no reader — regenerating is cheaper than storing |
| Extend `/build`'s session-start block instead | No new command | Couples orientation to implementation; a developer catching up on a review queue or a sprint is not in a build headspace, and `/build` immediately creates a branch |

## Consequences

**Positive:**
- Developers get "what shipped / what is open / what is mine / what next" in one command,
  on any board or git host `/board` and `/git` support, without editing the mode.
- `/catchup` becomes the natural reader of `docs/wip/session-capture-*.md`, closing the loop
  `/build` opened when it started writing those files.
- Recommendation order (finish in-flight PR → unblock a teammate's review → resume session
  capture → sprint/priority/unblocked/smallest) is now a documented convention.

**Negative / trade-offs:**
- `/git` has no PR-listing procedure today; `/catchup` relies on the agent applying `/git`'s
  MCP-vs-shell rule to the host's own listing command. Adding an explicit "list PRs" section
  to `/git` would tighten this.
- No persisted artefact — a briefing cannot be diffed against yesterday's.

**Neutral:**
- No adapter changes required; all six adapters glob `core/modes/*.md`. `kiro-power`'s
  hand-maintained `.kiro-power/marketplace.json` `capabilities.modes` list gained
  `catchup-mode`.

## References

- Issue: [the-psi/pai-orbit#42](https://github.com/the-psi/pai-orbit/issues/42) — "Add /catchup command to pai-orbit"
- Mode: `plugins/pai-orbit/core/modes/catchup.md`

## Related Decisions

- [2026-07-24-adapter-parity-and-dist-compat.md](2026-07-24-adapter-parity-and-dist-compat.md) —
  a new mode must ship with full adapter parity; satisfied via the existing mode glob.

## Review Date

Revisit if teams ask for a persisted briefing (e.g. for standup notes) — that would flip the
"no doc output" decision and `docs/wip/catchup-<date>.md` becomes the natural home.
