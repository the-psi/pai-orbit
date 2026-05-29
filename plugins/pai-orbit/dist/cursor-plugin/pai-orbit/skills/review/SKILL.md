---
name: review
description: Structured code review — checks a branch diff against AGENTS.md conventions, documented architecture decisions, and team patterns. Produces a review report the architect or tech lead can sign off on. TRIGGER when a PR or branch is ready for review, when the architect wants to verify architectural conformance, or before merging a significant change. SKIP read-only git inspection (git log, git diff without review intent) and automated test runs (handled by CI).
---

# Review

Structured code review against the project's documented architecture and conventions.

Reads from:
- `AGENTS.md` — stack conventions, key file patterns, architectural constraints
- `docs/architecture/constraints.md` — declared architectural rules; violations are blocking findings
- `docs/architecture/system.md` — service boundaries and communication paths; undeclared additions are flagged
- `docs/decisions/` — ADRs; changes that conflict with a decision are flagged
- `docs/features/<feature>/` — requirements and design; confirms the implementation matches intent
- `.cursor/pai-orbit-config.md` — branching model and PR conventions
- `.cursor/team.md` — reviewer assignment

---

## Procedure

### 1. Scope the review

Ask (or infer from context):
- Branch name or PR number
- Which feature or issue this relates to
- Is this a full review or a focused review (e.g., security, architecture, test coverage only)?

Run: `git diff main...<branch>` (or the equivalent for the configured branching model).

### 2. Read before reviewing

Before writing a single comment:
- Read `AGENTS.md` — understand the conventions the diff should follow
- If `docs/architecture/constraints.md` exists, read it. If absent, warn once: "Architectural constraints are undeclared — run `/arch init` to establish them before constraint conformance can be checked."
- If `docs/architecture/system.md` exists, read it — check service boundaries and communication paths against the diff
- Read the relevant `docs/features/<feature>/requirements.md` and `design.md` if they exist
- Read any ADRs in `docs/decisions/` that relate to the changed areas

### 3. Review the diff

Check each changed file against:

**Architecture conformance**
- Does the change violate any rule in `docs/architecture/constraints.md`? (blocking if yes)
- Does it introduce a direct DB connection across service boundaries? (check `constraints.md` Trust Boundaries)
- Does the change add a new service or communication path not declared in `docs/architecture/system.md`? (advisory)
- Does the change stay within the layer boundaries described in AGENTS.md? (e.g., router calls service, service calls data layer — not the other way)
- Does it introduce a new dependency that wasn't discussed in design?
- Does it conflict with any ADR in `docs/decisions/`? Name the ADR.

**Conventions**
- Naming, file location, code style — as documented in AGENTS.md
- No raw dicts where Pydantic models are expected; no inline SQL where a service layer exists; etc.
- Test coverage: new endpoints / public functions should have at least one test

**Requirements match**
- Does the implementation cover all functional requirements in `requirements.md`?
- Are acceptance criteria from the test plan addressable by the shipped code?

**Safety**
- No credentials, tokens, or secrets in code or comments
- No `TODO: fix later` on security-relevant paths
- No disabled tests or skipped assertions without a documented reason

### 4. Produce the review report

Write to `docs/wip/review-<branch-or-pr>-<date>.md`:

```
## Review: <branch or PR title>
Date: <date>
Reviewer: <name from .cursor/team.md>
Related issue: #N

## Summary
One paragraph: overall assessment — approve / approve with comments / request changes.

## Findings

### Blocking
Issues that must be resolved before merge.
- [ ] <file>:<line> — <description> — <reference to convention or ADR>

### Non-blocking
Suggestions worth addressing but not required for merge.
- [ ] <file>:<line> — <description>

### Positive observations
What was done particularly well — worth naming so it repeats.
- ...

## Architecture conformance
- [ ] No violations of rules in docs/architecture/constraints.md
- [ ] No undeclared service or communication path added (docs/architecture/system.md)
- [ ] No cross-service DB connection introduced in violation of trust boundaries
- [ ] Stays within layer boundaries defined in AGENTS.md
- [ ] No conflicts with ADRs in docs/decisions/
- [ ] No undiscussed dependencies introduced

## Requirements coverage
- [ ] All functional requirements from requirements.md are addressed
- [ ] Acceptance criteria are testable from the shipped code

## Sign-off
- [ ] All blocking findings resolved
- Reviewer: <name> — <date>
```

### 5. After review

- If blocking findings exist: do not close the issue; note what needs fixing
- If approved: the review doc serves as the approval record; link it in the PR description
- If changes are needed and you're in a build session: use `/build` to implement fixes, then re-run `/review`
