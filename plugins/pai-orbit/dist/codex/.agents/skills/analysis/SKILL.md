---
name: analysis
description: Change impact and dependency analysis — assess the blast radius of a proposed change before building, or evaluate the effect of a shipped change after the fact. TRIGGER before refactoring a shared interface, when removing or renaming a public API, when changing a data model used by multiple services, or when asked "what breaks if we change X". SKIP pure data exploration with no change involved (use /data) and full architectural design (use /design).
---

# Analysis

Assess the impact and dependencies of a change before building or after shipping.

Reads from:
- `AGENTS.md` — service boundaries, key interfaces, and data model
- Codebase — call sites, consumers, and dependencies
- `docs/decisions/` — relevant ADRs that constrain the change

Resolve the docs root per `reference/docs-path-resolution.md` (config: `.codex/pai-orbit-config.md → ## System Docs`) before writing the impact report.

---

## When to use

- **Before a change:** "What breaks if we rename this endpoint / remove this field / change this schema?"
- **Before a refactor:** "Which services consume this interface? Are they all in our control?"
- **After a ship:** "What was the actual blast radius of what we just changed?"
- **Dependency mapping:** "What does service X depend on? What depends on it?"

---

## Procedure

### 1. Define the change

State precisely what is changing:
- What is the current form? (endpoint path, type signature, table schema, function interface)
- What is the proposed new form?
- Is this a breaking change (callers must update) or a compatible change (callers continue to work)?

### 2. Find all consumers

Search across all configured repos and services:

```bash
# Find all references to an endpoint, function, or symbol
grep -r "<symbol>" --include="*.py" --include="*.ts" --include="*.tsx" .
```

For each consumer found, classify:
- **Owned** — in a repo we control; we can update it as part of this change
- **External** — outside our control; a breaking change here requires a deprecation strategy
- **Unknown** — needs investigation before proceeding

### 3. Classify the change

| Classification | Definition | Action |
|---|---|---|
| **Non-breaking** | Existing consumers work without modification | Safe to ship; note what's new |
| **Breaking — owned** | Consumers break but all are in our repos | Coordinate the update; ship atomically or use a migration period |
| **Breaking — external** | A consumer outside our control would break | Requires versioning, deprecation notice, or both |
| **Cascading** | Changing X forces changes in Y which forces changes in Z | Map the full chain before committing to the change |

### 4. Produce the impact report

Write findings to `<docs root>/wip/analysis-<slug>-<date>.md` (or share in-session for quick checks):

```
## Impact Analysis: <change description>
Date: <date>

## Change
Current: <current form>
Proposed: <proposed form>
Classification: Non-breaking / Breaking (owned) / Breaking (external) / Cascading

## Consumers found
| Location | File:line | Classification | Action needed |
|---|---|---|---|
| service-name | path/to/file.ts:42 | Owned | Update call site |
| external-api-client | — | External | Deprecation required |

## Migration path
If breaking: how do we get from current to new without downtime?
Options:
1. ...
2. ...

## Recommendation
Proceed / Proceed with migration plan / Do not proceed — explain why.

## Open questions
- [ ] Question — owner: <name>
```

### 5. Hand off

- If safe to proceed: switch to `/build` with the impact report as context
- If a migration plan is needed: switch to `/design` to design the migration
- If the blast radius is larger than expected: switch to `$orbit-plan` to rescope

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
