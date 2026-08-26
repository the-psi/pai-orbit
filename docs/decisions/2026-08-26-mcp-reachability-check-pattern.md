---
status: accepted
date: 2026-08-26
deciders: [Punit Singhal]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: Deploy-MCP reachability check uses a presence-in-session test, not a live tool call

## Context

`docs/features/azure-aws-deploy-support/requirements.md` (issue #59) requires `/setup` to
verify, for Azure/AWS, whether a configured deploy MCP server is reachable (REQ-5c) and to
surface "MCP configured but unreachable" as a distinguishable failure cause (REQ-8, AC-10).

No existing skill does this today. `/git` and `/board` — the only two skills with a shipped
MCP-opt-in layer (`docs/features/mcp-skills-evaluation/design.md`) — both follow a
try-then-fallback pattern: they attempt the real operation (a commit, a board move) via MCP
and fall back to CLI only if that specific call fails. Neither does a proactive, standalone
"is the MCP server reachable" check independent of doing real work.

This feature is the first to ask for a proactive verification step, run during `/setup`
before any real deploy work exists to attempt. `docs/epics/mcp-support/EPIC.md` queues four
more skills (`/epic`, `/incident`, `/data-model`, `/review` docs-sync) for the same MCP
opt-in treatment — whichever mechanism is chosen here is likely to be copied by those, so it
is being decided deliberately rather than left as an implementation detail of one feature.

## Decision

In the context of **`/setup` needing to report whether a configured deploy MCP server is
usable**,
facing **no prior art for a proactive MCP check, and the fact that `/setup` runs before any
real MCP-backed operation exists to attempt**,
we decided **to check whether the named MCP server appears among the current session's
connected tools, without issuing any live tool call to it**,
to achieve **an honest, cheap signal ("configured and connected" vs. "configured but not
connected to this session") without inventing a proactive probe-and-fail pattern that `/git`
and `/board` don't use**,
accepting **this is not a true reachability/auth test of the provider MCP server itself — a
server can show as connected and still fail on first real use, and the inverse (not
connected during `/setup`, but connected later when `/deploy`-equivalent work actually
happens) is explicitly not treated as a failure**.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) Presence-in-session check | Cheap, synchronous, no new call-and-fail pattern; distinguishes "not connected" from a hard failure so it doesn't over-claim | Doesn't prove the server actually works — only that it's attached to this session |
| Live tool-call reachability test (e.g. call a read-only whoami/list-accounts tool) | Most literally satisfies "reachable"; would catch a connected-but-broken server | Depends on the MCP server being connected specifically during the `/setup` session — a server configured for later use (e.g. attached only during `/release`) would wrongly report "unreachable"; establishes a proactive probe pattern `/git`/`/board` don't have, which the queued `/epic`/`/incident`/`/data-model`/`/review` MCP work would likely copy without the same scrutiny |
| Config-presence only, no session check at all | Simplest; matches `/git`/`/board` philosophy most closely (try at real use, fall back if it fails) | Doesn't satisfy "verify reachable" from the requirements at all — would need a groom amendment to soften REQ-5c/AC-10 |

## Consequences

**Positive:**
- `/setup` gives a real, if narrower, signal ("connected this session" vs "not connected")
  without a new kind of unreliable proactive probe.
- Sets a documented pattern the other four queued MCP opt-in features
  (`docs/epics/mcp-support/EPIC.md`) can reuse without re-litigating this trade-off.

**Negative / trade-offs:**
- A deploy MCP server that will be perfectly usable later (e.g. connected only when the
  user actually runs deploy-related work) reports as "not connected this session" during
  `/setup` — this is expected, not a bug, and the design's failure-message wording (see
  `docs/features/azure-aws-deploy-support/design.md`) must say "will attempt at first use,"
  not "broken."
- Does not catch a genuinely broken-but-connected MCP server at `/setup` time; that surfaces
  later at first real use, same as `/git`/`/board` today.

**Neutral:**
- No change to `/git` or `/board`'s existing try-then-fallback behavior — this ADR only
  governs the new deploy verification step.

## Related Decisions

- Builds on the MCP opt-in pattern resolved in `docs/features/mcp-skills-evaluation/design.md`
  (Decisions A/B: shell stays default/fallback, MCP is opt-in and preferred when configured).
- Feeds `docs/epics/mcp-support/EPIC.md`'s remaining MCP opt-in rows (`/epic`, `/incident`,
  `/data-model`, `/review` docs-sync) — they should follow this same presence-check pattern
  unless a specific reason to deviate is documented.

## Review Date

Revisit if a live tool-call check becomes cheap/reliable enough to attempt during `/setup`
(e.g. a standardized lightweight health-check tool convention across MCP servers), or once
`/epic`/`/incident`/`/data-model` MCP opt-in work is groomed and this pattern gets its second
real usage.
