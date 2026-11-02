# Test plan: `/groom` consumer check for existing signals

**Date:** 2026-09-29
**Issue:** [#37](https://github.com/the-psi/pai-orbit/issues/37)
**Requirements:** [requirements.md](./requirements.md) — 21 REQs, 13 ACs, 10 scenarios
**Design:** [design.md](./design.md) (D8 test approach)
**Result:** 13 of 13 acceptance criteria pass on Claude Code (AC-5 against its revised wording — see Finding 1).
One defect found and fixed during testing (TC-20). Codex (R7c, R8c) and Copilot (R9) parity runs pass; one Codex wording issue fixed (TC-14).

---

## Summary

The feature is behavioural: it changes what `/groom` searches, says and records in Phase 2, and what
the session-close audit accepts. None of that can be proven from the diff, so real sessions were run
against a fixture with known answers, and the evidence is recorded here.

## How it was tested

**Fixture** (`make-fixture.sh`, scratchpad, one fresh copy per run): a "Teamboard" project whose
`CLAUDE.md` Sub-projects table and `docs/architecture/system.md` declare `web`, `jobs`, `mobile`.

| Variant | Contents |
|---|---|
| full | `is_active` read by the dashboard (`web/src/dashboard/UserList.tsx`, the named surface), the admin CSV export (`web`) and the weekly report (`jobs`); 2 test files; `docs/domain/concept-consumers.md` with a stale "Admin panel user filter" row and no export row; `mobile/` absent |
| only-surface | Only the dashboard reads the flag, plus 1 test file; no `jobs/`, no map |
| docs-only | No code on disk at all; no map |
| + constraints | `docs/architecture/constraints.md`: "visibility rules must apply identically on every surface" |

**Method:** the built output (`dist/claude-code/commands/groom.md`) was installed as the fixture's
`.claude/commands/groom.md` and driven headless with `claude -p` / `--resume`, one session per run.
A driver agent played the developer from a fixed script and was forbidden to mention consumers,
searching or the map. Every turn was saved verbatim to the fixture's `transcript.md`. Key claims
were checked against the transcripts and fixture state, not taken from driver reports.
All sessions used standalone grooming (confirmed ticket opt-out), so no board was touched.

---

## Test cases

### Happy path
| ID | Scenario | Steps | Expected result | Automated? | Run | Result |
|----|----------|-------|-----------------|------------|-----|--------|
| TC-01 | S1, S5, S6, S8 | Full + constraints: "Hide inactive users on the team-lead dashboard"; exclude export with a reason; run to session close | 🔎 line before Scenario 1; Existing; export + weekly report proposed one at a time; dashboard not re-proposed; tests as a count; mobile not reachable; map discrepancies both ways; map unmodified; `## Consumer check` written; audit checks it | No (headless session) | R1 | Pass |
| TC-02 | S3 | Full, no constraints: "add a new `nickname` field" | New / not triggered with positive grounds; 3-line block | No | R2 | Pass (revised AC-5) — Finding 1 |
| TC-03 | S2 | Only-surface: same dashboard change | Lists sources and terms; "no concept map found"; no other consumers | No | R6 | Pass |
| TC-04 | S9 | Constraints present / absent | Read at start and applied / proceeds without error | No | R1, R2 | Pass |

### Edge cases
| ID | Scenario | Steps | Expected result | Automated? | Run | Result |
|----|----------|-------|-----------------|------------|-----|--------|
| TC-10 | S4 | Docs-only: "coloured account-status badge"; override as purely new | Unclear; check runs by default and says so; override accepted only because Unclear; recorded with reason | No | R3b | Pass |
| TC-11 | S4 (negative) | Full: same badge change; override attempted | Groom classifies from code; override on an Existing signal declined and recorded | No | R3 | Pass |
| TC-12 | S1, REQ-6 | Second signal surfaces mid-Phase 2 | Own 🔎 line for each signal | No | R3 → fixed | Fail → fixed (see failure doc) |
| TC-14 | S1, S6 (Codex) | Codex, full fixture: dashboard change; confirm/exclude each consumer | Each consuming surface a separate candidate | No | R7c | Fail → fixed (wording) — see Parity |
| TC-13 | S8 | Declared repo not on disk (`mobile`, and `jobs` in only-surface) | Named not reachable; developer asked; never "none found" for it | No | R1, R5, R6 | Pass |

### Failure / error paths
| ID | Scenario | Steps | Expected result | Automated? | Run | Result |
|----|----------|-------|-----------------|------------|-----|--------|
| TC-20 | S1, AC-2/3 | Full: "Skip any search … only the dashboard" after the check | Skip declined; each consumer still presented individually with its own reason | No | R5 → R5b | Fail → fixed → Pass |
| TC-21 | S7 | Docs-only: dashboard change | Limitation stated; asks developer; answer becomes a scenario; limitation under `## Context`; never "none found" | No | R4 | Pass |
| TC-22 | S10 | Ask groom to write the file without `## Consumer check` and mark it groomed | Refuses to do both; with the section removed, status is not groomed | No | R5 | Pass |
| TC-23 | all | Text check of all 5 adapters' built groom | Consumer check, audit bullet, section template, constraints read present; `AGENTS.md` for cursor-plugin/copilot/codex | Yes (grep) | build | Pass |

## Acceptance criteria coverage

| Criterion | TC ID | Status | Evidence |
|-----------|-------|--------|----------|
| AC-1: triggered, other consumers proposed one at a time | TC-01 | Pass | R1 🔎 line (transcript L215) before Scenario 1 (L254): "Result: 2 other consumers (Weekly email report — jobs; Admin CSV export — web)" |
| AC-2: skip request declined | TC-20, TC-11 | Pass | R5b: "What I can't do: treat 'only the dashboard' as a blanket exclusion…"; R3: "For Existing … not waive the search" |
| AC-3: excluded consumer under Out of scope with reason | TC-01, TC-20 | Pass (after fix) | R1: "Admin CSV export … excluded … serves admins performing a full audit"; R5b records each reason separately |
| AC-4: none found lists sources | TC-03 | Pass | R6: "Searched: web (code); jobs, mobile not reachable … Result: 0 other consumers found in web; none known to the developer in jobs/mobile (unverified)" |
| AC-5: new field → not triggered, no consumer search, recorded | TC-02 | Pass | Classified and recorded correctly; only a lookup confirming the name is unread — Finding 1 |
| AC-6: unclear → runs by default; override only here, recorded | TC-10 | Pass | R3b: "Any doubt at all means Unclear, and under Unclear the check runs by default"; "Override accepted and recorded — Unclear is exactly where it's available" |
| AC-7: map path named / "no concept map found" | TC-01, TC-03 | Pass | R1 names the map path; R6: "Concept map: no concept map found" |
| AC-8: union, discrepancies by direction, map untouched | TC-01 | Pass | R1: "Listed in map, not found in code: 'Admin panel user filter'" / "Found in code, not in map: 'Admin CSV export'"; `git status docs/domain` clean |
| AC-9: unsearchable → never "none found", asks, Context | TC-21 | Pass | R4: "Code cannot be searched — so I will not report 'none found'"; limitation in `## Context` |
| AC-10: multi-repo, labelled by repo, unreachable named | TC-01, TC-13 | Pass | R1 consumers labelled `web` / `jobs`; `mobile` named and asked about |
| AC-11: constraints read / absent OK | TC-04 | Pass | R1 applied rule 1 to scope and Scenario 5; R2: "Does not exist — continuing without" |
| AC-12: missing record fails audit, not groomed | TC-22 | Pass | R5 refused; with the section removed: "Status: Not groomed — consumer-check outcome not recorded" |
| AC-13: every adapter's dist carries the behaviour | TC-23 | Pass | grep of all 6 groom outputs after rebuild |

## Findings

**Finding 1 — "New" needs evidence, and evidence means a search (AC-5).** In R2 groom classified
`nickname` correctly as New / not triggered, but ran a search first to establish "nothing reads it
today". Design D2 requires positive grounds for New, while AC-5 and the cost requirement say a new
signal gets no search. A model cannot state positive grounds without looking, so the two conflict.
The search was cheap and turned up something real: the change also alters how the existing `name`
field is displayed, and groom ran a full check on `name` (2 other consumers). Requirements-level
question. **Resolved 2026-09-29:** REQ-8, AC-5 and the cost requirement revised to allow a quick lookup confirming the name is unread; the consumer search itself still does not run.

**Finding 2 — groom finds signals the issue didn't name.** R2 (`name` behind `nickname`) and R3
(`is_active` behind "account status") both identified an existing signal hiding behind a request
that read as new. That is the `status` replaces `is_active` case from D2 working without prompting.

**Finding 3 — consumer candidates can move scope.** In R3, confirming the export and weekly report
"In scope" grew the scope list from 4 to 8 items and pulled `jobs` into a small enhancement. Groom
flagged the tension but did not block. Correct per the rules; worth knowing in real use.

## Parity — Codex (rule 6)

The built `dist/codex/.agents/skills/groom/SKILL.md` was installed in fresh fixtures and driven with
`codex exec` / `codex exec resume`, sandbox `workspace-write`. (The first attempt failed on every
shell command with `CreateProcessWithLogonW failed: 1385` until `~/.codex/config.toml`
`[windows] sandbox` was changed from `elevated` to `unelevated`; no sandbox bypass was used.)

| Run | Case | Result | Evidence |
|---|---|---|---|
| R7c | S1, S6, S8 — dashboard change | Pass, one wobble | 🔎 line (L65) before Scenario 1 (L79): "Existing … 2 other code consumers found; mobile repo is declared but not reachable"; tests as "2 files"; both map discrepancies flagged; map untouched; `## Consumer check` written citing `AGENTS.md` |
| R8c | S3 — `nickname` | Pass | "New (adds a field with no existing reads and changes no existing readings) … Result: no existing consumers found"; only a lookup for the name itself |

**TC-14 wobble:** R7c first merged the CSV export and the stale map-only admin filter into one
scenario (L113), splitting them only when the developer said they were different things (L127).
Cause: "group hits by surface using the granularity test" reads as permission to group surfaces.
Fixed by wording — each surface is its own candidate, never merged. Verified by text in all 6 built
outputs; not re-run live.

Also seen in R7c (outside this feature): Codex did not ask the Phase 1 classification question when
no labels existed. That is #35's Phase 1 behaviour, not the consumer check.

## Parity — Copilot (rule 6)

**R9** — run by Chetan Sharma in VS Code Copilot Chat (Agent mode), 2026-09-29, against the full
fixture with the built `dist/copilot/.github/prompts/groom.prompt.md` installed as a workspace
prompt file (no user-level install), after the TC-14 wording fix. Case: "Hide inactive users on the
team-lead dashboard". **Pass.**

- Outcome line shown before Scenario 1, verbatim: "🔎 Consumer check — Signal: is_active · Existing
  (the dashboard already reads it; this change alters that existing reading) · Searched: web, jobs;
  concept map concept-consumers.md; mobile not reachable · Result: 3 other consumers."
- Found the admin CSV export, which exists only in code — evidence of a real code search, not a
  map read. `mobile` reported as declared in `AGENTS.md` but not present.
- Search terms listed; "Test-only hits: 2 files"; both map discrepancies flagged by direction.
- Asked once for other names before proposing scenarios.
- Each consumer presented as its own scenario, one message at a time (admin filter → weekly report →
  CSV export), each recorded with the developer's reason; stale map entry "I'll … suggest updating the
  map; I won't edit it."
- Phase 1 noticed the map's other consumers and offered to settle them early; when asked to defer,
  it listed them as "Deferred, not excluded … I'll raise each separately in Phase 2".

## Not covered

- **Cursor, Cursor plugin:** verified by text check only.
- **Copilot new-field case (S3):** not run; covered on Claude Code (R2) and Codex (R8c).
- **Automated regression:** none — belongs to the `test-automation` epic.

## Manual test checklist
- [x] TC-01 … TC-22 run headless against fresh fixtures (transcripts in the session scratchpad)
- [x] S1 + S3 run in Codex (rule 6) — R7c, R8c
- [x] S1 run in Copilot (rule 6) — R9

## Known risks
- The model can still skip the step. The order gate, the visible line and the audit held in every
  run here, including two adversarial ones, but eight sessions are not a guarantee.
- Common signal names (`status`, `name`) produce broad searches; R2's `name` search used 21 terms.

## Sign-off
- [x] All acceptance criteria covered
- [x] Edge cases documented
- [x] Manual checklist reviewed
- QA: Chetan Sharma — 2026-09-29
