---
mode: agent
description: "[skill] Validates whether a client's fix tracker (dev team's \"Completed and Deployed\" claims) actually closed the findings from a prior…"
tools: ["codebase", "editFiles", "runCommands", "search"]
---


# Security Fix Retesting / Remediation Validation

Re-run this whenever a client/dev team claims a prior security assessment's findings are fixed,
and you need to prove — not assume — whether that's true. The core discipline: **never accept
"fixed" on anyone's word, including your own prior pass's.** Every verdict needs either a live
HTTP observation or a direct, quoted read of the current source — not a paraphrase, not an
inference from a tracker's prose.

## 0. Inputs — get these before starting, don't guess

- The **original security assessment report** (PDF/HTML) — the one with the numbered findings
  (F1, S1, I1, C1, D1... or whatever scheme it uses). If not in the repo root, ask or search for
  it (often named `security-review-report.pdf` or similar, or in an `ProjectDocumentation`/
  `fixedIssues`-style folder).
- The **fix tracker** (usually a client-maintained spreadsheet, e.g. `*_High_Critical_Findings.xlsx`)
  with columns like Finding/Severity/Our Action/Status. This is the thing you're validating, not
  trusting.
- **Test environment access**: a UAT/staging URL and a dedicated low-privilege test account's
  credentials (often in a `User creds.txt`/`usercred.txt`-style file, or ask). Never use prod
  creds or a real customer account.
