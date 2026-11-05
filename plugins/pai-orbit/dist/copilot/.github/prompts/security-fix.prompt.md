---
mode: agent
description: "[skill] Security findings remediation. Intakes a findings tracker (xlsx/csv) or assessment report, triages each finding against the code,…"
tools: ["codebase", "editFiles", "runCommands", "search"]
---


# Security Fix

Turns a list of security findings into verified fixes. The fixing itself is done by `/build`; this skill does what `/build` does not: intake, triage, grouping, routing, proof, and tracker write-back.

Reads from:
- The findings source the user names: a tracker (`.xlsx` / `.csv`) or an assessment report (`.md`, `.html`, `.pdf`, e.g. `security-assessment/FINDINGS.md` from `security-scan`)
- `AGENTS.md`, `<docs root>/architecture/constraints.md`, relevant `<docs root>/decisions/`
- The current code at each finding's cited location

Writes to (docs root resolved per `reference/docs-path-resolution.md`):
- `<docs root>/wip/security-fix-<date>/triage.md`: the working table, the single source of truth for this run
- `<docs root>/features/security-remediation-<date>/requirements.md` and `design.md`: mini-specs `/build` consumes
- `<docs root>/wip/security-fix-<date>/ops-actions.md`: work code cannot do, for humans
- `<docs root>/wip/security-fix-<date>/tracker-update.csv`, plus an updated tracker **copy** when the source was a spreadsheet

**Never overwrite the original tracker or report.** It belongs to whoever commissioned the assessment. Write a copy.


## Rules that hold for the whole run

- **A finding is fixed only when an attack test proves it.** Every code-lane finding gets a regression test, named with the finding ID, that performs the attack. It must fail on the pre-fix code and pass after. Passing the existing suite is not proof.
- **Fix the root cause once.** When several findings share a cause (e.g. missing deny-by-default authorization), fix the cause centrally, then confirm each finding individually.
- **Never mark ops work as done.** Removing a secret from code does not close a leaked-secret finding. The secret must be rotated, and that is a human action.
- **Flag, don't guess.** If a finding cannot be located in the code, or the fix would change behaviour someone depends on, say so in the triage table. Do not silently skip it or silently "fix" it.


## Procedure

### 1. Intake

Read the findings source into a working list: `ID | Severity | Location (file:line if given) | Finding | Recommended action | Existing status/notes`.

- **xlsx:** read with whatever spreadsheet tooling is available (e.g. Python `openpyxl`). If none is available, ask the user to export the sheet as CSV. Do not guess at cell contents.
- **Report:** take each finding's own detail section, not just the summary table. The detail holds the exact location and the vulnerable pattern.
- Keep every column the source has. You will write the same shape back in step 7.
- If a finding's existing status says it is already being worked on (e.g. "in progress", "being developed"), mark it **skip, in progress elsewhere** unless the user says otherwise.

### 2. Triage against the current code

For each finding, open the cited location (or search for the described pattern) and record:

| Column | Values |
|---|---|
| **Present?** | `Yes (file:line)` / `Not found`, with what you searched / `Already fixed (file:line)` |
| **Actually High/Critical?** | `Yes` / `Lower: <reason>` / `Higher: <reason>`, judged on real exploitability in this codebase |
| **Group** | One of A–I below |
| **Lane** | `code` / `design` / `ops` / `skip` (see step 3) |
| **Fix?** | `Yes` / `No: false positive (<evidence>)` / `No: accepted risk (needs owner sign-off)` / `Ops only` / `In progress elsewhere` |

**Fix groups:**

| Group | Root cause | Typical lane |
|---|---|---|
| **A. Auth missing / fails open** | Endpoints without auth, no deny-by-default policy, filters that allow on error, auth validation disabled | code |
| **B. Token forging / minting** | Identity read from unvalidated tokens, tokens minted from guessable or public IDs | code if the change is local; design if the token model changes across apps |
| **C. IDOR / cross-tenant** | Tenant or owner ID taken from the request instead of the authenticated identity | code |
| **D. Business-logic trust** | Client-controlled amounts or prices, unverified payment callbacks, skipped checks | code |
| **E. Hardcoded secrets** | Keys, passwords or connection strings in source or config | code (move to config) **and** ops (rotate, purge history) |
| **F. Vulnerable dependencies** | Packages with advisories | code for patch/minor bumps; design for major or EOL upgrades; note where no fix exists |
| **G. Password / crypto storage** | Reversible encryption, weak hashing, plaintext in logs, email or cookies | code, with a **data migration for existing rows** |
| **H. Injection / SSRF** | String-built queries or commands, request-controlled URLs | code |
| **I. CI/CD / infra** | Pipeline gates, cloud trust policies, scanner config | ops or design; often outside the app repo |

### 3. Route to lanes

