---
name: security-scan
description: Runs an adaptive parallel multi-agent security assessment of any codebase and consolidates it into a severity-ranked, verifiable report. Use when asked for a dependency audit, outdated or EOL package check, CVE/vulnerability scan, secrets or hardcoded-credentials scan, infrastructure/IaC review, CI/CD or supply-chain security review, an SBOM, or any "is this repo secure" / security report request.
---

# Parallel Security Assessment

Independent scan dimensions run as concurrent subagents, then the orchestrator consolidates
them into one report. Language- and cloud-agnostic: Phase 0 recon decides which dimensions
exist in this repo, and only those are launched.

Two rules that hold for the whole workflow:
- **Agents find; the orchestrator reports.** Never hand back raw agent dumps.
- **A falsely clean result is worse than a gap.** Every phase has a check for this.

References (read as needed, not all upfront):
- `references/gotchas.md` — the ways a scan silently produces a wrong answer. **Read before Phase 1.**
- `references/ecosystems.md` — manifest → OSV id → native audit command → registry API, per ecosystem.
- `references/api-recipes.md` — verified OSV / registry / SBOM / secret-tool request shapes.
- `references/agent-briefs.md` — scope boundaries and task lists per dimension (baseline **and**
  the extended deep-dive tier: AUTH, UPLOAD, BIZLOGIC, CLIENT, DATA, DISCOVERY, ACTIVE-VALIDATION,
  DAST-PASSIVE).
- `references/active-dast-methodology.md` — comprehensive full-API-coverage authenticated DAST
  script pattern; reach for this instead of the lightweight ACTIVE-VALIDATION brief when the ask is
  full DAST coverage across an entire API and a swagger/OpenAPI/Postman surface description exists.
- `references/coverage-checklist.md` — the dimensions a COMPLETE review covers; use it to decide
  the extended tier and to write an honest scope-&-limitations statement.
- `references/report-format.md` — finding IDs, severity, OWASP map, confidence scoring.
- `references/report-rendering.md` — how to render a comprehensive report as a self-contained HTML file and PDF: design system, file layout, PDF generation mechanics.

---

## Phase 0 — Recon (orchestrator, always first)

