---
status: proposed
date: 2026-11-26
deciders: [Chetan Sharma (delegated to sub-agent analysis; team ratification pending)]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: The Agentic Factory lives in this repo as a top-level `factory/` service

## Context

A customer asked for orbit to run unattended on a server, from backlog to release
(`docs/features/agentic-factory/requirements.md`). That needs a running service: something that
polls a board, starts headless agent sessions, holds state, and enforces approval gates.

`docs/architecture/system.md` declares pai-orbit a static content pipeline with no runtime, and
`constraints.md` rule 6 requires every `core/` change to be fully supported by every adapter. The
requester's stated concern about a separate repo is that a prompt fix would have to be applied in
more than one place. They also asked for this decision to stay open for a team discussion, so this
ADR is a proposal for that discussion.

## Decision

In the context of **adding a server-side runtime to a repo that has only ever shipped static
content**,
facing **the risk of duplicating mode prompts and of version skew between prompts and
orchestrator**,
we propose **a new top-level `factory/` service in this repo that reads only
`plugins/pai-orbit/dist/claude-code/` and contains no mode text**,
to achieve **a single source for every prompt and one commit that pins prompts and orchestrator
together**,
accepting **that this repo now contains a runtime service, which its architecture documents must
say**.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| Top-level `factory/` consuming `dist/claude-code` (chosen) | Prompts stay single-sourced; one commit pins both; `core/` and `dist/` are byte-identical, so rules 2 and 7 are untouched | The repo is no longer "static content only"; three architecture documents change |
| Inside `plugins/pai-orbit/core` and the adapters | One build | Makes a runtime part of the plugin; triggers rule 6 for every adapter; changes `dist/` (rule 7); cannot sit under `adapters/` because `build.sh` runs everything there |
| Separate repo that installs pai-orbit | `system.md` stays true; separate release cadence | Version skew; tempts copying prompt text into the factory repo, which is the requester's exact concern |

## Consequences

**Positive:**
- A prompt fix is made once, in `core/`, and the factory picks it up from `dist/` in the same
  commit.
- `factory/` obeys the existing consumer trust boundary: it never reads `core/` or `adapters/`.

**Negative / trade-offs:**
- `system.md`, `stack.md` and `constraints.md` must describe a runtime, data on a volume, and
  credentials. They said "none" before.
- Rule 6 needs a scope sentence: it governs `core/` content, not the factory service. The factory
  is Claude first; that is not a rule 6 exception because nothing in `core/` is Claude-only.
- Contributors now need Node tests to pass as well as the adapter build.

**Neutral:**
- The decision is reversible. Moving `factory/` to its own repo later changes the path it loads the
  plugin from and nothing else.

## Related Decisions

- `docs/decisions/2026-11-26-agentic-factory-unattended-contract.md`
- `docs/decisions/2026-11-26-agentic-factory-gates-by-credential-separation.md`
- `docs/decisions/2026-10-08-claude-code-only-build-subagent-rules.md` (an actual rule 6 exception,
  for contrast)

## Review Date

At the team discussion the requester asked for; no later than the end of the pilot.
