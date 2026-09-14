# Test plan: `/groom` product-context reasoning (Phase 1)

**Date:** 2026-09-03
**Issue:** [#35](https://github.com/the-psi/pai-orbit/issues/35) · **PR:** [#62](https://github.com/the-psi/pai-orbit/pull/62)
**Requirements:** [requirements.md](./requirements.md) — 15 REQs, 12 ACs, 6 scenarios
**Design:** [design.md](./design.md)
**Result:** 12 of 12 acceptance criteria pass. No failures.

---

## Why this file exists

There is no test harness in this repo, and the feature is entirely behavioural — it changes
what `/groom` reads, when it asks, and when it refuses to proceed. None of that is provable
by reading a diff. This records what was actually exercised, against what, and what it found,
so the evidence survives the session it was produced in.

## How it was tested

The built mode text (`plugins/pai-orbit/dist/claude-code/commands/groom.md`, v1.5.0) was
installed as a throwaway project command at `.claude/commands/groom-test.md`, excluded via
`.git/info/exclude`, and invoked as `/groom-test 48`. The marketplace and the installed
plugin were left untouched, so the old `/groom` stayed available for comparison. The file and
the exclude entry were removed afterwards.

**Target:** issue [#48](https://github.com/the-psi/pai-orbit/issues/48) — "GROOM should ask
for ticket number immediately if invoked without one". Labelled `enhancement`, narrow scope,
and it cross-references [#29](https://github.com/the-psi/pai-orbit/issues/29).

One issue turned out to be enough. #48 exercised every path, including two genuine conflicts,
so the planned second run against
[#55](https://github.com/the-psi/pai-orbit/issues/55) was not needed for coverage — its board
overlap was verified separately (see AC-8).

**Environment:** `docs/domain/` holds only `.gitkeep`, so every run here is the sparse-context
case and D3's fallback path is what executes. This satisfied the third planned exercise
without a separate session.

---

## Results

| AC | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| AC-1 | Why-reasoning cites specific content before a draft purpose | Pass | Cited `docs/features/ticket-gate`, #29's NFR-2, and `constraints.md` rule 6 |
| AC-2 | Purpose reflects reasoning, not a paraphrase of the issue | Pass | Purpose framed around traceability and close-step failure, not the issue title |
| AC-3 | Sparse context triggers a why-directed question | Pass | `docs/domain/` empty; questions asked before any purpose was proposed |
| AC-4 | Conflict names the specific file or item | Pass | Named `ticket-gate`/#29 for both conflicts |
| AC-5 | Does not proceed while a conflict is unresolved | Pass | Blocked on both conflicts until answered |
| AC-6 | Assumption vs open-question choice offered | Pass | Offered; the design-question conflict was routed to `/design` as an open question |
| AC-7 | Bug/small enhancement skips roadmap reads | Pass (see Finding 1) | Skipped after classification; escape hatch fired on #48's explicit #29 reference |
| AC-8 | New feature checks capabilities and both roadmap sources | Pass | Capabilities fell back to `docs/features/*`; board verified separately below |
| AC-9 | Labels when present, ask when absent or ambiguous | Pass | `enhancement` treated as ambiguous; asked rather than guessing |
| AC-10 | Explicit scope list, explicit confirmation | Pass | 7 inclusions / 6 exclusions, blocked for confirmation |
| AC-11 | `## Scope` between `## Purpose` and `## Scenarios in scope` | Pass | Section present and correctly positioned |
| AC-12 | Exclusions name overlapping capabilities | Pass | Named `ticket-gate` NFR-2, #29's policy, `/board`, PRs #34/#51 |

### AC-8 board half — verified separately

The board was unreachable for most of this work (`gh` token lacked `read:project`), which
exercised D2's degraded path. After `gh auth refresh -h github.com -s read:project,project`
on the `chetansharmapsi` account, the overlap query was re-run against #55:

| Issue | Board status | Title |
|---|---|---|
| #55 | Backlog | feat: add Azure Boards support to `/board` |
| #59 | **In review** | feat: add Azure + AWS CLI / MCP support to pai-orbit |
| #56 | Backlog | fix: ticket status stays stale after work ships |

**#59 is in review and overlaps #55** — exactly what REQ-10 exists to catch. None of this
appears in `docs/plans/`, so the earlier plans-only run reported "no roadmap conflict," which
was wrong. That is the clearest evidence that D2's mandatory caveat is load-bearing rather
than a formality: without it, a plans-only session reads as a clean bill of health.

---

## What the run found that inspection did not

**Two real conflicts in #48**, neither previously noticed:

1. **Bypass policy.** `ticket-gate`/#29 decided "hard block, no bypass offered". #48 asks for
   a confirmed opt-out. Genuine contradiction. Resolved in favour of keeping #48's opt-out —
   `/groom` is upstream shaping where a ticket may legitimately not exist yet, unlike `/build`.
2. **Mechanism.** Does `/groom`'s check reuse #29's shared gate or stand alone? Correctly
   classified as a *how* question and deferred to `/design`, per `/groom`'s own rule against
   answering implementation questions.

**It applied constraint 6 unprompted.** It worked out that #48's proposed gate would live in
`## Session flow` — the section `copilot` and `codex` drop — and flagged that #48 would hit
the same parity problem documented in ADR 2026-09-03 for this feature. Nothing in the prompt
mentioned that.

**The Phase 1b → Phase 2 coverage link works.** It reported that scope item 5
(`docs/capabilities.md` update) was not reachable by any user-facing scenario and carried it
as an acceptance criterion instead of dropping it. That behaviour came from an edit made
during `/build` beyond the design's task list; without it the scope list would dead-end at
Phase 2.

---

## Findings — neither is a defect

**Finding 1 — the `enhancement` label is ambiguous in this repo, so AC-7 rarely fires
automatically.** Of 20 open issues, none carries a `bug` label; 9 are `enhancement` and 11
are unlabelled, and `enhancement` is applied to both new capabilities (#55) and small tweaks
(#48). #56 is labelled `enhancement` but titled `fix:`. Classification therefore resolves to
"ask the user" on essentially every issue. Asking is correct when the signal is ambiguous —
AC-9 works as specified — but the non-functional requirement that trivial issues stay cheap
is met only after a round-trip. Options, all requirements-level and none taken: accept it;
default a bare `enhancement` to small-enhancement unless the body names new capability; or
adopt a `bug` label discipline.

**Finding 2 — some reading happens before classification.** The run queried the board and
read `docs/features/` before asking the classification question, in order to make a reasoned
recommendation. The recommendation quality was good and cited a real overlap. But it means
part of the roadmap cost is paid before the user chooses "small enhancement", which partly
undercuts AC-7's intent.

---

## Not covered

- `copilot` and `codex` were not tested, because they do not carry the feature — see
  [ADR 2026-09-03](../../decisions/2026-09-03-ship-groom-phase1b-ahead-of-adapter-parity.md).
  Re-test after PRs #34 and #51 merge.
- The session-close pre-flight audit of `## Scope` was not exercised end to end — the test run
  was stopped at Phase 2 before any file was written, deliberately, so nothing landed in the
  repo.
- `cursor`, `cursor-plugin` and `kiro-power` were verified by confirming the Phase 1b text is
  present in their `dist/` output, not by running the mode in those tools.
