# Session capture: groom-product-context (#35)

**Date:** 2026-09-03 (updated after the `/build` session)
**Branch:** `feat/groom-product-context`
**Issue:** [#35](https://github.com/the-psi/pai-orbit/issues/35) — assigned to `chetansharmapsi`, In progress
**Modes used:** `/board`, `/git`, `/design`, `/arch update`, `/build`
**Next mode:** `/build` again, once PRs #34 and #51 merge

---

## What was completed

**Design phase — complete.** Output committed:

| Commit | Contents |
|--------|----------|
| `3841cfc` | `docs/features/groom-product-context/design.md` + ADR `2026-08-18-groom-roadmap-source-precedence.md` |
| `d2e53ed` | Arch corrections — `CLAUDE.md`, `constraints.md`, `system.md`, `plugins/pai-orbit/README.md` |

**Four design decisions**, all recorded in `design.md`: D1 no adapter work (rebuild sequenced
after PRs #34/#51), D2 per-field roadmap precedence, D3 capabilities registry primary,
D4 scope gate is Phase 1b.

**Build phase — tasks 1–6 complete.** All in the working tree / committed on this branch:

| Design task | File | State |
|---|---|---|
| 1 — Phase 1 rewrite (classification, conditional context, reason-before-draft, why-questions, conflict naming + block, assumption/open-question fallback) | `core/modes/groom.md` | Done |
| 2 — Phase 1b scope gate with explicit confirmation | `core/modes/groom.md` | Done |
| 3 — `## Behaviour` read set, D2 precedence, board-unreachable path | `core/modes/groom.md` | Done |
| 4 — `## Scope` in `## Output format`, between `## Purpose` and `## Scenarios in scope` | `core/modes/groom.md` | Done |
| 5 — session-close pre-flight audits `## Scope` | `core/modes/groom.md` | Done |
| 6 — amend `requirements.md` REQ-10, AC-8, `## Context` per D3 | `docs/features/groom-product-context/requirements.md` | Done |

**Beyond the listed tasks**, three coherence edits the design implied but did not enumerate:

- `core/modes/groom.md` — Phase 2 now derives scenarios from the confirmed scope list and
  falls back to Phase 1b (not Phase 1) when every scenario is excluded; Phase 3's entry
  condition names the scope gate. Without these the file would have described a gate that
  nothing downstream referenced.
- `core/modes/groom.md` `## Output format` — an inline comment distinguishing `## Scope`
  (implementation items) from `## Out of scope` (excluded scenarios), so AC-11's "distinct
  from `## Out of scope`" survives contact with a future groomer.
- `docs/capabilities.md` and `CLAUDE.md` — the `/groom` reference entry and the
  producer/consumer contract line both still described draft-then-confirm and the old read
  set. Left alone they would have contradicted the shipped mode text.

**AC coverage check (by inspection, no test harness exists):** all 12 ACs trace to text in
`core/modes/groom.md`. AC-8's "states which capabilities source it used" lands in the
`## Behaviour` read-set bullet rather than in Phase 1 step 2.

---

## What is in progress

Nothing mid-edit. Tasks 1–6 are complete and self-consistent.

---

## What is blocked

| Item | Blocker |
|------|---------|
| Build task 7 — `bash plugins/pai-orbit/build.sh` to rebuild `dist/` | PRs [#34](https://github.com/the-psi/pai-orbit/pull/34) and [#51](https://github.com/the-psi/pai-orbit/pull/51) are **both still OPEN** as of 2026-09-03. Rebuilding now regenerates `dist/copilot/` and `dist/codex/` in pre-PR layouts; those PRs rewrite 53 and 96 `dist/` files respectively, so an early rebuild creates hand-resolved conflicts in committed build output for no benefit. |
| Build task 8 — version bump in `core/plugin.json` + README/CLAUDE.md refs | Sequenced with task 7. `plugin.json` is copied into `dist/`, so bumping it without rebuilding just widens the core/dist gap. |

**This is a ship blocker, not a follow-up.** `dist/` is committed and is what consumers
install, so #35 is not shippable while `core/modes/groom.md` and `dist/` disagree.

---

## Next concrete action

1. Watch PRs #34 and #51. When both have merged, rebase this branch on `main`.
2. Run `bash plugins/pai-orbit/build.sh`.
3. Review the `dist/` diff: the new Phase 1 / Phase 1b text must appear in all six adapters'
   groom output, with no structural change to any of them.
4. Bump `plugins/pai-orbit/core/plugin.json` and the README / `CLAUDE.md` version references
   (currently 1.4.0), then rebuild again so the bump reaches `dist/`.
5. Live-exercise per `design.md` → Verification: a bug-labelled issue (AC-7), a new-feature
   issue (AC-8), and a run in this repo where `docs/domain/` holds only `.gitkeep` (AC-3 and
   D3's fallback).
6. Open the PR, `closes #35`.

---

## Carried-over open items

- [ ] **`docs/domain/product-capabilities.md` does not exist in this repo** — only `.gitkeep`.
      A template ships at `plugins/pai-orbit/core/templates/docs/domain/product-capabilities.md`
      and ADR
      2026-08-03 puts a standing obligation on `/build` to maintain the file. Deliberately
      **not** created in this session: `design.md`'s verification plan depends on this repo
      exercising D3's *fallback* path, and populating the registry is its own piece of work.
      Worth a board item. — owner: Chetan Sharma
- [ ] Should D2's precedence rule also bind `/plan`, which reads both roadmap sources? **Not
      part of #35** — `design.md` says so explicitly. — owner: `/plan`
- [ ] ADR 2026-07-24 carries the same parity mis-attribution that `d2e53ed` fixed in the live
      docs. Deliberately left as-is: an ADR records what was decided and believed at the time.
      Flagging in case a future reader wants it superseded rather than left standing.
- [x] `requirements.md` REQ-10 / `## Context` staleness — **resolved** as build task 6. The
      design flagged ownership as an open question (should `/groom` own edits to a groomed
      artifact?); done from `/build` per the handoff sequence, with the provenance recorded
      in the doc's own `## Context`.

---

## Environment notes for the next session

- **Board writes are limited.** The `gh` token has `gist, read:org, repo, workflow`. Projects
  v2 needs `read:project` — confirmed via both `gh project item-list` and raw GraphQL
  (`INSUFFICIENT_SCOPES`). Issue create/assign/comment work; column moves do not. #35 stays
  In progress and must not be closed until task 7 lands. Fix with
  `gh auth refresh -s read:project,project` in an interactive terminal.
- **Remotes:** `origin` = `chetansharmapsi/pai-orbit` (fork), `upstream` = `the-psi/pai-orbit`.
  No PR has been opened for this branch.
- **Commit convention:** no `Co-Authored-By` lines — the `/git` skill forbids them. `refs #35`
  during development; `closes #35` only on the final shipping commit.
- **Line endings:** `core/modes/groom.md` is CRLF. Edits made with tooling that assumes LF
  will silently no-op or rewrite the whole file — preserve CRLF on write.
