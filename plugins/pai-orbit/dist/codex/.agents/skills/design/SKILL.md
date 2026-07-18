---
name: "design"
description: "Architect a technical solution for a specific feature. Use to weigh trade-offs and record ADRs. Writes docs/features/<feature>/design.md and docs/decisions/. Explicit invocation only."
---

You are now in DESIGN MODE.

This is a technical design and trade-offs session. No implementation.

Output saved to:
- `docs/features/<feature>/design.md` — feature-level design notes
- `docs/decisions/<slug>.md` — Architecture Decision Records (ADRs)

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

- Read `.codex/pai-orbit-config.md`. If a `## System Docs` section is present:
  - If `system_docs_repo` is a relative path: check whether the directory exists. If yes, add `<system_docs_repo>/<system_docs_path>` to the doc read set. If no, warn once ("System docs path unreachable — continuing with local docs only") and proceed.
  - If `system_docs_repo` is a git URL: check whether a local clone exists at a resolvable path. If yes, add it. If no, warn once and proceed.
  - Read docs from all resolved paths before starting the session.
- Read `AGENTS.md` for project architecture context before designing
- If `docs/architecture/system.md` exists, read it — design proposals must fit within declared service boundaries or explicitly propose boundary changes with an ADR
- If `docs/architecture/constraints.md` exists, read it — design options that violate a constraint must flag this explicitly; violating a constraint requires `/arch update` to ratify the change before implementation
- Read relevant existing docs before making recommendations
- Present 2–3 options with explicit tradeoffs before recommending — the user decides
- Flag irreversible decisions explicitly — they warrant extra scrutiny and an ADR
- Use Mermaid diagrams for architecture, data flow, and sequence diagrams
- Do not implement — if you find yourself writing code, stop and note it as a build task

## Session close

Every design session should end by:

1. **Save output.** Write to `docs/features/<feature>/design.md` or `docs/decisions/YYYY-MM-DD-<slug>.md`. List open questions explicitly — who owns each, what is blocked on it.

2. **Commit.** Use `/git` to stage and commit the design file:
   ```
   docs: design <feature-name>
   ```
   Local commit only. Do not push yet.

3. **Create a build-phase board item.** If the design is approved, create a task board item for the implementation work via `/board`.

4. **Offer to move the board issue.** If a board issue tracks this design work, read the next column name from `.codex/pai-orbit-config.md → ## Agile Board`. Offer: "Move issue #N to `<column name>`?" Wait for confirmation before acting via `/board`. If it fails, surface the error and the permission required — do not silently skip.

5. **Offer to push.** After the commit, ask: "Push this branch to remote?" Wait for explicit confirmation.

6. **Architecture follow-up.** If the design touches system-level concerns (new service, new cross-service protocol, new external integration): prompt the user to run `/arch update` to keep the architecture declaration current.
