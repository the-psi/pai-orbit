---
status: accepted
date: 2026-09-08
deciders: [upneet01]
scope: service
supersedes: ""
superseded-by: ""
---

# ADR: Centralize docs write-path resolution in `core/reference/`

## Context

`system_docs_repo` / `system_docs_path` are the mechanism for pointing a project's docs at a
repo outside its code repo. The redirect only ever applied to the **read set** — every mode's
write instruction hardcoded a `docs/…` literal, so a project with `system_docs_repo` configured
read from the external repo but always wrote back into the code repo (#53). The read-side
resolution logic itself was duplicated verbatim across six mode files with no single source of
truth, which is exactly why the other six write-only files never picked it up at all, and why
`arch.md`'s two hand-rolled write redirects independently drifted into interpolating an extra
`docs/` segment.

## Decision

In the context of **twelve write sites needing the same docs-root resolution, and six of them
already duplicating the read-side version of that same logic**,
facing **a choice between re-deriving the resolution rule per file (the status quo that caused
the bug) or extracting it once**,
we decided **to add `core/reference/` as a new category alongside `modes/`, `skills/`, `agents/`,
and `templates/` — holding `docs-path-resolution.md`, a single algorithm for resolving the docs
root for both reads and writes, referenced by relative path (`reference/docs-path-resolution.md`)
from every mode, skill, and agent that touches project docs**,
to achieve **one place to fix this class of bug, instead of twelve, wired into all five adapters
at once rather than deferring the flat-file adapters to a follow-up**,
accepting **a new top-level core/ category, and two different wiring strategies per adapter: the
`claude-code` and `cursor-plugin` adapters ship `reference/` as a real sibling file resolved by
relative path; `cursor` (no-clone installer) fetches it as an additional asset alongside its rule
files; `codex` and `copilot` have no sibling-file convention (flat `SKILL.md` / `*.prompt.md`
files, TOML subagents) and instead inline the referenced content as an appendix wherever a body
mentions it — the same pattern the removed `kiro-power` adapter already used for other
file-structure-dependent content**.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) `core/reference/` — shared instruction fragment, referenced by path (real file for two adapters, inlined appendix for the rest) | Single source of truth; matches the existing `templates/foo.md`-by-path convention already used by every mode; full parity across all five adapters in one PR | New top-level category; two wiring strategies to maintain instead of one |
| Keep duplicating the resolution block per file, fix all 12 write sites independently | No new file/category | Doesn't fix the root cause — the next new write site reintroduces the same class of bug |
| Fold the shared logic into `templates/` | No new category | `templates/` means "scaffold copied into the target project"; this is read-at-runtime instruction, not a copy target — conflating the two would mislead future maintainers |
| Wire only the file-relative adapters now, defer `codex`/`copilot` inlining to a follow-up PR | Smaller diff | Leaves `constraints.md` rule 6 (full adapter parity before merge) violated on merge — the class of bug this ADR exists to fix would persist for two adapters |

## Consequences

**Positive:**
- One algorithm to update when the resolution rule needs to change, instead of twelve
- Fixes the reported bug: writes now redirect exactly like reads when `system_docs_repo` is configured
- Strengthens the "directory exists" check to require a recognizable docs subdirectory, closing the stale-pointer false-positive from the original report
- Full adapter parity (rule 6) on merge — no adapter ships this fix in degraded form

**Negative / trade-offs:**
- Adds a category to `core/` beyond the four documented in `CLAUDE.md` (`modes/`, `skills/`, `agents/`, `templates/`) — `CLAUDE.md`'s directory tree is updated to list it
- Two wiring strategies for the same reference file: `claude-code`/`cursor-plugin` ship it as a real sibling file, `cursor` fetches it as an installer asset, `codex`/`copilot` inline it as a per-body appendix. A future reference doc that's large or changes often makes the inlined copies more expensive to keep in sync — acceptable today at one short file.

**Neutral:**
- No behavior change for projects that never configure `system_docs_repo` — `<docs root>` resolves to local `docs/`, identical to today

## Related Decisions

None.

## Review Date

Revisit if a sixth adapter is added and needs its own resolution for path-reference content, or if `core/reference/` grows enough that the inlined-appendix cost on `codex`/`copilot` becomes noticeable (prompt/skill size budgets).
