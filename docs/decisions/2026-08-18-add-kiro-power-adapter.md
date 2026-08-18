---
status: accepted
date: 2026-08-18
deciders: [Punit Singhal]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: Add a Kiro Power adapter, accepting no agent/hook fidelity at introduction

## Context

PR #7 adds a fifth compile target for `core/`: `plugins/pai-orbit/adapters/kiro-power/`,
which compiles modes and skills into Kiro's Power format (`skills/` activated with
`#skill-name`, plus auto-loading `steering/` files) and ships as `dist/kiro-power/`. Kiro's
Power system has no equivalent of Claude Code's agents (named sub-agents spawned for
parallel/specialized work) or hooks (shell scripts wired to tool-use events) — there is no
mechanism in a Power to register either. This mirrors the existing `copilot` and `codex`
adapters, which also carry `❌`/`❌` for Agents/Hooks in `plugins/pai-orbit/README.md`'s
fidelity table, for the same reason: the target tool has no matching primitive.

`docs/decisions/2026-07-24-adapter-parity-and-dist-compat.md` established that no adapter
should ship a partial/degraded implementation as a *permanent, unacknowledged* state, and
tracked the `cursor` (legacy)/`codex` gaps as an open question rather than blocking on them.
Adding `kiro-power` introduces the same kind of gap for a new adapter, so it needs the same
explicit tracking rather than silently joining `copilot`/`codex` unacknowledged.

## Decision

In the context of **adding Kiro as a supported tool via a Power-format adapter**,
facing **Kiro having no agent or hook primitive to compile `core/agents/` or `core/hooks/`
into**,
we decided **to ship `kiro-power` now with full mode/skill/template fidelity and no
agent/hook support, rather than delay the adapter until Kiro gains an equivalent primitive
or building a lossy workaround (e.g. flattening agent/hook instructions into steering text)**,
to achieve **Kiro users get the full grooming/design/build/review methodology today**,
accepting **`kiro-power` carries the same permanent Agents/Hooks gap as `copilot` and
`codex`, tracked as an open question in `docs/architecture/system.md` alongside the existing
`cursor`/`codex` parity question rather than left implicit**.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) Ship modes/skills/templates now; track Agents/Hooks gap as an open question | Full value today for the 3 of 5 core surfaces Kiro can represent; gap is explicit and revisitable | Kiro users don't get agent-equivalent or hook-equivalent behavior until Kiro adds a primitive or we build a lossy fallback |
| Fold agent/hook instructions into the auto-loading steering text as reference-only prose (matching `cursor` legacy's `⚠️` treatment) | Closes the visible gap in the fidelity table | Steering files auto-load into every conversation; agent instructions (e.g. cross-repo-impact's read-only contract) and hook safety rules (e.g. bash-guard's blocked patterns) read as advice with nothing enforcing them — worse than an honest `❌`, since it implies protection that isn't there |
| Block the adapter until Kiro supports an agent/hook-equivalent primitive | No fidelity gap ever shipped | Indefinite delay on a feature that's otherwise ready; `copilot`/`codex` already establish that pai-orbit ships tool support incrementally rather than waiting for full primitive parity |

## Consequences

**Positive:**
- Kiro users get `/groom`, `/design`, `/build`, `/review`, etc. today instead of waiting on
  Kiro's roadmap.
- The Agents/Hooks gap is now tracked in `docs/architecture/system.md`'s Open Questions
  instead of only being visible in `plugins/pai-orbit/README.md`'s fidelity table.

**Negative / trade-offs:**
- `bash-guard`'s safety checks (blocking `git push --force`, `rm -rf`, etc.) and the
  `docs-writer`/`cross-repo-impact` agents have no Kiro-side equivalent; Kiro users doing
  build/review work get the documentation methodology but not these specific protections.

**Neutral:**
- No change to `core/` itself — this ADR documents the adapter-level trade-off, not a core
  behavior change.

## Related Decisions

- Extends the pattern accepted in
  [2026-07-24-adapter-parity-and-dist-compat.md](2026-07-24-adapter-parity-and-dist-compat.md)
  for `cursor`/`codex` to `kiro-power`.

## Review Date

Revisit alongside the `cursor`/`codex` parity open question in
`docs/architecture/system.md`, or sooner if Kiro adds an agent- or hook-equivalent primitive.
