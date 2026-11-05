# Active DAST methodology — full-coverage authenticated script

A standalone pattern for when the ask is comprehensive DAST across an entire API, not a few
findings upgraded to LIVE. Built once per engagement as a script the user runs (and re-runs) themselves,
it resolves and tests EVERY safe endpoint in the target's API surface — hundreds, not a handful —
and emits one structured JSON evidence file that becomes the backbone of the report's live-validation
section. All non-destructive/authorization ground rules are unchanged from gotchas #15–17; this file
only adds the engineering pattern for doing that at full-API scale. Read gotchas #15–17 first.

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

These are the same rules as gotchas #15–17, applied at script-construction time rather than
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
