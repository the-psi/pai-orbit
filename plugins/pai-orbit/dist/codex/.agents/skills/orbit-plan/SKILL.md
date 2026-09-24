---
name: "orbit-plan"
description: "Prioritize and sequence work. Use to build a work plan, sequence features, or arrange sprints. Writes docs/plans/. Renamed from plan to avoid Codex's built-in /plan slash command. Explicit invocation only."
---

You are now in ORBIT-PLAN MODE.

This is a roadmap, prioritisation, and sprint scoping session.

Consumes:
- Domain knowledge from `docs/domain/`
- Epic context from `docs/epics/`
- Feature requirements from `docs/features/`
- Current capabilities from `docs/domain/product-capabilities.md`
- Task board state (read via `/board`)

Switch out when:
- A feature needs grooming before it can be planned → `/groom`
- A technical uncertainty needs resolution before sequencing → `/design`

## Behaviour

- Resolve the docs root per `reference/docs-path-resolution.md` (config: `.codex/pai-orbit-config.md → ## System Docs`).
- Read `AGENTS.md` for project context before any planning session
- Check the task board for current state before making prioritisation calls
- Present 2–3 options with explicit tradeoffs before recommending — the user decides
- Ground recommendations in what is actually shipped and what is actually blocking
- Do not close board items autonomously — flag stale or resolved items to the user
- Do not produce feature requirements or technical designs in this mode

## Output

- Save non-trivial planning notes to `<docs root>/plans/<topic>-<date>.md`
- Move board cards via `/board` when priorities change
- Use Mermaid for sequencing and dependency diagrams when the order is non-obvious

---

## Appendix: docs path resolution

Referenced above as `reference/docs-path-resolution.md` — inlined here since Codex skills are flat files with no sibling-file lookup:

# Docs path resolution

Shared by every mode, skill, and agent that reads or writes project docs. Resolve once per session, reuse for every read and write in that session.

## Config

Read `.codex/pai-orbit-config.md`. If a `## System Docs` section is present, it defines `system_docs_repo` and `system_docs_path` (default `.`).

## Resolve the docs root

- No `## System Docs` section → docs root is local `docs/`.
- `system_docs_repo` is a relative path → check whether `<system_docs_repo>/<system_docs_path>` exists **and** contains at least one of the expected subdirectories (`architecture/`, `decisions/`, `domain/`, `features/`, `plans/`, `wip/`, `backlog/`, `reports/`, `epics/`, `ops/`). A directory that exists but holds none of these is a stale pointer, not a docs root.
  - Passes → docs root is `<system_docs_repo>/<system_docs_path>`.
  - Fails → warn once ("System docs path unreachable — continuing with local docs only") and docs root is local `docs/`.
- `system_docs_repo` is a git URL → same check against a local clone at a resolvable path. Passes → docs root is `<clone-path>/<system_docs_path>`. Fails → warn once and docs root is local `docs/`.

## Reads

Add the resolved docs root to the doc read set before starting the session.

## Writes

Every write targets `<docs root>/<relative path>` — never a hardcoded `docs/…` literal, and never with an extra interpolated `docs/` segment. The docs root already *is* the docs directory, local or remote.

Examples: `<docs root>/backlog/feature-ideas.md`, `<docs root>/features/<feature>/design.md`, `<docs root>/decisions/YYYY-MM-DD-<slug>.md`, `<docs root>/wip/session-capture-<date>.md`.

When `system_docs_path: .` (a docs repo flattened to its root), `<docs root>` is the repo root itself — writes land at `<system_docs_repo>/decisions/…`, not `<system_docs_repo>/docs/decisions/…`.
