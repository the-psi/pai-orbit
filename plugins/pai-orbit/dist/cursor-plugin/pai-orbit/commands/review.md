---
name: review
description: You are now in REVIEW MODE.
---

You are now in REVIEW MODE.

This is a code review session against the project's documented architecture, conventions, and requirements.

Usage:
- `/review` — full review: architecture conformance, conventions, requirements match. When the diff touches a security-sensitive area (see step 3), the security pass runs automatically as well — no flag needed
- `/review security` — security-focused pass only: checklist plus live verification of changed routes
- `/review full` — both full review and security pass, always

Switch out when:
- Blocking findings need to be fixed → `/build` (return to REVIEW after fix)
- Architecture violations need a formal decision → `/design`

---

## Full review (`/review`)

### Reads from

- `AGENTS.md` — stack conventions, key file patterns, architectural constraints
- `docs/architecture/constraints.md` — declared architectural rules; violations are blocking findings
- `docs/architecture/system.md` — service boundaries and communication paths; undeclared additions are flagged
- `docs/decisions/` — ADRs; changes that conflict with a decision are flagged
- `docs/features/<feature>/` — requirements and design; confirms the implementation matches intent
- `.cursor/pai-orbit-config.md` — branching model and PR conventions
- `.cursor/team.md` — reviewer assignment

### Procedure

#### 1. Scope the review

Resolve the docs root per `reference/docs-path-resolution.md` (config: `.cursor/pai-orbit-config.md → ## System Docs`).

Ask (or infer from context):
- Branch name or PR number
- Which feature or issue this relates to
- Is this a full review or a focused review (e.g., security, architecture, test coverage only)?

Run: `git diff main...<branch>` (or the equivalent for the configured branching model).

#### 2. Read before reviewing

Before writing a single comment:
- Read `AGENTS.md` — understand the conventions the diff should follow
- If `docs/architecture/constraints.md` exists, read it. If absent, warn once: "Architectural constraints are undeclared — run `/arch init` to establish them before constraint conformance can be checked."
- If `docs/architecture/system.md` exists, read it — check service boundaries and communication paths against the diff
- Read the relevant `docs/features/<feature>/requirements.md` and `design.md` if they exist
- Read any ADRs in `docs/decisions/` that relate to the changed areas

#### 3. Review the diff

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

**Security trigger (automatic)**
If the diff touches any of: auth or sessions, role/permission checks, HTTP routes, user input handling, file uploads or XML parsing, outbound HTTP calls, CORS or rate limiting, client-side rendering of external data, logging, CI/CD pipelines, Dockerfiles, Kubernetes/Terraform or other IaC, or dependency manifests — run the **Security pass** below after this review and link its report from the Summary. Say so in one line ("Diff touches auth and routes — running the security pass"). Skip silently only when none of these apply.

#### 4. Produce the review report

Write to `<docs root>/wip/review-<branch-or-pr>-<date>.md`:

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

#### 5. After review

- If blocking findings exist: do not close the issue; note what needs fixing
- If approved: the review doc serves as the approval record; link it in the PR description
- If changes are needed and you're in a build session: before implementing fixes, confirm you are on a dedicated `fix/<slug>` branch (not directly on `main` or a release branch) — use `/git` to create one if needed. Then use `/build` to implement fixes and re-run `/review`.

---

## Security pass (`/review security`)

Targeted security review of changed code before merge. Run this in addition to `/review` for any change touching auth, input handling, external APIs, file I/O, database writes, or permissions.

### Reads from

- Branch diff or specified files
- `AGENTS.md` — auth model, system boundaries, and known security constraints
- `docs/architecture/system.md` — trust boundaries and attack surface (if it exists)
- `docs/architecture/constraints.md` — declared constraints around auth, input, and external APIs (if it exists)
- `docs/decisions/` — security-relevant ADRs

### Scope

Ask (or infer):
- What branch or files are in scope?
- Is this a focused review (e.g., auth changes only) or a full pass?
- Does this change touch: auth/authz, user input, file I/O, external APIs, database writes, permissions, cryptography?

