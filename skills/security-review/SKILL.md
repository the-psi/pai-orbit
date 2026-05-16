---
name: security-review
description: Security-focused review of changed code — checks for OWASP Top 10 vulnerabilities, auth/authz gaps, secret management issues, and input validation at system boundaries. TRIGGER before merging a change that touches auth, input handling, external APIs, file I/O, database writes, or permissions. SKIP full architecture reviews (use /review) and ongoing implementation (use /build).
---

# Security Review

Targeted security pass on changed code before it merges.

Reads from:
- Branch diff or specified files
- `CLAUDE.md` — auth model, system boundaries, and known security constraints
- `docs/architecture/system.md` — trust boundaries and attack surface (if it exists)
- `docs/architecture/constraints.md` — declared constraints around auth, input, and external APIs (if it exists)
- `docs/decisions/` — security-relevant ADRs

---

## Scope

Ask (or infer):
- What branch or files are in scope?
- Is this a focused review (e.g., auth changes only) or a full pass?
- Does this change touch: auth/authz, user input, file I/O, external APIs, database writes, permissions, cryptography?

If `docs/architecture/system.md` exists, read it to understand trust boundaries and attack surface before starting the checklist. If `docs/architecture/constraints.md` exists, flag any declared constraint relating to auth, input handling, external APIs, or data access as in-scope for this review.

---

## Checklist

Work through each category. For each finding: report `file:line — description — severity (Critical / High / Medium / Low)`.

### Injection

- [ ] All user-supplied input is parameterised or escaped before use in queries, shell commands, template rendering, or log output
- [ ] No string concatenation to build SQL, shell commands, or URLs from user data
- [ ] ORM / query builder used consistently; raw queries validated for injection risk

### Authentication & session

- [ ] Auth checks happen at the system boundary (middleware or equivalent) — not scattered through business logic
- [ ] No endpoint that should be authenticated is reachable without credentials
- [ ] Session tokens are not logged, stored in plaintext, or returned in URLs
- [ ] Token expiry and refresh are handled correctly

### Authorisation

- [ ] Every data-mutating operation checks that the authenticated user has permission for the specific resource, not just for the operation type
- [ ] Ownership checks use the authenticated user's identity from the trusted source (session / IAP header / JWT claim) — never from user-supplied input
- [ ] Admin-only operations are gated at the right layer

### Secrets and credentials

- [ ] No credentials, API keys, tokens, or passwords in code, comments, or test fixtures
- [ ] Environment variables used for all secrets; `.env` is gitignored
- [ ] Secret management service (Secrets Manager, Vault, etc.) used for production secrets
- [ ] No secrets in log output

### Input validation

- [ ] All external input (request body, query params, headers, file uploads) is validated at the boundary
- [ ] File uploads: type validated server-side (not just client-side); size limited; stored outside the web root
- [ ] Error messages do not leak stack traces, internal paths, or schema details to the client

### Dependencies

- [ ] No new dependency added with known high/critical CVEs (check with `pip audit`, `npm audit`, `trivy`, or equivalent)
- [ ] Pinned versions used — no `>=` ranges on security-sensitive packages

### Cryptography

- [ ] No custom crypto — use standard library or well-audited package
- [ ] Passwords hashed with bcrypt / argon2 / scrypt — not MD5, SHA1, or plain SHA256
- [ ] TLS used for all external communications; certificate validation not disabled

### Cloud / infrastructure

- [ ] IAM permissions follow least privilege — no wildcard roles granted to application identities
- [ ] Storage buckets / blobs are not publicly readable unless explicitly required
- [ ] No internal service URLs or admin endpoints exposed publicly

---

## Output format

Write findings to `docs/wip/security-review-<branch>-<date>.md`:

```
## Security Review: <branch or PR title>
Date: <date>
Reviewer: <name>

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

**Critical or High findings block merge.** Do not approve and "fix later" — fix before merging. Switch to `/build` with the finding as context, then re-run `/security-review` on the fix.
