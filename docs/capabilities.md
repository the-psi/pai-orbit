# Capabilities

Reference for every mode, skill, and agent in PAI-Orbit.

---

## Modes

Modes are entered with a slash command. They change Claude's headspace and output destination for the session. Switch explicitly when the work type changes.

### `/domain` — Domain Mode

**Headspace:** Domain knowledge production  
**Reads:** Domain expert input, existing docs/domain/  
**Writes:** docs/domain/*.md  
**Switch to:** `/groom` when knowledge informs a feature, `/design` when it informs architecture

Distinguishes established knowledge, working hypotheses, and unknowns. Does not implement.

---

### `/ux` — UX Mode

**Headspace:** User experience and flow design  
**Reads:** CLAUDE.md, docs/features/ (existing), docs/domain/  
**Writes:** docs/features/*/ux.md  
**Switch to:** `/domain` for unresolved domain questions, `/groom` to formalise requirements, `/design` when ready for technical design

Leads with the user's goal and context before discussing interface. Describes flows in steps (what the user sees, does, and what happens next). Uses ASCII or Mermaid diagrams. Does not design the technical implementation.

---

### `/groom` — Groom Mode

**Headspace:** Feature requirements  
**Reads:** CLAUDE.md, docs/domain/, docs/features/ (existing)  
**Writes:** docs/features/*/requirements.md  
**Switch to:** `/domain` for unresolved expert knowledge, `/design` when ready, `/plan` for priority decisions

Leads with functional questions, not technical ones. Scopes to minimal deliverable. Captures open questions with owners. Does not design solutions.

---

### `/arch` — Architecture Mode

**Headspace:** System-wide structure — services, boundaries, data flow, constraints  
**Reads:** CLAUDE.md, docs/architecture/, docs/decisions/, system_docs_repo (if configured)  
**Writes:** docs/architecture/system.md, docs/architecture/constraints.md, docs/architecture/stack.md, docs/decisions/YYYY-MM-DD-*.md, docs/wip/arch-validate-*.md, CLAUDE.md → ## Architecture  
**Switch to:** `/design` for feature-level technical decisions, `/build` when ready to implement

Four sub-modes:
- `/arch init` — guided interview to declare services, communication, data stores, constraints, and trust boundaries for the first time
- `/arch view` — render a summary of the current declaration (no writes)
- `/arch update` — amend the declaration when structure changes; creates an ADR for irreversible decisions
- `/arch validate` — compare recent code changes against the declaration; classifies findings as constraint violations (blocking), ADR conflicts (blocking), or unrecorded evolution (advisory); writes `docs/wip/arch-validate-<date>.md`

`constraints.md` is the enforcement contract — `/build` reads it before generating code; `/review` checks every diff against it.

---

### `/design` — Design Mode

**Headspace:** Technical trade-offs  
**Reads:** CLAUDE.md, docs/architecture/, docs/features/, docs/decisions/, docs/domain/  
**Writes:** docs/features/*/design.md, docs/decisions/YYYY-MM-DD-*.md  
**Switch to:** `/groom` for unclear requirements, `/arch` for system-level boundary changes, `/build` when ready to implement

No implementation. Presents 2–3 options with tradeoffs. Flags irreversible decisions. Reads `docs/architecture/constraints.md` — design options that violate a constraint are flagged explicitly. Uses Mermaid diagrams. Ends every session by listing open questions with owners.

---

### `/build` — Build Mode

**Headspace:** Implementation  
**Reads:** CLAUDE.md, docs/features/, docs/decisions/  
**Writes:** Code (in sub-repos), docs/domain/product-capabilities.md  
**Switch to:** `/design` for non-trivial design questions, `/groom` for unclear requirements, `/plan` for priority questions

Reads CLAUDE.md and relevant docs before starting. Checks the task board. Spawns sub-agents per service for parallel work. Before switching modes mid-session, saves a handoff note to `docs/wip/session-capture-<date>.md`. After shipping: closes the board item, creates issues for newly discovered tasks, updates product-capabilities.md, records design choices as ADRs.

---

### `/plan` — Plan Mode

