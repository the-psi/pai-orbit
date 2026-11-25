---
mode: agent
description: "[skill] Runs an adaptive parallel multi-agent security assessment of any codebase and consolidates it into a severity-ranked, verifiable…"
tools: ["codebase", "editFiles", "runCommands", "search"]
---


# Parallel Security Assessment

Independent scan dimensions run as concurrent subagents, then the orchestrator consolidates
them into one report. Language- and cloud-agnostic: Phase 0 recon decides which dimensions
exist in this repo, and only those are launched.

Two rules that hold for the whole workflow:
- **Agents find; the orchestrator reports.** Never hand back raw agent dumps.
- **A falsely clean result is worse than a gap.** Every phase has a check for this.

Reads from:
- The whole project, from its root (read-only): source, manifests, lockfiles, CI/CD, IaC, and git history when present
- `.copilot/pai-orbit-config.md` — docs root (`## System Docs`)
- A live target only when gotcha #15's authorization check passes

Writes to: `<docs root>/reports/security-assessment/` (report, evidence, scripts); raw scratch data goes to `<SCRATCHPAD>` only. Resolve the docs root per `reference/docs-path-resolution.md` before writing.

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

# Live-target scan input (gotcha #19) — a `credentials` file at the project root that the user has
# told you they created for this scan is the source of truth for DISCOVERY/ACTIVE-VALIDATION/DAST
# target+login. A `credentials` file the user did not mention is NOT trusted as a target: ask first
# (it may be a genuine leak). Read a confirmed one now, not later — don't make DISCOVERY go looking
# for a target by other means when this already states one. Never write a confirmed scan-input file
# up as a secrets finding (see the SWEEP brief's exception).
ls credentials 2>/dev/null && echo "credentials file found — confirm the user created it for this scan before using it"

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
tracked directory, and never reuse `<docs root>/reports/security-assessment/` itself as scratch (that path is the
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
| `ACTIVE-VALIDATION` | a live, authorized target is confirmed (host + authorization verifiable from repo config or explicit user instruction) AND at least one static finding is a good candidate for a fixed-payload, non-destructive live proof, AND ideally after a DISCOVERY pass has produced a ranked candidate list, when one is in scope | upgrades specific findings from CONFIRMED-in-code to LIVE-VALIDATED; see `agent-briefs.md` and gotchas #15 and #18. Never spawn this speculatively — it targets specific findings from the other agents, so run it after (or interleaved late in) Phase 1, not as a first-wave dimension. |

Mark extended findings **CONFIRMED-in-code** or **NEEDS-DYNAMIC** — never assert an exploit the
source doesn't establish. Whatever is not run becomes an explicit scope-limitation line. When
both are in scope, run `DISCOVERY` before `ACTIVE-VALIDATION`: active validation should target
the specific endpoints the discovery pass ranked as high-value, not guessed ones.

Sizing: aim for 4–8 agents in the baseline tier; the extended tier is additive when scoped. Below 3, run sequentially — the fan-out overhead is not worth it.
Above 8, merge the smallest dimensions rather than splitting further. For a very large
ecosystem (a large monorepo workspace set), split `DEP-<eco>` by workspace instead of by task.
If the tool you are running in cannot launch subagents in parallel, run the same dimensions one
after another yourself; the OWNS / DOES NOT OWN boundaries still apply.

Shared files need one owner: `docker-compose*.yml` goes to `CICD` for build/secret concerns and
`IAC` for runtime posture — state which agent covered which axis. Everything else follows the
OWNS / DOES NOT OWN lists in `references/agent-briefs.md`.


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


## Critical gotchas — selected highlights, numbered to match `references/gotchas.md`

Not a sequential 1–19 walkthrough — these are the ones that bite most often, each tagged with its
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
  authorization from the repo's own config or the user's explicit instruction; a local instance
  the user started counts, and is the preferred first target. Decline active testing against an
  unverifiable third-party host and validate from source instead. Passive (headers/TLS/bundle)
  before active; active auth/injection probes use throwaway identifiers only, never real accounts
  or state changes. If the harness refuses an active request as a third-party attack, that
  refusal is final: do not retry, re-encode, or route around it, and do not hand the user the
  command to run instead — confirm at source and report the block.
- **#18 Authorized test-data creation is a separate, narrower exception** from #15 — every live
  dimension creates nothing by default; a minimal, disposable, explicitly-authorized write is the
  exception, not the default posture, and always triggers the report's test-data disclosure list.
  (Full list — 19 gotchas — in `references/gotchas.md`.)


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

---

## Appendix: docs path resolution

Referenced above as `reference/docs-path-resolution.md` — inlined here since Copilot prompts are flat files with no sibling-file lookup:

# Docs path resolution

Shared by every mode, skill, and agent that reads or writes project docs. Resolve once per session, reuse for every read and write in that session.

## Config

Read `.copilot/pai-orbit-config.md`. If a `## System Docs` section is present, it defines `system_docs_repo` and `system_docs_path` (default `.`).

## Resolve the docs root

- No `## System Docs` section → docs root is local `docs/`.
- `system_docs_repo` is a relative path → check whether `<system_docs_repo>/<system_docs_path>` exists **and** contains at least one of the expected subdirectories (`architecture/`, `decisions/`, `domain/`, `processes/`, `features/`, `plans/`, `wip/`, `backlog/`, `reports/`, `epics/`, `ops/`). A directory that exists but holds none of these is a stale pointer, not a docs root.
  - Passes → docs root is `<system_docs_repo>/<system_docs_path>`.
  - Fails → warn once ("System docs path unreachable — continuing with local docs only") and docs root is local `docs/`.
- `system_docs_repo` is a git URL → same check against a local clone at a resolvable path. Passes → docs root is `<clone-path>/<system_docs_path>`. Fails → warn once and docs root is local `docs/`.

## Reads

Add the resolved docs root to the doc read set before starting the session.

## Writes

Every write targets `<docs root>/<relative path>` — never a hardcoded `docs/…` literal, and never with an extra interpolated `docs/` segment. The docs root already *is* the docs directory, local or remote.

Examples: `<docs root>/backlog/feature-ideas.md`, `<docs root>/features/<feature>/design.md`, `<docs root>/decisions/YYYY-MM-DD-<slug>.md`, `<docs root>/wip/session-capture-<date>.md`.

When `system_docs_path: .` (a docs repo flattened to its root), `<docs root>` is the repo root itself — writes land at `<system_docs_repo>/decisions/…`, not `<system_docs_repo>/docs/decisions/…`.

---

## Appendix: active dast methodology — full-coverage authenticated script

Referenced above as `references/active-dast-methodology.md` — inlined here since Copilot prompts are flat files with no sibling-file lookup:

# Active DAST methodology — full-coverage authenticated script

A standalone pattern for when the ask is comprehensive DAST across an entire API, not a few
findings upgraded to LIVE. Built once per engagement as a script the user runs (and re-runs) themselves,
it resolves and tests EVERY safe endpoint in the target's API surface — hundreds, not a handful —
and emits one structured JSON evidence file that becomes the backbone of the report's live-validation
section. All non-destructive/authorization ground rules are unchanged from gotchas #15 and #18; this file
only adds the engineering pattern for doing that at full-API scale. Read gotchas #15 and #18 first.

## 0. Where this fits in the orchestrator's parallel-agent workflow

This pattern doesn't replace the skill's own orchestrator/parallel-agent architecture (`SKILL.md`
Phases 0-3) — it's one specialized producer feeding into it. The bounded DAST script is authored
during Phase 1, typically by (or alongside) the `ACTIVE-VALIDATION`/`DISCOVERY` dimension agent once
an API surface description is confirmed; it is then RUN — often repeatedly, by the user themselves,
as the script is iterated on — and its JSON evidence output is what the orchestrator consumes in
Phase 2, exactly like any other dimension agent's scratchpad findings.

```
                           ┌────────────────────────────────────┐
                           │ ORCHESTRATOR — Phase 0 (Recon)     │
                           │ Detect ecosystems, infra, CI/CD,   │
                           │ live target + auth. Decide which   │
                           │ dimension agents to spawn.         │
                           └────────────────────────────────────┘
                                              │
 spawns, in one message, all
 in-scope dimension agents
            ┌──────────────────────┬──────────────────────┬──────────────────────┐
            ▼                      ▼                      ▼                      ▼
 ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐
 │ SBOM & DEP AUDIT   │ │ SAST (static)      │ │ DAST (dynamic)     │ │ OTHER              │
 │                    │ │                    │ │                    │ │                    │
 │ DEP-<eco> agents,  │ │ APP, CICD, IAC,    │ │ DISCOVERY,         │ │ CI/CD supply-      │
 │ 1 per ecosystem.   │ │ SWEEP.             │ │ ACTIVE-VALIDATION. │ │ chain, IaC/cloud   │
 │ Native audit +     │ │                    │ │                    │ │ posture, secrets   │
 │ OSV cross-check.   │ │ +ext: AUTH,        │ │ THIS PATTERN:      │ │ sweep — own        │
 │                    │ │ UPLOAD, BIZLOGIC,  │ │ bounded, full-     │ │ agents when not    │
 │ → SBOM.md,         │ │ CLIENT, DATA       │ │ coverage DAST      │ │ folded into SAST   │
 │ sbom.cdx.json      │ │                    │ │ script (below)     │ │                    │
 └────────────────────┘ └────────────────────┘ └────────────────────┘ └────────────────────┘
            └──────────────────────┴──────────────────────┴──────────────────────┘
                                              every agent returns raw findings
                                              + a pointer to its scratchpad/evidence
                                              │
                                              ▼
                          ┌──────────────────────────────────────┐
                          │ ORCHESTRATOR — Phase 2 (Consolidate) │
                          │ Dedupe across agents, renumber into  │
                          │ the ID family scheme, reconcile      │
                          │ severity, write ONE report:          │
                          │ FINDINGS.md → report.pdf             │
                          └──────────────────────────────────────┘
                                              │
                                              ▼
                          ┌──────────────────────────────────────┐
                          │ ORCHESTRATOR — Phase 3               │
                          │ (Self-audit before finishing)        │
                          │ Section checklist, counts asserted   │
                          │ not eyeballed, byte-count rule       │
                          │ check, close gaps NOW — never        │
                          │ hand back a to-do list.              │
                          └──────────────────────────────────────┘

```

Two things worth being explicit about for anyone new to this framework:

- **The diagram's "THIS PATTERN" box is an artifact DISCOVERY/ACTIVE-VALIDATION produces, not a
  fifth sibling dimension.** It's drawn in its own box only to show where the full-coverage script
  fits chronologically; `SKILL.md`'s spawn table and the dimension briefs never treat it as
  something spawned independently of those two.

- **The orchestrator never runs dimension agents one at a time** — every agent selected for a given
  phase launches together, in a single message, so they execute concurrently. The diagram's
  side-by-side columns are literal, not illustrative.
- **This document's script is a Phase 1 producer, not a Phase 2/3 concern** — everything below
  (identifier resolution, tiering, evidence redaction, etc.) is about making that one agent's output
  as high-signal as possible before it ever reaches the orchestrator's consolidation step.

## When to reach for this vs. the lightweight ACTIVE-VALIDATION brief

Use the lightweight few-request pattern in `agent-briefs.md`'s ACTIVE-VALIDATION section when: the
goal is upgrading one or two specific static findings to LIVE-VALIDATED, no machine-readable API
surface description exists, or the target is small enough that guessed/hand-picked endpoints are
plausibly a complete picture.

Use THIS pattern when: the user wants comprehensive DAST coverage across an entire API (not just to
upgrade specific findings), AND a swagger/OpenAPI doc, Postman collection, API blueprint, or
equivalent machine-readable API surface description is available (or the user can point to one). If
that description doesn't exist, don't default to crawling to build one from scratch — that's a
DISCOVERY-dimension job (see agent-briefs.md), a different task with a different (browser-driven,
15-minute-budget) method. This pattern assumes the surface is already known and focuses on testing it.

## 1. Input: a supplied API surface description beats live discovery

Lead with this. Whenever the user has, or can point to, a swagger/OpenAPI JSON doc, a Postman
collection, an API blueprint, or similar, ask for a file path or URL and use it as the source of
truth for the candidate endpoint list. It's authoritative, works offline, and doesn't depend on a
debug/introspection endpoint being reachable (which can itself be a separate finding).

Accept, in this preference order:
1. A local file path the user supplies.
2. A URL to fetch once (the user's own doc host, or a vendor-hosted spec).
3. Fallback only: attempt conventional live paths against the target's own base URL
   (`/swagger/v1/swagger.json`, `/openapi.json`, `/v2/api-docs`, etc.) — but only after the user
   confirms that's their own environment and that path is expected to be reachable. This costs one
   extra live request and is a live-fetch, not a crawl; it is a fallback, never the default.

## 2. Core safety invariants — script-level restatement

These are the same rules as gotchas #15 and #18, applied at script-construction time rather than
per-request time. Do not restate the reasoning here beyond what's needed to build the script;
cross-reference gotchas for the "why."

**Bounded.** A hard `REQUEST_BUDGET` — a live-request counter checked before every network call, script
aborts or halts new categories once hit. Size it from the actual math, and show that math in a code
comment so the constant is a derivation, not a guess:

```
N  = setup calls (login, identifier-resolution list calls)
M  = auth-boundary checks (one unauthenticated call per candidate endpoint)
K  = IDOR/ownership differential pairs (2 requests each: own-id, adjacent-id)
J  = injection differential pairs (2 requests each: benign, payload)
TOTAL = N + M + 2K + 2J
```

For an API in the low hundreds of operations with per-endpoint auth + differential checks, this
typically lands in the 400–700 range. Never propose thousands of requests for a typical engagement;
if the surface is large enough that the honest math exceeds that, that's a case for the user's
explicit sign-off on a larger budget, not an assumed default.

**Non-destructive.** An explicit FORBIDDEN keyword blocklist — regex on path segments — checked
BEFORE any other logic, no exceptions: `delete|remove|clear|cancel|purge|drop|reset|disburse|payout|
wire.?transfer|execute.?payment|submit.?payment` (extend per-domain as the surface suggests). Only
`GET` is used for reads. `POST` is used ONLY for endpoints verified as non-mutating search/filter/
report-style (§4) — every other POST/PUT/DELETE/PATCH gets zero live invocation, full stop. See
gotcha #18 if the user has explicitly authorized minimal test-data creation on a confirmed-internal
target — that's a narrow, separate authorization and this script's default posture is stricter than
that: it does not create data at all.

**Full coverage WITH honest exclusion.** Every endpoint in the API surface description must end up
with SOME evidence entry — either real live-test results, or an explicit `excluded` entry stating the
reason (e.g. `"excluded: presumed state-mutating (matched blocklist keyword 'cancel'), zero live
requests"`). Never silently drop an endpoint from the output just because it wasn't tested — the
exclusion itself is documented evidence of scope, and is what lets the report claim "286/286
candidate endpoints resolved, none silently skipped" instead of an unverifiable partial scan.

**Explicit user authorization.** The script refuses to run without `LOGIN_URL`/credentials supplied
by the user via environment variable or config — never hardcoded, never guessed — and only targets a
host the user has explicitly identified as their own. Same verification rule as gotcha #15; this
script doesn't get a lighter version of it just because it's more automated.

## 3. Identifier resolution — the single highest-value technique here

A differential test ("my own resource" vs. "an adjacent id") is only meaningful if "my own resource"
is real. Build a `name → value` map of the account's own actual identifiers and reuse it everywhere.

**Seed the map from login + initial load.** Capture ids that appear in the login response and the
first authenticated page load via regex against field names, e.g. `"brandId":\s*(\d+)`. This gets the
tenant-scoping id(s) essentially for free (zero extra requests).

**Widen it with a few bounded list calls.** Make a small number of additional GETs against obvious
"list"/"get-all" endpoints (an orders list, a warehouse list, a product list — whatever the domain's
list-style endpoints are) purely to resolve further identifier types that recur across many endpoints
as path/query parameters. Each resolution costs exactly one extra GET; cache the found value in the
same map for the rest of the run.

**Resolver refinement 1 — fall back to the generic row shape.** Regex first for the exact field name
(`"orderId":\s*(\d+)`), but many list endpoints return rows keyed just `"id"` per row rather than a
qualified name — e.g. `{"data":[{"id":42,...}]}`. Fall back to matching that generic shape when the
qualified-name regex misses, or most list-endpoint responses will fail to resolve anything.

**Resolver refinement 2 — never resolve the bare `id` into the shared map.** The literal path
parameter name `{id}` means a completely different resource type on different endpoints — a product
id on one, a stock-plan id on another. Resolving a bare `id` into the shared map and reusing it
everywhere silently applies the wrong resource type almost everywhere it's used. Only resolve NAMED,
qualified identifiers (`stockUnitId`, `warehouseId`, `orderId`, etc.) into the shared map; leave bare
`id` unresolved and fill it per-endpoint with a benign literal fallback (see below) instead.

**Fill every parameter by name, not position.** For every request, fill each path/query parameter by
looking up its NAME in the map; fall back to a benign literal (e.g. `1`) only for names truly not yet
resolved. Never fill positionally — parameter order in a spec is not a reliable proxy for identity.

**Vary exactly one parameter in a differential test.** When running an IDOR-style differential, hold
every OTHER parameter at its own correctly resolved real value, and vary only the one parameter
actually under test. When an endpoint has more than one candidate parameter to vary, prefer the one
whose name matches a tenant-scoping pattern (`/brandid|tenantid|companyid/i`) over "whichever parameter
happens to be last in the path" — the tenant-scoping dimension is usually where the real authorization
boundary lives.

**Bug to avoid explicitly: don't reuse "my tenant id" as the fill value for every parameter regardless
of which one is being varied.** This is tempting because it's simple, and it silently breaks the moment
the varied parameter ISN'T the tenant id — it appears to work whenever two resolved values happen to be
numerically equal by coincidence, then silently produces a wrong (meaningless) result the moment they
diverge. Always resolve and use the SPECIFIC parameter's own value, keyed by its own name, never a
substitute from a different identifier dimension.

## 4. Candidate prioritization — tiered, not doc-order

When budget doesn't allow testing literally every operation in the doc in one pass (or even when it
does, for ordering purposes), rank candidates by how much genuine evidentiary value a test can
produce — never by the order they happen to appear in the API doc. Getting this wrong was found in
practice to waste roughly a quarter of a fixed candidate budget on endpoints that could never produce
any signal, while real testable endpoints went untested purely on doc-order luck.

- **Tier 0 — search/filter/report-style endpoints.** Candidates for the injection differential (§5).
  Always included; there are usually few of these, so they don't compete for budget.
- **Tier 1 — read (GET) endpoints where at least one parameter resolves to a REAL owned value.** The
  highest-value IDOR candidates: "my own resource" is genuinely real, so a positive result is strong
  evidence and a negative result is a meaningful enforcement check.
- **Tier 2 — read endpoints with a testable parameter, but nothing resolves to a real value.** Falls
  back to a synthetic placeholder; the test still runs, but a "no differential" result here is weaker
  evidence than Tier 1's, because "my own resource" wasn't actually real. Say so in the evidence entry.
- **Tier 3 — read endpoints with no testable parameter at all.** Still worth an auth-boundary check
  (§7 rollup); no ownership differential is possible.
- **Tier 4 (lowest, last) — everything else**, specifically endpoints that are provably going to
  receive zero live checks anyway under this script's own rules (non-search-shaped mutating POSTs,
  etc.). These belong at the bottom of the queue precisely because they're the excluded-with-reason
  entries from §2, not real candidates — never let them crowd out real Tier 0–3 candidates.

