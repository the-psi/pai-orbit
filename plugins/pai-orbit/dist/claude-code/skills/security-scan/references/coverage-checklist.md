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
