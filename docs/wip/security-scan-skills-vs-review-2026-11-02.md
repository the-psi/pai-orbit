# Comparison: `security-scan` / `security-scan-retest` skills vs. pai-orbit `/review`

Date: 2026-11-02
Status: Evaluation note (not a decision). Two external skills were reviewed against the existing `/review` mode. No integration has been made.

## Summary

The two external skills do not duplicate `/review`. They operate at a different scope and a different point in the lifecycle.

| | `/review` (pai-orbit) | `security-scan` | `security-scan-retest` |
|---|---|---|---|
| Question it answers | "Does this change conform to our architecture, conventions and requirements?" | "Is this system secure?" | "Did the dev team's fixes actually close the findings from the earlier assessment?" |
| Scope | One branch/PR **diff** | Whole **repository** (plus optionally a live, authorized target) | Findings from a prior report, checked against the **current** code and a test environment |
| When used | Every PR | A scheduled or on-demand audit; before release; for a client | After a prior assessment, once the dev team claims fixes are deployed |
| Method | Single reviewer pass against a checklist | Parallel subagents, one per dimension, consolidated by an orchestrator | Static cross-check plus non-destructive live re-tests, run by the orchestrator |
| Output | Findings file in `docs/wip/` | Severity-ranked report (Markdown source, rendered to HTML/PDF) | Validation report(s) with a verdict per finding, plus a stakeholder email |

## What each one does

### `/review` (existing)

Source: `plugins/pai-orbit/core/modes/review.md`.

- `/review` checks a diff against `CLAUDE.md`, `docs/architecture/constraints.md`, `system.md`, ADRs, and the feature's `requirements.md` / `design.md`.
- `/review security` is an OWASP-style checklist applied to the diff: injection, authentication and session, authorisation, secrets, input validation, dependencies, cryptography, cloud/infrastructure.
- `/review full` runs both.
- Findings go to `<docs root>/wip/security-review-<branch>-<date>.md`. Critical and High findings block merge.
- The dependency check is limited to "no new dependency with known high/critical CVEs" for the change under review.

### `security-scan`

- Phase 0 is recon: it detects ecosystems, CI/CD, IaC, toolchain mismatches and whether git history exists. Only dimensions with evidence are launched.
- Phase 1 runs subagents in parallel, one per dimension:
  - Baseline: dependencies (one agent per ecosystem, native audit plus an OSV.dev cross-check), app code, CI/CD, IaC, and a repo-wide secrets sweep.
  - Extended tier, for higher-value targets: AUTH, UPLOAD (XXE/SSRF/deserialization), BIZLOGIC (business-logic abuse), CLIENT (DOM-XSS and similar), DATA (PII and encryption config), DAST-PASSIVE, DISCOVERY and ACTIVE-VALIDATION against an authorized live target.
- For deep reviews, a second wave of verifier agents tries to disprove each candidate finding. Only findings that survive at confidence of at least 8/10 are kept, and the funnel is reported.
- Phase 2 consolidates one report: finding IDs by family, OWASP Top 10:2025 map, CONFIRMED vs PLAUSIBLE, upstream advisory URLs, an explicit "what was checked and passed" section, and a scope-and-limitations statement.
- Phase 3 is a mandatory self-audit of the report: section presence, mandatory fields on every finding, counts recomputed, rendered output matches source.
- Live testing is passive-first and consent-gated. The skill declines active testing against hosts whose authorization it cannot verify.

### `security-scan-retest`

- Inputs: the original assessment report, the dev team's fix tracker, and a test environment with a low-privilege account.
- It re-derives each High/Critical finding from the original report's exact `file:line` and pattern. It does not rely on the tracker's summary.
- It cross-checks the current code exhaustively. Notably, a removed script folder is not accepted as proof of a fix when the logic lives in a stored procedure or other code outside source control.
- It runs non-destructive live re-tests (for example, a single-quote differential for SQL injection) directly, one request at a time. Subagents are used only for read-only code search. It does not use stacked/UNION/time-based payloads or WAF evasion.
- Each finding receives one of these verdicts: FIXED (live confirmed), FIXED (code only), PARTIALLY FIXED, STILL VULNERABLE / TRACKER CLAIM NOT SUPPORTED, MITIGATED NOT RESOLVED, INCONCLUSIVE, OPEN AS TRACKER STATES.
- Deliverables: a technical validation report, a plain-English version, a rebuttal report if the dev team disputes findings, an optional attack deep-dive, and a short stakeholder email.

## How they fit together

```
every PR      ->  /review  (and /review security on sensitive PRs)
periodic or
pre-release   ->  security-scan          -> assessment report
after fixes   ->  security-scan-retest   -> validation of the fix tracker
```

An analogy: `/review` checks each brick as it is laid. `security-scan` inspects the whole building. `security-scan-retest` goes back after the repairs and checks the work was actually done.

## Gaps in `/review security` that `security-scan` covers

- Vulnerabilities in the full dependency tree, not only newly added packages.
- Secrets in git history and committed assessment evidence.
- CI/CD and supply-chain posture, and IaC posture.
- Business-logic abuse and cross-role access (BFLA).
- Live (authorized) validation.
- An independent verification pass over the findings.

## Open questions (for the team)

1. Should either skill be added to pai-orbit? If so, `plugins/pai-orbit/core/skills/<name>/` plus an adapter build would be needed, and the repo requires full parity across adapters (Claude Code, Cursor plugin, Copilot, Codex).
2. The skills reference tools such as `wkhtmltopdf` and `curl` against OSV.dev. Is that acceptable inside pai-orbit's local-first model?
3. Should `/review security` point to `security-scan` for full audits instead of growing its own checklist?

## Limitations of this note

- Both external skills were read in full from their `SKILL.md` files. `security-scan` also has eight reference files (briefs, gotchas, report format, and so on) that were not read.
- Of `review.md`, only the header, the first review steps and the security section were read. The remainder was not.
- Neither skill was run. This note describes what the skill instructions say, not how they behave in practice.