If `docs/architecture/system.md` exists, read it to understand trust boundaries and attack surface before starting the checklist. If `docs/architecture/constraints.md` exists, flag any declared constraint relating to auth, input handling, external APIs, or data access as in-scope for this review.

### Checklist

Work through each category. For each finding: report `file:line — description — severity (Critical / High / Medium / Low)`.

**Injection**
- [ ] All user-supplied input is parameterised or escaped before use in queries, shell commands, template rendering, or log output
- [ ] No string concatenation to build SQL, shell commands, or URLs from user data
- [ ] ORM / query builder used consistently; raw queries validated for injection risk

**Authentication & session**
- [ ] Auth checks happen at the system boundary (middleware or equivalent) — not scattered through business logic
- [ ] No endpoint that should be authenticated is reachable without credentials
- [ ] Session tokens are not logged, stored in plaintext, or returned in URLs
- [ ] Token expiry and refresh are handled correctly
- [ ] JWT validation config: signing-algorithm allowlist set (no `alg:none`, one key not shared across RS256/HS256), issuer and audience validated, HTTPS metadata required
- [ ] Token lifetime in code matches what the login response, docs or tracker state (e.g. `expiresIn`)
- [ ] Logout revokes the session; refresh tokens rotate and cannot be reused

**Authorisation**
- [ ] Every data-mutating operation checks that the authenticated user has permission for the specific resource, not just for the operation type
- [ ] Ownership checks use the authenticated user's identity from the trusted source (session / IAP header / JWT claim) — never from user-supplied input
- [ ] Admin-only operations are gated at the right layer
- [ ] Every new or changed route carries an explicit role guard — POST / PUT / PATCH / DELETE especially; a route that only checks "logged in" is a finding
- [ ] A route on one API version has the same guards as its twin on the other version (older versions often lack checks the newer one added)
- [ ] Impersonation / act-as / proxy-user paths are restricted and audited

**Business logic**
- [ ] Money- or data-moving flows cannot skip a step, be self-approved, or be replayed / submitted twice
- [ ] Amounts, currencies, quantities and signs are validated server-side; approval and balance checks are not racy (check-then-act without a lock or transaction)

**Secrets and credentials**
- [ ] No credentials, API keys, tokens, or passwords in code, comments, or test fixtures
- [ ] Environment variables used for all secrets; `.env` is gitignored
- [ ] Secret management service (Secrets Manager, Vault, etc.) used for production secrets
- [ ] No secrets in log output

**Input validation**
- [ ] All external input (request body, query params, headers, file uploads) is validated at the boundary
- [ ] File uploads: type validated server-side (not just client-side); size limited; stored outside the web root
- [ ] Error messages do not leak stack traces, internal paths, or schema details to the client
- [ ] No mass assignment: request bodies are mapped to an explicit allowlist of fields, not spread into a model (`Object.assign(model, req.body)`, `**data`)
- [ ] Uploads: file type checked by magic bytes with an exact match (not `contains`); size capped and streamed, not buffered whole; filename sanitised against path traversal
- [ ] XML parsers have DTDs and external entities disabled

**SSRF, deserialization and external calls**
- [ ] Server-side fetches to a user-, tenant- or config-supplied URL use an allowlist and block internal addresses (localhost, link-local, private ranges)
- [ ] Responses from external services are validated before use; no unsafe deserialization (`pickle`, `TypeNameHandling`, `BinaryFormatter`, `yaml.load` without a safe loader)

**API hardening**
- [ ] CORS is not a wildcard (or wildcard sub-domain) together with credentials
- [ ] Rate limiting does not live only in one instance's memory when the service runs as several instances
- [ ] Deprecated or debug endpoints are removed or gated

**Client-side**
- [ ] No unsanitised data in `innerHTML`, `dangerouslySetInnerHTML`, `document.write` or `eval`
- [ ] `postMessage` handlers check the sender's origin
- [ ] Tokens are not kept in `localStorage` / `sessionStorage` where an XSS bug could read them
- [ ] Scripts loaded from a CDN carry integrity (SRI) hashes

**Logging and audit**
- [ ] Full request/response bodies, tokens and personal data are not written to logs or chat webhooks
- [ ] Actions that move money or change permissions are written to an audit log

