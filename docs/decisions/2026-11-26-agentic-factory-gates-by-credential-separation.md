---
status: proposed
date: 2026-11-26
deciders: [Chetan Sharma (delegated to sub-agent analysis; team ratification pending)]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: Approval gates are enforced by who holds the credentials, not by prompts

## Context

The Agentic Factory must always stop for a person before merge and before release (REQ-11), and an
agent that reads ticket comments and code can be steered by text it reads. A gate that exists only
as an instruction to the agent is not a gate.

## Decision

In the context of **an unattended agent that must never merge or release without a person**,
facing **prompt injection and plain agent error**,
we decided **that the agent process receives only the model credential, and a separate orchestrator
process holds the board and code-host credentials and performs every push, pull request, comment,
merge and release start**,
to achieve **gates the agent cannot bypass because it has nothing to bypass them with**,
accepting **more plumbing in the orchestrator and a stricter environment for the agent**.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| Credential separation: agent has model access only; orchestrator does all writes (chosen) | Gates hold even if the agent is manipulated; one place decides what counts as approval | Orchestrator must implement push, PR, comment, merge; agent cannot use orbit's `/board` and `/git` skills for writes |
| Give the agent full credentials and instruct it to wait | Least code; reuses `/board` and `/git` as they are | Gate is prompt-only; one injected comment can merge |
| Rely on branch protection alone | No factory code | Says nothing about release, comments, or labels; depends on each project's settings being right |

## Consequences

**Positive:**
- Merge needs an approving review from a named person on the pull request's current head commit; an
  approval on an older commit does not count.
- The factory's own identity is never accepted as an approver.
- Release credentials are passed only to the release stage, only after a named approver approves.
- The two gates are absent from the configuration schema, so they cannot be switched off.
- Answers and approvals count only from people named in the configuration, which also limits what an
  injected comment can do.

**Negative / trade-offs:**
- The agent runs `/build` and `/test` without being able to push; the contract tells it to commit
  locally and stop. The orchestrator pushes at each stage boundary.
- In the first build all tickets share one container, separated by directory. One container per
  ticket is planned; until then isolation between tickets is by convention.

**Neutral:**
- Branch protection is still required on the base branch as a second line; `factory preflight`
  checks it.

## Related Decisions

- `docs/decisions/2026-11-26-agentic-factory-in-repo-service.md`
- `docs/decisions/2026-11-26-agentic-factory-unattended-contract.md`

## Review Date

When per-ticket containers are introduced.
