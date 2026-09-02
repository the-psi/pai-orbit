# Session capture: groom-product-context (#35)

**Date:** 2026-09-03
**Branch:** `feat/groom-product-context` (2 commits, pushed to `origin`, clean tree)
**Issue:** [#35](https://github.com/the-psi/pai-orbit/issues/35) — assigned to `chetansharmapsi`, In progress
**Modes used:** `/board`, `/git`, `/design`, `/arch update`
**Next mode:** `/build`

---

## What was completed

**Design phase — complete.** Output committed:

| Commit | Contents |
|--------|----------|
| `3841cfc` | `docs/features/groom-product-context/design.md` + ADR `2026-08-18-groom-roadmap-source-precedence.md` |
| `d2e53ed` | Arch corrections — `CLAUDE.md`, `constraints.md`, `system.md`, `plugins/pai-orbit/README.md` |

**Four design decisions**, all recorded in `design.md`:

- **D1 — no adapter work.** Four of six adapters already emit full mode text
  (`claude-code`, `cursor-plugin`, `cursor`, `kiro-power`). `copilot` and `codex` drop
  `## Session flow` on `main`, but PRs #34 and #51 replace `emit_mode_summary()` with
  full-text emission and close it. Verified against committed `dist/` output on both PR
  branches, not against PR titles.
- **D2 — roadmap precedence** (answers the question `/groom` deferred to `/design`). Board is
  authoritative for status/ownership/existence; `docs/plans/*.md` for sequencing rationale.
  Contradictions block as a REQ-5 conflict. Board-unreachable is a designed path.
- **D3 — capabilities source.** REQ-10 must read `docs/domain/product-capabilities.md` first,
  falling back to `docs/features/*`. REQ-10 predates ADR 2026-08-03.
- **D4 — scope gate is Phase 1b**, not a new Phase 2. Phases stay 1/2/3.

**Arch cleanup — both `/design` open questions resolved.** The parity records claimed
"`cursor` lossy, `codex` experimental — both fall short". Checked against each build script,
the gap is three separate things: mode *content* (copilot + codex), mode *invocation* (cursor
+ copilot + codex), agents/hooks (four adapters). Also found `kiro-power` was absent from
`CLAUDE.md` entirely and missing from the plugin README's tree, despite being in that
README's own fidelity table.

**Housekeeping:** 18 personal adapter working-notes excluded via `.git/info/exclude` (local
only — deliberately not `.gitignore`).

---

## What is in progress

Nothing. No implementation has started. No `core/` file has been touched.

---

## What is blocked

| Item | Blocker |
|------|---------|
| Build task 7 — rebuild `dist/` | PRs [#34](https://github.com/the-psi/pai-orbit/pull/34) and [#51](https://github.com/the-psi/pai-orbit/pull/51) must merge first. Rebuilding now regenerates `dist/copilot/` and `dist/codex/` in pre-PR layouts; those PRs rewrite 53 and 96 `dist/` files respectively, so an early rebuild creates hand-resolved conflicts in committed build output for no benefit. |

Nothing blocks build tasks 1–6. Neither PR touches `core/modes/groom.md`.

---

## Next concrete action

Enter `/build` and start **task 1** in `plugins/pai-orbit/core/modes/groom.md`:

> **Replace** Phase 1 step 2's clause "If purpose can be drafted from these, propose it and
> confirm with the user" — do not append alongside it.

This is the single most important edit in the feature, and the easiest to get wrong. REQ-2
requires reasoning *before* drafting. The current wording actively permits draft-then-confirm,
so leaving it in place while adding a reasoning step above it puts two contradictory
instructions in one phase — and the cheaper instruction tends to win. See `design.md` →
"The edit that carries the most risk".

Then tasks 2–6, in order, per `design.md` → Build tasks:

2. Add the Phase 1b scope gate with explicit confirmation.
3. `## Behaviour` — add the new read set with D2's precedence and the board-unreachable path.
4. `## Output format` — add `## Scope` between `## Purpose` and `## Scenarios in scope`.
5. `## Session close` — extend the pre-flight audit to check `## Scope`.
6. Amend `requirements.md` REQ-10 and `## Context` per D3.

Tasks 1–5 are all one file and should land together.

---

## Carried-over open items

- [ ] Should D2's precedence rule also bind `/plan`, which reads both roadmap sources? **Not
      part of #35** — `design.md` says so explicitly. — owner: `/plan`
- [ ] ADR 2026-07-24 carries the same parity mis-attribution that `d2e53ed` fixed in the live
      docs. Deliberately left as-is: an ADR records what was decided and believed at the time.
      Flagging in case a future reader wants it superseded rather than left standing.

---

## Environment notes for the next session

- **Board writes are limited.** The `gh` token has `gist, read:org, repo, workflow`. Projects
  v2 needs `read:project` — confirmed via both `gh project item-list` and raw GraphQL
  (`INSUFFICIENT_SCOPES`). Issue create/assign/comment work; column moves do not. #35 was
  moved to In progress manually by the user. Fix with
  `gh auth refresh -s read:project,project` in an interactive terminal.
- **Remotes:** `origin` = `chetansharmapsi/pai-orbit` (fork), `upstream` = `the-psi/pai-orbit`.
  No PR has been opened for this branch.
- **Commit convention:** no `Co-Authored-By` lines — the `/git` skill forbids them. `refs #35`
  during development; `closes #35` only on the final shipping commit.
- **`docs/domain/` holds only `.gitkeep`** in this repo, so D3's fallback path and the
  sparse-context path (AC-3) are what actually execute when testing here.