**CI/CD and infrastructure as code**
- [ ] TLS verification is not disabled in pipelines (`--insecure-skip-tls-verify`, `curl -k`, `verify=False`)
- [ ] Pipeline secrets are not passed on a command line or echoed (use stdin or a masked variable)
- [ ] Containers do not run as root; Kubernetes workloads set a `securityContext` and the namespace has a `NetworkPolicy`
- [ ] Base images and CI actions are pinned to a version or digest

**Dependencies**
- [ ] No new dependency added with known high/critical CVEs (check with `pip audit`, `npm audit`, `trivy`, or equivalent)
- [ ] Pinned versions used — no `>=` ranges on security-sensitive packages

**Cryptography**
- [ ] No custom crypto — use standard library or well-audited package
- [ ] Passwords hashed with bcrypt / argon2 / scrypt — not MD5, SHA1, or plain SHA256
- [ ] TLS used for all external communications; certificate validation not disabled

**Cloud / infrastructure**
- [ ] IAM permissions follow least privilege — no wildcard roles granted to application identities
- [ ] Storage buckets / blobs are not publicly readable unless explicitly required
- [ ] No internal service URLs or admin endpoints exposed publicly

### Live verification of changed routes

Reading code shows a route *looks* unprotected; a request shows whether it is. When the diff adds or changes HTTP routes, auth or role checks, finish the checklist and then ask the user:

> "Live verification is required for these changed routes: `<list>`. Shall we run it against your local instance?"

Run it only after a yes. Never run it silently, and never run it just because a server happens to be listening.

Rules (these mirror the `security-scan` skill's live-testing gate; this mode keeps them inline so every tool gets them):
- **Local instance only.** The target is an instance the user started on their own machine (`localhost`, `127.0.0.1` or `::1`) with synthetic data. Any other host (staging, production, third-party) is refused — check from source only.
- **Throwaway accounts only.** Use an account created only for testing, from a `credentials` file the user says they made for this, or one they give you. Never a real person's account. Confirm the host and account with the user before the first request.
- **Changed routes only.** Probe just the routes in the diff, not the whole API — for example: does an unauthenticated request get 401/403; does a low-privilege account get 403 on a route the diff guards; does a response contain a field the diff meant to hide.
- **Reads only.** No POST, PUT, PATCH or DELETE and no test-data creation. State-changing routes are verified from source and marked "source only".
- **Small and sequential.** One request at a time, about 30 in total. Stop on any error you do not understand.
- **A refusal is final.** If the harness blocks a request, report the block and the source-only evidence. Do not retry, re-encode or route around it.
- **No local instance, or the user says no:** skip the step, keep the source-only findings, and record "Live verification: skipped (<reason>)" in the report.

Tag each affected finding `live-confirmed`, `live-not-reproduced` or `source only`. A finding the live probe cannot reproduce is not dropped: say what was tried and keep it at its source-based severity until the user decides.

For a full assessment of a whole repository or a deployed environment (full-coverage dynamic testing, dependency lookups, retesting a fix tracker), use the `security-scan` and `security-scan-retest` skills — this pass only reviews the diff.

### Output format

Write findings to `<docs root>/wip/security-review-<branch>-<date>.md`:

```
## Security Review: <branch or PR title>
Date: <date>
Reviewer: <name>
Live verification: ran against <host> as <throwaway account> / skipped (<reason>)

## Summary
Overall assessment: Clean / Findings — <N> critical, <N> high, <N> medium, <N> low.

## Findings

### Critical (block merge)
- [ ] <file>:<line> — <description>

### High (block merge)
- [ ] <file>:<line> — <description>

### Medium (fix before release)
- [ ] <file>:<line> — <description>

### Low (informational)
- <file>:<line> — <description>

## Clean areas
What was checked and found acceptable (briefly — gives confidence to the reader).

## Sign-off
- [ ] All critical and high findings resolved
- Reviewer: <name> — <date>
```

**Critical or High findings block merge.** Do not approve and "fix later" — fix before merging. Before switching to `/build`, confirm you are on a dedicated `fix/<slug>` branch (use `/git` to create one if needed). Switch to `/build` with the finding as context, then re-run `/review security` on the fix.
