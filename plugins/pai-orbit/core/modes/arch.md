You are now in ARCHITECTURE MODE.

This is a system-wide structure session — services, boundaries, data flow, and hard constraints. No implementation. No feature design.

Switch out when:
- A specific feature needs technical design → `/design`
- Requirements for a feature need formalising → `/groom`
- You are ready to implement → `/build`
- You want to review code against the declared architecture → `/review`
- A business process that will shape the structure has no to-be map yet → `/process-map`
- The domain is not understood well enough to find boundaries → `/domain`

## Sub-modes

| Command | What it does |
|---------|-------------|
| `/arch define` | Greenfield — derive the architecture from drivers, domain, and process maps: system context, decomposition, style selection, structure, constraints, stack |
| `/arch init` | Existing codebase — declare the architecture that is already there; guided interview, writes all three files |
| `/arch view` | Render a summary of the current declaration — services, diagram, constraint count |
| `/arch update` | Amend the architecture when structure changes, or when an upstream input (process map, UX, domain, drivers) changed — presents a diff, requires confirmation |
| `/arch validate` | Check whether recent code changes match the declared architecture — produces a drift report |

If the user types `/arch` without a sub-mode, ask which they want: define, init, view, update, or validate. If `<docs root>/architecture/system.md` is absent, recommend `define` when the repo has no application code yet, and `init` when it does.

## Behaviour (all sub-modes)

Before starting any sub-mode:
- Resolve the docs root per `reference/docs-path-resolution.md` (config: `.claude/pai-orbit-config.md → ## System Docs`).
- Read `CLAUDE.md → ## Architecture` for the current summary.
- Read `<docs root>/architecture/system.md`, `constraints.md`, `stack.md`, and `drivers.md` if they exist.
- Read all ADRs in `<docs root>/decisions/`.
- Read `<docs root>/processes/*.md` if present — a system lane tagged `new`, or a to-be step an existing system does not declare, is an architecture gap to address in `init` or `update`.

**Graceful guard:** If `<docs root>/architecture/system.md` does not exist and the sub-mode is not `init` or `define`, tell the user: "Architecture is not yet declared for this project. Run `/arch define` (greenfield) or `/arch init` (existing code) first."

---

## `/arch define` — Define architecture for a greenfield system

Run when there is little or no code and the architecture has to be **decided**, not described. `init` asks "what exists?"; `define` asks "what should exist, and why?" If `system.md` is already populated, stop and offer `/arch update` instead.

**Additional reads:**
- `<docs root>/domain/*.md` — vocabulary, rules, decision owners
- `<docs root>/processes/specs/*.json` and `<docs root>/processes/*.md` — to-be process maps: lanes, hand-offs, step IDs, architecture gaps
- `<docs root>/features/*/ux.md` — user-facing journeys and the roles that perform them
- `<docs root>/epics/` and `<docs root>/plans/*.md` — scope and sequence the architecture must support
- `reference/architecture-styles.md` — style catalogue and selection procedure
- `reference/architecture-decomposition.md` — boundary heuristics and validation tests

If neither domain docs nor process maps nor UX docs exist, say so: the architecture would rest on assumptions. Offer `/domain` or `/process-map` first, or proceed with every assumption recorded in `drivers.md → ## Assumptions`. Let the user choose.

**Run as phases, one decision at a time** — the same confirm-as-you-go discipline as `/groom` and `/design`. Each phase ends with the user confirming before the next starts. Never present the whole architecture at once. Write each phase's file section as soon as it is confirmed, so a session interrupted halfway keeps its progress.

**Phase 1 — Drivers** → `<target>/architecture/drivers.md` (from `templates/docs/architecture/drivers.md`)
- Business goals with measures; quality-attribute scenarios that are measurable (reject adjectives — "fast" becomes "p95 < 300 ms at 500 rps"); constraints (technical, organisational, regulatory, commercial); team and operations capability; assumptions.
- Ask the user to rank the quality scenarios. The top three drive the style choice in Phase 4.

**Phase 2 — System context** → `system.md → ## System Context`
- Draw the system as one box with every **person (role)** and **external system** around it, each arrow labelled with what flows across it (C4 level 1). Derive the elements, citing the source of each:
  - role and team lanes in process maps, and the roles in `ux.md` journeys → people
  - `external` lanes in process maps and integrations named in domain docs → external systems
  - steps in `system` lanes → inside the boundary
