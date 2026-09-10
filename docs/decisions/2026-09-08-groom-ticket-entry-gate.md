---
status: accepted
date: 2026-09-08
deciders: [upneet01]
scope: service
supersedes: ""
superseded-by: ""
---

# ADR: `/groom` gates on a ticket number before Phase 1, with an explicit opt-out

## Context

`/groom` used to enter Phase 1 (purpose) unconditionally, whether or not the session was tied to
a board ticket. The only point where a "parent board issue" was assumed to exist was at session
close (posting open questions, offering a column move) — by which point a full requirements.md
could already be written with no ticket to link it to, and no traceability from ticket to
grooming output (#48).

## Decision

In the context of **a grooming session that may or may not be tied to a board ticket, and two
session-close steps that already assume a resolved parent issue**,
facing **whether to keep deferring the ticket check to session close, or move it to session
entry**,
we decided **to add an entry gate before Phase 1: check context for a ticket number, ask directly
if none is found, and require an explicit confirmed opt-out for standalone/exploratory grooming
rather than inferring it from silence**,
to achieve **every requirements.md traceable to a ticket by default, while still allowing
deliberate ticket-less exploration**,
accepting **one extra confirmation step at the start of every grooming session that isn't already
invoked with a ticket number in context**.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) Entry gate before Phase 1, explicit confirmed opt-out | Ticket traceability by default; session-close steps 4/6 always have a real issue to act on or a deliberate reason not to | Adds a question at the start of every untagged session |
| Keep the check at session close (status quo) | No new friction at entry | The bug this ADR fixes: no issue to act on by the time it matters, no traceability |
| Silently skip ticket linking when no number is given | No friction at all | Silent scope-creep of "exploratory" grooming — exactly what #48 flagged as the failure mode; violates the project's "flag ambiguity, don't infer" principle |

## Consequences

**Positive:**
- Requirements files are traceable to a ticket from the start, not discovered to be missing one at close
- Session-close steps 4 (post open questions) and 6 (offer column move) always have a resolved issue when relevant, instead of failing with nothing to act on
- Opt-out requires explicit confirmation, consistent with the existing "do not assume silence means agreement" rule already used for scenario confirmation in Phase 2

**Negative / trade-offs:**
- One additional question/confirmation at the start of every `/groom` session invoked without a ticket number already in context

**Neutral:**
- No change to sessions that already reference a ticket in the invocation (e.g. "groom #42") — the gate resolves immediately and Phase 1 proceeds as before

## Related Decisions

None.

## Review Date

None.