## 5. The injection differential — needs real seed values AND correct body construction

**Identifying candidates.** Match search/filter/query/suggest/list-style naming against LITERAL route
segments only — strip `{placeholder}` content first. A path parameter's own name can coincidentally
contain a trigger keyword (a boolean flag literally named `isFilter`) and falsely qualify an unrelated
endpoint if placeholders aren't stripped before matching.

Also maintain a small explicit allowlist for endpoints that are structurally identical (a report/list
operation accepting a filter-shaped POST body) but don't match the naming heuristic. Verify each
allowlist candidate against its own request-body schema before adding it — confirm it actually has a
free-text field to inject into, and confirm from its controller name/HTTP verb that it's non-mutating
— rather than trusting the allowlist entry on name alone.

**Running the differential.** Send one benign value and one payload that's syntactically disruptive
only if it reaches an interpreter unescaped (a single quote for SQL, `${7*7}` for template injection),
and compare. A stable 200 for both, or a matching clean error for both, is a real (if weak) negative.
A 200-then-500 split (or an equivalent syntax-error signature) is a strong positive. Zero data is
read, written, or exfiltrated either way.

**Refinement 1 — use a real seeded value as the benign side.** Pull it from the account's own
already-authorized data (a real name from a user list, a real product name), not an arbitrary
placeholder string. A synthetic guess almost always matches zero records, making benign-vs-payload
trivially identical (both empty) regardless of whether the endpoint is actually vulnerable. A real
seed value gives the benign case an actual chance to return real matching data, so a subsequent
difference (or lack of one) actually means something.

