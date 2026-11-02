**Status:** Groomed — ready for /design
**Issue:** [#37](https://github.com/the-psi/pai-orbit/issues/37)
**Groomed:** 2026-09-28

## Epic
<!-- None — standalone small enhancement, tracked as issue #37 -->

## Purpose
When `/groom` scopes a change to how an **existing** signal, field, or flag is interpreted, it must search for the other places that read it — in the code, and in a project-maintained "domain concept → consumers" map if one exists — and turn each one into a candidate scenario for the user to confirm or exclude. **This check must happen on every such session, visibly and verifiably, never silently skipped.** This is so developers don't ship a fix that covers only the one place the bug report named, while other places carry the same bug until someone happens to find them. `/groom` must also read `<docs root>/architecture/constraints.md` (as `/design` already does), so project-level conventions reach groom at grooming time, not only at design time.

## Scope
What this delivers, as concrete changes:
- `plugins/pai-orbit/core/modes/groom.md` Phase 2 — a new **consumer-check** sub-step, run before the scenario list is finalised:
  - a trigger rule: the change modifies interpretation/derivation of an *existing* signal, field, or flag (not introducing a new one); when uncertain, the check runs
  - a search for other consumers in **the codebase, and in other repos the project declares that are available locally (multi-repo setups)**
  - a lookup in a project-maintained "domain concept → consumers" map under `<docs root>`, if one exists
  - each consumer found becomes a candidate scenario, confirmed or excluded one at a time like any other scenario
  - a visible outcome line on every session: triggered / not triggered + reason, sources searched, results (including "none found")
- `plugins/pai-orbit/core/modes/groom.md` `## Behaviour` — add "If `<docs root>/architecture/constraints.md` exists, read it", matching `design.md`.
- `plugins/pai-orbit/core/modes/groom.md` Session close pre-flight audit — a new check that fails if the requirements file does not record the consumer-check outcome.
- `plugins/pai-orbit/core/modes/groom.md` `## Output format` — a place in `requirements.md` where the consumer-check outcome is recorded (exact location deferred to `/design`).
- `bash plugins/pai-orbit/build.sh` — rebuild `dist/` for all 5 adapters (constraints rules 1 and 6).

What this does NOT include:
- No changes to `plugins/pai-orbit/core/modes/design.md` — its impact-analysis gate ([design-uses-analysis](../design-uses-analysis/requirements.md)) is unchanged.
- No changes to the `/analysis` skill or the `cross-repo-impact` agent — whether groom reuses either is a design question.
- No changes to groom Phase 1 / 1b as delivered by #35 / #62 ([groom-product-context](../groom-product-context/requirements.md)).
- No template or scaffold for the concept map in `/setup` — groom only reads a map if one exists.
- No consumer check for brand-new signals or fields.
- No new mode, skill, agent, or hook.

## Scenarios in scope
1. A developer grooms a change to how an **existing** signal is read/derived; the report names one surface; the consumer check triggers and **finds other consumers** — each is proposed as a candidate scenario and confirmed/excluded one at a time.
2. A developer grooms a change to an existing signal; the check triggers and finds **no other consumers** — groom states what it searched and that none were found.
3. A developer grooms a change that **introduces a brand-new** signal/field — the check is **not triggered**, and groom announces and records that with the reason.
4. It is **unclear** whether the change touches an existing signal or introduces a new one — groom defaults to running the check; the developer may explicitly override, and the override and reason are recorded.
5. The project maintains a **"domain concept → consumers" map** under `<docs root>` — groom reads it as a consumer source in addition to the code search; if no map exists, it says so.
6. The concept map and the code search **disagree** (stale map) — groom takes the union as candidates, flags each discrepancy, and suggests (does not perform) a map update.
7. The **code cannot be searched** from the groom session — groom does not report "none found"; it states the limitation, uses the map if present, asks the developer where else the signal is read, and records the limitation under `## Context`.
8. The project is **multi-repo** and the signal may be read in **other declared repos** — groom also searches the declared, locally available repos, labels consumers by repo, and handles unreachable repos per Scenario 7.
9. `<docs root>/architecture/constraints.md` **exists** — groom reads it at session start and applies its rules to scope and scenarios; absent file is not an error.
10. At **session close**, the pre-flight audit verifies the consumer-check outcome is recorded; if missing or incomplete, it fails and returns to Phase 2.

## User stories / use cases
- As a developer grooming a fix to an existing signal, I want groom to find every other place that reads it, so I don't ship a fix that covers only the surface the bug report named. (S1)
- As a developer, I want groom to tell me explicitly what it searched when it finds nothing, so I can trust "no other consumers" as a real result. (S2)
- As a developer adding a brand-new field, I want groom to skip the consumer search and say why, so trivial sessions stay fast without hiding the decision. (S3)
- As a developer whose change is ambiguous, I want groom to run the check by default, so uncertainty never becomes a blind spot. (S4)
- As a team that maintains a concept → consumers map, I want groom to use it, so consumers a text search would miss (aliases, config, indirect reads) are still surfaced. (S5)
- As a developer, I want groom to flag where the map and the code disagree, so a stale map doesn't give false confidence. (S6)
- As a developer grooming from a docs-only repo, I want groom to say it couldn't search the code and ask me instead, so "couldn't search" is never mistaken for "nothing found". (S7)
- As a developer in a multi-repo project, I want groom to search the other declared repos too, so a web or mobile consumer of the same field isn't missed. (S8)
- As a developer, I want groom to read `constraints.md`, so project-level conventions shape scope and scenarios at grooming time. (S9)
- As a reviewer, I want the requirements file to carry a written consumer-check record, so I can verify the check actually happened. (S10)

## Functional requirements
1. REQ-1 (Scenario 1): During Phase 2, before finalising the scenario list, `/groom` must evaluate the consumer-check trigger: does the change modify how an **existing** signal, field, or flag is interpreted or derived (e.g. suppress / gate / fix / correct its reading), as opposed to introducing a new one?
2. REQ-2 (Scenario 1): When triggered, `/groom` must search for other consumers of that signal — every place the signal is read, derived, or surfaced — beyond the surface named in the issue.
3. REQ-3 (Scenario 1): Each consumer found must be proposed as a candidate scenario and confirmed or excluded **one at a time**, under the same discipline as any other Phase 2 scenario.
4. REQ-4 (Scenario 1): When the signal clearly already exists, the search **cannot be skipped** by the developer. The developer may exclude individual consumers found, but not waive the search.
5. REQ-5 (Scenario 1): Every excluded consumer must carry a **reason**, recorded under `## Out of scope` (e.g. "`ui/card.ts` reads `X` — excluded: card intentionally shows raw values").
6. REQ-6 (Scenarios 1–4): Every groom session must emit a **visible consumer-check outcome line**: triggered / not triggered, the reason, the sources searched, and the result.
7. REQ-7 (Scenario 2): When the search finds no other consumers, `/groom` must state the sources searched and "no other consumers found" — never omit the outcome.
8. REQ-8 (Scenario 3): When the change introduces a brand-new signal/field, `/groom` must not run the consumer search — a quick lookup confirming the name is unread today is allowed, as the positive grounds for "New" — and must announce and record "not triggered" with the reason.
9. REQ-9 (Scenario 4): When it is unclear whether the change touches an existing signal, `/groom` must default to running the check and say so.
10. REQ-10 (Scenario 4): In the unclear case only, the developer may explicitly override (declare the change purely new); `/groom` must record the override and the developer's reason.
11. REQ-11 (Scenario 5): When triggered, `/groom` must look for a project-maintained "domain concept → consumers" map under `<docs root>`; if found, every consumer it lists for the signal becomes a candidate scenario, in addition to code-search results.
12. REQ-12 (Scenario 5): The outcome line must name the sources used (code, map path, repos); if no map exists, it must say "no concept map found".
13. REQ-13 (Scenario 6): When the map and code search disagree, `/groom` must take the **union** of both as candidates and flag each discrepancy explicitly (listed in map but not found in code; found in code but not in map).
14. REQ-14 (Scenario 6): `/groom` must not edit the concept map; it may suggest a map update as a follow-up.
15. REQ-15 (Scenario 7): When the code cannot be searched from the session, `/groom` must not report "no consumers found". It must state the limitation and reason, use the map alone if present (and say so), and ask the developer directly where else the signal is read; answers become candidate scenarios.
16. REQ-16 (Scenario 7): The search limitation must be recorded under `## Context` in the requirements file.
17. REQ-17 (Scenario 8): In a multi-repo project, when triggered, `/groom` must also search the other repos **the project already declares** that are available locally; consumers found must be labelled with their repo.
18. REQ-18 (Scenario 8): `/groom` must report which declared repos were searched and which could not be reached; unreachable repos are handled per REQ-15. No new configuration is introduced, and undeclared repos are not guessed at.
19. REQ-19 (Scenario 9): If `<docs root>/architecture/constraints.md` exists, `/groom` must read it at session start and apply its rules when forming scope and scenarios. If it does not exist, `/groom` continues without error.
20. REQ-20 (Scenario 10): The requirements file must record the consumer-check outcome: triggered/not triggered, reason, sources searched, repos searched/unreachable, consumers found (with in/out decision and reason), map discrepancies, and any override.
21. REQ-21 (Scenario 10): The session-close pre-flight audit must fail if that record is missing or incomplete — "❌ Returning to Phase 2. Consumer-check outcome not recorded." — and must not mark the feature as groomed.

## Non-functional requirements
- **Reliability (primary goal):** the check must never be silently skipped. Every path — triggered, not triggered, unclear, unsearchable — produces a visible announcement and a written record, and the session-close audit enforces the record.
- **Mode discipline (constraints rule 4):** the check is a *completeness* check ("does the fix belong here too?"), not a breakage/compatibility assessment. Breakage stays with `/design`'s impact gate and `/analysis`.
- **Adapter parity (constraints rule 6):** the behaviour must work in every adapter (`claude-code`, `cursor-plugin`, `cursor`, `copilot`, `codex`).
- **Backward compatibility (constraints rule 7):** projects without a concept map, without `constraints.md`, or single-repo projects must work unchanged apart from the new outcome line.
- **Cost:** for brand-new signals the check adds only the "not triggered" announcement and, at most, a quick lookup confirming the name is unread — no consumer search. *(Revised 2026-09-29 after testing — see test-plan Finding 1.)*

## Context
- Classified as a **small enhancement** by the user (issue #37 has no labels); capabilities registry and roadmap reads were skipped per groom Phase 1 step 2.
- `docs/domain/` is empty; no `ux.md` or parent epic exists for this issue.
- PR #63 (merged 2026-09-28) introduced `<docs root>` resolution via `reference/docs-path-resolution.md`; all paths here use `<docs root>` wording.
- **Deliberate scope widening:** #37's original text scoped the problem to intra-service consumers. During grooming the user widened it to cover **multi-repo setups** (Scenario 8), because multi-repo is a shipped, first-class pai-orbit setup ([multi-repo-docs epic](../../epics/multi-repo-docs/EPIC.md)) where the same failure occurs. Cross-repo *breakage* analysis remains out of scope.
- The user's stated bar is that this "must work 100% always". A prompt cannot give an absolute guarantee; the requirements therefore make skipping **visible and caught** (announcement + written record + session-close audit + tests) rather than relying on the model to comply silently.

## Out of scope
- Cross-repo **breakage / compatibility** assessment at groom time — stays with `/design`'s impact gate and the `cross-repo-impact` agent.
- Searching repos the project does not declare.
- Creating or updating the concept map (groom only reads it and may suggest updates).
- Consumer checks for brand-new signals or fields.

## Open questions
All remaining questions are **design questions** (how, not what) — deferred to `/design`. No functional gaps are open.

- [ ] [design] Which prompt techniques make the check reliable in `groom.md` — few-shot examples (groom already has the login Chrome/Firefox example pattern), tagged/structured sections, a mandatory checklist, or a combination? — owner: /design (Chetan Sharma)
- [ ] [design] Where in `requirements.md` is the consumer-check outcome recorded — a new dedicated section, or inside `## Context` / `## Scenarios in scope`? — owner: /design (Chetan Sharma)
- [ ] [design] Concept map location and format — file name/path convention under `<docs root>` and minimum structure groom can rely on. — owner: /design (Chetan Sharma)
- [ ] [design] Search method — inline grep, reuse of the `/analysis` skill's consumer step, or the `cross-repo-impact` agent for multi-repo; and how search terms are derived (aliases, derived names). — owner: /design (Chetan Sharma)
- [ ] [design] How groom discovers "declared repos" — the sub-repos listed in the project's `CLAUDE.md` (as `cross-repo-impact` does), config, or both. — owner: /design (Chetan Sharma)
- [ ] [design] Precise wording of the trigger rule so "existing vs new signal" is classified consistently. — owner: /design (Chetan Sharma)
- [ ] [design] Adapter parity — confirm every adapter (esp. `copilot` and legacy `cursor`) can run the search and multi-repo steps, or define equivalent behaviour. — owner: /design (Chetan Sharma)
- [ ] [design] Test approach for the reliability bar — `/test` fixtures covering positive (existing signal) and negative (new field) triggers, unsearchable code, stale map, and the audit failure path. — owner: /design → /test (Chetan Sharma)

## Acceptance criteria
- AC-1 (Scenario 1): Grooming a change to an existing signal, where the code has ≥1 other consumer beyond the named surface, produces an outcome line "triggered" and proposes each other consumer as a candidate scenario, confirmed/excluded one at a time.
- AC-2 (Scenario 1): When the signal clearly exists, a developer request to skip the search is declined; individual consumers can still be excluded.
- AC-3 (Scenario 1): Every excluded consumer appears under `## Out of scope` with a reason.
- AC-4 (Scenario 2): When no other consumers exist, the outcome line lists the sources searched and states "no other consumers found".
- AC-5 (Scenario 3): Grooming a change that introduces a new field produces "not triggered" with a reason, runs no consumer search (a quick lookup confirming the name is unread is allowed), and records the outcome.
- AC-6 (Scenario 4): For an ambiguous change, groom runs the check by default and says so; an explicit developer override is honoured only in this case and recorded with its reason.
- AC-7 (Scenario 5): With a concept map present, consumers listed in it for the signal appear as candidates and the outcome line names the map path; with no map, the outcome line says "no concept map found".
- AC-8 (Scenario 6): When map and code disagree, candidates are the union of both, each discrepancy is flagged by direction, and the map file is not modified.
- AC-9 (Scenario 7): When code is unsearchable, groom never reports "no other consumers found"; it states the limitation, asks the developer, and records the limitation under `## Context`.
- AC-10 (Scenario 8): In a multi-repo project, consumers in declared, locally available repos are proposed as candidates labelled with their repo; unreachable declared repos are named and handled per AC-9.
- AC-11 (Scenario 9): With `constraints.md` present, groom reads it at session start; with it absent, the session proceeds without error.
- AC-12 (Scenario 10): A requirements file missing the consumer-check record fails the session-close audit with "❌ Returning to Phase 2. Consumer-check outcome not recorded." and is not marked groomed.
- AC-13 (all): After `bash plugins/pai-orbit/build.sh`, the regenerated groom output in every adapter's `dist/` contains the new behaviour.