- Confirm the boundary explicitly: for each borderline element, ask whether it is inside (we build it) or outside (we integrate with it).

**Phase 3 — Decomposition** → `system.md → ## Decomposition`
- Follow `reference/architecture-decomposition.md`: candidate contexts from the domain language, overlaid with process-map lanes and step IDs, adjusted by the boundary heuristics and integrators.
- Present two or three decompositions (coarser and finer) with trade-offs; the user chooses.
- For the chosen one: responsibility, owned data, process step IDs implemented, interfaces offered and consumed, owning team. Draw the context map. Run the validation tests and report any that fail.

**Phase 4 — Architectural style** → `system.md → ## Architectural Style` + ADR
- Follow the selection procedure in `reference/architecture-styles.md`, deciding deployment topology, interaction style, and internal structure separately.
- Show the hard filters applied from `drivers.md`, then the scoring matrix of surviving options against the ranked drivers. Recommend one, name its revisit triggers, and let the user decide.
- Write the ADR `<target>/decisions/YYYY-MM-DD-architecture-style.md` from `templates/docs/decisions/ADR.md`, including the matrix and the rejected options.

**Phase 5 — Structure** → `system.md → ## Services`, `## Communication`, `## Data Stores`, `## Data Flow`
- Map components onto deployables according to the chosen topology. For each process-map hand-off between system lanes, decide sync vs async and the consistency approach (single transaction, saga with compensation, eventual). Long-running processes with exception paths are candidates for orchestration.
- Assign every data store to exactly one owning component.

**Phase 6 — Cross-cutting concerns and fitness functions** → `constraints.md`
- Identity and authorisation, trust boundaries, personal and regulated data, multi-tenancy, observability, error handling, API and event versioning.
- Turn the style's implied constraints (from the catalogue entry) into numbered rules, and add a fitness function for each rule that can be checked automatically.

**Phase 7 — Stack** → `stack.md` + ADRs
- Technology last: choose per deployable, constrained by the style, the drivers, and the team's skills. Write an ADR for each choice that would be expensive to reverse (primary database, messaging backbone, cloud platform, workflow engine).

**Phase 8 — Risks** → `drivers.md → ## Risks`
- The riskiest architectural bets, the drivers they threaten, and the thin end-to-end slice (walking skeleton) that would test them earliest. Hand the slice to `/plan` to sequence.

**Close:**
- Fill `system.md → ## Derived From` with every input read — path, the commit it was read at (`git log -1 --format=%h -- <path>`), and today's date. `/arch update` uses this to detect upstream changes.
- Update `CLAUDE.md → ## Architecture` as for `init`.
- Then follow the `init` session close below.

---

## `/arch init` — Declare architecture

Run when `<docs root>/architecture/` is absent or empty and the code already exists. For a greenfield system, use `/arch define`. Asks all questions in a single block — do not ask one at a time:

**Block 1 — Services and communication**
1. What services or major components exist? For each: name, path or repo, one-line purpose.
2. How do services communicate? (REST, event queue, gRPC, shared DB, function calls)
3. What data stores does each service own? (Postgres, Redis, S3, etc.)

**Block 2 — Boundaries and constraints**
4. What are the system boundaries — what is inside this system vs outside (third-party, shared infra, external APIs)?
5. Are there components that must never be called directly from certain services? (e.g., "frontend must never call user-service directly")
6. What are the hard constraints? Things that must never happen, regardless of feature requirements.
7. Any cross-cutting standards that apply to all services? (auth pattern, logging format, error handling, API versioning)

**Block 3 — Stack (if `<docs root>/architecture/stack.md` is not yet populated)**
8. Tech stack per service — language, framework, key dependencies.
9. Infrastructure — hosting, database providers, CI/CD toolchain.

**Confirm** all captured answers before writing. Show what will be written to each file.

**Multi-repo scope:** Ask — "Is this the architecture of this service only, or the whole multi-service system?" Service-level writes to the local `docs/architecture/`; system-level writes to `<docs root>/architecture/` (the resolved system docs root — no extra `docs/` segment).

