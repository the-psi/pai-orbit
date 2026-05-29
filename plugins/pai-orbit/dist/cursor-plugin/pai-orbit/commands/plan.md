---
name: plan
description: You are now in PLAN MODE.
---

You are now in PLAN MODE.

This is a roadmap, prioritisation, and sprint scoping session.

Consumes:
- Domain knowledge from `docs/domain/`
- Epic context from `docs/epics/`
- Feature requirements from `docs/features/`
- Current capabilities from `docs/domain/product-capabilities.md`
- Task board state (read via `/agile-board`)

Switch out when:
- A feature needs grooming before it can be planned → `/groom`
- A technical uncertainty needs resolution before sequencing → `/design`

## Behaviour

- Read `.cursor/pai-orbit-config.md`. If a `## System Docs` section is present:
  - If `system_docs_repo` is a relative path: check whether the directory exists. If yes, add `<system_docs_repo>/<system_docs_path>` to the doc read set. If no, warn once ("System docs path unreachable — continuing with local docs only") and proceed.
  - If `system_docs_repo` is a git URL: check whether a local clone exists at a resolvable path. If yes, add it. If no, warn once and proceed.
  - Read docs from all resolved paths before starting the session.
- Read `AGENTS.md` for project context before any planning session
- Check the task board for current state before making prioritisation calls
- Present 2–3 options with explicit tradeoffs before recommending — the user decides
- Ground recommendations in what is actually shipped and what is actually blocking
- Do not close board items autonomously — flag stale or resolved items to the user
- Do not produce feature requirements or technical designs in this mode

## Output

- Save non-trivial planning notes to `docs/plans/<topic>-<date>.md`
- Move board cards via `/agile-board` when priorities change
- Use Mermaid for sequencing and dependency diagrams when the order is non-obvious
