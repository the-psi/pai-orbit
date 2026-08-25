---
status: accepted
date: 2026-07-24
deciders: [Anurag Setia, Punit Singhal]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: Require full adapter parity and dist/ backward compatibility

## Context

pai-orbit compiles a single tool-agnostic `core/` into five per-tool adapters
(`claude-code`, `cursor-plugin`, `cursor`, `copilot`, `codex`), whose `dist/`
output is what consumers actually install. As `/arch init` declared the
system architecture for the first time in this PR, two risks became visible
that had no binding rule against them:

- A mode/skill/agent/hook could be added or changed in `core/` and only
  implemented for `claude-code`, leaving other adapters silently degraded
  with no mechanism forcing the gap to be closed.
- A structural change to an adapter's `dist/<tool>/` output could break
  consumers who installed an earlier version and haven't re-run `/setup`,
  since `dist/` is what's actually loaded at runtime.

## Decision

In the context of **declaring pai-orbit's own architecture for the first
time**,
facing **the risk of adapters silently drifting out of parity and of
`dist/` changes breaking already-installed consumers**,
we decided **to add two binding constraints — full adapter parity for any
new/changed core behavior, and backward-compatible `dist/` output unless
paired with a version bump and migration note** (`docs/architecture/constraints.md`
rules 6–7),
to achieve **a repo where `core/` changes can't ship as a permanently
lossy experience on some adapters, and where installed consumers don't
break without warning**,
accepting **`cursor` (legacy) and `codex` (experimental) already fall short
of the parity bar today — tracked as an open question in
`docs/architecture/system.md` rather than blocking this PR**.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) Bind future changes to full parity + dist compat, flag existing gaps as open questions | Stops new drift immediately; doesn't require a disruptive one-time fix-everything effort | Existing `cursor`/`codex` gaps persist until separately addressed |
| No rule — parity/compat left to reviewer judgment per PR | No process overhead | What this PR observed: judgment alone hadn't prevented `cursor`/`codex` from falling behind |
| Require immediate parity fix for `cursor`/`codex` before merging this PR | Closes the gap right away | Scope creep unrelated to this PR's purpose (declaring architecture, not fixing adapters); delays the architecture declaration itself |

## Consequences

**Positive:**
- Future `core/` changes can't quietly ship as claude-code-only.
- Consumers on older `dist/` versions are protected from silent breakage.
- The gap in `cursor`/`codex` is now explicit and trackable instead of implicit.

**Negative / trade-offs:**
- `cursor` (legacy) and `codex` (experimental) remain below the new bar until
  someone picks up the open question in `docs/architecture/system.md`.
- Every future core change now carries the overhead of updating (or
  consciously version-bumping) all five adapters.

**Neutral:**
- No immediate code change required by this ADR — it formalizes rules
  already written into `docs/architecture/constraints.md`.

## Related Decisions

- `docs/decisions/2026-07-19-codex-adapter-decisions.md` — the Codex adapter
  upgrade that partially resolves this ADR's Review Date trigger by bringing
  Codex from experimental to full parity (see DC1–DC10, especially DC8 for
  the parity/zero-core-edit stance). The `cursor` (legacy) side of the
  original gap remains — it is now a documented deliberate lossy fallback
  (see `constraints.md` rule 6 comment, updated 2026-07-30).

## Review Date

~~Revisit once `cursor`/`codex` reach parity or the open question in
`docs/architecture/system.md` is otherwise resolved.~~ — **Partial trigger
met 2026-07-30**: `codex` reached full parity via the upgrade in the ADR
linked above; the `cursor` (legacy) gap is now an explicit documented
exception rather than a to-be-fixed item. This ADR remains open for future
revisit if the `cursor` (legacy) path is either removed or brought to
parity, or if a new adapter is added.
