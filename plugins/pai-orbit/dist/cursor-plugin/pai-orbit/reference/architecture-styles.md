# Architecture style catalogue

Used by `/arch define` to choose an architectural style from the project's drivers, not from fashion. Read the selection procedure first, then the entries for the shortlisted styles only.

## Three independent choices

A system's "architecture style" is really three decisions. Make each one separately — they combine freely.

| Choice | Question it answers | Options in this catalogue |
|--------|--------------------|---------------------------|
| **Deployment topology** | How many independently deployable units, and how do they split? | Modular monolith, Service-based, Microservices, Serverless |
| **Interaction style** | How do units (or modules) communicate and coordinate? | Request/response, Event-driven (choreography), Orchestration, Pipeline |
| **Internal structure** | How is code organised inside one deployable unit? | Layered, Hexagonal (ports & adapters), CQRS, Microkernel (plug-in) |

Example: a *modular monolith* with *hexagonal* modules that publish *domain events* in-process, with one *pipeline* for nightly settlement.

## Selection procedure

1. **Rank the drivers.** Take the top three quality-attribute scenarios from `drivers.md` by priority. A style choice that does not trace to a ranked driver is a preference, not a decision.
2. **Apply hard filters.** Strike out any option the constraints rule out before scoring:
   - Team: fewer than ~3 teams, or no one who has run a distributed system in production → strike Microservices.
   - Operations: no container platform, tracing, or on-call → strike Microservices; be cautious with Event-driven.
   - Consistency: a driver needs atomic multi-entity updates across most of the domain → favour fewer deployables.
   - Latency: hard low-latency scenarios → be cautious with Serverless (cold starts) and long synchronous call chains.
   - Cost: spiky, low average load with a tight budget → favour Serverless; steady high load → against it.
   - Regulatory isolation (data residency, PCI, PHI) → isolate the regulated scope in its own deployable regardless of the rest.
3. **Score the survivors.** For each remaining option, rate fit against each ranked driver (++ strong, + good, 0 neutral, − weak, −− poor) using the profiles below, and show the matrix. Weight by driver priority.
4. **Apply the default bias.** When two options score close, choose the one with fewer deployables and less operational surface. Distribution is cheap to add along well-drawn module boundaries and expensive to remove.
5. **Name the revisit triggers.** For the chosen option, state the measurable signals that would justify moving to the next style along its evolution path (e.g. "a module needs independent scaling beyond 10× the rest", "more than 4 teams deploying the monolith daily").
6. **Record an ADR** with the matrix, the rejected options and why, and the revisit triggers.

## Quality-attribute profiles

Relative, for typical implementations — not absolutes. Use them to structure the conversation, then adjust for the specifics of this system.

| Style | Deploy independence | Elastic scaling | Fault isolation | Modifiability | Simplicity / ops cost | Consistency | Performance |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Modular monolith | − | − | − | + | ++ | ++ | ++ |
| Service-based | + | 0 | + | + | + | + | + |
| Microservices | ++ | ++ | ++ | ++ | −− | −− | − |
| Serverless | ++ | ++ | + | + | + (ops) / − (debugging) | − | − (cold start) |
| Event-driven | + | ++ | + | ++ | − | −− | + (throughput) |
| Pipeline | + | + | 0 | + | + | 0 | ++ (batch) |

## Deployment topology