**Refinement 2 — resolve the request body's own schema; don't hand-guess the shape.** Follow `$ref`
against the doc's component schemas (with a depth cap against cycles) and fill EVERY declared
property with a type-appropriate value:
- strings → a benign placeholder, or the real seed value for the one field chosen to carry the
  injection payload (pick the first plain string field that isn't date-shaped);
- dates → a real ISO timestamp, never a bare placeholder string — a non-date value in a date-typed
  field fails validation identically for both the benign and payload requests, producing a false
  "no differential" that means nothing;
- booleans → `true`;
- any field whose name matches an already-resolved real identifier (a tenant id, etc.) → THAT real
  value from the §3 map, not a generic placeholder — otherwise the whole request is scoped to a
  nonexistent/empty context and returns nothing no matter what the search term is.

## 6. Verdict logic — a false "no vulnerability" signal is worse than no signal

For the ownership/IDOR differential, a verdict crediting "the boundary is enforced" must require that
the OWN-id request actually succeeded (200) before crediting the adjacent-id request's rejection
(403/404) as meaningful. Otherwise an endpoint that fails for BOTH ids (e.g. both 404 because neither
id resolves to a real resource, for a reason unrelated to authorization) gets mislabeled as
"enforcement confirmed" when nothing was actually proven.

Structure every verdict as exactly one of three states, never conflating the last two:
- **cross-boundary success** — own succeeds AND adjacent ALSO returns non-empty real content;
- **genuine enforcement** — own succeeds AND adjacent is correctly rejected;
- **inconclusive** — anything else, including both requests failing.

## 7. Evidence capture and redaction — show real content, never raw byte-count deltas

Real stakeholder feedback from this pattern's engagement: comparing responses by raw byte count alone
("7419 bytes vs 7426 bytes") is confusing and unconvincing — it doesn't show what the finding actually
means. Instead:

- Capture the actual response body for every check, not just status code. Parse as JSON where
  possible and store a redacted, PRETTY-PRINTED, human-readable snippet — never a raw single-line
  minified blob. If the envelope has an obvious wrapper (`{"data": [...]}` or a bare top-level array),
  keep only the first 1–2 records and note how many were omitted — the real record content is the
  evidence; the rest of a long list adds nothing.
- Redact by KEY NAME on the PARSED structure, never a fragile regex on raw text. Mask VALUES of any
  field whose name matches a PII/secret pattern (password, token, secret, name, email, phone,
  address, badge-number style fields, etc.) while leaving structural fields visible (ids, status
  flags, timestamps, amounts) — those structural fields are usually what PROVES two responses are
  genuinely different real records, not two copies of the same placeholder.
- For a non-JSON response (a generated Excel/Word/PDF/image document): don't dump raw bytes as text
  (unreadable garbage/mojibake) and don't cite a byte count either (still reads as a comparison).
  Store a plain, honest, qualitative line instead: "non-JSON response — likely a binary/generated
  document, content not displayable as text."
- Capture the REQUEST side too: the exact URL used (redact credentials/secrets in query strings the
  same way), and for a POST, the exact JSON body sent (same key-based redaction). A reader should be
  able to see the complete request/response pair for every single test, not just an abstract outcome.
- This costs ZERO additional live requests when implemented correctly — the response body is already
  being fetched for the status/length check; simply keep and process more of what's already fetched
  instead of discarding it.

Redaction here follows the same rules as gotcha #9 (first 4 + last 2 chars, decoded JWT claims only,
etc.) — this section is about WHAT to keep and present, not a different redaction standard.

## 8. Reporting implications

- Every endpoint in the surface description appears in the evidence output exactly once — real
  results or an explicit excluded-with-reason entry (§2). Report this as a stat, e.g. "286/286
  candidate endpoints resolved, none silently skipped" — full coverage with honest exclusion is
  itself evidence of thoroughness.
- Aggregate an auth-boundary-enforcement rollup across the WHOLE run (how many endpoints correctly
  rejected an unauthenticated request vs. didn't), not from a single representative sample. Testing
  every endpoint individually — not "check once, assume the rest match" — is what surfaces the
  genuinely inconsistent cases: an otherwise well-protected API that turns out to have one or two
  endpoints with no auth check at all.
- When presenting cross-tenant/ownership-boundary evidence, prioritize GENUINELY DEFINITIVE cases —
  where the adjacent-id response itself contains a field that self-identifies as belonging to a
  different tenant (e.g. a returned record explicitly tagged with a different brand/company id than
  the account's own). Call these out as the strongest possible evidence category: the payload proves
  its own cross-boundary origin without needing external corroboration, stronger than "adjacent id
  merely returned non-empty content."
- Feed this evidence file into the report's live-validation section per gotchas #16–17: state
  corrections to static claims explicitly, and keep "what passed" separate from "verified-safe /
  refuted" specific hypotheses.

---

## Appendix: agent briefs — scope boundaries and task lists

Referenced above as `references/agent-briefs.md` — inlined here since Copilot prompts are flat files with no sibling-file lookup:

# Agent Briefs — scope boundaries and task lists

Dimensions are a catalog, not a fixed set. Spawn only the ones Phase 0 found evidence for
(see SKILL.md "Scoping the fan-out"). Ownership is stated as OWNS / DOES NOT OWN so that
concurrent agents never audit the same file twice.

## Shared preamble — prepend to EVERY agent brief
> You are one of several parallel security-scan agents. Stay strictly inside the scope
> boundary below; other agents own everything else and duplicated work wastes the run.
> Read this skill's `references/gotchas.md` before starting (resolve the path from wherever this
> skill is installed — never assume a fixed location), plus `references/api-recipes.md` and `references/ecosystems.md` if
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
   skill's own scan-input convention (gotcha #19), not a finding — exclude it here, but confirm
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
user supplied for this purpose), not a loop, and stays fully within gotchas #15 and #18's
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
  and report the block. The user decides whether to grant broader permission.
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

---

## Appendix: advisory & registry api recipes

Referenced above as `references/api-recipes.md` — inlined here since Copilot prompts are flat files with no sibling-file lookup:

# Advisory & Registry API Recipes

Verified request shapes. OSV.dev is the universal layer — it covers every ecosystem in
`ecosystems.md`, so it works even when no native toolchain is installed.

## 1. OSV.dev — cross-ecosystem vulnerability lookup

### Batch query (preferred — many packages per call)
```bash
curl -s -X POST https://api.osv.dev/v1/querybatch \
  -H 'Content-Type: application/json' \
  -d '{"queries":[
        {"package":{"name":"<name>","ecosystem":"npm"},"version":"1.2.3"},
        {"package":{"name":"<name>","ecosystem":"PyPI"},"version":"4.5.6"}
      ]}'
```
Ecosystem ids are case-sensitive: `npm`, `NuGet`, `PyPI`, `Go`, `Maven`, `RubyGems`,
`Packagist`, `crates.io`, `Hex`, `Pub`, and OS ecosystems (`Debian`, `Alpine`, `Ubuntu`).
Maven names use `groupId:artifactId`. Go names are full module paths.

The batch response is `{"results":[{"vulns":[{"id":"...","modified":"..."}, ...]}, ...]}` — one
result object per input query, **positionally aligned with the input array** (not a flat ID list),
each holding a `vulns` array of `{id, modified}` pairs (an empty `vulns: []` or a result with no
`vulns` key means no hit for that query). Preserve your input order to map `results[i]` back to
`queries[i]`, then fetch full detail per id via the detail endpoint below.

### Detail fetch per ID
```bash
curl -s https://api.osv.dev/v1/vulns/<id>
```
Take from the detail payload: `summary`, `severity` (CVSS vector), `database_specific.severity`,
`affected[].ranges` (→ the fixed version), `affected[].ecosystem_specific`, and `aliases`
(→ the CVE number and any GHSA id).

### Single query by commit (for vendored/unpinned source)
```bash
curl -s -X POST https://api.osv.dev/v1/query -H 'Content-Type: application/json' \
  -d '{"commit":"<sha>"}'
```

### Practical batching
- Chunk to ~100 queries per POST; larger payloads get unreliable.
- Feed every **resolved** `name@version` from the lockfile, including transitives.
- Persist raw JSON to the scratchpad so consolidation can re-read without re-querying.
- Rate-limit politely; add a short sleep between chunks on large trees.

### MANDATORY positive control (gotchas #4)
Before reporting an empty result, query a package/version you have independently confirmed
carries an advisory (an old major release of a widely used library in that ecosystem) and
confirm a non-empty response. Do it once per ecosystem. If the control returns nothing, the
query shape is wrong — an empty response from a malformed request is indistinguishable from
a clean bill of health. Record the control result in the report.

## 2. Native audit commands
See `ecosystems.md` for the per-ecosystem table. Run the native tool when the toolchain
supports it (it catches ecosystem-specific advisory sources OSV may lag on) AND cross-check
with OSV. When the toolchain cannot restore the project, say so rather than reporting clean.

Lockfile-only modes avoid needing installed dependencies, e.g.:
```bash
npm audit --package-lock-only --json
```

## 3. Registry metadata — freshness and deprecation
Pattern is the same everywhere: fetch the package document, read the latest version, the
per-version publish timestamps, and any deprecation/yank flag.

```bash
# npm — dist-tags.latest + the `time` map of version -> ISO publish date
curl -s https://registry.npmjs.org/<pkg> | jq '{latest:.["dist-tags"].latest, times:.time}'
#   scoped packages: URL-encode the slash -> @scope%2Fname
#   .versions[<v>].deprecated holds the deprecation message

# PyPI — info.version, info.yanked, releases[<v>][].upload_time_iso_8601
curl -s https://pypi.org/pypi/<pkg>/json | jq '{latest:.info.version, yanked:.info.yanked}'

# NuGet — latest version
curl -s https://api.nuget.org/v3/registration5-semver1/<lowercase-name>/index.json
# NuGet — DEPRECATION / unlisted live ONLY on the gz-semver2 feed (gzipped: use --compressed)
curl -s --compressed https://api.nuget.org/v3/registration5-gz-semver2/<lowercase>/index.json
#   -> catalogEntry.deprecation {reasons,message,alternatePackage}, catalogEntry.listed

# RubyGems, crates.io, Packagist, Go proxy, Maven Central
curl -s https://rubygems.org/api/v1/versions/<gem>.json
curl -s https://crates.io/api/v1/crates/<name>
curl -s https://repo.packagist.org/p2/<vendor>/<pkg>.json
curl -s https://proxy.golang.org/<module>/@v/list
curl -s https://repo1.maven.org/maven2/<group/path>/<artifact>/maven-metadata.xml
```
Before relying on any of these to prove a NEGATIVE ("nothing is deprecated"), apply
gotchas #2: confirm on a record known to carry the field that this endpoint returns it.

Derive for the maintenance axis (reported separately from advisories):
- installed-version age = `now − publish date of the installed version`
- upstream liveness = `now − publish date of the latest version`
- explicit deprecation / yank / unlisted flags; archived or deleted source repository

## 4. Container and OS-package scanning
```bash
trivy image --severity HIGH,CRITICAL <image:tag>
trivy fs --scanners vuln,secret,misconfig .
grype <image:tag>
syft <image:tag> -o cyclonedx-json      # SBOM
```

## 5. SBOM generation
```bash
syft dir:. -o cyclonedx-json=sbom.cdx.json      # any ecosystem
cdxgen -o sbom.json                              # multi-language
npm sbom --sbom-format cyclonedx                 # npm native
dotnet CycloneDX <solution>                      # .NET
```
Record the format (CycloneDX / SPDX), the generator, and which manifests it covered.

## 6. Secret-scanning tools (complement, not replace, the regex sweep)
```bash
gitleaks detect --source . --no-git --redact
gitleaks detect --source . --log-opts="--all" --redact   # history, needs .git
trufflehog filesystem . --results=verified,unknown
```

