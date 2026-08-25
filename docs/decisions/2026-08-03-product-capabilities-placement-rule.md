---
status: accepted
date: 2026-08-03
deciders: [Anurag Setia, Punit Singhal]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: Give `/build` a placement rule for `product-capabilities.md`

## Context

`/build`'s after-shipping step said only "Update `docs/domain/product-capabilities.md`
with what was added or changed." That told `/build` *to* write, but not *where*.
With no placement rule, successive builds each appended wherever was
convenient — in practice the top of the file — and the doc degraded into a
reverse-chronological build log instead of answering the question it exists
for and that `/plan` and `/groom` read it for: **what does this product do
today?**

Two things compounded it on a long-running project:

- Nothing said to edit an existing entry **in place**, so one capability
  accumulated an entry per phase, scattered across the file.
- Nothing said how to record **built-but-dark** work, so feature-flag /
  approval / ops-prerequisite gates got written a dozen different ways and
  became ungreppable. Answering "what's shipped in code but off in prod?"
  required reading the whole file.

There was also a gap between two modes: `/setup` scaffolded `docs/domain/`
as an empty directory, while `/build` was told to maintain a file inside it.
The file's shape was never defined anywhere, so every project invented one
— or didn't.

On a ~2-year project this showed up concretely: the file reached 784 lines
with three interleaved ordering axes (reverse-chronological at the top,
topical in the middle, arbitrary after that) and had grown a *second*
registry — a "Not Yet Shipped" table where shipped rows were struck through
rather than removed. 35 capabilities existed only in that table with no
entry in the doc body, so a reader had to search two places for one answer.
21 distinct phrasings were in use for "built but not live."

## Decision

In the context of **`/build` maintaining `docs/domain/product-capabilities.md`
as the single reference for what the product does today**,
facing **the file drifting into a reverse-chronological build log with a
second, competing registry for unshipped/dark work, because no placement or
maintenance rule existed**,
we decided **to give `/build` an explicit placement rule (append by surface,
never prepend; edit existing entries in place; mark dark work with one
consistent `**Not live:**` marker; present tense; never restructure as a
side effect) and ship a self-describing template at
`core/templates/docs/domain/product-capabilities.md` that carries the same
rules in its own `## How to maintain it` header, wired into `/setup` so new
projects scaffold it correctly from the start**,
to achieve **a capability doc that stays answerable as "what does the
product do today, and what's built but not live?" regardless of how many
builds have touched it, and that holds even in a fresh session where
`build.md`'s instructions aren't in context**,
accepting **existing projects are unaffected until someone reruns `/setup`,
and the `**Not live:**` marker is a suggested convention, not enforced by
any hook — the value is that it's *one* string instead of twenty, not that
it's unbreakable**.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) Explicit placement rule in `build.md` + self-describing template shipped via `/setup` | Fixes the instruction gap at the source; template rules survive even without `build.md` in context; no schema/hook overhead | Convention only — nothing enforces the `**Not live:**` marker or in-place-edit rule at write time |
| Enforce structure with a hook (e.g. reject prepends, require the marker) | Structural drift becomes impossible, not just discouraged | New hook surface to maintain; brittle against legitimate structural changes; overkill for a markdown doc that's read by humans and modes, not machines |
| Leave `/build`'s instruction as-is, rely on reviewer judgment per PR | No process change | This is exactly what produced the 784-line, three-axis, dual-registry file this ADR is fixing |

## Consequences

**Positive:**
- `/plan`, `/groom`, and `/domain` can trust `product-capabilities.md` to
  answer "what does this product do today" without cross-referencing a
  second registry or reconstructing history from git.
- "What's built but not live?" becomes a single `grep -n "Not live:"` instead
  of a full read of the file.
- The rule travels with the file itself (via the template's own maintenance
  header), not only with `/build`'s instructions, so it survives context
  loss between sessions.

**Negative / trade-offs:**
- Nothing prevents a future build from ignoring the rule and prepending
  anyway — this is a convention, not a constraint, consistent with the
  project's "config over baked-in" principle but reliant on it being
  followed.
- Projects that already have a `product-capabilities.md` from before this
  change keep their existing structure until someone deliberately reruns
  `/setup` or manually adopts the new rules; `/build`'s new wording only
  governs where *new* entries go, not existing drift.

**Neutral:**
- Purely an instruction/template change — no hooks, scripts, or schema
  touched.

## Related Decisions

None yet.

## Review Date

Revisit if projects report the `**Not live:**` convention isn't being
followed in practice, or if the marker needs to become machine-checked
(e.g. via a hook) rather than convention-only.
