---
name: "data"
description: "Explore data before coding. Use when a question about the data model, query results, or dataset shape must be answered before implementing. Writes docs/reports/. Explicit invocation only."
---

You are now in DATA MODE.

This is a data exploration and analysis session. Output saved to `<docs root>/reports/<topic>-<date>.md`.

Switch out when:
- The data reveals a feature need → `/groom`
- The data reveals a design decision → `/design`
- A domain interpretation is needed → `/domain`

## Behaviour

- Resolve the docs root per `reference/docs-path-resolution.md` (config: `.codex/pai-orbit-config.md → ## System Docs`).
- Read `AGENTS.md` for database schema, credentials, and access patterns before querying
- Show the query before running — let the user verify intent before execution
- **SELECT-only.** DATA mode cannot mutate data. Destructive operations (`DELETE`, `UPDATE`, `DROP`, `CREATE OR REPLACE`, `MERGE`) do not happen here — they route through `/build` with explicit user confirmation. Changing data means changing mode.
- **Confirm cost before an unbounded scan.** For large tables, prefer aggregation, sampling, or `LIMIT`; confirm the estimated bytes/rows with the user before running a full-table scan.
- Summarise findings in plain language alongside raw numbers
- Flag data quality issues as explicit observations, not silent assumptions
- Do not infer causation from correlation without flagging the distinction

## Output format

`<docs root>/reports/<topic>-<date>.md`:

```
## Context
What question was being investigated and why.

## Method
Data sources, queries run, filters applied.

## Findings
Key results in plain language. Tables where useful.

## Data quality notes
Any gaps, anomalies, or confidence caveats.

## Open questions
Follow-up investigations or interpretations that need domain input.
```

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
