---
status: proposed
date: 2026-11-25
deciders: [upneet01]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: Security-scan skills — skill-local references, outbound OSV.dev calls, and live-target testing

## Context

PR #85 (issue #86) adds two skills, `security-scan` and `security-scan-retest`. They set three precedents that no existing skill had, and a later contributor would otherwise have to guess why:

1. `security-scan` is the first skill with a `references/` sub-directory (8 files, about 1,700 lines) next to its `SKILL.md`. The Copilot adapter only read `SKILL.md`, so its prompt shipped pointing at files that did not exist (review finding on #85, constraints rule 6).
2. `security-scan` is the first pai-orbit content that makes outbound network calls: it sends dependency `name@version` pairs to the public OSV.dev API and may query package registries. `CLAUDE.md` lists "Local-first docs" as a design principle.
3. Both skills can test a live target over HTTP. No other skill talks to external hosts.

## Decision

In the context of **two security skills that need bulky reference material, a vulnerability database, and optionally a running target**,
facing **the flat-file adapters, the local-first principle, and the risk of testing a host the user does not own**,
we decided **the following three things**,
to achieve **full-adapter parity, no silently-clean results, and live testing that stays inside the user's authorization**,
accepting **a very large Copilot prompt, a network dependency for one skill, and refusals that stop the work instead of being worked around**.

**1. Skill-local `references/` sub-files are allowed, wired per adapter.**
- `claude-code`, `codex` and `cursor-plugin` ship the `references/` folder next to the skill.
- `copilot` inlines each file into that skill's own prompt as an appendix (the same pattern already used for `core/reference/`, because Copilot prompts are flat files with no sibling-file lookup). `verify-dist.sh` now fails the build if a prompt points at a `references/<file>.md` with no appendix, so a future skill cannot repeat the bug.
- The legacy `cursor` bundle (`skills.mdc`) is the documented lossy exception: it does not include skill references.

**2. Outbound calls are limited to what the skill declares.**
- `security-scan` sends only package name and version to OSV.dev (no source code) and uses native audit tools and registry metadata where available.
- The skill must treat a failed lookup as a gap, never as a clean result: it runs a positive control first, and states "incomplete, not clean" when the lookup cannot run. This was observed in practice on an Express test run, where DNS was blocked and the report said so.
- All other pai-orbit modes and skills stay local-first.

**3. Live-target testing is consent-gated, passive-first and non-destructive.**
- The target host and the authorization must be verifiable from the repo's own config or an explicit user instruction. An unverifiable host is validated from source only.
- Passive checks come before active ones; active probes use throwaway identifiers only, never real accounts or state changes. Creating test data is a separate, narrower exception that must be disclosed in the report.
- No mass sweeps and no evasion of controls. If the harness refuses a request, that refusal is final: the skill reports it and does not route around it.
- `security-scan-retest` makes live HTTP requests itself, one at a time. It never delegates them to subagents.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) Ship references per adapter; inline for Copilot | Full parity; reuses the existing inline mechanism; the verifier guards it | Copilot prompt for this skill is about 2,000 lines (roughly 37,000 tokens by estimate), loaded only when invoked |
| Copilot: ship references as separate files under `.github/prompts/` | Smaller prompt | Copilot has no sibling-file lookup, so the agent may not find them |
| Fold the references into one long `SKILL.md` in core | One file everywhere, no adapter work | Hard to maintain; large file loaded for every adapter, including those that can load on demand |
| Skip the OSV.dev call; use native audit tools only | Fully local | Native tools miss some ecosystems and need a lockfile and a working toolchain |
| No live testing in the skill; static only | Smallest safety surface | Cannot upgrade findings from "confirmed in code" to "live validated" |

## Consequences

**Positive:**
- All five adapters behave consistently for `security-scan`; the verifier stops dangling `references/` pointers in Copilot.
- A scan that could not reach OSV.dev cannot be mistaken for a clean one.
- Live testing has written, repeatable limits.

**Negative / trade-offs:**
- The Copilot `security-scan` prompt is the largest in the bundle by about 4×; behaviour inside Copilot's context limits has not been tested.
- The skill depends on network access and, for dependency results, a lockfile; without them the dependency section is incomplete.
- Optional tools are needed for PDF output: Playwright for `security-scan`, `wkhtmltopdf` for `security-scan-retest`.

**Neutral:**
- Both skills have only been run once (static baseline on a sample repo); the live-testing paths have not been exercised.

## Related Decisions

- [2026-09-08-centralize-docs-path-resolution.md](2026-09-08-centralize-docs-path-resolution.md) — precedent for per-adapter wiring of shared reference files, including inlining for flat-file adapters.

## Review Date

Revisit after the skills have been run against a project with a lockfile and network access, or when a second skill adds a `references/` folder.

## References

- PR #85, issue #86 (related: #67, partial overlap only)
- `docs/architecture/constraints.md` (full-adapter parity)