## 7. Advisory URLs to cite
- GitHub Advisory — `https://github.com/advisories/GHSA-xxxx-xxxx-xxxx`
- NVD — `https://nvd.nist.gov/vuln/detail/CVE-YYYY-NNNNN`
- OSV — `https://osv.dev/vulnerability/<id>`
Cite at least one per dependency finding so the reader can verify it independently.

---

## Appendix: coverage completeness — what a full product security review covers

Referenced above as `references/coverage-checklist.md` — inlined here since Copilot prompts are flat files with no sibling-file lookup:

# Coverage Completeness — what a FULL product security review covers

This skill's default fan-out is **static-first** (SAST, secrets, IaC, CI/CD, SBOM, static authz).
That is a code-and-configuration review, not a validated penetration test. Before calling an
assessment "complete," check these dimensions and, for each, state in the report: **Covered /
Partial / Not started**, and why. Under-claiming coverage is what damages a reviewer's credibility.

Tie every gap to the specific product — name the endpoint, file, or integration — not a generic label.

This file is about WHAT gets reviewed on each dimension; how the resulting report is structured
(dedicated Secrets / CI-CD & infrastructure / Dependency-advisories-&-SBOM sections, the
Appendix, the Cyberattack exposure subsections, etc.) is specified once in `report-format.md` —
treat that file as the single source of truth for report shape and do not re-derive it here.

## The dimensions (roughly in value order for a money-/data-moving product)

1. **Business-logic & domain abuse** — the highest-value gap and the one SAST cannot find.
   For payments/commerce: approval maker-checker / self-approval, workflow-step skipping,
   amount/currency/sign/rounding tampering, duplicate/replay of submissions, race/TOCTOU on
   approvals or balance checks. For any product: the core state machine and money/data-moving flows.
2. **Authorization matrix (BFLA), all API versions** — enumerate function-level access per role,
   and test EVERY endpoint on an older API version against its newer twin (v1 often lacks checks v2
   added). Include any impersonation / proxy-user / "act-as" path — it multiplies the surface.
3. **Authentication & session deep-dive** — JWT validation config is a frequent hole: look for a
   missing `ValidAlgorithms` allowlist, RS256/HS256 sharing one key across schemes, `alg:none`,
   `ValidateIssuer/Audience=false`, `RequireHttpsMetadata=false`, verbose token errors. Plus
   refresh-token rotation/reuse, logout/revocation, session fixation, lockout/brute-force, MFA
   enrollment & recovery.
4. **File-upload & document processing** — magic-byte checks that use `contains` (polyglot bypass),
   whole-file buffering (zip-bomb/DoS), missing AV, filename/path traversal into other tenants'
   storage prefixes, and XML parsing (XXE/DTD) on every ingestion sink.
5. **SSRF & external-integration trust boundary** — server-side fetches to config/tenant-controlled
   URLs (payment/ERP/AI/webhook/asset), and whether vendor-controlled *responses* are trusted or
   content-negotiation-deserialized. Worse when egress is unrestricted or environments share a NAT.
6. **Insecure deserialization & XXE (depth)** — `TypeNameHandling`, `BinaryFormatter`, `XmlResolver`
   / `DtdProcessing` on each XML sink, `ReadAsAsync<T>` on external responses.
7. **API-security specifics** — rate limiting that is per-instance `MemoryCache` (bypassable across
   horizontally-scaled tasks), mass-assignment / over-posting via model binding, CORS with
   wildcard-subdomain + credentials, verbose errors, still-live deprecated endpoints.
8. **Dynamic testing (DAST)** — authenticated active scanning and manual injection/BOLA/BFLA probing
   with **two tenant accounts**; confirm the SAST-found injection sinks at runtime.
9. **Logging, monitoring & fraud detection** — for a money-mover the audit trail is a control:
   is every money-movement action audited, tamper-evident, alertable? Conversely flag over-logging
   of sensitive payloads (full request/response bodies, secrets to chat webhooks).
10. **Client-side deep-dive** — DOM-XSS, `postMessage` handlers, clickjacking/framing, SRI on CDN
    assets, prototype-pollution reachability, token-in-JS-storage theft surface.
11. **Data protection & crypto at rest** — SSE/KMS on stores, key rotation lifecycle, TLS to DB,
    PII inventory & retention, secrets-in-memory/logs. (IaC static review ≠ runtime verification.)
12. **Infrastructure/network pen test** — external+internal, subdomain takeover / DNS, ALB/edge TLS
    policy and WAF rule-tuning/bypass (often not in the repo), segmentation, shared-NAT blast radius.
13. **Threat model & abuse cases** — structured STRIDE/attack-tree on the core value flow, plus an
    explicit insider / repo-access model (committed secrets → real-world abuse path). For a
    comprehensive/deep-dive review, synthesize this as the report-format.md "Cyberattack exposure
    & threat assessment" section: a threat-actor-applicability table (unauthenticated attacker,
    authenticated low-priv user, insider/repo-access holder, commodity/automated attacker,
    supply-chain attacker), numbered attack chains that string together specific finding IDs in
    order, optionally tagged with MITRE ATT&CK technique IDs, and an exposure-by-surface rating
    distinct from per-finding severity. This is what turns a list of findings into a prioritization
    a non-technical stakeholder can act on — do it whenever ≥2 findings from different families
    chain into a materially worse outcome together (e.g. a pre-auth authentication bypass chained
    into an authorization-bypass IDOR chained into a state-changing money-movement endpoint).
14. **Transitive dependencies** — the graph the native tool couldn't restore (toolchain mismatch);
    re-run on a matching SDK.
15. **Compliance mapping** — PCI-DSS (money movement), SOC 2, ISO 27001, GDPR/PII: what the
    assessment does and does not evidence (e.g. no ASV scan, no segmentation test).

## Honest scope statement (adapt per engagement)
End a static-first report with a plain statement of what it CAN and CANNOT claim: it can assert
that specific exploitable weaknesses exist; it cannot assert that the core value flow is safe from
abuse, that authentication cannot be bypassed at runtime, or that upload/SSRF/authorization flaws
are absent — those need the dynamic and business-logic testing above. Do not let a clean static
pass read as a clean bill of health.

---

## Appendix: ecosystem matrix

Referenced above as `references/ecosystems.md` — inlined here since Copilot prompts are flat files with no sibling-file lookup:

# Ecosystem Matrix

Detect which rows apply in Phase 0, then scope dependency agents to those rows only.

| Ecosystem | Manifests / lockfiles | OSV `ecosystem` id | Native audit command | Registry API (latest + metadata) |
|---|---|---|---|---|
| JavaScript / Node | `package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml` | `npm` | `npm audit --package-lock-only --json` · `yarn npm audit --json` · `pnpm audit --json` | `https://registry.npmjs.org/<pkg>` |
| .NET | `*.csproj`, `*.sln`, `Directory.Packages.props`, `packages.lock.json`, `packages.config` | `NuGet` | `dotnet list package --vulnerable --include-transitive` | `https://api.nuget.org/v3/registration5-gz-semver2/<lowercase>/index.json` |
| Python | `requirements*.txt`, `pyproject.toml`, `poetry.lock`, `Pipfile.lock`, `uv.lock` | `PyPI` | `pip-audit -r requirements.txt` · `pip-audit` (env) | `https://pypi.org/pypi/<pkg>/json` |
| Go | `go.mod`, `go.sum` | `Go` | `govulncheck ./...` | `https://proxy.golang.org/<module>/@v/list` |
| Java / JVM | `pom.xml`, `build.gradle(.kts)`, `gradle.lockfile` | `Maven` | `mvn org.owasp:dependency-check-maven:check` · `gradle dependencyCheckAnalyze` | `https://repo1.maven.org/maven2/<group-path>/<artifact>/maven-metadata.xml` |
| Ruby | `Gemfile`, `Gemfile.lock` | `RubyGems` | `bundle audit check --update` | `https://rubygems.org/api/v1/versions/<gem>.json` |
| PHP | `composer.json`, `composer.lock` | `Packagist` | `composer audit --format=json` | `https://repo.packagist.org/p2/<vendor>/<pkg>.json` |
| Rust | `Cargo.toml`, `Cargo.lock` | `crates.io` | `cargo audit --json` | `https://crates.io/api/v1/crates/<name>` |
| Container base images | `Dockerfile*`, image refs | `Debian`/`Alpine`/`Ubuntu` (OS pkgs) | `trivy image <ref>` · `grype <ref>` | registry manifest / label inspection |

Notes that apply to every row:
- **OSV.dev is the universal cross-ecosystem fallback.** Native audit tools disagree with each
  other and with OSV in both directions. Run the native tool when the toolchain supports it,
  and cross-check every resolved `name@version` against OSV regardless. When no native tool is
  installed, OSV alone is still a complete-coverage option — say which you used.
- **Query resolved versions from the LOCKFILE, not declared ranges.** Declared ranges miss
  transitive packages, which is where most advisories live. If no lockfile exists, say so:
  the scan then describes a resolution that may not match what actually ships.
