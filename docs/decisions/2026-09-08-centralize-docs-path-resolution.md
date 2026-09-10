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
to achieve **one place to fix this class of bug, instead of twelve**,
accepting **a new top-level core/ category, and that only the `claude-code` and `cursor-plugin`
adapters preserve file-relative references — the lossy adapters (`cursor` legacy, `copilot`,
`codex`) already document losing file-structure-dependent content (see their `dist/*/README.md`
"What's lost" sections) and are addressed as a follow-up, not blocking this decision**.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) `core/reference/` — shared instruction fragment, referenced by path | Single source of truth; matches the existing `templates/foo.md`-by-path convention already used by every mode | New top-level category; lossy adapters can't resolve a path reference (pre-existing adapter limitation, not unique to this fix) |
| Keep duplicating the resolution block per file, fix all 12 write sites independently | No new file/category | Doesn't fix the root cause — the next new write site reintroduces the same class of bug |
| Fold the shared logic into `templates/` | No new category | `templates/` means "scaffold copied into the target project"; this is read-at-runtime instruction, not a copy target — conflating the two would mislead future maintainers |

## Consequences

**Positive:**
- One algorithm to update when the resolution rule needs to change, instead of twelve
- Fixes the reported bug: writes now redirect exactly like reads when `system_docs_repo` is configured
- Strengthens the "directory exists" check to require a recognizable docs subdirectory, closing the stale-pointer false-positive from the original report

**Negative / trade-offs:**
- Adds a category to `core/` beyond the four documented in `CLAUDE.md` (`modes/`, `skills/`, `agents/`, `templates/`) — `CLAUDE.md`'s directory tree needs updating to list it
- `reference/` is currently wired into only 2 of 5 adapter `build.sh` scripts (`claude-code`, `cursor-plugin`); `cursor` (legacy `.mdc`) and `kiro-power` inline the pointer text without shipping the file, which needs the same fix those adapters already apply for other file-relative references — tracked as a follow-up on this PR, not a new problem introduced by it

**Neutral:**
- No behavior change for projects that never configure `system_docs_repo` — `<docs root>` resolves to local `docs/`, identical to today

## Related Decisions

None.

## Review Date

Revisit if a sixth core/ adapter is added and needs its own resolution for path-reference content.
