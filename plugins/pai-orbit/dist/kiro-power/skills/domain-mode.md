---
name: domain-mode
description: pai-orbit domain mode - a domain knowledge production session Output saved to `<docs root>/domain/`.
inclusion: manual
---

# pai-orbit DOMAIN Mode

You are now in DOMAIN MODE.

This is a domain knowledge production session. Output saved to `<docs root>/domain/`.

Switch out when:
- Domain knowledge is ready to inform a feature requirement → `/groom`
- Domain knowledge is ready to inform a technical design → `/design`
- Domain knowledge reveals a data question → `/data`

## Behaviour

- Resolve the docs root per `reference/docs-path-resolution.md` (config: `.claude/pai-orbit-config.md → ## System Docs`).
- Lead with questions to the domain expert — do not assume
- Distinguish clearly between:
  - **Established knowledge** — cite sources or attribute to expert
  - **Working hypotheses** — flag uncertainty explicitly
  - **Unknowns** — mark as open questions with an owner
- Flag when domain knowledge contradicts existing implementation — that is a risk, not background noise
- Save all produced knowledge to `<docs root>/domain/` — conversation context is ephemeral

## Output structure

- `<docs root>/domain/domain-knowledge.md` — primary knowledge base; append with date-stamped sections
- `<docs root>/domain/rule-engine.md` (or equivalent) — if the product has inference, rules, or scoring logic
- `<docs root>/domain/product-capabilities.md` — what is currently shipped; maintained by `/build`, not by this mode

## Session close

When the domain knowledge is captured and ready to inform the next mode:

1. **Commit domain files.** Use `/git` to stage and commit any new or updated files under `<docs root>/domain/`:
   ```
   docs: domain <topic-name>
   ```
   Local commit only. Do not push yet.

2. **Offer to move the board issue.** If a board issue is associated with this domain work, read the next column name from `.claude/pai-orbit-config.md → ## Agile Board`. Offer: "Move issue #N to `<column name>`?" Wait for confirmation before acting via `/board`. If it fails, surface the error and the permission required — do not silently skip.

3. **Offer to push.** After the commit, ask: "Push this branch to remote?" Wait for explicit confirmation.

## What this mode is not

Domain mode is not a build session and not a design session. If the session drifts into "how do we implement this," stop and switch to `/design` or `/build`.

## Usage in Kiro
Activate this mode by using `#domain-mode` in your conversation or by typing "enter domain mode".

The mode will guide you through the structured workflow and generate the appropriate documentation files.

---

## Appendix: docs path resolution

Referenced above as `reference/docs-path-resolution.md` — inlined here since Kiro skills are flat files with no sibling-file lookup:

# Docs path resolution

Shared by every mode, skill, and agent that reads or writes project docs. Resolve once per session, reuse for every read and write in that session.

## Config

Read `.claude/pai-orbit-config.md`. If a `## System Docs` section is present, it defines `system_docs_repo` and `system_docs_path` (default `.`).

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
