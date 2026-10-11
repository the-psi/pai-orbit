---
status: proposed
date: 2026-10-11
deciders: [Anurag Setia]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: `/arch define` for greenfield architecture, with input-driven `/arch update`

## Context

`/arch init` is a declaration interview: it asks "what services exist, how do they communicate, what are the constraints?" That works for an existing codebase. On a greenfield project there is nothing to declare yet: the architecture has to be decided, and `init` gives no help deciding it. There was no place to capture the forces behind the decision (quality targets, constraints, team capability). There was no structured way to break the system into components or choose an architectural style, and no system context.

Once an architecture exists, the inputs it was derived from keep moving. Process maps (`/process-map`) and UX journeys (`/ux`) are the most frequent upstream changes, followed by domain knowledge and re-ranked drivers. `/arch update` was triggered only by intentional structural change. Nothing told the user that an upstream change had invalidated part of the architecture.

## Decision

In the context of **greenfield projects, and architectures derived from process maps, UX, and domain docs that keep evolving**,
facing **no guided way to decide an architecture and no detection of upstream changes that invalidate it**,
we decided **to add an `/arch define` sub-mode that runs eight confirmed phases (drivers, system context, decomposition, style, structure, cross-cutting concerns and fitness functions, stack, risks), backed by two shared reference guides (a style catalogue and a decomposition guide). It records the inputs it was derived from in `system.md → ## Derived From`, which `/arch update` and `/arch validate` use to detect and assess upstream changes**,
to achieve **architecture choices that trace to measurable drivers and to the domain and process model, and that stay in step as those inputs change**,
accepting **longer arch prompts in flat-file adapters (the guides are inlined), a new `drivers.md`, and new optional sections in the `system.md` and `constraints.md` templates**.

Supporting conventions:
- **`define` vs `init`.** `define` decides (greenfield); `init` declares (existing code). `/arch` with no sub-mode recommends one based on whether application code exists.
- **Style is three choices.** Deployment topology, interaction style, and internal structure are selected separately. Selection applies hard filters from constraints and team capability, then scores the survivors against the top three ranked quality scenarios, then breaks near-ties towards fewer deployables. The result is recorded in an ADR with revisit triggers.
- **Decompose before choosing a topology.** Boundaries come from domain language, process-map lanes and hand-offs, data that changes together, rate of change, scaling, compliance scope, external dependencies, and team ownership, weighed against reasons to keep things together. Two or three alternative decompositions are presented, never one.
- **System context is derived, not asked.** People come from role and team lanes and UX roles; external systems from `external` lanes and domain integrations. Borderline elements are confirmed explicitly.
- **Derived From.** `define` records each input's path and commit. `update` diffs against it and assesses impact per change type (process lane or hand-off, UX role or channel, domain rule, driver). It classifies each change as no impact, a declaration change, or a decision change, and a decision change requires a superseding ADR. `validate` reports changed inputs as advisory "upstream drift".
- **Generic reference inlining.** The codex and copilot adapters now inline any `core/reference/*.md` a prompt mentions, not only `docs-path-resolution.md`. Existing output is unchanged.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) `/arch define` sub-mode + reference guides + Derived From | Stays in the architecture headspace; guides reusable by `update` and `/design`; upstream changes detectable | Longer arch prompt in flat-file adapters |
| Extend `/arch init` with greenfield questions | One entry point | Mixes "describe" and "decide"; a single question block cannot support phased trade-off decisions |
| Separate `/architect` mode | Clean separation | Splits one headspace across two modes; `update` and `validate` would need both |
| Style guidance inline in `arch.md` | No new files | Bloats the mode; not reusable from `/design` or `update` |
| Detect upstream change by file dates only | Simpler | Unreliable across clones and rebases; commits are exact |

## Consequences

**Positive:**
- Greenfield teams get a traceable route from drivers, domain, and process maps to style, decomposition, and stack.
- `/process-map`, `/ux`, and `/domain` now hand off to `/arch update` when architecture exists, which closes the loop.
- `/design` evaluates options against the ranked quality scenarios.

**Negative / trade-offs:**
- The `/arch` prompt for Codex and Copilot grows by the inlined guides.
- Fitness functions are listed in `constraints.md`, but enforcing them in CI is left to each project.

**Neutral:**
- No migration: the new `system.md` sections and `drivers.md` are optional for `init`-declared projects; `/setup` now also scaffolds `drivers.md`.
- Version 1.11.0. Stacked on the `/process-map` change (1.10.0).

## Related Decisions

- [2026-10-11-process-map-skill-and-processes-folder](2026-10-11-process-map-skill-and-processes-folder.md): process maps are a primary input to system context and decomposition.
- [2026-09-08-centralize-docs-path-resolution](2026-09-08-centralize-docs-path-resolution.md): the `reference/` mechanism the new guides use.
- [2026-07-24-adapter-parity-and-dist-compat](2026-07-24-adapter-parity-and-dist-compat.md)

## Review Date

<!-- Revisit after the first two greenfield projects use /arch define. -->