- **Native audit tools need a working toolchain.** If the installed runtime/SDK cannot restore
  or build the project, the tool fails and transitives go unscanned — declare it as a coverage
  limitation instead of reporting a clean result (see `gotchas.md` #3).
- **Version-pin manifests** (`Directory.Packages.props`, `gradle.lockfile`, constraints files,
  `overrides`/`resolutions`) are themselves audit targets, not just inputs.
- **Monorepos**: enumerate every workspace manifest, not just the root one.

## Maintenance-risk signals per registry
Each registry API above exposes publish dates and/or deprecation state. Use them for the
maintenance axis, which is reported SEPARATELY from advisories (`gotchas.md` #8):
- last publish date of the installed version → how stale is this pin
- last publish date of the latest version → is upstream itself abandoned
- explicit deprecation / yank / unlisted flags → maintainer has disowned it
- archived or deleted source repository → no fix will ever arrive
- runtime/framework EOL dates (language runtimes, framework majors, base images)

---

## Appendix: gotchas

Referenced above as `references/gotchas.md` — inlined here since Copilot prompts are flat files with no sibling-file lookup:

# Gotchas

General rules learned from real scan failures. Each one is a way a scan silently produces a
WRONG answer — usually a falsely clean one.

## 1. Quote every glob argument (zsh)
```bash
grep -r --include=*.ext "pat" .      # FAILS: "zsh: no matches found: --include=*.ext"
grep -r --include="*.ext" "pat" .    # correct
```
zsh expands the glob before the tool sees it and aborts when nothing matches the CWD.
Quote every `*` meant for the tool rather than the shell: `--include`, `--exclude`,
`--exclude-dir`, `find -name`, and glob arguments to any scanner.

## 2. Verify an endpoint actually carries the field before trusting its absence
A registry/API endpoint can return `200 OK` with complete-looking data while **silently
omitting** the field you are testing for — producing a confident false negative.
Before concluding "no package is deprecated / no advisory exists / no field is set",
confirm on a record you KNOW has that field that the endpoint returns it.
Registries commonly split this across endpoint versions: metadata, deprecation state,
yank/unlisted flags and advisory data may each live on a different path or API version, and
the older path returns success while omitting the newer fields entirely.
(Concrete instance: NuGet's `registration5-semver1` omits `deprecation` outright — only
`registration5-gz-semver2` carries it. Assume every registry has an equivalent trap.)

## 3. The toolchain must be able to build/restore the project, or transitives go unscanned
Native audit tools (`dotnet list package --vulnerable`, `govulncheck`, `mvn dependency-check`,
`pip-audit`, `cargo audit`) resolve the dependency graph first. If the installed SDK/runtime
is older than the project's target version, restore fails, the command errors out, and
**transitive dependencies are never examined**. The run looks like a tooling hiccup and gets
reported as "no findings".
Detect in Phase 0: compare the installed toolchain version against the version the project
targets (target framework, `go` directive, `requires-python`, `rust-version`, toolchain files).
On mismatch, fall back to lockfile parsing + OSV, and state the gap explicitly.

## 4. Sanity-check the scanner against known-bad input before trusting a clean result
A broken query and a genuinely clean project return the same thing: nothing.
Before reporting zero findings, run a positive control — query a package/version pair you have
independently confirmed carries an advisory (an old major release of a widely used library) and
confirm the hit comes back. Do this per ecosystem and per tool. Record in the report that the
control passed; that is what makes a clean result credible.

## 5. Regex sweeps are overwhelmingly noise — filter, then hand-verify
A raw entropy/pattern sweep over a real repo returns hits by the thousand and survives triage
at well under 1%. Dominant noise sources, all of which must be excluded:
- **Vector graphics** — `*.svg` and inline `<path d="…">` float coordinate runs match
  long-numeric-ID patterns (cloud account IDs, card numbers) constantly.
- **Lockfile integrity hashes** — `sha512-…` base64 blobs match generic high-entropy rules.
- **Minified bundles, sourcemaps, vendored assets** — `*.min.*`, `dist/`, `build/`, `*.map`.
- **Dependency and build output directories** — `node_modules/`, `vendor/`, `target/`,
  `bin/`, `obj/`, `.venv/`, `.next/`, base64-embedded images and fonts.
- **Test/sample/placeholder values** — `changeme`, `YOUR_KEY_HERE`, `xxxx`, documented examples.
Then hand-verify every survivor. Report the raw-hits → triaged-findings funnel with the
reduction reasons, so the reader can see the filtering was deliberate rather than accidental.

## 6. An override/pin block can itself introduce the vulnerability
`overrides` / `resolutions` / central version-pin files / constraints files are audit targets in
their own right. A block added to force a transitive to a "safe" version can pin it to a version
*inside* the vulnerable range, and a scan that only reads declared dependencies will miss it.
Audit the pin block itself, and re-check it every run — a pin that was safe when written drifts
into an advisory range as new CVEs land.

## 7. Check whether the fix is REACHABLE before recommending a bump
A vulnerable transitive with an available fix is not automatically fixable. If a parent package
constrains it with a narrow pin, the fixed version may be unreachable without violating the
parent's constraint or breaking it. Walk the dependency path from the vulnerable package up to
the declared dependency and determine which applies:
- **Reachable** — a direct bump or an override resolves it. Remediation: bump, low effort.
- **Unreachable** — a parent's pin blocks it. Remediation is *structural*: upgrade, replace or
  migrate off the parent, or accept with a compensating control. Different effort, different
  owner, often different severity.
Reporting an unreachable fix as "bump it" sends someone on an impossible errand and costs the
report its credibility.

## 8. Old ≠ vulnerable — two separate axes, two separate sections
- **Advisory risk**: a published CVE/GHSA affects the installed version.
- **Maintenance risk**: outdated, EOL, deprecated, yanked, unmaintained, archived upstream.
A package can be many years old with zero advisories (maintenance risk only) or fully current
with several HIGH CVEs. Conflating them inflates the first number and buries the second.

## 9. Redact every secret, in every output, including scratch files
- Generic: first 4 + last 2 characters only — `AKIA…7Q`.
- JWTs: report **decoded claims** (`iss`, `aud`, `sub`, `exp`, scopes) — never the token.
- Account/tenant/subscription identifiers: `1234…89`.
- Connection strings: keep host and database, redact user and password entirely.
- Private keys: report type, path and line only — never any key material.
Intermediate scratch files get read back during consolidation, so redact on write, not at the end.

## 10. No version history = no history scan; rotation, not deletion, is the fix
An extracted archive or exported tree has no `.git`, so nothing can be said about what was
committed and later removed. A secret deleted in a later commit is still live in history and
still compromised. State the limitation explicitly, and recommend a history scan against the
real origin repository, e.g.:
```bash
gitleaks detect --source . --log-opts="--all"
trufflehog git file://. --since-commit HEAD~1000
```
Always state the actual remediation: **rotate the credential.** Deleting the line does nothing.

## 11. Build-time public env vars are shipped to every client
Any framework prefix that marks a variable as client-exposed is inlined into the published
bundle at build time: `REACT_APP_*`, `NEXT_PUBLIC_*`, `VITE_*`, `PUBLIC_*`, `GATSBY_*`,
`EXPO_PUBLIC_*`, `NUXT_PUBLIC_*`, and equivalents in any other framework.
A pipeline can mask these perfectly in its logs and still publish them to every visitor.
Flag any such variable holding an API key, secret, token, signing key or account identifier —
regardless of how well the pipeline handles it. Masking in CI is not a control here.

## 12. Committed security-assessment evidence is itself a secrets risk
Prior scan output, pentest reports, HAR files, proxy exports, debug dumps, screenshots and
"findings" documents routinely contain **captured live tokens, session cookies and credentials**.
Search for `*pentest*`, `*security*report*`, `*assessment*`, `*audit*.json`, `*.har`,
`evidence/`, `screenshots/`, `*.dump`, `*.log` fixtures. Treat hits as high-priority findings.

## 13. Multiple lockfiles for one ecosystem = drift risk
Two lockfiles for the same manifest means the installed tree depends on which tool ran, and your
audit describes only one of them. Flag it, and state which lockfile you scanned.

## 14. Report what PASSED, not only what failed
A findings-only report gives the reader no way to tell a thorough scan from a shallow one, and
no credit for controls that are already correct. Explicitly list the checks performed that came
back clean, alongside the coverage limitations that bound them.

## 15. Live/active DAST is passive-first and consent-gated
Live testing proves a code-level finding on a running copy of the app. It is the one place this
skill touches a system the repo does not contain, so it has its own gate:
- **Verify the target and the authorization first**, from the repo's own config or the user's
  explicit instruction naming the environment as their own. A local instance the user started is
  the safest target and counts; test there first. An unverifiable or third-party host does not —
  decline and confirm from source instead.
- **Passive before active.** Headers, TLS and served-bundle reads come first; active auth or
  injection probes come only after, with throwaway identifiers, never real accounts or
  state-changing calls.
- **No mass sweeps, no control evasion.** Test a small, deliberate set of candidates; a WAF or
  rate limit that blocks a probe is a result, not an obstacle.
- **A refusal is final.** If the harness refuses an active request as a third-party attack, that
  is correct. Do not retry, re-encode, or reach the same outcome another way, and do not hand the
  user the command to run instead — report the block and the source-only evidence you do have.
- Creating any test data is a separate, narrower exception (gotcha #18).

## 16. When a live check contradicts a static finding, say so explicitly — don't just fix the number
A passive or active live check will sometimes refute or soften something the static pass reported
(a static "no WAF present" finding meeting a live `x-cdn: Imperva` header; a static "no HSTS"
claim meeting a live response that has it). When this happens:
- State the correction explicitly and where it came from — "LIVE correction: the edge is fronted
  by an Imperva WAF (confirmed via response headers); the static finding is downgraded from 'no
  WAF' to 'no AWS-native WAF and no access logging'." Silently editing the finding away, or
  silently leaving the stale static claim next to a contradicting live result, both cost the
  report its credibility.
- The reverse also happens — a live check can confirm and sharpen a static finding (e.g. a
  static "hardcoded key in the client bundle" finding confirmed by grepping the actual served
  bundle for the key material). State that too, tagged LIVE-VALIDATED / CONFIRMED-live.
- Never let an unresolved contradiction sit in the same report as two different verdicts on the
  same control — one of them is wrong, and the reader has no way to tell which without redoing
  the work.

## 17. "What was checked and PASSED" vs "verified-safe / refuted" are different sections
A control that is correctly configured (parameterized queries throughout, secrets loaded from a
secret manager, a fallback-deny authorization policy) belongs in "what passed." A *specific attack
hypothesis* that was investigated and disproven with reasoning (e.g. "RS256→HS256 confusion:
refuted — only a `SymmetricSecurityKey` is ever configured, so there is no RSA key material for an
attacker to redirect an HS256 forgery against"; "XXE: not exploitable — this runtime prohibits DTD
resolution by default") belongs in "verified-safe / refuted." Conflating the two loses the
sharpest kind of negative evidence: proof that a plausible-looking vector was chased down and
closed, not merely that nobody happened to look for it.

## 18. Authorized test-data creation during live validation is a narrow, separate exception
Every live-testing dimension's DEFAULT posture is to create nothing — ACTIVE-VALIDATION's safe
patterns, the full-coverage DAST script, and DISCOVERY's click-through are all read-only/
non-mutating by default (gotcha #15's authorization-verification rule governs whether to test
live at all; this gotcha governs the separate, narrower question of ever writing anything).
Creating even minimal, disposable test data is permitted ONLY when ALL of the following hold:
- The target has already passed gotcha #15's check (host + authorization verified from the
  repo's own config or the user's explicit instruction naming it as their own environment).
- The user has EXPLICITLY authorized test-data creation for this engagement — never infer this
  from "destructive testing seems implied" or from a prior pass having done it; silence is not
  authorization, and authorization from a previous engagement/session does not carry forward.
- The write is minimal and non-bulk — one record, not a loop — and uses an account the
  assessor/user already owns or controls, never a real third party's.
- The created record is clearly tagged as scan output (a recognizable prefix/marker in whatever
  free-text field is available, e.g. `ZZTEST-` or an equivalent project convention) so it can be
  found and removed later, and, wherever practical, the write is reverted immediately after the
  proof is captured and the revert is itself verified.
Whenever this exception is used, the report's **test-data disclosure** list (`report-format.md`
§14) is mandatory, not optional: record type, id/identifiable name prefix, which test account
created it, and which part of the app it lives in — so the target's owner can find and clean it
up even if a revert was also performed. Absent explicit authorization, treat any doubt about whether a write is permitted the same as
everywhere else in this skill: decline and fall back to source-only confirmation, the same as
gotcha #15's own instruction for an unverifiable target.

## 19. A user-supplied `credentials` file at the project root is scan input, not a finding
Gotcha #15 says to confirm the live target and authorization "from the repo's own config" — a file
literally named `credentials` (no extension) sitting at the project root is that config, when the
user has told you they created it themselves specifically so this skill can pick a target URL and
login for `DISCOVERY`/`ACTIVE-VALIDATION`/a full-coverage DAST script (see
`active-dast-methodology.md`). It is not part of the application's source or its deployed code —
it never ships, it's not read by the app itself, it's a convention between the user and this skill.
Two things follow from that:
- **Read it early, in Phase 0**, specifically to seed the live-target host, username and password
  for every live-testing dimension in scope — don't wait for `DISCOVERY` to go looking for a target
  by other means when this file already states one.
- **Exclude it from SWEEP's (and every other agent's) secrets/hardcoded-credentials findings.** A
  plaintext URL+username+password in a file named exactly `credentials` at the repo root is this
  convention working as intended, not a committed-secret finding — do not write it up as one. This
  applies to that specific, exact filename at the project root only; a similarly-shaped file found
  anywhere else (a subfolder, a config directory, a different name) gets no such exemption and is
  scanned normally — the exemption is for the one deliberate hand-off point, not a blanket pass on
  anything credential-shaped.
- If you're not sure whether a `credentials`-named file is this convention or a genuine leak (e.g.
  the user hasn't mentioned creating one, or it lives somewhere other than the project root), ask
  rather than assume either way — silently excluding a real leak is as wrong as flagging the user's
  own scan-input as a vulnerability.

---

## Appendix: report format

Referenced above as `references/report-format.md` — inlined here since Copilot prompts are flat files with no sibling-file lookup:

# Report Format

The orchestrator writes this. Agents return findings; agent output is raw material,
never the deliverable.

## Finding IDs
`<FAMILY><n>` — numbered within family, stable for the life of the report.

| Family | Domain |
|---|---|
| `F` | Application / source code flaws (authz, injection, validation, crypto misuse) |
| `S` | Secrets & credentials (hardcoded, committed, exposed) |
| `I` | Infrastructure / IaC / cloud posture |
| `C` | CI/CD, build and supply chain |
| `D` | Dependency advisories & maintenance risk |

Extended-tier dimensions (AUTH, UPLOAD, BIZLOGIC, CLIENT, DATA, and any DAST-PASSIVE/
ACTIVE-VALIDATION finding not already upgrading a baseline-tier finding) fold into these same
five families rather than inventing new letters — the family scheme stays stable regardless of
which tier produced a finding:
- **AUTH, UPLOAD, BIZLOGIC, CLIENT** findings → family **F** (they are all application-layer
  logic/trust-boundary flaws, the same domain `F` already covers).
- **DATA** findings → family **F** when the issue is in application code (e.g. a logging
  statement over-capturing PII), or family **I** when it's a declared infrastructure/datastore
  posture gap (e.g. encryption-at-rest not requested in IaC) — pick whichever existing family the
  finding's actual location sits in, and say which in the finding's Location field.
- A live-only finding from DAST-PASSIVE/ACTIVE-VALIDATION that doesn't map onto any specific
  static finding still gets a family by its subject matter (an exposed header → `F`; an exposed
  secret in a response → `S`), never a bespoke prefix.
State the chosen family once per finding if it's not obviously `F` — a reader should never have
to guess why an AUTH/DATA finding ended up under a given letter.

## Severity
CRITICAL / HIGH / MEDIUM / LOW / INFO, anchored on **real exploitability in this codebase**,
not on the advisory's headline score. A HIGH-scored CVE in a dev-only build tool that never
reaches production is not a HIGH finding here — downgrade it and state the reasoning. The
reverse also holds: a MEDIUM-scored issue on an internet-facing unauthenticated path can rate
higher. Always show the adjustment, never silently restate the upstream score.

## Per-finding template
```
### S2 — [HIGH] Long-lived cloud access key committed in deploy script
- Location:      <path>:<line>
- Status:        CONFIRMED
- Evidence:      AKIA…7Q (redacted), account 1234…89
- Impact:        Valid long-lived credential granting <scope> if still active.
- OWASP:         A07:2025 Authentication Failures
- Remediation:   Rotate immediately — deletion does not remediate (no history scan available).
                 Replace with short-lived OIDC federation in the pipeline.
- References:    <advisory or documentation URL>
```
Required on every finding, no exceptions: Location, Status, Impact, Remediation. Impact must be a
genuine, specific 1-2 sentence business-impact statement grounded in that finding's real
mechanism — never blank, never a placeholder restatement of the title. Location must be a real
`file:line` whenever a single line applies; when a finding is process- or configuration-level and
no single line applies (e.g. a missing CI secret-scanning gate, an org-wide IAM policy), state
that plainly instead of omitting the field — e.g. "general CI/CD artifact-handling process — no
single line, this is a process gap." A missing Location or Impact field is a defect in the report,
not an acceptable gap.
Every dependency finding (`D*`) must cite at least one upstream advisory URL —
`https://github.com/advisories/GHSA-…` or `https://nvd.nist.gov/vuln/detail/CVE-…` —
so it can be verified without rerunning the scan.

**Never present live-test evidence as a raw byte-count comparison** ("own id: 200/2170 bytes,
adjacent id: 404/125 bytes"). A size number proves nothing to the reader on its own and reads as
noise. Show the real thing instead: the actual (redacted) request and response content — pulled
from wherever it was captured, not re-derived or approximated — pretty-printed and readable. For a
non-text/binary response, don't cite its size either; state plainly what it is ("returns a
generated Excel document; content not displayable as text") and compare on status code only. This
applies everywhere live evidence is quoted — per-finding write-ups, the Appendix request log, and
the full endpoint evidence log below — never only in one of them.

## CONFIRMED vs PLAUSIBLE
- **CONFIRMED** — verified by reading the file, resolving the version, or a positive API hit.
- **PLAUSIBLE** — pattern matched and looks real, but liveness or exploitability is unverified.
Keep them in separate subsections. Never promote a placeholder (`YOUR_API_KEY_HERE`, `xxxx`,
`changeme`, `<secret>`, documented examples) into a finding — one inflated finding costs the
whole report its credibility.

## Required report sections
1. **Executive summary** — counts by severity; the three things to fix first.
2. **Scope & method** — which dimensions ran, which ecosystems and infra were detected,
   which tools and data sources were used, and the positive-control results. This is also the
   methodology / rules-of-engagement section: co-locate the exclusions and scope-boundary
   statement here (what was explicitly out of scope and why), or if it is written out in full in
   section 3 instead, put an explicit one-line cross-reference here pointing to it — never leave
   exclusions to be discovered only in section 3 with no link from here.
3. **Coverage & limitations** — what was NOT scanned and why: no version history; toolchain
   unable to restore a project so transitives unscanned; duplicate lockfiles and which was used;
   no runtime/DAST testing; no access to production configuration or live cloud state. When the
   extended tier (BFLA/upload/SSRF deep-dive) was not run, add one explicit line scoping what a
   follow-up pass would need — an ID-prefix scheme for its findings and the CONFIRMED-in-code vs
   NEEDS-DYNAMIC tagging convention it would use — rather than silently omitting the tier.
4. **Findings** — severity descending, grouped by family, CONFIRMED before PLAUSIBLE.
5. **Secrets & credential exposure** (`S*`) — mandatory dedicated section whenever any `S*`
   finding exists; never scatter secrets findings through the general findings list only (they
   still appear there too, but this section is where they get read as a group). Contents:
   - A short prevailing-pattern intro paragraph — name the pattern across the findings (e.g.
     "cloud credentials are hardcoded into deploy scripts three separate times, all in the same
     `scripts/deploy/` tree"), not just a list of unrelated instances.
   - A `.gitignore`-adequacy subsection: don't just say pass/fail — list the concrete additional
     patterns this repo should add (e.g. `*.pfx`, `.env*`, `**/appsettings.*.json`, `*.pem`), each
     tied to a secret type actually found or plausible here.
   - A structured **"committed secret = incident, not just rotate"** table for every CONFIRMED
     committed secret, columns: Step | What to do | Why — at minimum: rotate & revoke the
     credential; establish the exposure window via a history scan (when a `.git` history exists);
     hunt for actual abuse (billing anomalies, unfamiliar access, CloudTrail/audit-log review);
     decide on notification (customer, compliance, internal security). Deletion from the current
     tree is never sufficient by itself — say so.
6. **CI/CD & infrastructure findings** (`C*` / `I*`) — mandatory dedicated section whenever any
   `C*` or `I*` finding exists. Immediately BEFORE the finding cards, include a **"controls
   already implemented correctly"** callout: a short list of genuinely-sound existing CI/CD and
   infra controls (e.g. "actions pinned to commit SHA", "OIDC federation already used for cloud
   auth, no long-lived keys in the pipeline", "encryption at rest enabled on all datastores").
   This is a localized, up-front credibility marker for this specific section — distinct from and
   in addition to the report-wide "What was checked and PASSED" section, which is the exhaustive
   list; this callout is the short, section-local version a reader sees right before the bad news.
7. **Dependency advisories & SBOM** (`D*`) — dedicated section combining the advisory findings
   and the SBOM summary (do not leave the SBOM as a standalone file only). Contents:
   - Stat cards up top: total packages scanned, vulnerable count, CRITICAL/HIGH/MEDIUM/LOW counts,
     direct vs transitive split.
   - The vulnerable-package table itself: package, ecosystem, installed, fixed-in, severity,
     **CVSS score** (not just advisory ID and a one-line summary), advisory URL, **fix reachable?
     (yes / blocked by parent pin — structural)**.
   - A **structural exposure** note for any unfixable transitive chain (parent pin blocks the
     fix): name the chain and the blocking parent. When transitives could not be scanned at all
     (toolchain couldn't restore the project — gotchas #3), say that plainly instead of a
     structural-exposure claim you can't actually back — those are two different limitations and
     the report must say which one applies.
   - A coverage-limits note specific to this section (which manifests/lockfiles were covered,
     which were not, why).
   - Cross-reference the full machine-readable SBOM file (path, format — CycloneDX/SPDX,
     generator, manifests covered) for the complete row-by-row data; do not duplicate every row
     of a large dependency tree inline in the report body — the table above is the
     findings/vulnerable subset, the file is the full inventory.
8. **Maintenance risk** — outdated / EOL / deprecated / yanked / unmaintained / archived
   upstream. SEPARATE from section 7 (gotchas #8).
9. **What was checked and PASSED** — mandatory. Name the controls verified as sound.
10. **Verified-safe / refuted** — mandatory whenever a plausible-looking vuln class was
    investigated and found NOT to hold (e.g. "RS256→HS256 confusion: refuted — only a
    `SymmetricSecurityKey` is ever configured, no RSA path exists for an attacker to redirect
    against"; "XXE: not exploitable on this runtime — DTD prohibited by default"). This is
    distinct from section 9: "passed" lists controls that are correctly configured; this section
    lists specific attack hypotheses that were chased down and disproven, with the reasoning.
    Both are credibility-building negatives — a report of only bad news reads as unverified.
11. **OWASP Top 10:2025 coverage map** — category → finding IDs. Every category gets one of
    three explicit statuses: **BROKEN** (≥1 confirmed finding violates it — cite the IDs),
    **NOT OBSERVED** (considered, no qualifying finding at the confidence gate), or
    **NOT ASSESSED** (excluded from this engagement's scope — say why). Never leave a category
    silently blank. Use the current taxonomy (verify at `top10.owasp.org/2025`; do not map from
    memory). Key shifts from 2021: A02↔Security Misconfiguration (up to #2); **A03 Software
    Supply Chain Failures** (broadened from "Vulnerable & Outdated Components" — it now houses
    BOTH dependency advisories `D*` AND CI/CD supply-chain findings like mutable image tags,
    deleted lockfiles, unpinned actions); A04 Cryptographic Failures; A05 Injection; A06 Insecure
    Design; A07 renamed "Authentication Failures"; A09 renamed "Security Logging & Alerting
    Failures"; SSRF folded into A01; new **A10 Mishandling of Exceptional Conditions** (verbose
    errors to client, fail-open handling). When mapping to a renamed/new category on lighter
    evidence, say so — don't inflate a "broken" verdict past what the findings support.
12. **Confidence scores** — per domain, formula below. Include one plain explanatory sentence
    for a reader unfamiliar with this scoring, framing what the number does and doesn't mean —
    e.g. "this is relative risk exposure across weighted domains, not a percentage of code
    reviewed and not a compliance pass/fail threshold." Without that sentence a raw number invites
    exactly the misreading it's meant to avoid.
13. **Prioritized remediation plan** — ordered, with effort and owner per item; separate
    "rotate now" items from "schedule" items. For a comprehensive/deep-dive review (extended
    tier spawned, or ≥15 confirmed findings), also include:
    - **Quick wins as a ranked table**, not a flat bullet list — columns: # | Quick win | Finding
      | Effort | Why it pays off — ordered urgency-then-ease, separate from the full sequenced
      roadmap.
    - **A projected-grade note per phase** of the roadmap (quick wins / near-term / structural,
      or however the phases are split) — e.g. "Quick wins: projected Grade E → D." Reason it from
      which confidence-score domains that phase's fixes actually touch and by how much (tie it
      back to section 12's domain scores) — never an arbitrary letter pulled from nowhere.
    - **Remediation verification** — for every HIGH/CRITICAL, one line stating the exact retest
      that must now FAIL (be blocked) once the fix ships, e.g. "F1: `createPassword` with no/
      invalid reset token → rejected (401/400), no password set." A fix isn't done until the
      original attack no longer works; this table is what proves it, and it doubles as the
      QA/regression-test spec.
    - **Systemic root causes** — when findings cluster into repeating patterns (the same
      client-supplied-identity-as-authorization bug in three endpoints; hardcoded keys in two
      unrelated modules; secrets committed three separate times despite a `.gitignore`), name
      the pattern once, list every finding it produced, and give ONE control that prevents the
      whole class recurring (a lint, a shared authorization primitive, a CI secret-scanning
      gate) — this is higher-leverage than closing findings one at a time and is what a
      leadership audience should act on.
14. **Cyberattack exposure & threat assessment** — required for a comprehensive/deep-dive
    review (see coverage-checklist.md); optional but recommended otherwise. Synthesizes
    individual findings into how an attacker actually chains them:
    - **Threat-actor applicability table** — for each actor type in scope (unauthenticated
      external attacker, authenticated low-privilege user, malicious/compromised insider or
      repo-access holder, opportunistic/commodity automated attacker, supply-chain attacker),
      state motivation, the capability/access level required GIVEN THIS CODEBASE'S findings
      (not generically), and the realistic outcome.
    - **Attack chains** — number each chain, cite the finding IDs it strings together in order,
      tag steps with MITRE ATT&CK technique IDs where a clear one applies (e.g. `T1190`
      exploit public-facing app, `T1552.001` credentials in files, `T1078` valid accounts), and
      state plainly "what stops it today" (a real control) vs nothing.
    - **Exposure rating by attack surface** — a table of surface → likelihood (with basis) →
      impact → exposure rating, distinct from per-finding severity: this rates the surface as a
      whole (e.g. "pre-auth application" surface can be CRITICAL even if each contributing
      finding is individually only HIGH, because they chain).
    - **What materially reduces exposure fastest** — a distinctly-labeled subsection naming the
      top 3 highest-leverage actions across the whole assessment. Cross-reference the remediation
      roadmap's most urgent phase (section 13) by name rather than re-describing those fixes here
      — this subsection is about which few actions collapse the most attack chains at once, not a
      second remediation list.
    - **Live-validation corrections table** — one row per instance where a live check (from
      ACTIVE-VALIDATION / DAST-PASSIVE) confirmed, upgraded, or corrected a static claim that is
      relevant to exposure (e.g. a static "no WAF" finding refuted by a live `x-cdn` header; a
      static PLAUSIBLE injection upgraded to LIVE-VALIDATED). Columns: static claim | live check |
      result | effect on this section's exposure rating. This belongs here in addition to wherever
      DAST results are otherwise reported — the threat-assessment reader should not have to jump
      to the DAST section to see what live checks changed about the exposure picture.
    - State plainly what this section does NOT establish (no live exploitation attempted beyond
      what §Active Validation covers; no proof of active compromise) — this section reasons
      about chains from confirmed findings, it does not claim to have executed them end-to-end
      unless each step is separately marked LIVE-VALIDATED.
    - **Test-data disclosure** — if active validation created any test data (see gotcha #18),
      list exactly what was created: record type, id/identifiable name prefix, which test account
      created it, and which section of the app it lives in — so the app owner can find and clean
      it up. This is mandatory whenever any create-type request was made during active validation,
      not an optional footnote.
15. **Appendix** — consolidates material that would otherwise be scattered as inline mentions
    across the document. Never invent new content here — every row pulls from checks and lists
    already described elsewhere in the report:
    - **Active-validation request log** — an actual table (not prose), one row per live request
      made under ACTIVE-VALIDATION/DAST-PASSIVE: request sent (redacted) | response observed |
      what it confirmed. Pull rows from what's already described in the findings and in the
      cyberattack-exposure live-validation-corrections table; never fabricate a request that
      wasn't actually sent.
    - **Discovery endpoint inventory** — when DISCOVERY ran, its deduped method+path inventory and
      OWASP-ranked candidate list land here, even for findings that never got upgraded to LIVE —
      this is what shows a reader which candidates ACTIVE-VALIDATION chose from and why the chosen
      few were prioritized; never let DISCOVERY's output disappear silently into a scratchpad file
      the report never surfaces.
    - **Full DAST endpoint evidence log** — only when the comprehensive full-API-coverage pattern
      (`active-dast-methodology.md`) was used, not the lightweight few-request brief above: every
      candidate endpoint from the target's API surface appears here exactly once, live-tested or
      explicitly marked excluded with its reason — never silently dropped. One entry per endpoint
      (grouped by controller/module), showing the actual checks run and the real captured
      evidence (request + response, redacted, no byte counts, per the rule above). See
      `report-rendering.md` for how to render this without producing an unnavigable wall of text.
    - **Consolidated tooling list** — every scanner, API, and native audit command actually used
      (OSV, native ecosystem auditors, secret-scanners, IaC linters, etc.), in one place, instead
      of only mentioned in passing in Scope & method.
    - **Consolidated standards-references list** — OWASP Top 10 version and URL (e.g.
      `top10.owasp.org/2025`), CWE, and MITRE ATT&CK, gathered in one place rather than left as
      separate inline citations spread through the findings and the threat-assessment section.
    - **Report handling & distribution** — closing paragraph of this section (not a separate
      numbered section), always present when the report contains live-exploitation detail, any
      credential/key reference (even redacted), a named customer/environment, or internal
      hostnames: state the intended audience (need-to-know / the remediation team), and note that
      a wider audience (board, customer, auditor) should receive a redacted version with exploit
      specifics, key references, customer names and internal hostnames removed — finding,
      severity and remediation are sufficient for that audience. This is not optional legal
      boilerplate; a report with live PoC detail is itself sensitive material and should not
      default to broad distribution.

## Confidence scoring
Do NOT use a flat `100 − (High×5 + Med×3)`: it goes negative past roughly twenty findings and
implies a thoroughly scanned project scores worse than an unscanned one.

Use a **weighted per-domain mean**. Score each in-scope domain 0–100:

```
domain_score     = 100 × coverage_factor × (1 − severity_penalty)

coverage_factor  = fraction of the domain actually examined (0–1);
                   reduce for each limitation (unscanned transitives, no history, no live state)
severity_penalty = min(0.9, (0.25·CRIT + 0.15·HIGH + 0.07·MED + 0.02·LOW) / sqrt(assets_examined))
```
Clamp each domain to [0, 100]. Overall = mean of the in-scope domain scores, weighted by each
domain's relevance to this codebase. A domain with no assets (no IaC in the repo) gets
**weight 0 — excluded**, never a free score of 100.

Present as a table: Domain | Coverage | Findings (C/H/M/L) | Score | Note.
Print the formula in the report so the number is auditable.

## Tone
Accurate, not alarmist. State uncertainty as uncertainty. Prefer "unverified — could not
determine whether this credential is still active" over either "critical breach" or silence.

**Write for a mixed audience of developers and non-technical stakeholders — plain English, not
security jargon.** Every finding's Impact and Remediation fields (and the executive summary) must
be understandable by someone without a security background: short sentences, define an acronym or
term of art on first use (or avoid it), and explain the mechanism in concrete terms ("anyone with
no login can call this and adjust stock or place orders" beats "the fail-closed authorization
policy is not enforced on this controller"). This does not mean removing precision — keep every
exact finding ID, file:line, endpoint name, and status code — it means explaining what those facts
mean in plain terms alongside stating them, not instead of.

---

## Appendix: report rendering

Referenced above as `references/report-rendering.md` — inlined here since Copilot prompts are flat files with no sibling-file lookup:

# Report Rendering

`report-format.md` specifies WHAT a report contains. This file specifies HOW to render that
content as a polished, shareable HTML file and PDF. Read this only once you're producing a
rendered deliverable, not a plain markdown/text answer.

## When to produce a rendered HTML/PDF report

Produce the full HTML+PDF pipeline when any of these hold:
- The user explicitly asks for a "report," "PDF," "document," or a shareable deliverable.
- This is a comprehensive/deep-dive review — the same trigger condition `report-format.md` uses
  for its extended sections (extended tier spawned, the user asked for a "thorough"/"complete"
  assessment, or ≥15 confirmed findings).
- There's an existing project convention for it — a prior `report.html`/`report.pdf` already in
  the repo, or a `reports/security-assessment/` folder already present in the docs root.

For a narrow single-dimension answer ("any CVEs?", "any hardcoded secrets?"), a plain findings
list is sufficient — don't over-produce a rendered report nobody asked for.

## File layout convention

These are project deliverables, so they land in the docs root (`<docs root>/reports/security-assessment/`, resolved per
`reference/docs-path-resolution.md`), not the scratchpad:

```
<docs root>/reports/security-assessment/
  FINDINGS.md        # markdown source of truth — structured per report-format.md
  report.html        # rendered version of FINDINGS.md
  report.pdf         # printed from report.html
  evidence/          # raw scan data, organized by dimension — see redaction note below
  scripts/           # reusable scan/discovery scripts
  SBOM.md            # (if produced) dependency bill of materials
  sbom.cdx.json      # (if produced) machine-readable SBOM, CycloneDX
  AUDIT.md           # (if produced) structural self-audit of the assessment itself
```

**`FINDINGS.md` is the single source of truth.** `report.html`/`report.pdf` are rendered FROM it.
Any correction happens in `FINDINGS.md` first, then the HTML/PDF are regenerated — never edited
independently. Editing the HTML directly is exactly how the two drift apart across passes.

The SBOM, when produced, is cross-referenced from `report.html` (per `report-format.md`'s
dependency section) rather than duplicated inline — the report shows the vulnerable subset, the
SBOM file is the full inventory.

**Redaction is a write-time guarantee, not a promotion-time filter.** Per gotcha #9, every agent
redacts on write — scratchpad data is never in an unredacted state to begin with, because it gets
read back during Phase 2 consolidation. Copying/moving that same data into `evidence/` for the
final deliverable does not get a second chance to catch what should already be clean: if anything
unredacted reaches `evidence/`, gotcha #9 was violated upstream and that is itself a defect to fix
at the source agent, not something this folder's own naming is relied on to filter. Before
publishing, do one explicit grep of `evidence/` for raw-looking secrets (long high-entropy runs,
`-----BEGIN`, bare JWTs) as a final confirmation that the write-time rule actually held — treat
any hit as a stop-the-release bug, not a thing to quietly scrub and move on from.

## The HTML design system

A single self-contained HTML file: inline CSS only, no external font/script/stylesheet
dependencies, so it renders correctly offline and prints cleanly.

Default CSS custom-property palette — a brand-neutral, high-contrast enterprise-report look.
Teams can swap the actual color values for their own brand, but should keep this same variable
*scheme* so the rest of this guidance stays valid:

```css
:root{
  --bg:#eceff4; --card:#ffffff; --ink:#141a24; --muted:#586274; --line:#e0e5ec;
  --crit:#8e0038; --high:#c62828; --med:#b26a00; --low:#2e7d32; --info:#1565c0;
  --chip:#eef1f6; --accent:#0b47c2; --code:#0f172a; --codebg:#f4f6fa;
  --ok:#2e7d32; --gaugebg:#e6eaf0; --band:#8e0038; --headbg:#0f1b31; --headink:#eaf0fb;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#0b0e13; --card:#141a21; --ink:#e6edf3; --muted:#9aa4b2; --line:#232a34;
    --crit:#ff5c93; --high:#ff6b6b; --med:#e0a24a; --low:#6cc46c; --info:#5aa9ff;
    --chip:#1b222c; --accent:#6ea8ff; --code:#e6edf3; --codebg:#0d1117; --gaugebg:#232a34;
    --headbg:#0a1120; --headink:#eaf0fb;
  }
}
:root[data-theme="dark"]{
  --bg:#0b0e13; --card:#141a21; --ink:#e6edf3; --muted:#9aa4b2; --line:#232a34;
  --crit:#ff5c93; --high:#ff6b6b; --med:#e0a24a; --low:#6cc46c; --info:#5aa9ff;
  --chip:#1b222c; --accent:#6ea8ff; --code:#e6edf3; --codebg:#0d1117; --gaugebg:#232a34;
  --headbg:#0a1120; --headink:#eaf0fb;
}
```

Both the `@media (prefers-color-scheme: dark)` block AND the explicit `:root[data-theme="dark"]`
block are required, not redundant. The media query alone only responds to OS-level preference —
it misses a page or environment that force-sets `data-theme="dark"` independently of OS
preference (e.g. a viewer or wrapper app that applies the attribute regardless of system theme).
A structural self-audit this session found exactly this gap: a report styled with only the media
query rendered in light colors on an ink-dark-forced environment, unreadable against a dark
surrounding chrome. Ship both blocks.

## Structural elements

Each element below maps to the `report-format.md` content section it renders — this file is "how
to render," that file is "what to include."

- **Confidentiality banner** — full-width, bold, uppercase, colored per classification; repeated
  identically at the very top and the very bottom of the page. Renders the distribution/handling
  statement from the Appendix's "report handling & distribution" paragraph.
- **Cover block** — dark block using `--headbg`/`--headink`: uppercase eyebrow label, H1 title,
  a one-paragraph lede, and a responsive meta-grid of key/value pairs (prepared-by, target,
  environment, date, report reference, classification, standards, rules-of-engagement). Draws
  from the Executive Summary and Scope & Method sections.
- **Overall-exposure callout** — directly under the cover, colored by real severity. Grounded in
  the actual confidence score / grade from the Confidence Scores section — never inflate this to
  look more dramatic than the underlying data supports, and never downplay it either.
- **Table of contents** — two-column box (collapsing to one column under ~620px) linking every
  major section by anchor, in the same order as `report-format.md`'s Required report sections.
- **Stat-card grid** — "assessment by the numbers" summaries: responsive
  `repeat(auto-fit,minmax(118px,1fr))` grid, bold number over a small uppercase label. Used for
  the Executive Summary counts and the dependency section's stat cards.
- **Severity bar chart** — alongside (not instead of) the findings-summary table, a simple
  horizontal bar per severity (Critical/High/Medium/Low), each bar's width proportional to its
  count, colored via `--crit/--high/--med/--low`. Gives an at-a-glance shape to the finding
  distribution before the reader gets to the table itself.
- **Severity badges** — pill-shaped, bold, uppercase, colored per `--crit/--high/--med/--low/--info`.
  Plus a distinct `LIVE-VALIDATED` pill in `--ok` green for live-confirmed findings, and a lighter
  chip style for `CONFIRMED-in-code`/`NEEDS-DYNAMIC` status tags (extended-tier findings).
- **Finding cards** — border-left in the severity color; header row (ID + title + severity/LIVE
  badges); tag row (OWASP category, CWE, confidence score, attacker-effort rating); then labeled
  field blocks in this order: LOCATION (monospace, small, light background), DESCRIPTION/EVIDENCE
  (code-styled block for any snippet), BUSINESS IMPACT, FIX/RECOMMENDATION. **Every field is
  mandatory on every card — never render an empty/blank field block.** If `report-format.md`'s
  per-finding data is missing a field (e.g. no Business Impact was ever written), that's a content
  gap to fix in `FINDINGS.md` first, not something to silently skip when rendering.
  Style each label as a small uppercase tick-marked heading (a short colored accent bar or `::before`
  tick in the card's severity color, e.g. `▍IMPACT`) rather than a plain bold word — this is the
  advisory-card look (as in a professional pentest-tooling report) that reads as more polished than
  a flat label, at zero cost to the mandatory-field rule above (still four fields, just styled).
- **Request/response evidence panels** — anywhere a live request/response pair is quoted (a
  finding's Evidence field, the Appendix request log, the full endpoint evidence log below), render
  each side as its own bordered, monospace, lightly-shaded panel (a subtle background tint distinct
  from the page background, `--codebg`), with a small uppercase tab label directly above it
  ("REQUEST" / "RESPONSE" / "OWN ID" / "ADJACENT ID" as fits the context) — never just a bare `<pre>`
  block with no label, and never a bare byte-count line standing in for one (see `report-format.md`'s
  rule against byte-count comparisons — this is its rendering side).
- **Full DAST endpoint evidence log** (when `active-dast-methodology.md`'s comprehensive pattern
  produced one) — this can run to hundreds of entries, so render it as collapsible `<details>`
  elements (one per endpoint), grouped under a `<h4>`/bold heading per controller/module, collapsed
  by default for on-screen browsing. The `<summary>` line states the endpoint + method + a short
  plain-language verdict (never a byte count) — e.g. "Auth NOT enforced", "adjacent id returns real
  data", "excluded — state-mutating". Color-code each entry by outcome so real issues are visually
  distinct from clean passes at a glance: a colored left border (and/or a small leading dot) —
  red/orange for a real finding (auth not enforced, adjacent id returned non-rejected real data),
  green for a clean pass (auth enforced, adjacent id correctly blocked), grey for excluded or
  inconclusive (no signal either way). This is the single most useful visual cue in a report this
  size — a reader should never have to open every entry to find the ones that matter.
  **Critical PDF-rendering step, easy to miss:** `<details>` renders collapsed by default, and a
  headless-browser PDF print of a collapsed `<details>` omits its content entirely — before calling
  `page.pdf()`, force every one open: `await page.evaluate(() => document.querySelectorAll('details')
  .forEach(d => d.open = true))`. Skipping this silently produces a PDF where the entire evidence log
  reads as a wall of one-line summaries with no evidence inside — verify by checking that the PDF's
  extracted text actually contains the expected JSON/request content, not just the summary lines.
- **Tables** — findings summary, OWASP map, confidence-score domains, attack-surface, threat-actor,
  exposure-rating, remediation quick-wins, retest-verification, appendix logs: all share one
  visual style — header row in a light tint, 1px bordered body rows, monospace font for
  code-like cell content (IDs, file paths, CWE numbers).
- **Confidence-score section** — a large score number next to a grade-letter pill, a horizontal
  gauge bar, and a per-domain mini-table each with its own inline progress bar. Renders
  `report-format.md`'s weighted per-domain-mean formula and its table (Domain | Coverage |
  Findings | Score | Note) — print the formula on the page too, so the number stays auditable.
- **Body typography** — system UI font stack
  (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`),
  ~15px/1.62 line-height; max content width ~1080px centered with ~20px side padding; no
  horizontal scroll at phone width.

## PDF rendering mechanics

1. Check for an available headless-browser tool before starting anything new. Playwright is
   commonly already present under a project's or a global `node_modules/playwright` — check
   there first rather than assuming a fresh install is needed.
2. If truly absent, a fresh `npm install playwright` in your own scratchpad is fine, and
   `npx playwright install chromium` if the browser binary itself is missing.
3. Render:
   - Open the finished `report.html` via a local `file://` URL.
   - `page.emulateMedia({media:'print'})`
   - `page.pdf({format:'A4', printBackground:true, margin:{top:'16mm',bottom:'16mm',left:'15mm',right:'15mm'}})`
4. If no headless-browser capability is available at all after a bounded attempt (a few minutes,
   not longer), say so plainly and deliver the HTML only. Never fabricate or leave behind an
   empty/placeholder PDF file.

## Verification, always

After producing `report.pdf`, confirm it is non-trivial:
- **File size** should scale with content volume — a report with dozens of findings should be
  several hundred KB to a few MB, not a few KB.
- **Page count** should be plausible for the amount of content rendered — extract it via a
  `/Type /Page` object-count grep on the raw PDF bytes, or a PDF-reading library/CLI tool if
  available.

A silently-empty or 1-page PDF for a large report is a rendering failure, not a success —
investigate and re-render rather than reporting it as done.

## Regeneration discipline

Whenever `FINDINGS.md` changes after `report.html`/`report.pdf` already exist, both derived files
MUST be regenerated from the updated source before the task is considered complete. Never leave
`report.html`/`report.pdf` stale relative to `FINDINGS.md` — this drift is exactly the failure
mode across multiple editing passes: a correction lands in the markdown, and the rendered
deliverable someone actually reads or prints still shows the old version.
