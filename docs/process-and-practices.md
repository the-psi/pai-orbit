# Process & Practices

PAI-Orbit is a structured working methodology for software teams using Claude Code. This document explains why the methodology is designed the way it is, and how to get the most out of it.

---

## The core problem

Software teams lose context constantly. A feature gets half-designed in a conversation and then built from memory. A build session derails into a planning debate. Domain knowledge lives in someone's head and never gets written down. A data question gets answered with a guess.

PAI-Orbit imposes light discipline: **each slash command puts Claude into a distinct headspace with a defined output destination.** Switching is explicit. Outputs are saved to the docs directory. Nothing important lives only in a conversation window.

---

## The full workflow

```
BACKLOG                          SPRINT                                    RELEASE
┌──────────────┐    ┌─────────────────────────────────────────┐    ┌──────────┐
│ /domain      │    │ /groom → /design → /build → /test ─────────→ /review │    │ /deploy  │
│ /ux          │ →  │                               └─ fail → /build        │ →  │          │
│ /plan        │    │                                                        │    │          │
│ /arch        │    │                                                        │    │          │
└──────────────┘    └─────────────────────────────────────────────────────┘    └──────────┘

Production fast-path:  /incident ──────────────────→ /build → /review → /deploy
```

**Workflow skills** (used across all phases):
`/git` · `/board` · `/analysis` · `/data-model` · `/security-review` · `/simplify`

`/arch validate` is used after build sessions that touch service structure.

---

## The producer/consumer model

Every mode either produces or consumes:

| Mode | Produces | Consumes |
|------|----------|----------|
| `/domain` | `docs/domain/` | — |
| `/ux` | `docs/features/*/ux.md` | `docs/domain/`, user research |
| `/groom` | `docs/features/*/requirements.md` | `docs/domain/`, `docs/features/*/ux.md`, `docs/architecture/system.md` |
| `/arch` | `docs/architecture/system.md`, `docs/architecture/constraints.md`, `docs/architecture/stack.md`, `docs/decisions/YYYY-MM-DD-*.md`, `docs/wip/arch-validate-*.md` | CLAUDE.md, existing `docs/architecture/`, `docs/decisions/`, git log |
| `/design` | `docs/features/*/design.md`, `docs/decisions/YYYY-MM-DD-*.md` | `docs/features/*/requirements.md`, `docs/domain/`, `docs/architecture/` |
| `/build` | Code, `docs/domain/product-capabilities.md` | All docs, task board, `docs/architecture/constraints.md` |
| `/test` | `docs/features/*/test-plan.md` | `docs/features/*/requirements.md` |
| `/review` | `docs/wip/review-*.md` | Diff, CLAUDE.md, `docs/architecture/`, `docs/decisions/` |
| `/plan` | `docs/plans/`, board card moves | All docs, task board state |
| `/data` | `docs/reports/` | Database, `docs/domain/` |
| `/incident` | Tracking issue, `docs/wip/postmortem-*.md` | Error logs, recent deploys |

`/plan` is the integrator — it consumes everything and decides what to work on next. It never produces domain knowledge, requirements, or designs.

The discipline: **switch modes when the headspace or output destination changes.** If you're in a build session and a design question surfaces that you can't answer in a sentence, stop and switch to `/design`. If you're in a planning session and realise a feature isn't groomed, stop and switch to `/groom`. Don't try to do both at once.

---

## Working style

**Lead functionally, go technical when you drive it.** In design and groom sessions, start with what the system does and for whom — not how it does it. Technical discussions are more productive when the functional intent is clear.

**Save everything.** Conversation context is ephemeral. A good discussion that doesn't end in a saved document is a conversation that will need to happen again. Every mode has a defined output destination; use it.

**Flag ambiguity, don't assume.** Requirements with hidden assumptions create build debt. Design decisions made without flagging uncertainty create architectural debt. When something is unclear, name it as an open question with an owner. "I don't know" is a better output than a confident guess.

**CLAUDE.md is the contract.** This file tells Claude everything project-specific: architecture, stack, conventions, key files, deployment. Keep it current. Stale CLAUDE.md leads to wrong assumptions that compound over time.

---

## How a session should flow

