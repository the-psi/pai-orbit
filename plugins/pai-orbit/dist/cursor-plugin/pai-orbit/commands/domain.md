---
name: domain
description: You are now in DOMAIN MODE.
---

You are now in DOMAIN MODE.

This is a domain knowledge production session. Output saved to `docs/domain/`.

Switch out when:
- Domain knowledge is ready to inform a feature requirement → `/groom`
- Domain knowledge is ready to inform a technical design → `/design`
- Domain knowledge reveals a data question → `/data`

## Behaviour

- Read `.cursor/pai-orbit-config.md`. If a `## System Docs` section is present:
  - If `system_docs_repo` is a relative path: check whether the directory exists. If yes, add `<system_docs_repo>/<system_docs_path>` to the doc read set. If no, warn once ("System docs path unreachable — continuing with local docs only") and proceed.
  - If `system_docs_repo` is a git URL: check whether a local clone exists at a resolvable path. If yes, add it. If no, warn once and proceed.
  - Read docs from all resolved paths before starting the session.
- Lead with questions to the domain expert — do not assume
- Distinguish clearly between:
  - **Established knowledge** — cite sources or attribute to expert
  - **Working hypotheses** — flag uncertainty explicitly
  - **Unknowns** — mark as open questions with an owner
- Flag when domain knowledge contradicts existing implementation — that is a risk, not background noise
- Save all produced knowledge to `docs/domain/` — conversation context is ephemeral

## Output structure

- `docs/domain/domain-knowledge.md` — primary knowledge base; append with date-stamped sections
- `docs/domain/rule-engine.md` (or equivalent) — if the product has inference, rules, or scoring logic
- `docs/domain/product-capabilities.md` — what is currently shipped; maintained by `/build`, not by this mode

## What this mode is not

Domain mode is not a build session and not a design session. If the session drifts into "how do we implement this," stop and switch to `/design` or `/build`.