- **code:** the fix is clear from the recommended action plus a recipe below, and it stays within the declared architecture constraints.
- **design:** a real choice exists (a new token model, a password migration strategy that affects other systems, a major framework upgrade), or the fix crosses a `constraints.md` boundary. Route to `/design` with the finding IDs. Don't decide it here.
- **ops:** needs action outside the code: rotate credentials, purge git history, change cloud IAM or pipeline settings, review audit logs for past abuse.
- **skip:** not present, a false positive with evidence, or in progress elsewhere.

### 4. Confirm the plan (one checkpoint)

Show the user a short summary: counts per lane and group, every `Lower` / `No` / `design` / `ops` decision with its one-line reason, and the fix order. Ask once for confirmation or corrections. Security priority and risk acceptance are the owner's call.

If the user already said to proceed without stopping (e.g. "fix everything, don't ask"), state the plan and continue. Still record every `No` / `Lower` decision in `triage.md` for review.

### 5. Write the mini-spec and hand off to `/build`

Write `features/security-remediation-<date>/requirements.md` and `design.md` so `/build`'s readiness gate is satisfied without a separate groom or design cycle:

- **requirements.md:** one section per group. Each finding gets two acceptance criteria: *the attack in the finding is blocked* and *the legitimate use it touches still works*, both stated concretely (endpoint, actor, expected status or result).
- **design.md:** one section per group, with the chosen recipe (below), the files involved, and the fix order. Note any new pattern that needs an ADR (e.g. deny-by-default authorization).

Fix order (later groups rely on earlier ones):
1. **E** (move secrets to configuration; other fixes may need new config)
2. **A** (deny-by-default authorization)
3. **B** (token handling)
4. **C** (ownership checks)
5. **D** (business logic)
6. **H** (injection)
7. **G** (password storage and migration; may need a legacy key from E's config)
8. **F** (dependencies)

Then switch to `/build` with the mini-spec as the work item. Independent groups can run as parallel streams. Each finding's regression test is written **first** and seen failing before the fix.

**Recipes** (adapt to the stack; follow the codebase's existing patterns where a correct one exists):
- **A:** global fallback policy requiring an authenticated user; mark only genuinely public endpoints anonymous; role or policy checks on privileged areas; auth filters fail **closed** (missing, unknown or erroring → 401/403, never allow from a `catch`).
- **B:** take identity only from the framework's validated principal (signature, lifetime, issuer and audience where applicable); never from decoded-but-unvalidated token contents or a public ID; re-load the user server-side when reissuing.
- **C:** derive the tenant or owner from the authenticated identity; for resources looked up by ID, check ownership and return 404/403 on mismatch.
- **D:** recompute money server-side from the authoritative record; verify payment-provider callbacks with the provider, not from redirect parameters.
- **E:** read from environment or a secret store; fail startup when a required secret is missing; keep placeholders, not values, in committed config.
- **F:** bump to the first fixed version; run the full suite; if no fix exists, record that, plus any mitigation, instead of claiming it is done.
- **G:** one-way adaptive hash (PBKDF2, bcrypt, Argon2); migrate **all** existing rows, not just users who log in again; password reset by single-use, expiring token (store only its hash); never email or log a password.
- **H:** parameterised queries for every value; allow-list outbound hosts and schemes for request-controlled URLs.

### 6. Ops actions

Write `ops-actions.md`: one checklist item per ops-lane action, each with the finding ID, the exact secret or setting (by name, **never by value**), the action, and how to verify it. Always include, where they apply:
- rotate every exposed credential (the value in git history is compromised even after removal)
- purge history, only with explicit owner approval (destructive, rewrites shared history)
- review logs for past abuse of the exposed credential or endpoint

### 7. Write back

After `/build` finishes:
1. Run the full suite, including all new regression tests. Record pass/fail per finding ID.
2. Update `triage.md` with the outcome per finding: `Fixed (test <name>, commit <sha>)` / `Partially fixed: <what's left>` / `Ops pending` / `Design pending` / `Not fixed: <why>`.
3. Write `tracker-update.csv` with the source's ID column plus its triage, fix-decision, notes and status columns, filled from `triage.md`. **Fill the columns the source already has** (map by meaning, e.g. "Actually High/Critical?", "Are We To Fix This?", "Our Action / Notes", "Status"). Add a new column only when the source has no column for that value, and never add a parallel duplicate of an existing one. Status values: `Fixed - pending verification` (code done and tested), `Ops action required`, `Design required`, `Won't fix - <reason>`, `In progress elsewhere`.
4. If the source was a spreadsheet and tooling allows, write `<original name>-updated-<date>.xlsx` next to the original, with those columns filled in.

**Never write plain "Fixed"** while ops work for that finding is open, or before independent verification.

### 8. Hand off for verification

Recommend independent verification: `security-scan-retest` if available (it re-checks each finding against the code and a test environment), otherwise `/review security` on the fix branch. Code-lane findings stay `Fixed - pending verification` until that passes.


## Output to the user

End with:
- a table of counts by lane, and fixed / pending / not fixed
- the ops actions, with the owner needed for each
- links to `triage.md`, `ops-actions.md` and the tracker update
- anything found along the way that was not in the source (new issues go in as **new** rows marked `Found during remediation`, never silently fixed without a record)

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