- Confirm with the user **before any live testing**: is destructive testing acceptable in this
  environment (data loss doesn't matter), or must everything be strictly read-only/non-destructive?
  Default to non-destructive unless told otherwise, and even with destructive permission, SQLi
  verification should still use the non-destructive single-quote differential first — a write test
  needs its own justification, not just "we're allowed to."
- Note whether the project has `.git` history available. If not (a plain extracted archive), every
  "fixed/removed" verdict is a **snapshot comparison**, not a diff — state this as an explicit
  scope limitation in the final report (see §7).
- Confirm the test environment is one the user owns or is explicitly authorized to test — a UAT/
  staging host named in the engagement's own credentials file or the user's direct instruction.
  Never extend live testing to a host you're inferring is related but wasn't named.

## 1. Re-derive the finding list independently — don't trust the tracker's summary

Read the **original report's own detail section** for every High/Critical finding and pull its
exact: file/line location, the vulnerable pattern described (string concatenation, missing auth
check, hardcoded key, etc.), and any especially specific/non-obvious technical detail (e.g. "proc
A escapes quotes but sibling proc B doesn't" — these specific asymmetries are gold: if your own
independent re-test reproduces the *exact same* specific detail without having been told to look
for it, that's the strongest possible corroboration you can offer later when a dev team disputes
the finding).

Build a short working table: `ID | file:line in original report | vulnerable pattern | tracker's claimed status | tracker's "Our Action" note`.

## 2. Static cross-check — exhaustive, not a spot check

For each finding, in the **current** codebase:

- Does the exact file/line from the original report still exist? If the file/folder is gone
  entirely (e.g. a `db_scripts/`-style folder restructured into a new migration tool), **do not
  accept "removed" as proof of a fix** when the vulnerable logic lives in a database stored
  procedure, Lambda, or anything not fully checked into source. A migration-script folder being
  edited or deleted does NOT prove what's deployed to the live database. Mark these explicitly as
  needing live verification or direct DBA review (`sp_helptext` or equivalent), not "fixed."
- When checking "is X still present/absent," run an **exhaustive, repo-wide** search (every
  extension, every folder, case-insensitive) and show the exact command + exact output in your
  evidence — not a spot check of the folder you expect it in. A prior pass in this exact workflow
  once disputed a finding as "still present" based on an incomplete search; a fuller search proved
  it was genuinely gone. Always re-verify a disputed "absent" claim with a fresh, maximally broad
  search before asserting either way.
- For findings where the vulnerable code has no direct caller in this layer, trace the full call
  chain: which handler invokes it, which service calls that handler, which controller route
  exposes it — then test *that route* live. Also check sibling verbs/routes on the same
  controller/feature that might reach the identical vulnerable sink through a second door (this
  surfaced real, previously-unknown-to-the-tracker exposure in practice — e.g. the same vulnerable
  stored procedure reachable via both a GET and an unrelated POST endpoint).
- **Mandatory on every run, not just when prompted by a dispute**: run a dedicated discovery pass
  across every `GET`, `POST`, `PUT`, and `DELETE`/`PATCH` action in the entire backend, independent
  of what the original report named. For each, check whether any free-text field (filter value,
  search term, sort/column-name parameter, comment) reaches a database call with no visible
  parameterization, or reaches a stored procedure not present in source control (flag explicitly —
  a clean-looking parameterized call proves nothing about what that procedure does internally).
  This breadth pass is pure read-only code search — delegate it to a subagent to go fast — but
  hand-pick a small, deliberate set of real candidates from its output to test live yourself;
  never auto-fire payloads at everything it finds. Full CRUD/verb coverage is a correctness
  requirement for this skill, not an optional extra.
- Quote real code, verbatim, with line numbers — never paraphrase "the code does X." A developer
  who disputes a paraphrase can't dispute a verbatim quote with a line number next to it.

## 3. Live verification — ground rules (non-negotiable)

- Log in once via the real login endpoint with the test account. Keep the bearer token out of
  everything you print to a report or leave on disk — delete scratch token files after use.
- **Non-destructive differential technique by default**: send a benign baseline value, then a
  single SQL-breaking value (one extra `'`), and compare responses (200/clean vs 500/raw error, or
  a leaked query fragment). Never use payloads that write/delete/drop data unless explicitly
  pre-approved for that specific, reversible, same-account-only action.
- **No stacked/UNION/DDL/time-based/boolean-blind payloads** by default, even to "prove harm" —
  this crosses from verification into exploitation. If the environment's own safety tooling blocks
  an attempt (time-based blind SQLi, UNION-based extraction, probing a live third-party credential
  like a webhook), **respect that block completely** — do not retry with different encodings,
  different endpoints, a subagent, or any other phrasing of the same outcome. Report the block
  honestly and explain what evidence is still sufficient without it (see §5).
- **No mass sweeps.** If you need to find "a record with property X" among many, narrow first via
  a read-only metadata/config endpoint, then test a small handful (3-5) sequentially. If a search
  starts turning into an unthrottled sweep, stop it immediately.
- **No WAF/control evasion.** A control blocking a more diagnostic payload = inconclusive, not a
  reason to craft something cleverer to get past it.
- Do **not** delegate live HTTP testing to a background subagent/workflow — do it directly,
  one call at a time, visible and interruptible. Subagents are for read-only code search only
  (see §4).
- When a live test on a confirmed-vulnerable endpoint comes back clean, don't stop at "fixed" —
  check nearby parameter positions and any sibling endpoint reaching the same sink before
  concluding. A fix applied to one parameter/route and not its sibling is a real, common pattern.

## 4. What's safe to delegate to parallel subagents (and what isn't)

Safe to delegate (pure read-only static analysis, can run in parallel, speeds things up a lot):
- Re-deriving exhaustive file:line evidence + reproducible search commands for a disputed finding.
- Discovering all POST/PUT/DELETE endpoints across a backend and triaging which ones build SQL
  dynamically vs. call clean parameterized/EF code (a breadth-first discovery pass before you
  pick live-test candidates yourself).
- Building a "developer-shareable evidence dossier" when a dev team says evidence "isn't deep
  enough" — ask for verbatim code quotes + exact search output for every disputed claim, not
  summaries.
- Reformatting/highlighting an already-finalized report for readability (do this from your own
  authoritative HTML source if you have it in context, not by re-extracting text from a rendered
  PDF, which risks silent fidelity loss in tables/formatting).

Never delegate: anything that sends a live HTTP request. Keep that in your own hands, one call at
a time.

## 5. Verdict taxonomy

- **FIXED — LIVE CONFIRMED**: code changed + a live test proves the old exploit no longer works.
- **FIXED — CODE ONLY**: code changed, live-testing would require a destructive write so it wasn't
  attempted — say so explicitly.
- **PARTIALLY FIXED**: some of the fix is in, a specific gap remains — describe the gap precisely
  with file/line.
- **STILL VULNERABLE / TRACKER CLAIM NOT SUPPORTED**: tracker says fixed, evidence says otherwise.
  This is the most important category to get right — verify it harder than any other.
- **MITIGATED, NOT RESOLVED**: a genuine compensating control exists today (an unrelated permission
  check, a second independent lock, a narrowed call path) that blocks the specific exploit tested,
  but the underlying unsafe-by-design code is still there and the control covering it is
  undocumented, caller-dependent, or could be removed without anyone noticing it was load-bearing.
  Use this instead of forcing the finding into "fixed" (overstates it — the root cause remains) or
  "still vulnerable" (understates it — today's real callers are actually blocked). Report this
  honestly even when it softens a finding you expected to stay severe; it is a distinct, common
  real-world outcome, not a reluctant compromise between the other two.
- **INCONCLUSIVE**: reached the real code path but the safe test didn't produce a clear signal.
  Don't force a finding to stay "still vulnerable" just because that's where it started — if what
  you actually found during the test is better described as MITIGATED above, use that category
  instead, not this one.
- **OPEN, AS TRACKER STATES**: no dispute, tracker already says not fixed.

## 6. When a dev team disputes your findings

This is the real test of the methodology. Expect responses like "it only gives an error, no
harm," "this is intentionally exposed," "a separate effort already covers this," or — the one to
check hardest — **"these are new issues, the ones in the original report were already fixed."**

For every dispute:
1. **Pull the original report's exact LOCATION/DESCRIPTION text for that finding** (file/line,
   procedure name, any distinctive technical detail) and compare it directly against what you
   traced/tested. If the procedure names, endpoints, and code paths match, say so with a
   side-by-side table — this is the single most effective rebuttal format. If a specific,
   non-obvious detail from the original report (like "sibling function A escapes but B doesn't")
   reproduces independently in your own live test, call that out explicitly — two independent
   methods landing on the same specific signature is much stronger evidence than either alone.
2. **For "no harm" claims on injection-class findings**: don't just re-assert CWE severity —
   explain the standard next steps (error-based → column-count enumeration → UNION/blind
   extraction) as a plain-language attack walkthrough, grounded in exactly what you observed (the
   real leaked table/column names, the real error text), making clear which steps you actually
   performed live vs. which are the well-documented next steps you deliberately didn't take.
3. **For "intentionally exposed" / access-control claims**: search the whole repo (comments,
   doc-comments, steering/spec docs) for any documentation supporting that claim — usually there's
   none. Then check sibling endpoints handling identical data for an inconsistency (if every
   similar endpoint enforces a check and only the disputed ones don't, that's evidence of an
   omission, not a design decision). Check whether a genuine alternate access model exists
   elsewhere in the codebase for comparison.
4. **For a nuanced case where the dev team turns out to be partly right**: say so. Report it as
   found — e.g., "a real compensating control exists, but it's undocumented and only covers
   today's callers" — rather than forcing it to match the pattern of the other disputed findings.
   Credibility on the findings you push back on hard depends on being visibly honest about the
   ones where the pushback doesn't fully apply.
5. State the **no-git-history limitation** plainly wherever it's relevant: you can say what's
   present/absent in this snapshot, not when/why it changed, or whether a claimed fix predates or
   postdates the finding. This cuts both ways — it weakens unverifiable "already fixed" claims,
   but it equally means your own "confirmed removed" verdicts (where you didn't also get a live
   test) should be labeled as snapshot-only evidence, not overstated as "we watched it get fixed."

## 7. Deliverables

Produce these as PDFs (build HTML, render with `wkhtmltopdf` — check what's actually installed in
this environment first, don't assume):

1. **Full technical validation report**: cover + executive summary table (verdict counts) +
   methodology/scope (state explicitly what was/wasn't tested live and why, including the no-git
   caveat) + one section per finding (tracker's claim → dev evidence → live test → verdict) +
   ranked recommendations.
2. **Plain-English version** of the same report, same structure, no code/jargon — translate every
   technical finding into an everyday analogy and a one-paragraph "why this matters," for
   non-technical stakeholders. Keep the same verdict categories, just explained in plain language.
3. **Dev-team rebuttal report**, produced reactively once they respond to the first report: one
   section per disputed finding, dev's quote verbatim, your verdict, then deep evidence per §6.
   Use parallel subagents to go deep on each disputed finding simultaneously (one agent per
   finding) since this is pure static analysis and massively parallelizable — then synthesize
   their findings yourself rather than pasting raw agent output into the report.
4. **Threat/attack deep-dive** for the findings that need to convince a skeptical engineer that
   "it gives an error" is real harm: plain-language, step-by-step attack walkthroughs grounded in
   real evidence, explicit about which steps were actually performed vs. which are the standard
   next steps not executed. If the request is "make this one document fully self-contained" (e.g.
   because only this file will be shared), fold the complete file:line evidence and exact
   command/output proof into it too, not just the narrative — don't assume the reader also has the
   other companion reports.
5. Keep report file names stable across revisions when asked to "update" rather than "replace" —
   overwrite in place so a previously-shared link/filename keeps working.

## 8. Stakeholder email

Keep it short. Default format: a verdict breakdown (Fixed / Partial / Still Open), one line per
finding with its name, a numbered action list, and a pointer to the attached report(s) for detail
— never inline the full evidence into the email body. Adjust length/format on request (e.g. "just
list what's fixed/open, one-liners," "give me Outlook-paste-friendly text" → drop markdown tables
for plain indented text, since Outlook doesn't render markdown pipe-tables).

## 9. Hard-won gotchas from prior runs

- A disputed "removed" finding can go either way — always re-verify with a fresh exhaustive search
  rather than trusting either side's prior claim, including your own report from an earlier pass.
- The procedure/script body behind a stored-proc-based finding is very often **not in source
  control at all** — only the application-layer caller is (whatever the stack: C#, Java, Python,
  Node, ...). A "clean" parameterized call in that layer proves nothing about the procedure's own
  internal SQL; say this explicitly whenever it applies, since it's exactly the gap a dev team will
  exploit ("look, our code is parameterized").
- Safety classifiers in the execution environment may block live exfiltration-style payloads
  (UNION extraction, timing-based blind SQLi) and even unrelated follow-up commands right after
  such a block. Respect every block as final for that outcome — don't reframe, re-encode, or
  retry through another tool. Explain plainly to the user what was attempted and why it stopped
  there; let them decide whether to grant broader permission through their own settings.
- When asked to test "all PUT/POST/DELETE endpoints," split the work: delegate the breadth-first
  discovery/triage to a subagent, then hand-pick a small, deliberate set of real candidates to test
  yourself — never auto-fire payloads at every endpoint a discovery pass turns up.
