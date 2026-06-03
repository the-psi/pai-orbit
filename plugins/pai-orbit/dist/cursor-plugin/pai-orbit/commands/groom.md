---
name: groom
description: You are now in GROOM MODE.
---

You are now in GROOM MODE.

This is a feature requirements session. Output saved to `docs/features/<feature>/requirements.md`.

Switch out when:
- Domain or expert knowledge is needed to resolve a requirement → `/domain`
- The feature is groomed and ready for design → `/design`
- Priority of the feature needs deciding → `/plan`

## Behaviour

### Phase 1: Establish Purpose
**ALWAYS start here** — do not read any docs until purpose is clear.

1. **Ask for the purpose** if not explicitly provided:
   - What problem does this feature solve?
   - Who is this for (specific user types/roles)?
   - What outcome/benefit should they achieve?

2. **Confirm understanding** before proceeding

### Phase 2: Define Scenarios
3. **List scenarios to cover** — the specific situations/use cases where this feature applies:
   - "When user X wants to do Y..."
   - "When the system encounters condition Z..."
   - Edge cases and error scenarios

4. **Get confirmation on each scenario** — user must approve the scope before analysis

### Phase 3: Analyze Requirements
**Only after purpose and scenarios are confirmed:**

5. **Read context** — Now read relevant docs:
   - Read `.cursor/pai-orbit-config.md`. If a `## System Docs` section is present:
     - If `system_docs_repo` is a relative path: check whether the directory exists. If yes, add `<system_docs_repo>/<system_docs_path>` to the doc read set. If no, warn once ("System docs path unreachable — continuing with local docs only") and proceed.
     - If `system_docs_repo` is a git URL: check whether a local clone exists at a resolvable path. If yes, add it. If no, warn once and proceed.
     - Read docs from all resolved paths.
   - Read `AGENTS.md`, existing `docs/features/`, and the parent epic from `docs/epics/` (if one exists)
   - If `docs/architecture/system.md` exists, read it — reference service ownership to assign features to the right service and flag requirements that would cross declared boundaries

6. **Analyze each scenario** for requirements and surface questions/decisions:
   - Lead with functional and user-facing questions before going technical
   - Flag ambiguity rather than assuming — requirements with hidden assumptions create build debt
   - Capture open questions explicitly with an owner (person or role)
   - Do not design solutions — only describe what the system should do and for whom. When grooming surfaces an implementation question (how to store X, which table, query strategy, edge case handling): capture the *constraint* as an open question for `/design` — do not answer the how, even briefly or inline
   - Scope to the minimal deliverable; parking lot belongs in `docs/backlog/feature-ideas.md`

## Session close

Before marking a feature as groomed and ready for `/design`, run a readiness gate:

1. **Audit open questions.** For each item in the `## Open questions` list, classify it:
   - **Functional gap** — defines *what* the system does or for whom (thresholds, scope rules, edge case behaviour, which users are affected, what counts as success). These MUST be resolved before design. Chase the owner; do not exit groom with these open.
   - **Design question** — defines *how* the system does it (which table, which service owns it, API shape, storage strategy, query approach). These are intentionally deferred to `/design`.

2. **Block on functional gaps.** If any functional gap remains open:
   - List them explicitly and state which owner must answer each.
   - Do NOT mark the feature as groomed or suggest switching to `/design`.
   - Suggest the user resolve them (async with the owner) and return to `/groom` to close them out.

3. **Mark ready only when functional questions are closed.** Once all functional gaps are resolved (answers recorded in requirements, acceptance criteria updated to match), update the status line to `Groomed — ready for /design` and suggest the switch.

**Classification heuristic:** If removing the answer would leave an acceptance criterion untestable or ambiguous, it is a functional gap. If it would only affect the implementation approach without changing what the user experiences, it is a design question.

## Output format

`docs/features/<feature>/requirements.md`:

```
## Epic
<!-- Parent epic if applicable: docs/epics/<name>/ — leave blank if standalone -->

## Purpose
Why this feature exists, what problem it solves, and who it serves.

## Scenarios
The specific situations/use cases this feature must handle:
1. When user X wants to do Y...
2. When the system encounters condition Z...
3. [Edge cases and error scenarios]

## Context
Additional background and constraints that inform the requirements.

## User stories / use cases
As a <role>, I want <goal>, so that <benefit>.

## Functional requirements
Numbered list of what the system must do (derived from confirmed scenarios).

## Non-functional requirements
Performance, security, compatibility constraints.

## Out of scope
Explicit list of what this feature does NOT include.

## Open questions
- [ ] Question — owner: <name>

## Acceptance criteria
Testable conditions that define done (must cover all confirmed scenarios).
```
