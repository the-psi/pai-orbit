---
status: proposed
date: 2026-08-18
deciders: [Chetan Sharma]
scope: service
supersedes: ""
superseded-by: ""
---

# ADR: Roadmap source precedence for `/groom` product-context reasoning

## Context

Issue #35 adds product-context reasoning to `/groom` Phase 1. Part of that reasoning is
checking roadmap position — does this feature conflict with, duplicate, or reorder other
planned work. Two sources can answer that, and grooming left the tie-break to `/design` as
an explicit open question:

> When both `docs/plans/*.md` and the board have relevant roadmap info, which takes
> precedence, or are they merged? — owner: `/design`

The sources are not two copies of one truth:

- **The board** (GitHub Projects v2 here) holds live status, column position, assignee, and
  whether an item exists at all. It is updated continuously and by people who are not in the
  grooming session.
- **`docs/plans/*.md`** is written by `/plan` and holds the *reasoning* — why this sequence,
  what was traded against what. It is versioned, reviewable, and only as current as the last
  `/plan` run.

A third consideration surfaced during this design session: **the board was unreachable.**
The `gh` token carried `gist, read:org, repo, workflow`; Projects v2 reads need
`read:project`. Board access failed outright. Any rule that treats the board as the primary
authority therefore needs a defined behaviour for the common case where it cannot be read,
or `/groom` Phase 1 becomes unrunnable in exactly the environment it was designed for.

`CLAUDE.md`'s "local-first docs" principle argues for markdown as source of truth, but it was
written about publishing surfaces (Confluence, Notion) — places markdown gets pushed *to*.
The board is not a publishing surface; it is a live system of record for status that no local
file mirrors.

## Decision

In the context of **`/groom` needing roadmap context from two sources that can disagree**,
facing **the fact that a single global precedence rule discards real information whichever
way it points, and that the board is frequently unreachable**,
we decided **to merge both sources with per-field precedence — the board is authoritative
for status, ownership, and existence; `docs/plans/*.md` is authoritative for sequencing
rationale — and to treat any genuine contradiction as a REQ-5 conflict that names both items
and blocks**,
to achieve **roadmap reasoning that keeps the live facts and the recorded why, and that
degrades to a documented partial answer instead of failing**,
accepting **that `/groom` must consult two sources instead of one, and that some
disagreements will surface to the user rather than being resolved automatically**.

### Precedence by field

| Question | Authoritative source |
|---|---|
| Does this item exist as tracked work? | Board |
| What status/column is it in? | Board |
| Who owns it? | Board |
| Why is it sequenced where it is? | `docs/plans/*.md` |
| What was traded off to get this order? | `docs/plans/*.md` |
| Is it already shipped? | `docs/domain/product-capabilities.md` (see ADR 2026-08-03), not either roadmap source |

### Contradiction handling

A disagreement about *whether something is planned at all* — board says done, a plan says
upcoming — is not resolved by precedence. It is a REQ-5 conflict: name the specific board
item and the specific plan file, and block Phase 1 until the user resolves it. Silently
preferring the board would hide exactly the kind of drift that makes grooming produce
duplicate work.

### Degraded path (mandatory)

When the board cannot be read — missing scopes, no network, no CLI, board not configured —
`/groom` must:

1. proceed using `docs/plans/*.md` alone;
2. state in-session that the board was not consulted, and why;
3. record that limitation under `## Context` in the output file.

It must not fail the phase, and must not silently omit the caveat. A groomed requirements
doc that was written without board visibility should say so on its face.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) Merge with per-field precedence; contradictions block; mandatory degraded path | Keeps live status and recorded rationale; works when the board is unreachable; conflicts surface instead of hiding | Two sources to consult; some sessions gain a blocking question |
| Board wins outright | Always current; one source to read | Discards the *why* captured by `/plan`; hard-fails when the board is unreachable, which is the observed common case |
| `docs/plans/*.md` wins outright | Consistent with local-first docs; fully offline | Grooms against a stale roadmap whenever plans lag the board; cannot see in-flight work that was never planned in markdown |
| Ask the user every time | Maximum accuracy | Adds a prompt to every new-feature grooming session; conflicts with the non-functional requirement that trivial issues stay fast |

## Consequences

**Positive:**
- `/groom` can reason about roadmap position without either source's blind spot silently
  dominating.
- The board-unreachable case — the live condition when this was decided — is a designed path
  rather than an error.
- Requirements docs carry an explicit note when they were groomed without board visibility,
  so a reader can judge how much to trust the overlap analysis.

**Negative / trade-offs:**
- Two sources to read where one would be simpler, and a per-field rule is more to remember
  than "the board wins".
- Contradictions become blocking questions, so some sessions get slower in exchange for not
  grooming duplicate work.
- The rule is stated for `/groom` only. `/plan` reads both sources too and has the same
  ambiguity; leaving it unbound risks the two modes reasoning differently about the same
  files. Tracked as an open question in the feature design.

**Neutral:**
- No change to how either source is produced — `/plan` still owns `docs/plans/*.md`, the
  board is still external and unowned per `system.md`'s declared boundaries.
- Scoped to REQ-9/REQ-10, which only consult roadmap sources for new-feature issues. Bug
  fixes and small enhancements skip this path entirely.

## Related Decisions

- [2026-08-03 Give `/build` a placement rule for `product-capabilities.md`](./2026-08-03-product-capabilities-placement-rule.md)
  — establishes the capabilities registry as the answer to "what is shipped today", which is
  why that question routes there rather than to either roadmap source.

## Review Date

Revisit if `/plan` adopts a different precedence for the same two sources, or if the board
becomes reliably reachable in normal sessions and the degraded path stops being exercised.
