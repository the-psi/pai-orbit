---
status: proposed
date: 2026-10-11
deciders: [Anurag Setia]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: To-be process modelling as a `/process-map` skill — JSON spec, true swimlane SVG, `docs/processes/`

## Context

pai-orbit's flow is journey-centric: `/domain` captures knowledge, `/ux` shapes user journeys, `/groom` formalises requirements. For process-driven systems — back-office operations, multi-party workflows, approvals, settlements, integrations across several systems — the solution is shaped less by any one user's journey and more by how work moves between roles and systems. Teams in that situation drew L3 process diagrams in project-specific, workspace-local skills, outside the framework, so the diagrams were not consumed by `/groom`, `/design`, or `/arch`, and step-level traceability from process to requirement did not exist.

The to-be process view also works as a solution-shaping exercise: drawing lanes and hand-offs surfaces integration points, missing systems, and feature boundaries before any feature is groomed.

Four questions had to be settled: whether this is a mode or a skill, where its output lives, which diagram format it uses, and how a renderer reaches projects on every adapter. The design borrows from a project-specific swimlane skill already proven on a client programme (JSON spec as source of truth, true-swimlane SVG renderer, Mermaid preview, discuss-before-draw workflow), generalised for any project.

## Decision

In the context of **process-driven systems where the high-level solution emerges from a to-be business process**,
facing **no framework-native place to model processes across roles and systems, and no traceability from process steps to requirements**,
we decided **to add a `/process-map` skill (create / update / trace) that writes to-be L3 maps to a new top-level `<docs root>/processes/` folder, with a JSON spec per process as the source of truth, rendered by a vendored, standard-library Python script into a true swimlane SVG plus a Mermaid preview and generated step table, using permanent step IDs (`<PREFIX>-<n>`)**,
to achieve **a reusable process view that `/groom` cites by step ID, `/design` reads for integration points, and `/arch` reads for architecture gaps**,
accepting **a Python 3 dependency for rendering (with a Mermaid-only fallback), a renderer copy living in each project, and one more docs folder to keep current**.

Supporting conventions:
- **Skill, not mode.** Process modelling does not change headspace on its own — it is called after `/domain`, alongside or instead of `/ux`, and from `/design` or `/arch`. A skill is callable from any mode; a mode would duplicate elicitation already done in `/domain`.
- **To-be by default.** An as-is baseline is optional and kept in its own section. As-is knowledge remains `/domain`'s responsibility.
- **Top-level `processes/`, not per-feature.** A to-be process spans several features and often several services; features link to it, not the other way round. In multi-repo setups it lives in the system docs root.
- **JSON spec, not Mermaid, is the source of truth.** Mermaid has no swimlane primitive — `subgraph` lanes cannot hold phase columns and lay out unpredictably. A spec of lanes × phases × steps × edges renders a real swimlane grid; the same spec also emits the Mermaid preview (for GitHub/IDE inline viewing), the step table, and `INDEX.md`, so they never drift. Lane colours derive from lane type and status (`role`, `team`, `system` existing/new, `external`) rather than a client-specific palette; projects can extend the palette per spec.
- **Renderer is vendored through the docs scaffold.** It lives at `core/templates/docs/processes/_render/swimlane.py`, so every adapter's existing `/setup` scaffold path (`templates/docs/` → project `docs/`) delivers it — including Copilot and legacy Cursor, which ship only markdown for skills. Once copied it is project-owned and runs in CI without the plugin. All paths it writes are relative to the processes folder.
- **Step IDs are permanent.** Removed steps are marked `Retired`, never renumbered, so citations in `requirements.md` and `design.md` stay valid. `/process-map trace` reports uncovered and dangling IDs.
- **Operational skill (implicit invocation allowed) on Codex**, like `analysis` and `epic`, so it can fire when the description matches.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) Skill + top-level `docs/processes/` + JSON spec → swimlane SVG + Mermaid preview | True swimlanes; one source for diagram, preview, table, and index; diff-reviewable; callable from any mode | Needs Python 3 to render; renderer copy per project |
| Mermaid `flowchart` with `subgraph` lanes only | No tooling; renders on GitHub | Not real swimlanes — no phase columns, unstable layout, hand-maintained tables drift |
| Renderer bundled in the skill folder | Single copy | Copilot and legacy Cursor ship only skill markdown, breaking adapter parity |
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
- Existing projects need no migration; on first use the skill copies the renderer from the plugin's templates (or, with the user's consent, from the repo) into `docs/processes/_render/`. `/setup` scaffolds the folder, renderer, and `PROCESS.md` template for new projects.
- Version bumped to 1.10.0 per constraint 7.

## Related Decisions

- [2026-09-08-centralize-docs-path-resolution](2026-09-08-centralize-docs-path-resolution.md) — `processes/` is resolved through the shared docs root.
- [2026-07-24-adapter-parity-and-dist-compat](2026-07-24-adapter-parity-and-dist-compat.md) — full parity across all adapters.

## Review Date

<!-- Revisit if Mermaid gains native swimlanes, or if teams need BPMN export. -->