### Modular monolith
One deployable, divided into modules along domain boundaries with enforced interfaces and module-owned data (schemas or tables).
- **Fits when:** one to a few teams; domain boundaries not yet proven; strong consistency needed; small ops capability; early product.
- **Avoid when:** parts of the system have sharply different scaling, availability, or release-cadence needs; many teams contend for one release train.
- **Costs:** one failure domain; one scaling unit; boundaries erode without enforcement.
- **Implied constraints:** modules call each other only through published interfaces; no cross-module table access; each module owns its schema.
- **Fitness functions:** module dependency check in CI (no imports of another module's internals); no cross-schema queries.
- **Evolves to:** Service-based, by extracting the module whose revisit trigger fires.

### Service-based
A handful (typically 4–12) of coarse-grained, independently deployable domain services, often still sharing one database.
- **Fits when:** a few teams; some parts need independent deployment or scaling; full microservices overhead is not justified.
- **Avoid when:** a shared database would become the coupling point most of the domain fights over.
- **Costs:** shared-database coupling; inter-service calls add latency and partial-failure handling.
- **Implied constraints:** each table has one owning service for writes; services never call each other synchronously in long chains.
- **Fitness functions:** write-ownership check per table; maximum synchronous call depth.
- **Evolves to:** Microservices, by splitting data per service where ownership is already clean.

### Microservices
Many small services, each owning its data, deployed and scaled independently, usually one team per few services.
- **Fits when:** many teams needing autonomous release; parts with very different scaling or availability profiles; mature platform, observability, and on-call.
- **Avoid when:** small team; boundaries unproven; strong cross-entity consistency is common; no platform team.
- **Costs:** distributed-systems failure modes, eventual consistency, data duplication, contract versioning, high ops and cognitive load.
- **Implied constraints:** database per service; no shared libraries containing domain logic; versioned contracts; idempotent consumers.
- **Fitness functions:** no shared database access; contract tests on every interface; per-service SLOs monitored.
- **Evolves to:** consolidation (merge chatty services) when a pair always changes and deploys together.

### Serverless
Functions and managed services; the platform handles scaling and runtime.
- **Fits when:** spiky or event-triggered load; small team; glue and integration work; low ops appetite.
- **Avoid when:** steady high throughput (cost); hard latency targets (cold starts); long-running or stateful work; strict portability requirements.
- **Costs:** vendor coupling; harder local testing and debugging; distributed state; per-invocation limits.
- **Implied constraints:** functions stateless and idempotent; timeouts and retries explicit; infrastructure as code.
- **Fitness functions:** cold-start latency budget; cost per transaction tracked.
- **Evolves to:** containerised services for hot paths whose cost or latency trigger fires.

## Interaction style

### Request/response
Synchronous calls (HTTP/gRPC or in-process). Simple, immediately consistent, easy to reason about; couples availability — the caller fails when the callee does. Keep call chains short (a depth of 2–3 is a common ceiling).

### Event-driven (choreography)
Components publish facts; others react. No central coordinator.
- **Fits when:** many independent reactions to the same business event; high throughput; loose coupling between teams; process lanes that hand off asynchronously.
- **Avoid when:** a workflow needs one place to see its state or enforce ordering and compensation.
- **Costs:** eventual consistency; the end-to-end flow is invisible in any one place; schema evolution of events; duplicate and out-of-order delivery.
- **Implied constraints:** events are past-tense facts with versioned schemas; consumers idempotent; an outbox (or equivalent) for publish-with-commit.
- **Fitness functions:** event schema compatibility check in CI; consumer lag and dead-letter monitoring.

### Orchestration
A coordinator (workflow engine or process manager) drives a multi-step process and owns its state, including compensation (sagas).
- **Fits when:** long-running business processes with many steps, timeouts, human tasks, and compensation — typically what a `/process-map` with several system lanes and exception paths describes.
- **Costs:** the orchestrator is a coupling point and must not absorb domain logic that belongs to the participants.
- **Implied constraints:** each step idempotent; every forward step has a defined compensation or an explicit "no compensation" decision.

### Pipeline (pipes and filters)
Data flows through ordered, independent processing stages.
- **Fits when:** ETL, document or media processing, settlement and reconciliation batches, ML feature pipelines.
- **Avoid when:** interactive request handling.

## Internal structure

### Layered
Presentation → application → domain → data. Familiar and quick to start; tends towards anaemic domains and changes that touch every layer. Fine for CRUD-heavy modules.

### Hexagonal (ports & adapters)
Domain at the centre; inbound and outbound adapters behind ports. Keeps business rules testable and independent of frameworks, databases, and third parties. Good default for modules with real domain logic or many integrations. Fitness function: the domain package imports no framework or adapter code.

### CQRS
Separate write model from read models. Use where read and write shapes or loads differ sharply (reporting, search, dashboards). Adds synchronisation and eventual consistency between models; do not apply system-wide by default.

### Microkernel (plug-in)
Minimal core plus plug-ins with a defined extension contract. Fits products customised per customer, jurisdiction, or partner (rules engines, tax, connectors). Costs: contract versioning and plug-in isolation.

## Common combinations

| Situation | Typical starting point |
|-----------|-----------------------|
| New product, one or two teams, domain still being learned | Modular monolith + hexagonal modules + in-process domain events |
| Process-heavy back office with many external parties | Modular monolith or service-based + orchestration for long-running processes + anti-corruption adapters per external party |
| High-volume event intake with many independent consumers | Event-driven ingestion + service-based processing |
| Per-customer or per-jurisdiction variation | Modular monolith or service-based + microkernel for the variable rules |
| Spiky integration and automation glue | Serverless functions around a small core service |
