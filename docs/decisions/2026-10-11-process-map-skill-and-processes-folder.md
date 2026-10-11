---
status: proposed
date: 2026-10-11
deciders: [Anurag Setia]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: To-be process modelling as a `/process-map` skill writing to `docs/processes/`

## Context

pai-orbit's flow is journey-centric: `/domain` captures knowledge, `/ux` shapes user journeys, `/groom` formalises requirements. For process-driven systems — back-office operations, multi-party workflows, approvals, settlements, integrations across several systems — the solution is shaped less by any one user's journey and more by how work moves between roles and systems. Teams in that situation drew L3 process diagrams in project-specific, workspace-local skills, outside the framework, so the diagrams were not consumed by `/groom`, `/design`, or `/arch`, and step-level traceability from process to requirement did not exist.

The to-be process view also works as a solution-shaping exercise: drawing lanes and hand-offs surfaces integration points, missing systems, and feature boundaries before any feature is groomed.

Three questions had to be settled: whether this is a mode or a skill, where its output lives, and which diagram format it uses.

## Decision

In the context of **process-driven systems where the high-level solution emerges from a to-be business process**,
facing **no framework-native place to model processes across roles and systems, and no traceability from process steps to requirements**,
we decided **to add a `/process-map` skill (create / update / trace) that writes to-be L3 maps to a new top-level `<docs root>/processes/` folder, using a Mermaid `flowchart` with one `subgraph` per lane and permanent step IDs (`<PREFIX>-<n>`)**,
to achieve **a reusable process view that `/groom` cites by step ID, `/design` reads for integration points, and `/arch` reads for architecture gaps**,
accepting **that Mermaid has no true swimlane primitive, so lanes are approximated with subgraphs, and that a new docs folder adds one more thing to keep current**.

Supporting conventions:
- **Skill, not mode.** Process modelling does not change headspace on its own — it is called after `/domain`, alongside or instead of `/ux`, and from `/design` or `/arch`. A skill is callable from any mode; a mode would duplicate elicitation already done in `/domain`.
- **To-be by default.** An as-is baseline is optional and kept in its own section. As-is knowledge remains `/domain`'s responsibility.
- **Top-level `processes/`, not per-feature.** A to-be process spans several features and often several services; features link to it, not the other way round. In multi-repo setups it lives in the system docs root.
- **Step IDs are permanent.** Removed steps are marked `Retired`, never renumbered, so citations in `requirements.md` and `design.md` stay valid. `/process-map trace` reports uncovered and dangling IDs.
- **Operational skill (implicit invocation allowed) on Codex**, like `analysis` and `epic`, so it can fire when the description matches.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) Skill + top-level `docs/processes/` + Mermaid subgraph lanes | Callable from any mode; one process serves many features; renders on GitHub and in every adapter with no tooling | Subgraph lanes are an approximation; extra folder to maintain |
| Optional output of `/domain` | No new artifact type | Mixes to-be solution shaping into a knowledge-capture mode; `/domain` is for what is, not what will be |
| New `/process` mode | Strong headspace discipline | Re-interviews what `/domain` already captured; mode count grows for what is a procedure, not a headspace |
| Per-feature `docs/features/<f>/process.md` | Co-located with requirements | Processes span features; the same process would be duplicated or split arbitrarily |
| BPMN XML / draw.io files | True swimlanes, tool interoperability | Not reviewable in a diff, not renderable in Copilot/Codex/Cursor, needs external tooling |

## Consequences

**Positive:**
- Process-driven projects get a framework-native, traceable path: `/domain` → `/process-map` → `/groom` (cites step IDs) → `/design` (integration points) → `/arch update` (gaps).
- Works on domain docs already written — no rework needed for projects mid-flight.

**Negative / trade-offs:**
- Skill count rises to 7 and Copilot prompt count to 31; adapter count assertions (`verify-dist.sh`, codex guards) and install docs were updated accordingly.
- `docs-path-resolution.md` now lists `processes/` as an expected subdirectory.

**Neutral:**
- Existing projects need no migration; the skill creates `docs/processes/` on first write. `/setup` scaffolds it (with a `PROCESS.md` template) for new projects.
- Version bumped to 1.10.0 per constraint 7.

## Related Decisions

- [2026-09-08-centralize-docs-path-resolution](2026-09-08-centralize-docs-path-resolution.md) — `processes/` is resolved through the shared docs root.
- [2026-07-24-adapter-parity-and-dist-compat](2026-07-24-adapter-parity-and-dist-compat.md) — full parity across all adapters.

## Review Date

<!-- Revisit if Mermaid gains native swimlanes, or if teams need BPMN export. -->
