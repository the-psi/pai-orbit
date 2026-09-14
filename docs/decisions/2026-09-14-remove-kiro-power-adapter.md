---
status: accepted
date: 2026-09-14
deciders: [Chetan Sharma]
scope: system
supersedes: "2026-08-18-add-kiro-power-adapter.md"
superseded-by: ""
---

# ADR: Remove the Kiro Power adapter rather than carry its agent/hook gap indefinitely

## Context

[2026-08-18-add-kiro-power-adapter.md](2026-08-18-add-kiro-power-adapter.md) shipped
`kiro-power` with full mode/skill/template fidelity and **no agent or hook support**, because
Kiro has no primitive to compile `core/agents/` or `core/hooks/` into. That gap was accepted
at introduction and tracked as an open question in `docs/architecture/system.md`, with the
stated review trigger: "revisit when Kiro gains an agent/hook-equivalent primitive."

Kiro has not gained such a primitive. The adapter has had exactly one commit since it landed
(`e4eadb3`, 2026-08-19) and no follow-up work, so the gap is not narrowing on its own.

Meanwhile `constraints.md` rule 6 requires full adapter parity and states that no adapter may
ship a partial or degraded implementation as a **permanent state**. `kiro-power` has become
precisely that permanent state. The gap is not cosmetic: `bash-guard`'s safety checks (blocking
`git push --force`, `rm -rf`) and the `docs-writer` / `cross-repo-impact` agents have no Kiro-side
equivalent, so a Kiro user running `/build` gets the documentation methodology without the
protections the same methodology assumes elsewhere.

## Decision

In the context of **Kiro support having stalled at a permanent agent/hook gap**,
facing **a parity rule that forbids indefinite partial implementations, and no sign of the
Kiro primitive that would close the gap**,
we decided **to remove the `kiro-power` adapter entirely — build script, committed `dist/`
output, root `.kiro-power/marketplace.json`, and install guide — rather than keep carrying it
as a documented exception**,
to achieve **rule 6 holding for every shipped adapter, with the legacy `cursor` fallback as
the single remaining documented exception**,
accepting **that Kiro is no longer a supported target and Kiro users have no pai-orbit install
path at all**.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) Remove the adapter | Rule 6 holds for every shipped adapter; no misleading half-support; one fewer bundle to keep in sync on every `core/` change | Kiro users lose pai-orbit entirely, with no migration path to another adapter |
| Keep carrying it as a documented exception | No user loses anything today | Indefinite violation of rule 6's "not a permanent state" clause; every future `core/` change must be verified against an adapter nobody is advancing |
| Close the gap by folding agent/hook text into auto-loading steering | Fidelity table would show no gap | Explicitly rejected in the 2026-08-18 ADR: steering text implies enforcement that does not exist, which is worse than an honest `❌` |
| Deprecate now, delete in a later release | Gives any Kiro user a warning window | Kiro's install path is a marketplace URL, not a script that can print a warning — there is no surface on which a deprecation notice would actually reach anyone |

## Consequences

**Positive:**
- Rule 6 in `constraints.md` is satisfied by every shipped adapter; only the legacy `cursor`
  fallback remains as a documented, deliberate exception.
- Six adapters drop to five — every `core/` change now has one fewer bundle to rebuild,
  review, and keep backward compatible.
- No adapter ships agent/hook instructions as unenforced prose.

**Negative / trade-offs:**
- **Kiro is no longer supported.** Anyone who installed the power via
  `https://github.com/the-psi/pai-orbit` gets a broken source on their next sync, with no
  in-product deprecation warning — the removal fails loudly rather than gracefully.
- Re-adding Kiro later means rewriting the adapter, not reverting this commit.

**Neutral:**
- No change to `core/` — this removes a compile target, not any mode, skill, agent, or hook.
- `plugins/pai-orbit/build.sh` needs no edit: it discovers adapters by globbing
  `adapters/*/build.sh`, so deleting the directory is sufficient.
- The superseded ADR is retained as historical record, marked `superseded-by`.

## Migration

Per `constraints.md` rule 7, this is a structural change to shipped `dist/` output:

- Version bumped `1.4.2` → `1.5.0` in `plugins/pai-orbit/core/plugin.json`.
- Kiro users have **no migration target**. If a Kiro user needs pai-orbit, the practical
  answer is to use a supported tool (Claude Code, Cursor, Codex, or Copilot) or to rebuild a
  Kiro adapter against `core/`, which is unchanged and still the single source of truth.

## Related Decisions

- Supersedes [2026-08-18-add-kiro-power-adapter.md](2026-08-18-add-kiro-power-adapter.md).
- Applies the parity standard set in
  [2026-07-24-adapter-parity-and-dist-compat.md](2026-07-24-adapter-parity-and-dist-compat.md).

## Review Date

No scheduled review. Revisit only if Kiro gains agent- and hook-equivalent primitives and
there is demonstrated demand for Kiro support.