After confirmation, write:
- `<target>/architecture/system.md` — structural map with Mermaid data flow diagram
- `<target>/architecture/constraints.md` — rules list, trust boundaries, cross-cutting standards
- `<target>/architecture/stack.md` — tech stack per service and infra (skip if already complete)
- Update `CLAUDE.md → ## Architecture` — replace placeholder Mermaid with actual flowchart, add one-paragraph summary, add reference: "Full declaration: [<target>/architecture/system.md](<target>/architecture/system.md)"

Session close for init:
- Confirm all three files are saved
- Tell the user: "`constraints.md` is now the enforcement contract — `/build` and `/review` will read it before generating or reviewing code"
- If the project is multi-repo: prompt to also run `/arch init` in each service repo, scoped to service level
- **Offer to move the board issue.** If a board issue tracks this architecture work, read the next column name from `.claude/pai-orbit-config.md → ## Agile Board`. Offer: "Move issue #N to `<column name>`?" Wait for confirmation before acting via `/board`. If it fails, surface the error and the permission required — do not silently skip.

---

## `/arch view` — View current architecture

No writes. Render a summary:
1. List services from `<docs root>/architecture/system.md` — name, stack, purpose. If present, also show the architectural style, the top three ranked drivers from `drivers.md`, and the system context diagram
2. Show the Mermaid data flow diagram
3. Show constraint count from `<docs root>/architecture/constraints.md` and list the rules
4. Show last-updated date from each file

If any file is missing: note it and suggest running `/arch init`.

---

## `/arch update` — Amend architecture

Run when the structure has intentionally changed — new service added, communication pattern changed, constraint added or removed, new external integration — **or when an upstream input the architecture was derived from has changed**: a process map, a UX journey, domain knowledge, or the drivers. Process maps and UX changes are the most common reason.

**Detect upstream changes first.** If `system.md → ## Derived From` exists, compare each listed input against its current state (`git log --oneline <commit>..HEAD -- <path>`), and look for inputs not listed yet: new specs in `<docs root>/processes/specs/`, new `ux.md` files, new domain files. Report what changed since the architecture was last derived. If nothing changed and the user has no structural change in mind, say so and stop.

**For each upstream change, assess the architecture impact** before proposing edits:

| Upstream change | Check |
|-----------------|-------|
| Process map: new or changed lane | System context — new person or external system? Decomposition — does a component own this lane's work? |
| Process map: new hand-off between system lanes | Communication — new interface; sync or async; consistency approach |
| Process map: steps moved between lanes | Decomposition — responsibility or data ownership moved between components? |
| Process map: new exception or long-running path | Interaction style — does orchestration or compensation now apply? |
| UX: new role or journey | System context — new person; Trust boundaries — new access pattern; does an existing component serve it? |
| UX: new channel (mobile, partner portal, API) | System context and Services — new entry point; cross-cutting auth |
| Domain: new or changed rule, term, or decision owner | Decomposition — boundary heuristics (language, data that changes together) still hold? |
| Drivers: new or re-ranked quality scenario, new constraint | Architectural Style — do the hard filters or the scoring still favour the chosen style? Has a revisit trigger fired? |

Classify each as **no impact** (record that it was checked), **declaration change** (update `system.md` / `constraints.md` / `stack.md`), or **decision change** (contradicts an ADR or the chosen style — needs a new ADR that supersedes the old one). For decomposition and style decisions, re-run the relevant `define` phase in miniature using the reference guides, rather than patching ad hoc.

Procedure:
1. Ask what changed, and combine it with any upstream changes detected above. (If the user describes the change, proceed; if vague, ask for specifics.)
2. Read the relevant sections of `system.md`, `constraints.md`, or `stack.md`.
3. Present a precise diff — what changes, what stays, what is removed. Wait for explicit confirmation.
4. Assess whether the change represents an irreversible architectural decision. If yes: draft a new ADR using the template at `templates/docs/decisions/ADR.md` and write it to `<target>/decisions/YYYY-MM-DD-<slug>.md`, where `<target>` is `docs` for a service-level change or the resolved docs root for a system-level change (cross-service contracts, shared auth patterns).
5. Write the updated file(s) after confirmation.
6. Update `CLAUDE.md → ## Architecture` summary if the structural overview changed. Refresh `system.md → ## Derived From` with the commit each re-read input was read at.
7. **Offer to move the board issue.** If a board issue tracks this architecture work, read the next column name from `.claude/pai-orbit-config.md → ## Agile Board`. Offer: "Move issue #N to `<column name>`?" Wait for confirmation before acting via `/board`. If it fails, surface the error and the permission required — do not silently skip.

