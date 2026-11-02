# Architecture decomposition guide

Used by `/arch define` to break a system into components (modules or services) with clear responsibilities and data ownership. Decompose before choosing a deployment topology: the boundaries matter more than whether each one becomes a module or a service.

## Inputs, in order of weight

1. **Domain knowledge** (`domain/`) — the business vocabulary, rules, and who owns which decisions.
2. **To-be process maps** (`processes/specs/*.json`) — lanes, hand-offs, and step groups show where work and responsibility change hands.
3. **Drivers** (`architecture/drivers.md`) — quality scenarios that need a part of the system to behave differently from the rest.
4. **Organisation** — teams, their skills, and who will own what.

## Boundary heuristics

Look for seams. Each heuristic below suggests a boundary; a boundary suggested by several heuristics at once is strong.

| Heuristic | Signal of a boundary |
|-----------|---------------------|
| **Language** | The same word means different things in two areas ("account" for sales vs for billing), or the experts for two areas are different people. Each meaning gets its own bounded context. |
| **Process lanes and hand-offs** | Steps in a process map cluster by lane and phase, with few hand-offs between clusters. A hand-off between two system lanes is a candidate interface; many back-and-forth hand-offs between two clusters mean they belong together. |
| **Data that changes together** | Entities updated in the same transaction by the same rule belong together. Entities that tolerate being briefly out of step can be split. |
| **Rate of change** | Parts that change weekly (pricing rules, onboarding flows) separated from parts that are stable (ledger, identity). |
| **Scaling and availability profile** | A part with very different load, latency, or uptime targets from the rest (ingestion, search, checkout). |
| **Security and compliance scope** | Regulated data (payments, health, personal data) isolated so the compliance scope stays small. |
| **External dependency** | Each third party behind its own adapter (anti-corruption layer), so their model does not leak into yours. |
| **Team ownership** | One team should be able to own a component end to end. A component two teams must change together is a missing boundary or a wrong one. |

## Integrators — reasons to keep things together

Weigh these against the heuristics above before splitting:
- **Transactional consistency** that the business genuinely requires (not merely convenient).
- **Chatty interaction** — two candidates that would call each other many times per user action.
- **Shared rules** that would have to be duplicated or kept in lockstep.
- **Joint change** — the history (or the roadmap) shows they almost always change together.

## Procedure

1. **List candidate contexts** from the language heuristic, citing the domain docs. Name each with a noun from the business vocabulary, not a technical term ("Settlement", not "PaymentProcessor").
2. **Overlay the process maps.** Map each process step's lane and step IDs to a candidate. Steps with no home reveal a missing component; a component with no steps is suspect.
3. **Apply the remaining heuristics and integrators** and adjust: split where several heuristics agree, merge where integrators dominate.
4. **Present two or three decompositions** (typically coarser and finer) with trade-offs, and let the user choose. Do not present a single answer as obvious.
5. **Define each chosen component:** one-sentence responsibility, the data it owns (it is the only writer), the process step IDs it implements, the interfaces it offers and consumes, and the owning team.
6. **Draw the context map:** how components relate — customer/supplier, conformist, anti-corruption layer, shared kernel (avoid unless deliberate), published language, open-host service.

## Validation tests

A decomposition passes when every answer is yes:
- Can each component's responsibility be stated in one sentence without "and"?
- Does every piece of data have exactly one owning (writing) component?
- Can a typical feature on the roadmap be built by changing one component, or two at most?
- Can each component be owned by one team?
- Is every process hand-off between components an explicit interface?
- Are there no cycles in the component dependency graph?

## Output shape (system.md → Decomposition)

| Component | Responsibility | Owns data | Process steps | Offers | Consumes | Team |
|-----------|----------------|-----------|---------------|--------|----------|------|
| Settlement | Calculates and books merchant payouts | payouts, fee ledger | SET-3…SET-7 | payout API, `PayoutBooked` event | `PaymentCaptured` | Payments |

Context map as a Mermaid `graph` with the relationship type on each edge.
