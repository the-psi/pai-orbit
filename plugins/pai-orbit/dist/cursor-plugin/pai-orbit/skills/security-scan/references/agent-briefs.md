# Agent Briefs — scope boundaries and task lists

Dimensions are a catalog, not a fixed set. Spawn only the ones Phase 0 found evidence for
(see SKILL.md "Scoping the fan-out"). Ownership is stated as OWNS / DOES NOT OWN so that
concurrent agents never audit the same file twice.

## Shared preamble — prepend to EVERY agent brief
> You are one of several parallel security-scan agents. Stay strictly inside the scope
> boundary below; other agents own everything else and duplicated work wastes the run.
> Read this skill's `references/gotchas.md` before starting (resolve the path from wherever this
> skill is installed — global `~/pai-orbit plugin skills/` or a project-local `pai-orbit plugin skills/`, never
> assume one or the other), plus `references/api-recipes.md` and `references/ecosystems.md` if
> you query advisories.
> Rules: quote every glob argument; redact all secrets (first 4 + last 2 chars, JWTs as decoded
> claims only); cite `file:line` on every finding; separate CONFIRMED from PLAUSIBLE; report
> the checks that PASSED as well as those that failed; state your own coverage limitations.
> Do NOT write a report — return structured findings; the orchestrator consolidates.
> Write raw scan data to `<SCRATCHPAD>/<agent-name>/` — `<SCRATCHPAD>` is the concrete path the
> orchestrator resolved in Phase 0 (see `SKILL.md`'s Phase 0) and gives you verbatim in this
> brief; it is never something you invent or guess yourself.

---

## DEP-<ecosystem> — dependency advisories (one per ecosystem present, or merged)
OWNS: that ecosystem's manifests, lockfiles, version-pin/constraint files, and registry config
(e.g. `.npmrc`, `nuget.config`, `pip.conf`, `settings.xml`, `.cargo/config.toml`).
DOES NOT OWN: application source, app configs, pipeline files, IaC.

1. Confirm the installed toolchain can restore/build the project; if not, record the coverage
   gap and fall back to lockfile parsing + OSV (gotchas #3).
2. Run the ecosystem's native audit command (`ecosystems.md`).
3. Extract EVERY resolved `name@version` from the lockfile — transitives included — and
   cross-check all of them against OSV `querybatch`.
4. Run the positive control and report that it passed (gotchas #4).
5. Audit `overrides` / `resolutions` / central pin files as targets in their own right (gotchas #6).
6. For every hit, walk the dependency path and state whether the fix is REACHABLE (gotchas #7).
7. Maintenance pass via the registry API — staleness, deprecation, yank, archived upstream,
   EOL runtimes — reported SEPARATELY from advisories (gotchas #8).
8. Flag duplicate lockfiles and state which one you scanned (gotchas #13).
9. Check registry configuration: private/proxy registries, scoped registry overrides,
   integrity checking disabled, credentials embedded in registry config or lockfile URLs,
   and dependency-confusion exposure (internal package names resolvable from a public registry).

## APP — application configs & source secrets
OWNS: application config files (environment configs, settings/properties files, `.env*`,
framework config), application source trees, test fixtures, seed/sample data.
DOES NOT OWN: pipeline files, deploy scripts, container definitions, IaC.

- Hardcoded credentials: connection strings, API keys, signing/encryption keys, passwords,
  service-account keys, private keys, webhook and bearer tokens.
- Credentials in test fixtures, seeders, sample data, and committed local-dev config.
- Default or development credentials left enabled in a non-dev config.
- **Client-exposed build-time env vars** — any framework public prefix (gotchas #11).
- Insecure settings: TLS/certificate validation disabled, permissive CORS (`*` with
  credentials), debug/verbose error pages enabled, directory listing, unsafe deserialization
  switches, weak crypto (ECB, MD5/SHA1 for secrets, hardcoded IV/salt), missing security headers.
- AuthN/AuthZ: unauthenticated endpoints that mutate state, missing authorization checks,
  long-lived or non-expiring tokens, secrets used as both signing key and API key.
- Injection surface: string-concatenated queries/commands, unvalidated redirects, SSRF-prone
  fetches, path traversal in file handling.
- Report the config controls that PASSED — secret manager references in use, env-var
  indirection, secrets excluded from version control, parameterized queries throughout.

## CICD — pipelines, build and container security
OWNS: pipeline definitions for any provider — GitHub Actions (`.github/workflows/`),
GitLab CI (`.gitlab-ci.yml`), Jenkins (`Jenkinsfile`), CircleCI (`.circleci/`),
Azure DevOps (`azure-pipelines*.yml`), Bitbucket, Drone, Buildkite — plus deploy scripts,
`Dockerfile*`, `docker-compose*.yml`, `.dockerignore`, build scripts and release automation.
DOES NOT OWN: IaC templates (IAC owns those), application configs (APP owns those).

Credentials and identity
- Static long-lived cloud credentials stored as pipeline secrets, where short-lived **OIDC
  federation / workload identity** is available. Recommend the federation path explicitly.
- Hardcoded credentials in pipeline files, deploy scripts, or committed runner config.
- Secrets exported to the environment of untrusted steps, or echoed/printed.
- Over-broad default token permissions — grant least privilege per job, not repo-wide defaults.

Supply-chain integrity
- Unpinned third-party build steps: actions/orbs/plugins/images referenced by mutable tag or
  branch instead of an immutable digest or commit SHA.
- Untrusted-input-to-shell injection: interpolating PR titles, branch names, issue bodies or
  any attacker-controllable field directly into a shell command.
- Workflows that run with elevated privileges on untrusted contributions (fork PRs, forked
  branch triggers) and can be reached by an outside contributor.
- Install steps that bypass lockfile integrity (non-`ci`/non-frozen installs, disabled
  integrity/checksum verification, `--force`, curl-pipe-to-shell bootstrapping).
- Self-hosted/persistent runners: state reuse between jobs, network reach into private
  networks, no ephemeral isolation.
- Missing artifact signing/attestation where the pipeline publishes packages or images.

Container build
- Secrets in `ARG`/`ENV` or in any intermediate layer — they persist in image history even if
  a later layer deletes them. Use build secrets/mounts instead.
- Build-time public env vars baked into client bundles (gotchas #11) — coordinate with APP;
  CICD owns the pipeline side, APP owns the source side.
- Containers running as root; no `USER` directive; unnecessary capabilities or privileged mode.
- Mutable base image tags (`latest`, floating majors) instead of a pinned digest.
- Missing/inadequate `.dockerignore` letting `.env`, credentials, or version history into the
  build context.

## IAC — infrastructure-as-code & cloud posture
OWNS: Terraform (`*.tf`, `*.tfvars`, state files), CloudFormation templates, Pulumi programs,
CDK source, ARM/Bicep, Kubernetes manifests, Helm charts (`values*.yaml`), Kustomize overlays,
Ansible playbooks, and `**/infrastructure/` trees. `docker-compose*.yml` is shared with CICD —
CICD reads it for build/secret issues, IAC for runtime posture; state which one you covered.
DOES NOT OWN: pipeline definitions, application configs.

Both axes — secrets AND posture. Cloud-agnostic categories:
- **Over-broad IAM / RBAC** — wildcard actions or resources, unbounded role assumption or
  impersonation, cluster-admin bindings, default service accounts with elevated rights,
  long-lived static access keys where a workload identity exists.
- **Unrestricted network exposure** — ingress from any address, especially to admin and
  database ports; **and egress** left fully open (exfiltration path); management planes,
  dashboards, metadata endpoints or object stores reachable publicly.
- **Missing encryption at rest** — storage, databases, disks, snapshots, backups, queues,
  logs; customer-managed key requirements unmet.
- **Missing encryption in transit** — plaintext listeners, TLS not enforced/redirected,
  outdated TLS versions or weak cipher policy, unverified internal traffic.
- **Disabled audit logging / monitoring** — control-plane audit trail off, flow logs off,
  access logs off, no log retention, no alerting on privileged actions.
- **Privileged or root containers** in workload manifests; missing security context,
  writable root filesystem, hostPath/hostNetwork/hostPID, missing resource limits,
  no network policy (default-allow east-west traffic).
- **Secrets passed as environment variables or plaintext manifest values** instead of a
  managed secret store / sealed secret / external secret reference.
- **Mutable image tags** in workload specs; no digest pinning; no image provenance check.
- **Data protection gaps** — versioning/soft-delete off, no backups, deletion protection off,
  public snapshot or image sharing.
- **State and variable files** — committed state (contains secrets in plaintext), `*.tfvars`
  with real credentials, plaintext outputs exposing secret values, unencrypted remote state.

## SWEEP — repo-wide regex & entropy catch-all (always run)
OWNS: everything no other agent claimed — migration and SQL scripts, documentation, READMEs,
notebooks, shell/utility scripts, archives and backup files, `.gitignore`/ignore files, and any
committed prior-assessment evidence. Re-verifies nothing another agent already owns.

1. Provider-agnostic and provider-specific patterns: long-lived cloud access key ids, personal
   access tokens (`ghp_`, `glpat-`, `xox[baprs]-`, `sk-`, `AIza…`), private key headers
   (`-----BEGIN … PRIVATE KEY-----`), JWTs (`eyJ…`), database connection URIs with embedded
   credentials, basic-auth URLs, SSH keys, `.pem`/`.pfx`/`.jks`/`.keystore` files, and
   long numeric account/tenant identifiers.
2. Generic high-entropy strings (≥ 20 chars) in assignment or config positions.
3. Ignore-file adequacy: are secrets, key material, local env files, state files and build
   output actually excluded from version control?
4. Committed prior security-assessment evidence (gotchas #12).
   **Exception:** a file named exactly `credentials` (no extension) at the project root is this
   skill's own scan-input convention (gotcha #15), not a finding — exclude it here, but confirm
   with the user first if you're not already aware they created it for this purpose.
5. History: is a version-control directory present? If not, state that history scanning is
   impossible and recommend a history scan against origin; note that rotation, not deletion,
   is the fix (gotchas #10).
6. Complement the regex pass with a secret-scanning tool (`api-recipes.md` §6).

MANDATORY: apply the false-positive filters in gotchas #5, then hand-verify every survivor, and
report the raw-hits → triaged-findings funnel with the reduction reasons.

---

# Extended deep-dive briefs (coverage-gap tier)

The A1–A6 / DEP·APP·CICD·IAC·SWEEP set is the static baseline. When the target is
higher-value (money- or data-moving, multi-tenant, regulated) OR the user asks for a
"complete / deep" review, add the deep-dive agents below. They map to
`coverage-checklist.md`; each still obeys the shared preamble (redact, `file:line`,
CONFIRMED vs PLAUSIBLE, report PASSES, no report-writing, scratchpad for raw data).
Business-logic and runtime items often can't be fully proven statically — mark each finding
**CONFIRMED-in-code** (the check is demonstrably absent) or **NEEDS-DYNAMIC** (suspicious,
needs runtime), and never assert an exploit the source doesn't establish. Spawn only the
dimensions Phase 0 found evidence for (no upload agent if there is no upload path).

## AUTH — authentication & session deep-dive
OWNS: the auth/session config — token issuance and validation, sign-in/MFA/reset flows,
CORS, rate limiting.
DOES NOT OWN: per-endpoint/per-role function access once a session is established (BIZLOGIC),
client-side storage of the resulting token (CLIENT), and the secrets/connection-string surface
APP already covers — AUTH reasons about the auth *mechanism's* correctness, not where its keys
are stored.
TASKS: is there an algorithm allowlist on token validation (its ABSENCE
permits algorithm confusion)? Do multiple auth schemes share one signing key, or mix a
symmetric (HMAC) key with an asymmetric (RSA/EC) path (classic RS→HS confusion)? Validation
flags — issuer/audience/lifetime/signing-key/https-metadata/`alg:none`/verbose token errors.
Is a symmetric secret derived from a committed/predictable config value (e.g. a secret-store
*path string* used directly as the key)? Refresh-token rotation/reuse, logout/revocation,
session fixation, lockout/brute-force, password policy, MFA enrollment & recovery. CORS with
wildcard-subdomain + credentials. Rate limiting backed by per-instance memory (bypassable
across horizontally-scaled instances). Report each with `file:line`; say SAFE where it is.

## UPLOAD — file-upload, XML (XXE) & SSRF trust boundary
OWNS: upload endpoints, file-type/signature validation, storage-key construction, every XML
parse sink, and server-side outbound fetches.
DOES NOT OWN: general injection surface unrelated to a file/XML/fetch sink (APP), and the
dependency version of the parsing/upload library itself (DEP-<eco> — UPLOAD checks how it's
*configured and called*, not whether a newer version exists).
TASKS: magic-byte checks that use a `contains`
test (payload can sit anywhere → polyglot bypass); whole-file buffering (zip-bomb/DoS); no
AV/malware scan; storage keys built from request/DB fields (path traversal into another
tenant's prefix). XXE: every XML parser — is DTD/entity resolution disabled (resolver null /
DTD prohibited)? SSRF: server-side HTTP fetches to config/tenant-controlled URLs (payment,
ERP, AI, webhook, asset), whether the URL is attacker-influenced and whether the *response*
is content-negotiation-deserialized (trusting a vendor-controlled reply); egress allowlist?
Insecure deserialization: unsafe polymorphic type handling / legacy binary formatters —
report SAFE explicitly if none (a credibility-building negative).

## BIZLOGIC — business-logic abuse & authorization matrix (BFLA)
OWNS: the core value flow (for payments: approval/maker-checker, amount handling, posting)
and function-level access across roles and API versions.
DOES NOT OWN: the authentication mechanism itself (AUTH owns token/session correctness; BIZLOGIC
assumes a valid session and asks what it's then allowed to do), and upload/XML/SSRF trust
boundaries (UPLOAD).
TASKS: can one actor both submit and
approve (self-approval)? Is the next approver derived from server state or from request input?
Can approval stages be skipped by calling a later-stage endpoint directly? Is the caller
verified as the designated actor for THIS item's current state? Amount/quantity tampering —
taken from the request without sign/range/precision validation, or re-validated server-side?
Duplicate/replay (no idempotency key or state guard); check-then-act / TOCTOU on balance or
state checks (cite the non-atomic pattern; mark NEEDS-DYNAMIC). BFLA: enumerate access per
role, and test every action on an OLDER API version against its newer twin (the old one often
lacks a check the new one added); list any action with no authorization attribute. Any
impersonation / proxy-user / act-as path — is it an intended admin feature or an abusable
cross-tenant/escalation path? Evidence with `file:line`.

## CLIENT — client-side / browser trust boundary
OWNS: DOM-rendering sinks (`dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `v-html`),
`postMessage` listeners, frame/embed policy, CDN-loaded third-party scripts and their integrity,
client-side storage of tokens/secrets, and reachable prototype-pollution sinks in bundled
dependencies.
DOES NOT OWN: server-set header *configuration* (APP owns the header policy; CLIENT owns what the
browser actually does with the response and what runs client-side) and the version of any bundled
library with a known pollution advisory (DEP-<eco> owns the version/advisory; CLIENT owns whether
it's actually reachable with attacker-influenced input).
TASKS:
1. Every `dangerouslySetInnerHTML`/`innerHTML`/`v-html`/`document.write` sink: is the value
   passed through a maintained sanitizer (DOMPurify or equivalent) immediately before the sink,
   or passed through server-sourced data unsanitized? A sibling component that sanitizes the same
   field is strong evidence the unsanitized one is a gap, not a deliberate design choice.
2. `window.addEventListener('message', ...)` handlers: is `event.origin` validated against an
   allow-list before the payload is trusted/acted on? An unchecked origin lets any embedding page
   post arbitrary data/commands into the handler.
3. Framing: is there a `X-Frame-Options`/CSP `frame-ancestors` set (server-side, but the CLIENT
   agent notes the practical clickjacking consequence — e.g. a payment/approval action framed by
   an attacker page), and does any anti-framing JS (frame-busting script) exist as a weaker
   fallback?
4. Auth/session tokens (access token, refresh token, API key) in `localStorage`/`sessionStorage`:
   flag as MEDIUM+ (any script-injectable path, including a stored-XSS finding elsewhere in the
   report, becomes a token-theft path) and recommend httpOnly/Secure/SameSite cookies instead.
5. Third-party script/CDN inclusion without Subresource Integrity (`integrity=`/`crossorigin`) —
   a compromised or MITM'd CDN asset executes with the page's full privileges.
6. Prototype-pollution reachability: is a vulnerable version of a pollution-prone library
   (`lodash`, `immutable`, older jQuery, etc. — cross-reference the `DEP-*` findings) actually
   reached with attacker-influenced keys (e.g. merging a request body into an object with a
   vulnerable deep-merge)? Mark CONFIRMED only if a reachable call site exists, else NEEDS-DYNAMIC.
7. Report SAFE explicitly for sinks that already sanitize correctly — this asymmetry (some
   renderers sanitize, others don't) is itself useful evidence for a stored-XSS finding elsewhere.

## DISCOVERY — authorized live-target attack-surface mapping
Distinct from both DAST-PASSIVE and ACTIVE-VALIDATION: this dimension does not test anything —
it maps what exists, so ACTIVE-VALIDATION has a ranked target list instead of guessed endpoints.
Only run this when (a) the target host and authorization are verified from the repo's own
config or the user's explicit instruction naming that host as their own environment, and (b)
working test credentials for that environment are available — same authorization-verification
rule as ACTIVE-VALIDATION, never assume. Always run DISCOVERY before ACTIVE-VALIDATION when
both are in scope; you cannot target-test what you haven't mapped.
OWNS: building an attack-surface/endpoint inventory for the authorized live target.
DOES NOT OWN: anything in the static repo (APP/CLIENT's territory), and any state-changing or
payload-based request against the live target (ACTIVE-VALIDATION's territory) — DISCOVERY only
ever maps, never tests.
Method:
- Prefer a headless-browser session (Playwright/Puppeteer) over manual curl-guessing.
- One authorized login with the supplied test account.
- Click through each main nav destination once, read-only only — no form submissions that
  create, edit, delete, approve, or send anything. If a destination requires a state-changing
  step to even view it, skip that step and note the gap; do not perform it.
- Capture every XHR/fetch fired: method, path normalized (replace ID-shaped path segments and
  body field values with a placeholder — never record real IDs or values), and body field
  *names* only, never field values.
- Dedupe into an endpoint inventory (method + normalized path).
- Cross-reference with JS-bundle-embedded `/api/` path literals (grep the loaded bundles) to
  surface routes that exist in code but weren't exercised live during the click-through; label
  these "seen in bundle only, not exercised live."
Output: a ranked candidate list, each endpoint mapped to the OWASP Top 10 category it most
likely matters for:
- **A01 IDOR/BFLA candidates** — has an ID-like path or body parameter (numeric id, UUID,
  slug-that-looks-like-a-key).
- **A03 Injection candidates** — search/filter/report/export-shaped endpoints (free-text query,
  sort/filter params, report generation).
- **A07 Auth candidates** — login/password/session/token/MFA endpoints.
- Any endpoint that doesn't fit a category cleanly: note it plainly rather than forcing a fit.
Hard rules:
- Read-only navigation only in this phase. Any state-changing action, including minimal
  non-bulk test-data creation, needs ACTIVE-VALIDATION's own separate, explicit authorization
  (gotcha #18) — DISCOVERY never creates, edits, deletes, approves, or sends anything, full stop.
- No fuzzing, no looping, no brute-forcing nav paths or parameters.
- Redact every captured token/cookie/credential on write, including in scratch files, per the
  one canonical format in gotcha #9 (first 4 + last 2 characters only) — never the raw value.
- Small time budget (~15 minutes). If a section isn't reached or the browser session fails to
  launch, state that as a coverage limitation and move on — do not retry-loop trying to force
  full coverage.
Report: the deduped endpoint inventory, the OWASP-ranked candidate list, the bundle-only routes,
and coverage limitations (sections not reached, launch failures, login failures).

## DAST-PASSIVE — passive runtime recon against an authorized live target
OWNS: what a single authorized login against the live target passively reveals — response headers,
TLS, served bundles, browser-visible storage and globals. Same authorization-verification rule as
DISCOVERY/ACTIVE-VALIDATION: verify host + authorization before starting, never assume.
DOES NOT OWN: sending any request designed to exercise or prove a specific vulnerability
(ACTIVE-VALIDATION's territory) and building the endpoint inventory itself (DISCOVERY's territory)
— DAST-PASSIVE only observes what ordinary, unmodified use of the app already exposes.
Preferred tooling: when a headless-browser tool is available (Playwright/Puppeteer), prefer a
scripted browser session over raw `curl` for runtime recon — it captures materially more than
headers/HTML: `localStorage`/`sessionStorage` (classify each value: JWT / JSON / opaque-long /
short; secret-pattern-scan every one), cookie flags (`httpOnly`/`secure`/`sameSite` per cookie),
`window` globals matching `config|token|auth|user|env|key|secret|jwt|bearer`, every loaded JS
bundle (secret-pattern-scanned, checked for an exposed `sourceMappingURL`), and nav links for a
lightweight sitemap — all from ONE login. This is a single authorized login (using credentials the
user supplied for this purpose), not a loop, and stays fully within gotchas #15–17's
non-destructive/passive-first rules. Mask every secret on write, including in scratch files, per
the one canonical redaction format in gotcha #9 (first 4 + last 2 characters only) — never the raw
value. If no headless-browser tool is available, fall back to `curl` for the GET/HEAD-only subset
(headers, HTML, one bundle fetch) and state the coverage gap (storage/cookies/window-globals
were not captured).

## ACTIVE-VALIDATION — authorized, non-destructive live proof-of-concept
Distinct from DAST-PASSIVE below: this dimension SENDS requests that exercise a specific
suspected vulnerability, using fixed/deterministic payloads, to convert a static finding into a
LIVE-VALIDATED one. Only run this when (a) the target host and authorization are verified from
the repo's own config or the user's explicit instruction naming that host as their own
environment, and (b) gotchas #15's passive-first and non-destructive rules are followed exactly.

This brief is the LIGHTWEIGHT pattern: a handful of fixed-payload requests upgrading one or two
specific static findings. When the ask is instead comprehensive DAST coverage across the entire
API surface (hundreds of endpoints, not a handful) AND a swagger/OpenAPI doc, Postman collection,
or equivalent machine-readable API surface description is available, use the heavier pattern in
`references/active-dast-methodology.md` instead — it's a standalone script built once and run
repeatedly, not an inline agent task. Same authorization/non-destructive rules underneath either way.
OWNS: nothing in the repo — it owns a short list of live HTTP requests against the already-
verified target, each mapped to one specific static finding it is trying to upgrade to LIVE.
Never invent new attack surface live; only confirm what static analysis already found.
Safe, repeatable patterns (use these as templates, adapt payload to the actual finding):
- **Anonymous-reachability check** — call the suspected-unauthenticated endpoint with a
  throwaway/nonexistent identifier (a made-up email/username that cannot belong to a real
  account) and confirm it is processed (e.g. reaches business logic and 500s on a null lookup)
  rather than rejected with 401/403. Proves "no auth required" without touching any real account.
- **Self-targeted secret-disclosure check** — if a suspected finding is "endpoint returns a
  secret/token/passcode it shouldn't," trigger the flow ONLY against a test account the assessor
  or user owns/controls, and confirm the response body; never target a real user's account.
- **Error-based injection differential** — for a suspected injection sink, send one benign value
  and one payload that is syntactically invalid only if it reaches an interpreter unescaped (e.g.
  a single quote for SQL, `${7*7}` for template injection) and compare responses: a stable 200 for
  benign input plus a syntax-error 500 (or a rendered `49`) for the payload is proof of injection
  with zero data read or written. Never use a payload that reads, modifies, or exfiltrates data.
- **Passive corrections to static claims** — while doing the above, also capture response
  headers/cookies/served bundle from the same requests (no extra calls) and use them to correct
  any static over/under-statement (e.g. a static "no WAF" finding refuted by an `x-cdn: Imperva`
  header seen on the live response) — say explicitly that the live check corrected the static one.
Hard rules (restated from gotchas #15 and #18 — violating any of these means DECLINE and fall back
to source-only confirmation, not a workaround):
- Only `GET` and a verified non-mutating search/filter/report-style `POST` are ever sent; every
  other write verb (`POST`/`PUT`/`PATCH`/`DELETE` that creates, edits, deletes, approves, sends,
  or transfers anything) gets zero live invocation under this brief, full stop.
- A handful of fixed, deterministic payloads only — no loops, no fuzzing, no brute-forcing
  parameters or identifiers.
- Every identifier used is either the assessor's/user's own test account's real data, or an
  explicitly-invented throwaway value that cannot belong to a real account — never a guessed or
  scraped real user's identifier.
- By default this dimension creates nothing. Minimal, disposable test-data creation is only ever
  in scope under gotcha #18's own explicit-authorization rule, logged in the report's test-data
  disclosure list — never assume it's permitted because the target is "clearly a test
  environment."
- If the harness itself refuses a request as a third-party attack, treat that as correct, not an
  obstacle — do not retry, re-encode, or route around it; fall back to source-only confirmation
  and hand the user the exact command to run themselves if they want to proceed.
Report each attempt as its own line: request sent (redact secrets), response observed, and
which finding ID it upgrades to LIVE-VALIDATED (or which static claim it corrected).

## DATA — data protection & lifecycle (static review, not a runtime audit)
Spawn when regulated/PII data is handled, or the user asks for a data-protection/compliance-
flavored review. This is a **static read of config and code**, not a runtime verification that a
cloud provider's encryption/rotation settings are actually in effect — say so explicitly in
coverage limitations; that gap is IAC's "encryption at rest" posture check applied to live state,
which this dimension does not perform.
OWNS: datastore connection/config (encryption-in-transit settings, TLS enforcement to DB/cache/
queue), key-rotation configuration as declared in code/IaC (not verified live), PII inventory in
schemas/models/DTOs, data-retention logic, and logging statements that may over-capture sensitive
payloads.
DOES NOT OWN: whether a cloud resource's encryption-at-rest setting is actually enabled right now
(IAC owns the declared posture in templates; neither dimension confirms live cloud state without
an authorized live check), and the secrets/credentials surface itself (APP/SWEEP own hardcoded
credentials; DATA owns what's done with the data those credentials protect).
TASKS:
1. **Encryption in transit to datastores** — is the DB/cache/queue connection string or client
   configured to require TLS (`sslmode=require`, `Encrypt=true`, equivalent), or does it silently
   accept plaintext? Report SAFE explicitly where TLS is enforced.
2. **Encryption at rest, as declared** — does IaC/config explicitly request encryption (KMS key,
   `StorageEncrypted: true`, equivalent) for datastores this codebase provisions or connects to?
   Cross-reference IAC's own findings rather than re-deriving them; DATA's job is to also check any
   datastore config that lives in application code/config rather than IaC.
3. **Key rotation lifecycle** — is a rotation period configured (vs. a static key created once and
   never rotated)? State as CONFIRMED-in-code (a rotation policy is declared) or NEEDS-DYNAMIC
   (would need to observe actual rotation events to confirm it runs).
4. **PII inventory** — walk the data models/schemas/DTOs and list which fields hold personal data
   (name, email, phone, address, government ID, payment data, health data, precise location,
   biometric). This is descriptive, not a finding by itself — it's the input the Secrets and
   Business-Impact write-ups elsewhere in the report should reference when a finding exposes one
   of these fields, so impact statements can say "exposes name, email and payment data" rather
   than "exposes a record."
5. **Retention** — is there any code-level deletion/anonymization/TTL logic for PII, or does data
   persist indefinitely with no retention policy anywhere in the codebase? State plainly when no
   retention logic exists at all — that is itself the finding, not a silent gap.
6. **Secrets/PII in logs** — grep logging statements (not just explicit secret assignments) for
   full request/response body logging, verbose exception logging that could capture a password/
   token field in transit, and any sensitive-payload-to-webhook pattern (a full user object posted
   to a chat/monitoring webhook). This overlaps gotcha #9's redaction concern but is about the
   APPLICATION's own logging practice, not this skill's scan output.
Report SAFE explicitly for each task with no finding — a DATA dimension that only ever reports
findings is exactly the shallow-pass risk this brief exists to prevent; a credible DATA section
states what was checked and came back clean as plainly as what didn't.
(DAST-PASSIVE's own brief, covering the live-target GET/HEAD-only recon this section's name
might suggest, is grouped earlier alongside DISCOVERY and ACTIVE-VALIDATION, since all three
target the same authorized live environment.)
