## Epic
<!-- None — standalone enhancement, sourced from issue #36 -->

## Purpose
`/design` mode exists to turn agreed requirements into a technical design with explicit trade-offs, without diving into implementation. Today it runs as a single unstructured session, which risks two failure modes: it asks the user to absorb too much at once instead of building the design incrementally, and — when `/groom` leaves open design questions — it can narrow into answering just those questions instead of exploring the full design space the feature actually needs. This feature restructures `/design` into a phased, smaller-interaction flow (mirroring `/groom`'s gated phases) and ensures groom's leftover open questions are treated as *required inputs*, not as the *boundary* of what `/design` considers.

## Scenarios in scope
1. Developer enters `/design` for a feature, and the session is broken into distinct phased interactions — Framing, Decision Inventory, Options & Trade-offs, Decisions & Recording — each gated on explicit confirmation before advancing, mirroring `/groom`'s phase-gating discipline.
2. Developer enters `/design` for a feature whose `requirements.md` has open design questions left by `/groom`. Claude must ensure every such question is explicitly addressed in the design, but must not treat them as the full scope of the session — it still surveys the broader design space for the feature.
3. Developer enters `/design` for a feature with a clean handoff from `/groom` — no open design questions carried over. Claude runs full phased design exploration with no mandatory leftover items to reconcile, and does not fabricate questions that don't exist.
4. At `/design` session close, Claude runs a readiness audit — verifying every phase was actually gated (not skipped or bulk-approved) and that every open design question inherited from `/groom` was explicitly resolved — before marking the feature ready for `/build`. If either check fails, Claude returns to the relevant phase instead of closing out.
5. During Framing, or during a decision point in Options & Trade-offs, Claude proactively surfaces a plausible future case (an extensibility need or anticipated follow-on requirement) when it is materially relevant to the decision at hand, and asks the user to confirm whether it should influence the current design or be explicitly deferred.
6. During a design session, when a decision establishes a pattern applicable beyond the single feature under design (not a one-off, feature-specific choice), Claude surfaces it as a candidate architectural principle and confirms it with the user. Once confirmed, it is documented to `docs/architecture/`. In future `/design` sessions, previously confirmed principles are read and used to constrain new design decisions rather than re-derived or re-litigated.

## User stories / use cases
- As a developer running `/design`, I want the session broken into smaller confirmed phases, so that I'm not asked to absorb an entire design at once.
- As a developer whose `/groom` session left open design questions, I want `/design` to guarantee those questions get answered without treating them as the entire scope, so my design isn't artificially narrow.
- As a developer with a clean groom handoff, I want `/design` to explore the full design space without inventing leftover questions that don't exist, so the session stays honest about what's actually undecided.
- As a developer, I want `/design` to refuse to mark a feature ready for `/build` if phases were skipped or decisions are missing, so incomplete designs don't silently slip through.
- As a developer, I want `/design` to flag plausible future cases only when they matter to the decision at hand, so I can consider extensibility without being buried in hypotheticals.
- As a developer, I want `/design` to recognize and document architectural principles as they emerge, and reuse them in later sessions, so the same trade-offs aren't re-litigated feature after feature.

## Functional requirements
1. REQ-1 (Scenario 1): `/design` must run as four gated phases, in order: Framing, Decision Inventory, Options & Trade-offs, Decisions & Recording. Each phase must reach explicit user confirmation before advancing to the next.
2. REQ-2 (Scenario 1): Phase 1 (Framing) must load the feature's `requirements.md`, `docs/architecture/system.md` and `constraints.md` (if present), and any previously confirmed architectural principles, then confirm the scope of what is being designed this session.
3. REQ-3 (Scenario 1): Phase 2 (Decision Inventory) must present decision points one at a time for confirmation (in scope / out of scope / revise) — never as a single bulk list — and silence must never be treated as agreement, mirroring `/groom`'s scenario-confirmation discipline.
4. REQ-4 (Scenario 1): Phase 3 (Options & Trade-offs) must, for each confirmed inventory item, present 2–3 options with explicit trade-offs and require confirmation before moving to the next item.
5. REQ-5 (Scenario 1): Phase 4 (Decisions & Recording) must record the chosen option for each item, flag irreversible decisions as requiring an ADR, and hold this content for `design.md` — no file writes occur until session close.
6. REQ-6 (Scenario 2): Phase 2 (Decision Inventory) must include every open design question tagged in the feature's `requirements.md` `## Open questions` as a mandatory inventory item.
7. REQ-7 (Scenario 2): Phase 2 must not be limited to groom's open questions — Claude must also propose additional decision points it identifies from requirements, architecture docs, and confirmed principles, presented alongside groom's items in the same inventory.
8. REQ-8 (Scenario 2): The session-close audit must verify every groom-inherited open question has a corresponding recorded decision; if any are missing, the audit fails per REQ-11.
9. REQ-9 (Scenario 3): If `requirements.md` contains no open design questions, Phase 2 proceeds using only Claude-identified decision points. Claude must not fabricate placeholder groom questions.
10. REQ-10 (Scenario 4): At session close, before marking the design ready for `/build`, Claude must audit (a) that all four phases were explicitly gated in sequence, with no phase skipped or bulk-approved, and (b) that every item in the locked Decision Inventory has a recorded decision in Phase 4 output.
11. REQ-11 (Scenario 4): If the audit fails on either check, Claude must hard-block: return to the relevant phase, and must not mark the feature ready for `/build` or write the final `design.md`. There is no override — this mirrors `/groom`'s functional-gap block, since (unlike a functional gap needing an external owner) a skipped phase or missing decision can be resolved immediately within the same session.
12. REQ-12 (Scenario 5): During Phase 1 (Framing), and during Phase 3 (Options & Trade-offs) only when a decision point is materially affected by a plausible future case, Claude must surface that future case and ask the user to confirm whether to incorporate it now or explicitly defer it. Claude must not surface a future case for every decision point by default — this must stay low-noise.
13. REQ-13 (Scenario 5): A future case confirmed as "incorporate now" must be added as a new item to the Decision Inventory (looping back through Phase 2 confirmation for that item) rather than folded silently into an existing option. A future case confirmed as "defer" must be recorded rather than dropped.
14. REQ-14 (Scenario 6): When a decision in Phase 3 or Phase 4 establishes a pattern applicable beyond the single feature under design — not a one-off, feature-specific choice — Claude must surface it explicitly as a candidate architectural principle and confirm it with the user before treating it as established. Claude must not attempt this for every decision, only ones that are genuinely reusable.
15. REQ-15 (Scenario 6): Confirmed architectural principles must be documented in `docs/architecture/` at session close.
16. REQ-16 (Scenario 6): At the start of future `/design` sessions (Phase 1: Framing), Claude must read previously confirmed architectural principles from `docs/architecture/` and apply them as constraints on new design decisions in Phase 3. If a new decision would conflict with a confirmed principle, Claude must flag this explicitly, mirroring the existing `constraints.md` violation-flagging behavior (requiring `/arch update` to ratify the change).

## Non-functional requirements
- Phase gating must happen via explicit user confirmation; silence is never treated as agreement (same principle `/groom` already applies).
- No file writes (`design.md`, ADRs, architecture updates) occur until session close, once all four phases are locked — matches `/groom`'s "no writes mid-session" discipline.
- This phasing sits on top of, not instead of, the existing session-start impact-analysis gate (`design-uses-analysis` feature) — that gate still runs before Phase 1 (Framing) begins.

## Context
- No parent epic — standalone enhancement sourced from GitHub issue #36 ("DESIGN mode - improve experience").
- Builds on the existing `plugins/pai-orbit/core/modes/design.md` mode file and the existing `design-uses-analysis` feature (session-start analysis gate); this feature restructures the session that follows that gate.
- Deliberately mirrors `/groom`'s phase-gating discipline (`plugins/pai-orbit/core/modes/groom.md`) for consistency across modes.

## Out of scope
- Changes to `/groom` itself.
- Changes to the existing session-start analysis-gate behavior (`design-uses-analysis` feature) — this feature composes with it, not replaces it.
- The specific file within `docs/architecture/` where confirmed principles are written (`system.md` vs `constraints.md` vs a new file) — deferred to `/design`.
- The mechanism/location for recording deferred future cases (e.g. `docs/backlog/feature-ideas.md` vs a design-session note) — deferred to `/design`.
- The exact schema/format for representing a confirmed architectural principle — deferred to `/design`.

## Open questions
- [ ] Where exactly should confirmed architectural principles be written — `system.md`, `constraints.md`, or a new file? — owner: `/design` session for issue #36
- [ ] Where/how should deferred future cases (Scenario 5) be recorded so they aren't lost? — owner: `/design` session for issue #36
- [ ] Should the four phase names (Framing / Decision Inventory / Options & Trade-offs / Decisions & Recording) used in this document be adopted as-is in the mode file, or refined? — owner: `/design` session for issue #36

## Acceptance criteria
- AC-1 (Scenario 1): Given a feature ready for design, when `/design` starts (after the existing analysis gate), then Claude runs Framing → Decision Inventory → Options & Trade-offs → Decisions & Recording in order, each requiring explicit confirmation before advancing.
- AC-2 (Scenario 1): Given the Decision Inventory phase, when Claude presents inventory items, then each is confirmed individually (in scope / out of scope / revise) — never as a bulk list, and silence is never treated as agreement.
- AC-3 (Scenario 2): Given `requirements.md` has open design questions, when Phase 2 begins, then every such question appears in the Decision Inventory as a mandatory item.
- AC-4 (Scenario 2): Given a design session, when the Phase 2 inventory is built, then Claude also proposes decision points beyond groom's open questions, drawn from requirements, architecture docs, and confirmed principles.
- AC-5 (Scenario 2): Given session close, when the audit runs, then every groom-inherited open question must have a corresponding recorded decision, or the audit fails.
- AC-6 (Scenario 3): Given `requirements.md` has no open design questions, when Phase 2 begins, then the inventory contains only Claude-identified decision points, with no fabricated groom-question placeholders.
- AC-7 (Scenario 4): Given session close, when any phase was skipped/bulk-approved or an inventory item lacks a recorded decision, then Claude hard-blocks — returns to the relevant phase and does not mark the feature ready for `/build`.
- AC-8 (Scenario 4): Given all phases gated correctly and the inventory fully resolved, when the audit runs, then Claude marks the design ready for `/build`.
- AC-9 (Scenario 5): Given Framing, or a decision point in Options & Trade-offs where a plausible future case is materially relevant, then Claude surfaces it and the user confirms incorporate-now or defer; future cases are not surfaced for every decision point.
- AC-10 (Scenario 5): Given a future case confirmed as "incorporate now," when Phase 2 is updated, then a new inventory item is added and confirmed before Phase 3 proceeds on it. Given "defer," then it is recorded rather than dropped.
- AC-11 (Scenario 6): Given a decision in Phase 3/4 that establishes a reusable pattern beyond the current feature, when Claude recognizes this, then it surfaces the candidate principle and confirms it with the user before treating it as established.
- AC-12 (Scenario 6): Given a confirmed architectural principle, when session close occurs, then it is documented to `docs/architecture/`.
- AC-13 (Scenario 6): Given a future `/design` session, when Phase 1 Framing runs, then previously confirmed principles are read and applied; a new decision conflicting with one is flagged explicitly rather than silently allowed.

---
Status: Groomed — ready for /design
