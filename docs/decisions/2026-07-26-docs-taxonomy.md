---
status: accepted
date: 2026-07-26
deciders: [Anurag Setia]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: Docs taxonomy rule — routing table wins over mode defaults, wip/ sweeps at /release

## Context

`docs/wip/` was the fallback destination for six modes (`/incident`, `/review` twice, `/analysis`,
`/arch`, `/test`, `/build`), each hardcoding `docs/wip/<prefix>-*.md` as its own default. In a
project running pai-orbit for five months, `wip/` reached 31 files, of which only 2 were the
session captures it was nominally meant to hold — the rest were impact analyses, post-mortems,
spike results, and reviews that never got promoted, the oldest seven weeks old.

Two structural causes, not a discipline problem:

- **An artifact with no legal home.** `/incident` wrote post-mortems to `wip/`, but most projects
  also have a human-owned `ops/`, so the file could be neither routed there nor promoted — it just
  accumulated.
- **No lifecycle.** Grepping the plugin for `archive|retention|prune|promote|stale` returned one
  relevant line — `docs-writer.md`'s "Do not delete docs — flag stale content and ask" — a
  prohibition on cleanup, not a lifecycle. Archiving happened by hand, rarely, and never to an
  `analysis-*`, `spike-*`, or `security-*` file.

## Decision

In the context of **`docs/wip/` being every mode's fallback destination with no routing authority
above individual mode defaults, and no event ever triggering cleanup**,
facing **artifacts accumulating indefinitely in a directory whose only stated meaning was
"ephemeral" — a word that describes an intent, not a checkable condition**,
we decided **to add a single routing table (`templates/rules/docs-taxonomy.md`, installed by
`/setup` alongside `decisions.md`) that explicitly wins over any mode's hardcoded default, to
replace "ephemeral" with an answerable test ("is this dead once the branch merges or the session
resumes?"), and to bind a `wip/` sweep to `/release` specifically — because a release is the one
point in the workflow where "is the issue this references still open?" already has an answer**,
to achieve **a state where no mode has to guess a destination, and `wip/` is swept by something
that actually happens instead of by manual discipline**,
accepting **the routing table is only as good as it stays current — a mode added later that
produces a new artifact type and forgets to add a row regresses back to guessing, and projects
that never adapt the table's default rows may find them wrong for their taxonomy**.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) Routing table with explicit precedence over mode defaults, `wip/` swept at `/release` | One place to look, one place to fix; sweep trigger is a real recurring event, not a new one to invent | Table must be kept current as modes evolve; per-project adaptation still needed |
| Per-mode fix only — hardcode a better destination in each mode body, no shared table | No new file to maintain | Fixes today's six modes but repeats the original design flaw for the next one; no shared precedent for "wip/ vs subject folder" |
| Dedicated `/archive` mode as the sweep trigger | Decouples archiving from release cadence, could run anytime | Requires someone to remember to invoke a mode with no other purpose; the whole problem was that manual triggers don't fire — this doesn't solve that |
| Session-end sweep (every session checks `wip/` on close) | Runs more often than once per release | Most sessions don't know which referenced issues have closed; would either sweep too aggressively (guessing "done") or do nothing useful most of the time |

## Consequences

**Positive:**
- Every mode that can produce a doc now has exactly one place to look up where it goes, instead of
  a hardcoded guess baked into that mode's own body.
- `wip/` retention is tied to an event that already happens (`/release`), so it will actually run
  rather than depend on someone remembering.
- The "is this dead once the branch merges or the session resumes?" test is answerable in a way
  "ephemeral" never was, which should reduce future mis-filing.

**Negative / trade-offs:**
- The table is a new piece of shared state that must be kept in sync as modes change — a future
  mode addition that skips updating it regresses to the pre-fix behavior for that one artifact
  type.
- Existing projects have no `docs/incidents/` directory and existing `wip/` post-mortems are left
  in place; the `/release` sweep will offer to promote them, but nothing forces that to happen
  immediately.

**Neutral:**
- The table's default rows are explicitly a starting point, not a prescription — projects are
  expected to adapt them to their own taxonomy.

## Related Decisions

None yet — first ADR to touch docs organization specifically. Does not conflict with
`docs/decisions/2026-07-24-adapter-parity-and-dist-compat.md` (adapter build/parity) — this
decision operates one layer up, on where the *outputs* of modes/skills land, not on how core/
compiles to adapters. The obligation to write an ADR at all is governed by
`.claude/rules/decisions.md`, not a separate ADR.

## Review Date

Revisit once a second real-world project has run a full `/release` sweep — confirm the
open/closed-issue resolution step is actually answerable in practice, not just in the routing
table's description.
