---
status: accepted
date: 2026-09-29
deciders: [Chetan Sharma]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: Conventions for groom's consumer check — concept map file and `## Consumer check` record

## Context

Issue [#37](https://github.com/the-psi/pai-orbit/issues/37) adds a consumer check to `/groom`
Phase 2: when a change alters how an existing signal is read, groom must find the signal's other
readers and record the outcome, and the session-close audit must fail if the record is missing.
See [requirements](../features/groom-shared-signal-consumers/requirements.md) and
[design](../features/groom-shared-signal-consumers/design.md).

Two parts of this become conventions that users and future pai-orbit changes depend on:

1. Where a project keeps its optional "domain concept → consumers" map, and its format. Groom only
   reads it; teams create and maintain it by hand.
2. How the consumer-check outcome is recorded in `requirements.md`. The session-close audit checks
   that record, so its heading and labels act as a contract.

Both are hard to change once adopted. Renaming the map breaks every project that created one, and
renaming the section makes older requirements files fail the audit.

## Decision

In the context of **`/groom` reading an optional, user-maintained consumer map and writing an
audited consumer-check record**,
facing **the need for both to be found and checked reliably across five adapters**,
we decided **on a single fixed map file, `<docs root>/domain/concept-consumers.md`, holding one
`Concept | Aliases | Consumer | Repo` table (one row per consumer), and a dedicated
`## Consumer check` section placed after `## Scenarios in scope`, with fixed labelled lines, one
block per signal**,
to achieve **a definite "map found / not found" answer and a record the audit can check line by
line**,
accepting **that the file name, columns, heading and labels are now a compatibility surface that
needs a migration note and version bump to change**.

The procedure itself lives inline in `core/modes/groom.md` (no new `reference/` fragment), and
groom searches with the host's own tools rather than the `cross-repo-impact` agent. See design D1
and D3.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) Fixed file `domain/concept-consumers.md` + table | One known location; mirrors `domain/product-capabilities.md`; aliases feed the search; per-row diffs against code are simple | Name and columns become a contract |
| One file per concept, `domain/concepts/<concept>.md` | Scales to many concepts | Groom must guess file names from signal names — a silent-miss path |
| Any consumers table anywhere in `domain/` | Flexible | "Was a map found?" becomes fuzzy, which undermines the reliability goal |
| (chosen) New `## Consumer check` section with labelled lines | Audit can check completeness per label; holds a "not triggered" result | Adds a section to the requirements format |
| Prose under `## Context` | No new section | Free text can't be checked for completeness |
| Notes on `## Scenarios in scope` | Close to the scenarios | Nowhere to record "not triggered"; mixes two concerns |

## Consequences

**Positive:**
- Groom's "no concept map found" is a definite statement, not a best effort.
- The session-close audit has a concrete, per-label check (REQ-21).
- Existing consumers of `requirements.md` (`/design`, `/test`, `/review`, `/epic`, `/board`) are
  unaffected, since the section is additive.

**Negative / trade-offs:**
- Changing the map path, its columns, the section heading or its labels needs a version bump and a
  migration note (constraints rule 7).
- Re-grooming a feature with a pre-1.9.0 `requirements.md` fails the audit until the section is
  added.

**Neutral:**
- No `/setup` scaffold creates the map; teams opt in by creating the file. The format is documented
  in `groom.md` and `docs/capabilities.md`.

## Related Decisions

- [2026-09-08-centralize-docs-path-resolution](2026-09-08-centralize-docs-path-resolution.md) — `<docs root>` resolution used for the map path.
- [2026-08-18-groom-roadmap-source-precedence](2026-08-18-groom-roadmap-source-precedence.md) — prior groom read-set convention.

## Review Date

Revisit after the first three real grooming sessions that trigger the check, to confirm the map
columns are sufficient.
