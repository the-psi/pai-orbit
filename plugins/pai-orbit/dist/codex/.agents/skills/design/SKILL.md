---
name: "design"
description: "Architect a technical solution for a specific feature. Use to weigh trade-offs and record ADRs. Writes docs/features/<feature>/design.md and docs/decisions/. Explicit invocation only."
---

You are now in DESIGN MODE.

This is a technical design and trade-offs session. No implementation.

Output saved to:
- `<docs root>/features/<feature>/design.md` — feature-level design notes
- `<docs root>/decisions/<slug>.md` — Architecture Decision Records (ADRs)

Switch out when:
- Requirements are not yet clear → `/groom`
- Domain knowledge is unresolved → `/domain`
- You are ready to implement → `/build`
- Priority of this feature needs deciding → `$orbit-plan`

## Behaviour

**At session start — impact analysis gate (before any design discussion):**

1. Scan `docs/wip/` for an existing `analysis-*.md` report relevant to the current change. If found, read and cite it — do not re-run `/analysis`.
2. Assess whether the change touches a shared interface: an existing API endpoint, a data model field consumed by more than one service, or a cross-service contract. Use heuristic judgement from the change description. When uncertain, treat as shared-interface (conservative default).
3. Apply the matching path:
   - **Shared-interface change and no analysis report in context:** invoke `/analysis` now, or state: "This change touches a shared interface. Run `/analysis` first — I will not present design options until an impact report is available." Do not present options until the report is in context.
   - **Existing analysis report loaded:** state which report was loaded (filename and date) and proceed to design.
   - **Purely additive change (new endpoint, new field, no existing consumers affected):** state "No shared interface changes detected — skipping analysis" and proceed.
   - **Developer explicitly states analysis is done or change is self-contained:** acknowledge ("Noted — proceeding without analysis") and proceed.

- Resolve the docs root per `reference/docs-path-resolution.md` (config: `.codex/pai-orbit-config.md → ## System Docs`).
- Read `AGENTS.md` for project architecture context before designing
- If `docs/architecture/system.md` exists, read it — design proposals must fit within declared service boundaries or explicitly propose boundary changes with an ADR
- If `docs/architecture/constraints.md` exists, read it — design options that violate a constraint must flag this explicitly; violating a constraint requires `/arch update` to ratify the change before implementation
- Read relevant existing docs before making recommendations
- Read the feature's `requirements.md`, including its `## Open questions`. Treat any design questions deferred from grooming as a **starting point, not a boundary** — design the feature comprehensively. Surface and decide design aspects grooming never raised (data model, failure modes, migration, observability, etc.); do not limit the session to only the questions groom happened to flag.
- **Drive the design in small interactions, one decision at a time — mirror groom's phased, confirm-as-you-go flow.** Do not dump a full design up front. Break the work into discrete decision areas (data model, API shape, control flow, error handling, etc.). Take them one at a time: for each, present 2–3 options with explicit tradeoffs, recommend one, and get the user's pick before moving to the next. The user decides each; do not bulk-present and do not assume silence is agreement.
- Flag irreversible decisions explicitly — they warrant extra scrutiny and an ADR
- Use Mermaid diagrams for architecture, data flow, and sequence diagrams
- Do not implement — if you find yourself writing code, stop and note it as a build task

## Session close

Every design session should end by:

1. **Save output.** Write to `<docs root>/features/<feature>/design.md` or `<docs root>/decisions/YYYY-MM-DD-<slug>.md`. List open questions explicitly — who owns each, what is blocked on it.

2. **Commit.** Use `/git` to stage and commit the design file:
   ```
   docs: design <feature-name>
   ```
   Local commit only. Do not push yet.

3. **Create a build-phase board item.** If the design is approved, create a task board item for the implementation work via `/board`.

4. **Offer to move the board issue.** If a board issue tracks this design work, read the next column name from `.codex/pai-orbit-config.md → ## Agile Board`. Offer: "Move issue #N to `<column name>`?" Wait for confirmation before acting via `/board`. If it fails, surface the error and the permission required — do not silently skip.

5. **Offer to push.** After the commit, ask: "Push this branch to remote?" Wait for explicit confirmation.

6. **Architecture follow-up.** If the design touches system-level concerns (new service, new cross-service protocol, new external integration): prompt the user to run `/arch update` to keep the architecture declaration current.

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