Fast, and it determines the fan-out. Quote every glob (gotchas #1).

```bash
# Dependency manifests across all ecosystems
find . -maxdepth 4 \( -name "package.json" -o -name "*.csproj" -o -name "requirements*.txt" \
  -o -name "pyproject.toml" -o -name "Pipfile" -o -name "go.mod" -o -name "pom.xml" \
  -o -name "build.gradle*" -o -name "Gemfile" -o -name "composer.json" -o -name "Cargo.toml" \) \
  -not -path "*/node_modules/*" -not -path "*/vendor/*"

# Lockfiles + duplicate-lockfile drift (gotchas #13)
find . -maxdepth 3 \( -name "*.lock" -o -name "*-lock.json" -o -name "*.lockfile" \
  -o -name "packages.lock.json" -o -name "go.sum" \) -not -path "*/node_modules/*"

# CI/CD surface — any provider
ls -d .github/workflows .gitlab-ci.yml Jenkinsfile .circleci azure-pipelines.yml \
      bitbucket-pipelines.yml deployment scripts 2>/dev/null

# IaC / container surface
find . -maxdepth 4 \( -name "*.tf" -o -name "*.tfvars" -o -name "Dockerfile*" \
  -o -name "docker-compose*.yml" -o -name "Chart.yaml" -o -name "values*.yaml" \
  -o -name "*template*.yaml" -o -name "*.bicep" -o -path "*infrastructure*" -o -path "*k8s*" \) \
  -not -path "*/node_modules/*"

# Toolchain INSTALLED vs what the projects TARGET (gotchas #3)
node --version; npm --version; dotnet --version; python3 --version; go version; java -version
grep -rn "<TargetFramework\|^go \|requires-python\|rust-version\|<maven.compiler" \
  --include="*.csproj" --include="go.mod" --include="pyproject.toml" --include="pom.xml" . 2>/dev/null

# Live-target scan input (gotcha #15) — a user-supplied `credentials` file at the project root,
# if present, is the source of truth for DISCOVERY/ACTIVE-VALIDATION/DAST target+login. Read it
# now, not later — don't make DISCOVERY go looking for a target by other means when this already
# states one. Never write this file up as a secrets finding (see the SWEEP brief's exception).
ls credentials 2>/dev/null && echo "credentials file found — read it now for target URL + login"

# History available? (gotchas #10)
ls -d .git 2>/dev/null || echo "NO version history — history scan impossible; note as limitation"
```

Record: ecosystems present, infra/CI providers present, toolchain mismatches, duplicate
lockfiles, whether history exists, and repo size.

**Resolve `<SCRATCHPAD>` now, once, and pass the literal path to every agent brief** — it is never
a placeholder agents invent themselves. Use, in this order: (1) the session's own scratch/temp
directory convention if the harness provides one (a per-session scratch path outside the target
project); (2) failing that, a dedicated, clearly-named directory under the target project itself
that is NOT already tracked and gets a `.gitignore` entry added for it before any agent writes
there, e.g. `<project-root>/.security-scan-scratch/` — never write scratch data into an existing
tracked directory, and never reuse `security-assessment/` itself as scratch (that path is the
FINAL deliverable location per `report-rendering.md`, kept separate so a half-finished run never
looks like a published report). State the resolved path in the report's Scope & Method section.

### Scoping the fan-out
Spawn a dimension only when Phase 0 found evidence for it. Do not spawn no-op agents, and do
not report a score for a dimension that does not exist here.

| Dimension | Spawn when | Notes |
|---|---|---|
| `DEP-<ecosystem>` | a manifest for that ecosystem exists | **one agent per ecosystem**; merge ecosystems that have only one small manifest each |
| `APP` | application source or config files exist | always, in practice |
| `CICD` | any pipeline definition, deploy script, or container build file exists | one agent covers all providers present |
| `IAC` | IaC templates, k8s/Helm manifests, or an infrastructure tree exist | skip entirely when absent |
| `SWEEP` | always | the catch-all; also owns history/ignore-file/evidence checks |

**Extended deep-dive tier (coverage-gap):** add these when the target is higher-value
(money-/data-moving, multi-tenant, regulated) OR the user asks for a "complete/deep" review.
Briefs are in `references/agent-briefs.md`; the full dimension list is in `references/coverage-checklist.md`.

| Dimension | Spawn when | Finds |
|---|---|---|
| `AUTH` | any auth/session/JWT config | alg-confusion, missing algorithm allowlist, issuer/audience off, CORS wildcard+credentials, per-instance/fail-open rate limiting, session/refresh flaws |
| `UPLOAD` | any file-upload, XML parse, or server-side fetch | signature-bypass, zip-bomb, path traversal, **XXE**, **SSRF** via config/tenant-controlled URLs, insecure deserialization |
| `BIZLOGIC` | a core value flow (payments, orders, approvals) and/or two API versions | business-logic abuse (self-approval, step-skip, amount tampering, replay, TOCTOU), **BFLA** across roles and v1/v2, impersonation/proxy-user abuse |
| `CLIENT` | a browser/SPA frontend exists | DOM-XSS sinks, `postMessage` origin checks, clickjacking, SRI, prototype-pollution reachability, token-in-storage theft surface |
| `DATA` | regulated/PII data is handled | static read of data-protection config & code — encryption/rotation as *declared*, PII inventory, retention, logging over-capture; see `agent-briefs.md` |
| `DAST-PASSIVE` | an authorized live target | passive GET/HEAD-only recon (headers, storage, bundles); see `agent-briefs.md` |
| `DISCOVERY` | a live, authorized target is confirmed (host + authorization verifiable from repo config or explicit user instruction) AND working test credentials for that environment are available | builds a ranked attack-surface/endpoint inventory (read-only click-through + JS-bundle grep) ranked by likely OWASP Top 10 category (IDOR/BFLA, injection, auth); see `agent-briefs.md`. Run before `ACTIVE-VALIDATION` whenever both are in scope. |
| `ACTIVE-VALIDATION` | a live, authorized target is confirmed (host + authorization verifiable from repo config or explicit user instruction) AND at least one static finding is a good candidate for a fixed-payload, non-destructive live proof, AND ideally after a DISCOVERY pass has produced a ranked candidate list, when one is in scope | upgrades specific findings from CONFIRMED-in-code to LIVE-VALIDATED; see `agent-briefs.md` and gotchas #15–17. Never spawn this speculatively — it targets specific findings from the other agents, so run it after (or interleaved late in) Phase 1, not as a first-wave dimension. |

Mark extended findings **CONFIRMED-in-code** or **NEEDS-DYNAMIC** — never assert an exploit the
source doesn't establish. Whatever is not run becomes an explicit scope-limitation line. When
both are in scope, run `DISCOVERY` before `ACTIVE-VALIDATION`: active validation should target
the specific endpoints the discovery pass ranked as high-value, not guessed ones.

Sizing: aim for 4–8 agents in the baseline tier; the extended tier is additive when scoped. Below 3, run sequentially — the fan-out overhead is not worth it.
Above 8, merge the smallest dimensions rather than splitting further. For a very large
ecosystem (a large monorepo workspace set), split `DEP-<eco>` by workspace instead of by task.

Shared files need one owner: `docker-compose*.yml` goes to `CICD` for build/secret concerns and
`IAC` for runtime posture — state which agent covered which axis. Everything else follows the
OWNS / DOES NOT OWN lists in `references/agent-briefs.md`.

---

## Phase 1 — Parallel agents

Launch every selected agent **in a single message** so they run concurrently. Give each the
shared preamble plus its OWNS / DOES NOT OWN boundary verbatim from `references/agent-briefs.md` —
non-overlapping ownership is what keeps the fan-out from duplicating work.

Dimension summary (full task lists in the briefs file):
- **DEP-<eco>** — native audit command for the ecosystem + OSV cross-check of every resolved
  `name@version` in the lockfile; audit override/pin blocks; fix-reachability; maintenance axis;
  registry config and dependency-confusion exposure.
- **APP** — config and source secrets, insecure settings, authn/authz gaps, injection surface,
  client-exposed build-time env vars.
- **CICD** — pipeline credentials and identity federation, token permissions, untrusted-input
  injection, unpinned build steps, lockfile integrity, secrets in image layers, container build posture.
- **IAC** — secrets in templates AND cloud posture: over-broad IAM/RBAC, unrestricted ingress
  and egress, encryption at rest/in transit, audit logging, privileged containers, mutable image
  tags, secrets as env vars instead of a secret store.
- **SWEEP** — repo-wide regex/entropy catch-all with documented false-positive filtering,
  ignore-file adequacy, history availability, committed prior-assessment evidence.

Every brief carries: quote globs, redact secrets, `file:line` on every finding, CONFIRMED vs
PLAUSIBLE, report PASSES as well as failures, write raw data to the scratchpad, do not write a report.

### Adversarial verification pass (do this for a comprehensive/deep-dive review, or on request)
A finding agent grading its own work is a weaker check than a second agent whose only job is to
disprove it. For a deep-dive review (extended tier spawned, or the user asks for a "thorough" /
"complete" assessment), run static review as two waves instead of one:
1. **Candidate wave** — each dimension agent returns candidate findings as usual, each with a
   self-assessed confidence 1–10.
2. **Verify wave** — spawn one lightweight verifier agent per candidate (or a small batch per
   dimension for cheap ones), prompted to independently re-derive the finding from the cited
   `file:line` and argue for why it might NOT hold (wrong line, control exists elsewhere, not
   actually reachable, confused with a safe sibling). Keep the finding only if it survives at
   confidence ≥ 8/10; otherwise drop it or demote to PLAUSIBLE with the counter-argument recorded.
Report the funnel plainly (e.g. "20 candidates → 14 confirmed at confidence ≥8"), the same way the
regex-sweep raw-hits → triaged funnel is reported (gotchas #5). This roughly doubles agent count for
the static phase, so reserve it for the deep-dive tier or an explicit request, not the default
narrow/baseline run.

### The universal advisory layer
OSV.dev covers every ecosystem, so it works even when no native toolchain is installed.
Run the native tool when the toolchain supports it AND cross-check with OSV — they disagree
in both directions.
```bash
curl -s -X POST https://api.osv.dev/v1/querybatch -H 'Content-Type: application/json' \
  -d '{"queries":[{"package":{"name":"<name>","ecosystem":"npm"},"version":"1.2.3"}]}'
curl -s https://api.osv.dev/v1/vulns/<id>     # severity, fixed range, CVE/GHSA aliases
```
Ecosystem ids: `npm`, `NuGet`, `PyPI`, `Go`, `Maven`, `RubyGems`, `Packagist`, `crates.io`.
Per-ecosystem manifests, audit commands and registry endpoints: `references/ecosystems.md`.

---

## Phase 2 — Consolidate (orchestrator only)

Read the agents' returns and their scratchpad data, then write ONE report. Deduplicate across
agents, reconcile severity disagreements, renumber into the family scheme. Full spec in
`references/report-format.md`:

- Finding IDs by family: **F**=app, **S**=secrets, **I**=infra, **C**=CI/CD, **D**=dependency.
- Rank by severity anchored on real exploitability here, not the advisory's headline score;
  show every adjustment.
- CONFIRMED and PLAUSIBLE in separate subsections.
- Every dependency finding cites an upstream URL — `https://github.com/advisories/GHSA-…` or
  `https://nvd.nist.gov/vuln/detail/CVE-…` — so it is independently verifiable.
- OWASP Top 10:2025 map, including the categories with no findings (verify the current taxonomy
  at `top10.owasp.org/2025`; `D*` and CI supply-chain findings map to A03 Software Supply Chain
  Failures — see report-format.md).
- Confidence: **weighted per-domain mean**, never `100 − (High×5 + Med×3)` — that flat formula
  goes negative past ~20 findings. Weight each domain by relevance; a domain with no assets is
  excluded at weight 0, not awarded 100. Print the formula.
- Mandatory sections: scope & method, coverage & limitations, dedicated **secrets & credential
  exposure** section (`S*`, whenever any exist), dedicated **CI/CD & infrastructure** section
  (`C*`/`I*`, preceded by a "controls already implemented correctly" callout), dependency
  advisories & SBOM (with fix reachability, CVSS, structural-exposure note), maintenance risk
  (separate from advisories), **what was checked and PASSED**, **verified-safe / refuted**
  (specific attack hypotheses chased down and disproven — not the same as "passed", see
  report-format.md), prioritized remediation plan, and a closing **Appendix** (active-validation
  request log, tooling list, standards-references list, report handling & distribution).
  Every finding needs a real Location and a specific Business Impact — no exceptions; state an
  honest process-level location when no single file:line applies. Full specs in report-format.md.
- For a comprehensive/deep-dive review (extended tier spawned, or ≥15 confirmed findings), also
  produce: a **cyberattack exposure & threat assessment** (threat-actor table, numbered attack
  chains across finding IDs, exposure-by-surface, a "what reduces exposure fastest" top-3
  subsection cross-referencing the roadmap's most urgent phase, and its own live-validation-
  corrections table), **quick wins as a ranked table** (#/win/finding/effort/why) with a
  **projected-grade note per remediation phase**, a **remediation-verification retest table**
  (what must now FAIL, per HIGH/CRITICAL), and a **systemic root-cause table** (repeating patterns
  → one class-level control each). Full specs in `references/report-format.md`.
- Close with the **Appendix**'s **report handling & distribution** paragraph whenever the report
  contains live-exploit detail, a credential/key reference, a named customer/environment, or
  internal hostnames — state the intended audience and that a wider audience needs a redacted
  version.

---

## Phase 3 — Self-audit before finishing (mandatory, orchestrator only)

Never declare the report done on the strength of "I wrote all the sections" alone — verify it
programmatically, the same way you'd verify a subagent's claim rather than trust it at face value.
This closing audit is not optional busywork; a report that skips it routinely turns out to have a
silently-empty field, a stale PDF, or a section that exists in outline only.

1. **Section-presence checklist** — for every item in `report-format.md`'s "Required report
   sections" list (and the extended-tier additions when that tier ran), grep the rendered output
   for its actual heading/content, don't eyeball a mental checklist. Build a literal checklist from
   that numbered list and tick each one off against a real search, not memory.
2. **Every finding has every mandatory field** — Location, Status, Impact, Remediation, non-empty,
   for every single finding card. Spot-checking a few is not enough once the finding count is high;
   script the check (e.g. parse each `### <ID>` block and assert all four fields are present and
   non-placeholder) rather than reading through by eye.
3. **Counts are asserted, not eyeballed** — anywhere the report states a total (findings count,
   "N/N endpoints covered," a tier breakdown, a verdict split), independently recompute that number
   from the underlying evidence/scan data and assert equality. A report claiming "286/286 covered"
   is worth nothing if nobody actually counted the 286 to check.
4. **Byte-count-comparison rule compliance** — grep for the patterns `report-format.md` forbids
   ("N bytes" comparisons standing in for real evidence) and manually classify every hit: legitimate
   prose (e.g. quoting a captured `[non-JSON response...]` message, or "byte-for-byte identical"
   describing a string match) is fine; anything still functioning as "X vs Y bytes" as the evidence
   itself must be fixed before finishing, not flagged for later.
5. **No dangling "go look elsewhere" pointers** — if the deliverable is (or might become) a
   standalone file the reader won't have the rest of the project alongside, grep for references to
   external evidence files/paths and confirm each either points at content already inlined in the
   same document or is a legitimate methodology mention (describing how evidence was gathered, not
   telling the reader to fetch more of it themselves).
6. **Rendered output matches source** — if `report.html`/`report.pdf` exist, confirm they were
   regenerated from the current `FINDINGS.md` (per `report-rendering.md`'s regeneration discipline)
   and are non-trivial (file size and page count scale with content — see that file's verification
   section). A stale or empty rendered file is a failed task, not a finished one with a footnote.
7. **Write the audit result down** — a short, explicit statement of what was checked and the
   outcome (gaps found and closed, or confirmed complete) belongs in your final report to the user,
   not just in your own reasoning. If you find a gap during this phase, close it now — don't hand
   back a list of things you noticed but didn't fix.

This phase applies to every report this skill produces, not only the largest ones — scale the
depth of checking to the report's size, but never skip it entirely.

## Adapting scope

A request for one dimension is the common case. Run the narrower version — do not fan out five
agents for a question about one.

| Request | Run |
|---|---|
| "audit my dependencies" / "any CVEs?" | Phase 0 (manifests + toolchain only) → `DEP-<eco>` per ecosystem → consolidate `D*` |
| "any hardcoded secrets?" | Phase 0 (tree + history check) → `APP` + `SWEEP` (+ `CICD` if pipelines exist) → `S*` |
| "review my Terraform / k8s / cloud setup" | Phase 0 (infra surface) → `IAC` alone → `I*` |
| "review my pipeline / supply chain" | Phase 0 (CI surface) → `CICD` alone → `C*` |
| "what's outdated?" | `DEP-<eco>` maintenance axis only — registry freshness, deprecation, EOL; explicitly NOT an advisory scan |
| "generate an SBOM" | Phase 0 → SBOM generation (`api-recipes.md` §5); advisory scan only if also asked |
| single file or single PR | skip the fan-out entirely; scan directly and report inline |

Rules when narrowing:
1. **Always keep Phase 0** for the dimensions in scope — the toolchain and history checks are
   what prevent a falsely clean answer.
2. **Always keep the gotchas** that apply: positive control before declaring clean, false-positive
   filtering, redaction, fix-reachability, old ≠ vulnerable.
3. **Always keep the report skeleton**, scaled down: findings, coverage limitations, what passed.
   Drop the sections that have no in-scope content rather than padding them.
4. **Say what you did not look at.** A secrets-only scan must state that dependencies, IaC and
   pipelines were out of scope, so the result is not read as a whole-repo clean bill of health.
5. Below three agents, run the work sequentially yourself — fan-out overhead exceeds the gain.

---

## Critical gotchas — selected highlights, numbered to match `references/gotchas.md`

Not a sequential 1–18 walkthrough — these are the ones that bite most often, each tagged with its
real number in the reference file so a citation elsewhere (e.g. "gotcha #9") always means the same
thing wherever it's read. Gotchas #13 (duplicate lockfiles) and #14 (report what passed) aren't
excerpted here but apply just as fully — see the full file.

- **#1 Quote every glob** — `grep -r --include="*.ext"`; unquoted globs abort under zsh.
- **#2 Verify an endpoint carries the field before trusting its absence.** APIs return 200 with
  complete-looking data while silently omitting deprecation/advisory fields that live on a
  different endpoint version. Confirm against a record known to have the field.
- **#3 The toolchain must be able to restore/build the project**, or the native audit tool fails
  and transitive dependencies go unscanned. Detect the version mismatch in Phase 0 and declare
  the gap — never let it read as clean.
- **#4 Sanity-check the scanner against known-bad input** before trusting a clean result. An empty
  response from a malformed query is indistinguishable from no vulnerabilities.
- **#5 Regex sweeps are overwhelmingly noise.** Filter vector-graphic coordinate runs, lockfile
  integrity hashes, minified bundles, dependency/build directories and placeholders; hand-verify
  the survivors; report the raw-hits → findings funnel.
- **#6 An override/pin block can itself pin a vulnerable version** — audit the override block,
  not just declared dependencies.
- **#7 Check fix reachability before recommending a bump.** A parent's narrow version pin can make
  the fix unreachable, turning "bump it" into "structural — migrate or replace the parent".
- **#8 Old ≠ vulnerable.** Advisory risk and maintenance risk are separate axes in separate sections.
- **#9 Redact everywhere**, scratch files included: first 4 + last 2 chars; JWTs as decoded claims
  only; account identifiers truncated. This is the one canonical redaction format — every
  reference file uses it, with no dimension-specific variant.
- **#10 No version history = no history scan.** Say so, recommend a history scan against origin,
  and state that **rotation, not deletion**, remediates an exposed credential.
- **#11 Build-time public env vars ship to every client** — `REACT_APP_*`, `NEXT_PUBLIC_*`,
  `VITE_*`, `PUBLIC_*`, `GATSBY_*`, `EXPO_PUBLIC_*`, `NUXT_PUBLIC_*` and equivalents. Perfect
  log masking in CI does not help; the value is in the published bundle. Always flag these.
- **#12 Committed security-assessment evidence** — prior scan output, HAR files and debug dumps
  routinely contain captured live tokens, cookies and credentials.
- **#15 Live/active DAST is passive-first and consent-gated.** Verify the target host and
  authorization from the repo's own config; decline active testing against an unverifiable
  third-party host and validate from source instead. Passive (headers/TLS/bundle) before active;
  active auth/injection probes use throwaway identifiers only, never real accounts or state
  changes. If the harness refuses an active request as a third-party attack, that is correct —
  do not route around it; confirm at source and hand the user the exact command to run.
- **#18 Authorized test-data creation is a separate, narrower exception** from #15 — every live
  dimension creates nothing by default; a minimal, disposable, explicitly-authorized write is the
  exception, not the default posture, and always triggers the report's test-data disclosure list.
  (Full list — 18 gotchas — in `references/gotchas.md`.)

---

## Output style

- Rank by severity; every finding carries a `file:line` reference.
- Separate **CONFIRMED** from **PLAUSIBLE** — never blur them.
- **Explicitly list what was checked and PASSED.** A report of only bad news gives no way to
  distinguish a thorough scan from a shallow one, and no credit for controls already correct.
- State coverage limitations plainly: unscanned transitives, no history, no runtime testing,
  which lockfile was used, dimensions out of scope. A stated gap beats silent under-reporting.
- Be accurate, not alarmist. Never inflate a placeholder into a finding. Never restate an
  advisory's score as this repo's risk without reasoning about reachability and exposure.
  State uncertainty as uncertainty.

## Reporting

The **orchestrator** consolidates — per-agent output is raw material, not the deliverable.
Deduplicate across agents, reconcile severity disagreements, renumber into the family ID scheme,
and cite upstream advisory URLs (GitHub Advisory / NVD) for every dependency finding so the
reader can verify each one independently without rerunning the scan.
