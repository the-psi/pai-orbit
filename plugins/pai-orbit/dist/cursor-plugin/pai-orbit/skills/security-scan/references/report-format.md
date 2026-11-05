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
