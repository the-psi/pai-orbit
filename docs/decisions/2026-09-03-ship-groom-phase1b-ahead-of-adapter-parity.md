---
status: accepted
date: 2026-09-03
deciders: [Chetan Sharma]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: Ship `/groom` Phase 1b with `copilot` and `codex` below parity

## Context

Issue #35 adds product-context reasoning and a Phase 1b scope gate to `/groom`. Every line of
that behaviour lives in `core/modes/groom.md`'s `## Session flow` section.

`constraints.md` rule 6 requires **full adapter parity**: a changed mode must be fully
supported by all six adapters before the PR merges, and "no adapter may ship a partial or
degraded implementation as a permanent state."

The feature's design ([design.md](../features/groom-product-context/design.md) decision D1)
satisfied rule 6 **by merge order rather than by code**: `claude-code`, `cursor-plugin`,
`cursor` and `kiro-power` already emit full mode text, while `copilot` and `codex` pass modes
through `emit_mode_summary()` — which keeps only the headspace line and the "Switch out when"
block and drops `## Session flow` entirely. PRs
[#34](https://github.com/the-psi/pai-orbit/pull/34) and
[#51](https://github.com/the-psi/pai-orbit/pull/51) replace that path with full-mode-text
emission, so D1 deferred the `dist/` rebuild until both had merged.

Neither PR can be merged now. The choice became: hold #35 indefinitely on two unrelated
adapter PRs, or ship it and let `copilot` and `codex` catch up when those PRs land.

Rebuilding revealed one fact the design did not predict, which materially changes the
trade-off. The rebuild touches **14 files, none of them under `dist/copilot/` or
`dist/codex/`** — those two adapters' output is byte-identical before and after, precisely
*because* they drop `## Session flow`. The "rebuilding early creates hand-resolved conflicts
in committed build output" cost that D1 was avoiding does not exist. The only real cost is the
parity gap itself.

## Decision

In the context of **shipping #35's `/groom` changes while PRs #34 and #51 remain unmerged**,
facing **rule 6's requirement that all six adapters carry a changed mode before merge**,
we decided **to rebuild `dist/` and ship now, accepting that `copilot` and `codex` deliver a
`/groom` without Phase 1 product-context reasoning or the Phase 1b scope gate until #34 and
#51 merge**,
to achieve **four of six adapters getting the behaviour immediately rather than all six
getting it never, since #35 was otherwise blocked on work outside its own scope**,
accepting **a known, time-boxed rule 6 violation that is recorded here rather than
discovered later, and that must be closed by #34 and #51 — not left to stand.**

### What each adapter ships as of this decision

| Adapter | Phase 1 reasoning + Phase 1b | Notes |
|---|---|---|
| `claude-code` | Yes | `commands/groom.md` |
| `cursor-plugin` | Yes | `commands/groom.md` + `rules/groom.mdc` |
| `cursor` (legacy) | Yes | `.cursor/rules/groom.mdc` |
| `kiro-power` | Yes | `skills/groom-mode.md` |
| `copilot` | **No** | `emit_mode_summary()` drops `## Session flow`; `dist/copilot/` unchanged by the rebuild |
| `codex` | **No** | Same; `dist/codex/AGENTS.md` unchanged by the rebuild |

### Conditions attached

1. This is **not** a permanent state, which is what rule 6 actually forbids. PRs #34 and #51
   close it.
2. Because `dist/copilot/` and `dist/codex/` are byte-identical after the rebuild, this
   commit adds **no** merge-conflict surface to either PR. The conflict cost D1 cited is not
   being paid — only the parity gap is.
3. When #34 and #51 merge, `bash plugins/pai-orbit/build.sh` must be re-run so both adapters
   pick up Phase 1b. No further `core/` work is required for them to do so.
4. `constraints.md` rule 6's "known gaps" note still frames the copilot/codex gap as
   prospective ("PRs #34 and #51 … close this gap"). It now describes a shipped state and
   should be restated by `/arch`, which owns that file.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) Ship now; `copilot`/`codex` catch up via #34/#51 | Unblocks #35, which is complete and correct in `core/`; four adapters get the behaviour immediately; costs no conflict surface | Two adapters ship a `/groom` without the feature; a rule 6 violation exists on `main` until the PRs land |
| Hold #35 until #34 and #51 merge (the original D1 plan) | Rule 6 never violated | #35 is held hostage to two unrelated adapter PRs with no committed merge date; the conflict cost that justified the deferral turned out not to exist |
| Ship `core/` only, leave `dist/` stale | No `dist/` churn | Worse: `dist/` is committed and is what consumers install, so *all six* adapters would lack the feature while `core/` claims it — and rule 1 forbids hand-fixing `dist/` |
| Add full-mode-text emission to `copilot`/`codex` inside #35 | Rule 6 satisfied immediately | Duplicates the entirety of PRs #34 and #51, guaranteeing large conflicts in both — the exact outcome D1 set out to avoid |

## Consequences

**Positive:**
- #35 ships on its own merits instead of waiting on unrelated adapter work.
- The parity gap is written down with an explicit closure condition, rather than being
  inferred later from a diff.
- Confirms empirically that mode-content changes cost `copilot` and `codex` nothing in
  `dist/` churn — useful for sequencing any future mode change against those PRs.

**Negative / trade-offs:**
- A Copilot or Codex user installing between this merge and #34/#51 gets a `/groom` that
  still permits draft-then-confirm and has no scope gate, with nothing in their bundle saying
  so.
- Rule 6 now has a live exception on `main`. Exceptions normalise; this one needs closing
  rather than extending.

**Neutral:**
- No structural change to any adapter's `dist/` output — no files added or removed — so rule
  7 is not triggered and no migration note is required. The version bump to 1.5.0 is made
  under the Cross-cutting Standards "bump on every meaningful change" clause.

## References

- [design.md — D1](../features/groom-product-context/design.md)
- [constraints.md rule 6](../architecture/constraints.md)
- [2026-07-24 Adapter parity and dist compatibility](./2026-07-24-adapter-parity-and-dist-compat.md)
- PRs [#34](https://github.com/the-psi/pai-orbit/pull/34), [#51](https://github.com/the-psi/pai-orbit/pull/51); issue [#35](https://github.com/the-psi/pai-orbit/issues/35)

## Review Date

At the merge of PRs #34 and #51 — this ADR should be marked resolved once a rebuild confirms
Phase 1b text in `dist/copilot/` and `dist/codex/`.
