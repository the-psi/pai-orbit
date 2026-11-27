---
status: proposed
date: 2026-11-27
deciders: [upneet01]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: `/review` runs the security pass automatically and live-checks changed routes

## Context

The `security-scan` skill (PR #85) checks far more than the `/review security` checklist: JWT configuration, role guards on every route and API version, mass assignment, uploads, SSRF, client-side sinks, logging, CI/CD and IaC. Most of those can be checked from a diff, but `/review` never looked for them. Plain `/review` also ran no security checks beyond three "Safety" bullets, so a developer had to know to add `security` or `full`. Separately, reading code shows a route looks unprotected; only a request shows whether it is.

## Decision

In the context of **a per-PR review that should catch the problems the whole-repo scan finds, before they are merged**,
facing **a checklist with gaps, a security pass that is easy to forget, and no way to confirm a finding on a running app**,
we decided **to extend the checklist, trigger it from the diff, and add an opt-in live check of changed routes**,
to achieve **earlier findings with no extra flag and no extra command**,
accepting **a longer review mode file and a checklist that must be kept in step with the skill by hand**.

1. **Checklist.** The `/review security` checklist gains diff-checkable groups taken from `security-scan`: JWT configuration, role guards on changed routes and across API versions, business logic, mass assignment, uploads and XML, SSRF and deserialization, API hardening, client-side sinks, logging and audit, CI/CD and IaC.
2. **Automatic trigger.** Plain `/review` runs the security pass when the diff touches a security-sensitive area (auth, routes, input, uploads, outbound calls, CORS, client rendering, logging, pipelines, IaC, dependency manifests). `/review security` (pass only) and `/review full` (both, always) stay.
3. **Live verification of changed routes only.** After the checklist, the review asks once: "Live verification is required for these changed routes. Shall we run it against your local instance?" It runs only on a yes, only against loopback, with a throwaway account, read-only, one request at a time (about 30 in total), and a harness refusal is final. State-changing routes stay source-only. No instance or a "no" is recorded as skipped in the report.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) Extend the review checklist; auto-trigger from the diff; opt-in live check of changed routes | No new flag; reuses the existing mode; live check stays small | Rules are repeated inline rather than shared with the skill |
| Make `/review` call the `security-scan` skill | One source of truth | Skill scans the whole repo; far too heavy per PR; Copilot and Cursor cannot call skills the same way |
| Add a `--live` flag | Explicit | Easy to forget, which is the problem being fixed |
| Run live checks without asking when a server is up | Fewer prompts | A listening port is not consent; may hit the wrong target |
| Leave `/review` unchanged; point people at the skill | No work | The checks are used only when someone remembers the skill |

## Consequences

**Positive:**
- Diff-level security problems are caught in the normal review, before merge.
- A live probe can upgrade "looks unprotected in code" to "confirmed", on a harmless local instance.

**Negative / trade-offs:**
- The live rules exist both here and in `security-scan` gotcha #15; a change to one must be copied to the other.
- A review that finds a security-sensitive diff is longer and asks the user a question.
- Live verification has not yet been run against a real project through `/review` (see Review Date).

## Related Decisions

- [2026-11-25-security-scan-skills-references-network-and-live-testing.md](2026-11-25-security-scan-skills-references-network-and-live-testing.md) — the live-testing gate and local-only exception this mode reuses.

## Review Date

Revisit after `/review` has run its live step on a real project with a local instance, or when the `security-scan` live rules change.

## References

- PR #85 (security-scan skills); PR #78 also edits `review.md` (mode transitions) — touches different sections.