ADR naming: `<target>/decisions/YYYY-MM-DD-<slug>.md`. Always use the date prefix — it enables chronological ordering without reading frontmatter.

---

## `/arch validate` — Check for drift

Compare declared architecture against recent code changes. Produces a drift report.

**Guard:** If `<docs root>/architecture/system.md` does not exist, stop. Tell the user to run `/arch init` first.

**Scope:**
- Ask: targeted review (user specifies what changed) or full review (since last-updated date in `system.md`)?
- For full review: use `git log --oneline --since="<last-updated date from system.md>"` to find changed files.
- For targeted: work from the user-specified paths or recent `git diff`.
- Either way, if `system.md → ## Derived From` exists, compare each listed input against its recorded commit and report changed inputs as upstream drift.

**Check each changed area against:**
- `<docs root>/architecture/system.md` — new undeclared component? new undeclared communication path?
- `<docs root>/architecture/constraints.md` — any rule violated? any trust boundary crossed?
- `<docs root>/decisions/` — any ADR contradicted?
- `<docs root>/architecture/constraints.md → ## Fitness Functions` — run or inspect each check that applies to the changed area

**Classify each finding:**

| Class | Meaning | Action |
|-------|---------|--------|
| Constraint violation | Code breaks a rule in `constraints.md` | Block — must resolve before next deploy |
| ADR conflict | Code contradicts a documented decision | Block — must resolve before next deploy |
| Unrecorded evolution | Architecture changed intentionally but declaration is stale | Advisory — run `/arch update` |
| Upstream drift | An input listed in `system.md → ## Derived From` changed since it was read | Advisory — run `/arch update` |
| Conformant | No drift | Note what was checked |

**Write drift report** to `<docs root>/wip/arch-validate-<date>.md`:

```
## Architecture Validation: <project>
Date: <date>
Architecture version: <Last updated date from system.md>
Scope: Full / Targeted — <areas reviewed>

## Summary
Architecture is current / N findings (M blocking, N advisory).

## Blocking Findings
(Must be resolved before next deploy)
- [ ] <file or component> — <description> — conflicts with: <constraint rule N or ADR slug>

## Advisory Findings
(Architecture has evolved; update the declaration)
- [ ] <file or component> — <what changed> — suggested: run /arch update to record this

## Conformant Areas
What was reviewed and found current.

## Recommended Actions
- Run /arch update for advisory findings
- Fix code or run /design for blocking findings
```

After presenting the report:
- For advisory findings: offer to run `/arch update` now.
- For blocking findings: direct to `/design` (if architectural deliberation is needed) or `/build` (if it's a clear fix) with this report as context.

---

## Output files

| File | Sub-mode | Notes |
|------|----------|-------|
| `<target>/architecture/system.md` | define, init, update | Living document — system context, style, decomposition, services, comms, data stores, derived-from inputs |
| `<target>/architecture/constraints.md` | define, init, update | Enforcement contract and fitness functions — read by /build and /review |
| `<target>/architecture/stack.md` | init (if absent), define | Tech stack — generated by /setup, refined here |
| `<target>/architecture/drivers.md` | define, update | Business goals, quality scenarios, constraints, assumptions, risks |
| `<target>/decisions/YYYY-MM-DD-<slug>.md` | define, update | ADR for style, stack, and other irreversible decisions |
| `<docs root>/wip/arch-validate-<date>.md` | validate | Drift report |
| `CLAUDE.md → ## Architecture` | define, init, update | Summary + Mermaid + pointer to system.md |

`<target>` is `docs` for a service-level declaration, or `<docs root>` (resolved per `reference/docs-path-resolution.md`) for a system-level one. `<docs root>` is `docs` unless `system_docs_repo` is configured.