### Starting a feature (full flow)

1. `/domain` — capture any expert knowledge needed to understand the problem space; output to `docs/domain/`
2. `/ux` — define the user flow and interface behaviour; output to `docs/features/<feature>/ux.md`
3. `/groom` — formalise requirements and acceptance criteria; output to `docs/features/<feature>/requirements.md`
4. `/design` — design the technical solution; output to `docs/features/<feature>/design.md` and/or `docs/decisions/`
5. `/board` — create the task board item if it doesn't exist yet
6. `/build` — implement; reference the docs from steps 1–4
7. `/test` — write and run the test plan; output to `docs/features/<feature>/test-plan.md`
   - If tests fail: document the failure, switch back to `/build` with context, re-test after fix
8. `/security-review` — if the change touches auth, input handling, or permissions
9. `/review` — architect or tech lead code review before merge
10. `/git` — commit and push
11. `/deploy` — ship to production

Not every feature needs every step. A minor bug fix may go straight to `/build → /git → /deploy`. A greenfield feature needs the full flow.

### Starting a build session

1. Open Claude Code in your project directory
2. Check `/board` for the issue you're working on
3. Type `/build` — Claude reads CLAUDE.md and any relevant docs before writing a line of code
4. Claude confirms what it understood about the task before starting
5. **If switching modes mid-session:** save a handoff note to `docs/wip/session-capture-<date>.md` before switching; read it when returning to `/build`

### Responding to a production incident

1. `/incident` — triage scope and severity; open a tracking issue immediately
2. Switch to `/build` — tight scope, fix the symptom, preserve rollback path
3. `/review` — focused review: does it fix the symptom, does it introduce new risk?
4. `/deploy` — confirm environment and rollback plan before deploying
5. Verify resolution; update the tracking issue
6. `/incident` post-mortem — for P1/P2: write `docs/wip/postmortem-<slug>-<date>.md`; file follow-up items on the board

### Starting a planning session

1. `/plan` — read current board state, read `docs/domain/product-capabilities.md`, triage and sequence
2. Board card moves happen through `/board` or the browser
3. Save non-trivial planning notes to `docs/plans/<topic>-<date>.md`

### Exploring data

1. `/data` — run queries with intent declared upfront; output to `docs/reports/`
2. If findings reveal a domain interpretation question: switch to `/domain`
3. If findings reveal a feature need: switch to `/groom`

---

## Workflow skills: when to use them

These skills cross-cut the sprint phases — they can be invoked from any point in the flow.

| Skill | When to reach for it |
|-------|---------------------|
| `/git` | Committing, branching, opening a PR |
| `/board` | Creating an issue, moving a card, assigning work, closing on ship |
| `/analysis` | Before changing a shared interface: "what breaks if we change X?" |
| `/data-model` | Before writing a query against an unfamiliar table; proposing a schema change |
| `/security-review` | Before merging anything that touches auth, input, secrets, or IAM |
| `/simplify` | After a build session when the implementation feels overbuilt; on periodic cleanup passes |
| `/arch validate` | After a build session that added a service, changed inter-service communication, or crossed a boundary |

---

## Docs structure

```
docs/
├── architecture/  Declared system architecture — system.md (structure), constraints.md (rules), stack.md (tech)
├── domain/        Expert knowledge — the science or logic behind the product
├── features/      One folder per feature: ux.md, requirements.md, design.md, test-plan.md
├── decisions/     Architecture Decision Records (ADRs) — named YYYY-MM-DD-<slug>.md
├── plans/         Planning and prioritisation notes
├── reports/       Data analysis findings
├── ops/           Human-owned operational files — Claude does not modify these unless asked
├── backlog/       Feature parking lot — promoted to task board by human decision only
└── wip/           Ephemeral session captures, review reports, arch-validate reports, post-mortems
```

**`docs/architecture/constraints.md` is the enforcement contract.** Every code-generating command (`/build`) and every code-reviewing command (`/review`) reads it and treats violations as blocking. Declare it once with `/arch init`; update it with `/arch update` when the rules evolve.

**`docs/ops/` is human-owned.** Files here (field actions, pending decisions, operational runbooks) are written and maintained by people, not by Claude. Claude reads them for context but does not modify them without explicit instruction.

