---
status: proposed
date: 2026-11-26
deciders: [Chetan Sharma (delegated to sub-agent analysis; team ratification pending)]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: Modes run unattended through an appended contract, not through edited prompts

## Context

Orbit's modes are written for a person at the keyboard. `/groom` alone has dozens of "ask the user"
and "wait for confirmation" steps. The Agentic Factory must run the same modes with no person
present, turn a real question into a ticket comment, and continue when it is answered. Interactive
behaviour on a developer's machine must not change (AC-32), and mode text must not be duplicated.

## Decision

In the context of **running interactive, gated modes with no person present**,
facing **the need to keep one copy of every prompt and to leave interactive behaviour untouched**,
we decided **to leave the modes unedited and have the factory append one instruction file,
`factory/contract/unattended.md`, to the system prompt, and to require each stage to end with a
result validated against `factory/contract/stage-result.schema.json`**,
to achieve **a zero-line diff in `core/` and `dist/` and a machine-readable signal for "needs a
person"**,
accepting **that correct unattended behaviour depends on the agent following the contract, which
must be tested with real headless runs**.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| Appended contract + schema-validated result (chosen) | No change to any mode or adapter output; AC-32 provable by `git diff`; works for any runner that accepts extra instructions | Behaviour rests on instruction-following; needs fixture runs to prove |
| Edit each mode: "if unattended, read `reference/unattended-contract.md`" | Discoverable from the mode itself | Changes every mode in every adapter's `dist/` (the codex adapter inlines fragments); puts AC-32 at risk; rule 6 work for five adapters |
| Build-time marker injection (the `CLAUDE_CODE_ONLY` precedent) | Keeps `core/` generic | Forks output text per adapter; still a `dist/` change |

## Consequences

**Positive:**
- The contract sorts every "ask" into procedural (decide by policy), functional or irreversible
  (confirm only with cited support, otherwise return the question), and forbidden.
- The agent has no question tool, so a question can only leave through the result. Nothing waits
  silently.
- Questions are batched per stage, so a person answers once per stage.

**Negative / trade-offs:**
- `/groom` confirms scenarios one at a time to prevent silent bulk approval. Unattended, the agent
  confirms what the ticket supports and must cite it. This is weaker than a person confirming, so
  the optional gate after requirements should be on for a pilot.
- A mode change that adds a new kind of interactive step may need a line in the contract. The
  contract is the one place where the factory knows about mode behaviour.

**Neutral:**
- The result schema is the contract between any runner and the orchestrator; a later non-Claude
  runner must produce the same result.

## Related Decisions

- `docs/decisions/2026-11-26-agentic-factory-in-repo-service.md`
- `docs/decisions/2026-09-08-groom-ticket-entry-gate.md` (the entry gate the contract answers by
  policy)

## Review Date

After the first 10 pilot tickets: compare factory-written requirements and designs with
person-driven ones.
