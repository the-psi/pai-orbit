## Epic
<!-- None — standalone enhancement -->

## Purpose
When Claude enters `/design` mode for a change that touches shared interfaces, API contracts, or cross-service data models, it should automatically invoke (or prompt to invoke) the `/analysis` skill before presenting design options — so that blast radius is understood before options are evaluated. This prevents designs from being made without knowing what else breaks.

## Scenarios in scope
1. Developer enters `/design` for a change that touches a shared interface — an existing API endpoint, a data model field used by multiple services, or a cross-service contract. Claude invokes `/analysis` or blocks on it before presenting any design options.
2. Developer enters `/design` for a purely additive new feature — no changes to existing shared interfaces, no existing consumers affected. Claude skips the analysis step and states this explicitly.
3. Developer enters `/design` and a relevant analysis report already exists in `docs/wip/analysis-*.md` from a prior session. Claude reads the existing report rather than re-running `/analysis` from scratch.
4. Developer enters `/design` and explicitly states the change is self-contained or that blast radius has already been handled. Claude acknowledges and proceeds without requiring `/analysis`.

## User stories / use cases
- As a developer, I want `/design` to trigger impact analysis automatically when my change touches shared interfaces, so that my design options are informed by blast radius before I commit to an approach.
- As a developer working on a new additive feature, I want `/design` to skip analysis when there are no shared interface changes, so that I am not blocked unnecessarily.
- As a developer returning to a feature, I want `/design` to reuse an existing analysis report, so that I do not repeat work already done.
- As a developer who has already assessed blast radius, I want to tell `/design` that analysis is done, so that I can proceed directly to design options.

## Functional requirements
1. REQ-1 (Scenario 1): At session start, `/design` mode must assess whether the change under discussion touches a shared interface, existing API contract, data model field used across services, or cross-service boundary. If yes — or if uncertain — it must invoke `/analysis` or explicitly prompt the user to run it before presenting design options.
2. REQ-2 (Scenario 1): `/design` must not present design options for a shared-interface change until an impact report is available in session context — either run inline or loaded from file.
3. REQ-3 (Scenario 2): For purely additive changes (new endpoints, new fields, new services with no existing consumers), `/design` may skip the analysis step. The skip must be stated explicitly: "No shared interface changes detected — skipping analysis."
4. REQ-4 (Scenario 3): At session start, `/design` must scan `docs/wip/` for an existing `analysis-<slug>-<date>.md` report relevant to the current change. If found, it must read and cite it rather than re-running `/analysis`.
5. REQ-5 (Scenario 4): If the developer explicitly states the change is self-contained or analysis is already handled, `/design` must acknowledge this and proceed without blocking.

## Non-functional requirements
- The analysis check must happen at session start, before any design discussion — not mid-session.
- Detection is heuristic: Claude judges from the change description whether it modifies an existing API endpoint, a data model field consumed by more than one service, or a cross-service contract. If uncertain, Claude must treat the change as shared-interface (conservative default) and invoke `/analysis`.

## Context
The `/analysis` skill already exists at `plugins/pai-orbit/core/skills/analysis/SKILL.md`. This enhancement wires it into the `/design` mode entry sequence — no changes to the skill itself are required.

## Out of scope
- Changes to the `/analysis` skill itself.
- Auto-running `/analysis` from modes other than `/design`.

## Open questions
- [x] Should the shared-interface detection be purely heuristic or config-driven? → **Heuristic judgement.** Claude assesses from context whether the change touches an existing API, data model field used across services, or cross-service boundary. No config entry required. (resolved 2026-06-20)

## Acceptance criteria
- AC-1 (Scenario 1): Given a change touching an existing API or data model field, when `/design` starts, then Claude invokes `/analysis` or states it is required before presenting options.
- AC-2 (Scenario 1): Given `/analysis` has not been run and the change touches a shared interface, when the user asks for design options, then Claude declines and redirects to analysis first.
- AC-3 (Scenario 2): Given a purely additive new feature, when `/design` starts, then Claude explicitly states "No shared interface changes detected — skipping analysis" and proceeds.
- AC-4 (Scenario 3): Given a relevant `docs/wip/analysis-*.md` exists, when `/design` starts, then Claude reads and cites it without re-running the skill.
- AC-5 (Scenario 4): Given the developer states analysis is already done or the change is self-contained, when `/design` starts, then Claude acknowledges and proceeds without blocking.

---
Status: Groomed — ready for /design