**Headspace:** Roadmap and prioritisation  
**Reads:** All docs, task board state  
**Writes:** docs/plans/*.md, board card moves  
**Switch to:** `/groom` for ungroomed features, `/design` for technical uncertainties

Presents 2–3 options before recommending. Grounds recommendations in shipped capabilities and actual blockers. Does not close board items autonomously.

---

### `/data` — Data Mode

**Headspace:** Data exploration and analysis  
**Reads:** CLAUDE.md (schema, access patterns), database  
**Writes:** docs/reports/*.md  
**Switch to:** `/domain` for domain interpretation, `/groom` for feature implications

Shows query before running. Prefers read-only. Flags data quality issues explicitly.

---

## Skills

Skills are invoked with a slash command and perform a defined operation.

### `/epic`

Epic lifecycle management — create, load, update, and list epics in `docs/epics/`. An epic is a container for related features sharing a goal and success metric.

- `/epic create <name>` — scaffolds `docs/epics/<name>/EPIC.md` from template, prompts for owner and summary, then opens a board item via `/board`
- `/epic load <name>` — reads the epic, scans `docs/features/` for linked features, and refreshes the Features table
- `/epic update <name>` — reviews session history, proposes a diff, writes on confirmation
- `/epic list` — prints all epics with Status, Owner, and Last Updated

Features link to an epic via the `## Epic` field in `requirements.md`. `/plan` reads `docs/epics/` for multi-feature sequencing.

---

### `/setup`

First-time project configuration. Discovers repo structure and tech stack, asks targeted questions, generates `.claude/pai-orbit-config.md`, `.claude/team.md`, CLAUDE.md stub, stack-specific agents, lint hooks, and docs scaffold. Re-run when the stack or team changes significantly.

---

### `/git`

Git operations following the project's configured branching model. Covers commit conventions, branch naming, PR process, and safety rules (no force-push, no bulk staging, no hook bypass). Reads from `.claude/pai-orbit-config.md → ## Git`.

---

### `/board`

Task management — create issues, move cards, assign work, close on ship. Reads board config from `.claude/pai-orbit-config.md → ## Agile Board` and team roster from `.claude/team.md`. Supports GitHub Issues, Linear, and Jira.

---

### `/test`

Test session — reviews a feature's requirements for testability, produces `docs/features/<feature>/test-plan.md` with test cases (happy path, edge cases, failure paths), maps each acceptance criterion to a test case ID, and distinguishes automated vs manual coverage. Also runs a release readiness check. When a test run fails, classifies the failure (code bug / requirements gap / test setup) and hands off to `/build` or `/groom` with a failure doc as context.

---

### `/review`

Structured code review — reads a branch diff and checks it against CLAUDE.md conventions, ADRs in `docs/decisions/`, and the feature's requirements and design docs. Produces `docs/wip/review-<branch>-<date>.md` with blocking and non-blocking findings, architecture conformance checklist, and a sign-off section for the architect or tech lead.

---

### `/security-review`

Security-focused review — checks changed code against OWASP Top 10 (injection, auth, authorisation, secrets, input validation, dependencies, cryptography, cloud/IAM). Produces `docs/wip/security-review-<branch>-<date>.md`. Critical and High findings block merge.

---

### `/incident`

Production incident fast-path — triage scope and severity, open a tracking issue, coordinate the BUILD → REVIEW → DEPLOY fast-path (bypassing GROOM and DESIGN), and produce a post-mortem for P1/P2 incidents. Use only when something is broken in production right now.

---

### `/analysis`

Change impact and dependency analysis — assess the blast radius of a proposed change before building, or evaluate the effect of a shipped change after the fact. Classifies each consumer as owned, external, or cascading. Produces `docs/wip/analysis-<slug>-<date>.md` with a migration path recommendation.

---

### `/data-model`

Schema reference and change management — read the current schema for any table, propose new columns or tables, draft migrations with rollback, and assess query/API impact. Documents schema decisions as ADRs. Enforces safety rules: no dropping columns without deprecation, no NOT NULL without default or backfill, no editing applied migrations.

---

### `/simplify`

Code simplification pass — reviews recently changed code for over-engineering, dead code, unnecessary abstractions, and duplication, then fixes what's found. Runs the test suite after to confirm no behaviour change. Reports a summary of what was removed and why.

---

### `/deploy`

Guided deployment with preflight (auth, project guard, dirty working tree check) and post-deploy health check. Reads deployment targets from `.claude/pai-orbit-config.md → ## Deploy`. Stops on first failure; never silently continues.

---

### `/suggest-skills`

Analyses working patterns (git log, session captures, docs, existing skills) and suggests domain-operational skills worth adding. Scaffolds the selected skill using `templates/skills/domain-operational.template.md`.

---

## Agents

Agents are spawned by modes (primarily `/build`) for parallel sub-repo work.

### `docs-writer`

Writes and updates documentation. Knows the docs directory structure. Supports local write and outbound sync to Confluence/Notion via MCP. Does not modify `docs/ops/` without explicit instruction.

---

### `cross-repo-impact`

Read-only. Given a proposed change (endpoint removed, type renamed, interface altered), searches all configured repos for usages and classifies each as breaking, compatible, or unknown. Returns `file:line` locations.

---

### Stack agents (generated by `/setup`)

One agent per service, generated from the templates in `templates/agents/`. Each agent:
- Works only inside its service directory
- Reads the service's CLAUDE.md before starting
- Runs the service's test suite before claiming completion
- Does not touch other repos

Available templates: FastAPI, Next.js, Django, Express/Node, React/Vite, Infrastructure/IaC, generic.

---

## Hooks

Hooks run automatically on tool events.

### `arch-drift-guard.sh` (PostToolUse, async)

Fires after Edit/Write on structural files (`docker-compose.yml`, `package.json`, `go.mod`, `requirements.txt`, `pyproject.toml`, `Cargo.toml`, `fly.toml`, `main.py`, `index.ts`, etc.). Prints a one-line advisory: "Consider running `/arch validate` after this session to check architecture alignment." Never blocks.

---

### `bash-guard.sh` (PreToolUse)

Blocks force-push, bulk git staging, hook bypass (`--no-verify`), and destructive `rm` on root/home. Project-specific blocks can be added at the bottom of the script.

### `lint-python.sh` (PostToolUse, async)

Runs `ruff check` on any `.py` file after Edit/Write. Advisory only — never blocks. Fails open if ruff is not installed.

### `lint-ts.sh` (PostToolUse, async)

Runs `eslint --max-warnings 0` on any `.ts` or `.tsx` file after Edit/Write. Advisory only — never blocks. Fails open if eslint is not available.