**`docs/backlog/feature-ideas.md` is a parking lot**, not a task board. Ideas here are promoted to the task board by a human. Claude does not move entries autonomously.

**`docs/wip/` is ephemeral.** Session captures, review reports, test failure notes, and post-mortems live here. They are working documents, not permanent records. Promote findings to the appropriate permanent location (decisions/, domain/, features/) when they stabilise.

---

## Multi-Repo Documentation Convention

In microservices projects where each service lives in its own repo, documentation falls into two categories with different homes.

**Service repo (`./docs/`)** — docs that are co-located with the code they describe:
- Feature requirements, designs, and test plans for features owned by this service
- Service-level ADRs (decisions that affect only this service's internals)
- Domain knowledge specific to this service's bounded context
- The service's own `docs/domain/`, `docs/features/`, and `docs/decisions/` trees

**System repo (`system_docs_repo`)** — docs that describe the whole system or cross service boundaries:
- System-level ADRs (API contracts, auth patterns, shared protocols, inter-service agreements)
- Epics that span multiple services
- Domain knowledge shared across the whole product (shared data models, business-wide rules)
- Roadmaps and plans that sequence work across services
- Cross-cutting features (e.g., SSO, rate limiting, observability)

**The deciding question:** "Would an engineer working in a different service need this doc?" If yes, it belongs in the system repo.

**Architecture docs follow the same split:** `docs/architecture/` in a service repo describes that service's internals (its components, its data stores, its service-level constraints). The system-wide architecture declaration — all services, inter-service communication, and system-wide invariants — lives in `<system_docs_repo>/docs/architecture/`. When running `/arch init`, you are asked which scope to declare; write to the appropriate location. Cross-cutting ADRs (API contracts, shared auth patterns, inter-service agreements) always go to `<system_docs_repo>/docs/decisions/`.

**How to configure:** Add a `## System Docs` section to `.claude/pai-orbit-config.md` in each service repo with a `system_docs_repo` pointer (relative path or git URL). Commands resolve this at session start and read from both locations automatically.

**Discipline:** Do not put service-specific docs in the system repo to avoid the "arbitrary home" problem that the hybrid model is designed to prevent. Cross-cutting means the doc is relevant to at least two services.

---

## Docs home: local vs remote platform

PAI-Orbit uses a **local-first** approach for docs. All modes write markdown to a local `docs/` directory. If your team uses Confluence or Notion, the `docs-writer` agent handles outbound sync.

**Why local-first?**
- Every mode works the same way regardless of docs home — no conditional MCP logic
- Works offline
- Diff and review before publishing
- Claude always reads local — one source of truth for its context

**Why outbound-only sync?**
Direct edits on Confluence or Notion don't get pulled back automatically. The intended flow is: Claude writes locally → team publishes to the remote platform. If someone edits Confluence directly and that change needs to reach Claude, feed it back explicitly in a session. Bidirectional sync creates conflict resolution problems that aren't worth the complexity for most teams.

---

## Memory

Claude Code's memory system (`.claude/projects/.../memory/`) allows Claude to accumulate project context across conversations. PAI-Orbit uses memory for:

- Team context: who people are, roles, preferences
- Project state: what was decided, what is in progress
- Feedback: corrections and working preferences

Memory supplements CLAUDE.md — it holds evolving context that doesn't belong in the stable project spec. CLAUDE.md is architecture; memory is living context.

---

## Operational skills

Beyond the core modes and workflow skills, PAI-Orbit projects grow domain-specific skills over time: skills that encode a recurring multi-step procedure (data backfill, seed data insertion, a structured review of domain-specific entities). These live in `.claude/skills/` in the project repo.

Run `/suggest-skills` after a few weeks of work to discover what recurring patterns are worth encoding as skills.

---

## What PAI-Orbit is not

- **A project management tool.** It helps Claude interact with your task board — it doesn't replace it.
- **A documentation generator.** It saves real outputs from real sessions — it doesn't generate docs from thin air.
- **A replacement for human judgment.** Modes and skills constrain Claude's behaviour; they don't replace the engineer or domain expert's decisions. Flag ambiguity, don't paper over it.
