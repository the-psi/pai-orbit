---
status: proposed
date: 2026-11-03
deciders: [Upneet Singh]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: `/build` orchestrator with flat, file-owned work streams

## Context

`core/modes/build.md` said only "spawn sub-agents per repo … parallel where possible", so what ran in parallel varied run to run. Issue #79 (split from #32) asks for a defined split across code, tests and docs. Constraints: full adapter parity (rule 6), `dist/` backward compatibility (rule 7), Codex `max_depth = 2` / `max_threads = 4`, and sub-agents cannot message each other. Impact analysis: `docs/wip/analysis-build-parallel-streams-2026-11-02.md`.

## Decision

In the context of **`/build` splitting work across parallel sub-agents on five adapters with different limits**,
facing **inconsistent splits, late-discovered spec changes, same-repo file conflicts and Codex depth/thread caps**,
we decided **the primary agent orchestrates and spawns task agents directly, tagged code/tests/docs (flat, depth 1); streams own disjoint paths; streams report changes to the orchestrator at every dependency-layer boundary; streams merge in order code → tests → docs and run one verification pass**,
to achieve **faster builds with consistent output and no adapter-specific exception**,
accepting **test-vs-code mismatches surface only at the final verification pass, and extra reconcile cost at each layer checkpoint**.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) Flat orchestrator, file ownership, layer-checkpoint reports | Same on all adapters; no limit changes; conflict-free by construction | Mismatch found late for tests; orchestrator overhead per layer |
| Spawned orchestrator / stream agents with children | Cleaner context separation | 3 levels breaks Codex `max_depth`; stream agents consume `max_threads`; limit raise needs migration note |
| Claude-Code-only streams, others sequential | Simplest | Permanent rule 6 exception |
| Shared change-log file / live messaging for propagation | Earlier detection | Races; live messaging absent on Cursor/Copilot |
| Merge at every checkpoint instead of ownership | Early conflicts | More merges; breaks conflict-free guarantee |

## Consequences

**Positive:**
- No new rule 6 exception; no Codex config change; no rule 7 migration note.
- Copilot Free degrades to the same layer order, sequentially.

**Negative / trade-offs:**
- Codex 4-thread cap queues extra tasks.
- Shared files need an orchestrator-assigned owner.

**Neutral:**
- Version 1.12.0 (minor); worktree isolation from #32 stays as a Claude Code safety net.

## Related Decisions

- `2026-10-08-claude-code-only-build-subagent-rules.md` (marker mechanism, worktree rule)

## Review Date

After first real multi-stream `/build` runs on Codex and Copilot, or when any adapter adds nested sub-agent support.
