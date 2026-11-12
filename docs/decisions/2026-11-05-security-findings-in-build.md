---
status: accepted
date: 2026-11-05
deciders: [Chetan Sharma]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: Handle security findings lists inside `/build`, not as a separate skill

## Context

Teams receive security assessment results as a findings tracker (often a spreadsheet of High/Critical findings) and need them fixed quickly and auditably. We tested `/build` on a small deliberately vulnerable ASP.NET Core app with 10 planted findings covering auth, token forging, IDOR, payment trust, injection, password storage, hardcoded secrets and a vulnerable dependency. A hidden grader checked each fix (attack blocked, legitimate use still works).

- **`/build` given one goal fixed all 10 correctly** in about 10–15 minutes with no operator input.
- What it did **not** do: triage (judging whether each finding is real and worth fixing), root-cause grouping, a separate record of ops-only work (credential rotation, history purge), or writing results back to the tracker. With a larger list these gaps make the work hard to audit.
- **Limits of this evidence:** one small sample app, graded by a grader we wrote. Since plain `/build` already fixed all 10, the sample shows the gaps are in process (triage, records, write-back), not in fix quality; it does not show how the flow behaves on a large real codebase.
- We first built these steps as a separate `security-fix` skill wrapping `/build`; it scored 10/10 on the same sample and covered every gap. On review, the requester preferred the steps inside `/build`.

## Decision

In the context of **fixing a list of security findings**,
facing **`/build` fixing code well but skipping triage, grouping, ops routing and tracker write-back**,
we decided **to add a short, conditional "Security findings" section to `/build`** (intake → triage → one owner checkpoint → fix by group → attack test per finding → ops checklist → tracker copy → independent verification) that applies only when the goal points to a findings file (a tracker or assessment report with several findings),
to achieve **one familiar entry point (`/build` with the findings file as the goal) with an auditable record per finding**,
with guardrails: `code` lane only for local fixes that follow an existing pattern (auth-model, token-format, data-model or boundary changes go to `/design`); skips, downgrades and Won't fix always need owner confirmation, even when told not to ask; fixes that change login, access or session / token behaviour are applied but marked `Fixed - owner review required` and listed first, so the owner checks the model's lane choice before merge (holding them instead left the most important Criticals unfixed in testing); credential rotations are shown at the checkpoint; the suite runs after each fix group and a failing group is reverted,
accepting **a slightly longer `/build` for every build, and triage (an owner decision) running inside an implementation mode, bounded by the single confirmation checkpoint**.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| **(chosen) Conditional section in `/build`** | Users already reach for `/build`; nothing new to discover; no new skill or adapter counts; no conflict with other skill PRs | `/build` grows for every build; relies on `/build` recognising a findings list (if it misses, behaviour falls back to plain `/build`: correct fixes without triage or write-back) |
| Separate `security-fix` skill wrapping `/build` | Clean mode separation; `/build` unchanged | Users must know it exists; adds a skill and count changes to every adapter |
| Do nothing | Zero work; fixes were already correct | No triage, no record of "won't fix" decisions, ops work can look closed, tracker left stale |

## Consequences

**Positive:**
- `/build Goal: fix the findings in <file>` produces triage reasons, grouped fixes, an attack test per finding, an ops checklist and an updated tracker copy.
- The original tracker is never overwritten; ops-only work is never marked done by code.
- Normal feature builds are unchanged.

**Negative / trade-offs:**
- Every `/build` session carries the extra section.
- Reading `.xlsx` depends on spreadsheet tooling in the target environment; falls back to asking for CSV.

**Neutral:**
- Composes with `security-scan` (find) and `security-scan-retest` (verify) from PR #85 when those merge, and with `/review security` today.

## Related Decisions

- [2026-11-03 build orchestrator streams](2026-11-03-build-orchestrator-streams.md): for findings, the order per group is always attack tests → fix → full suite (with or without the orchestrator), so each attack test is seen failing before the fix; `/build` states this exception in its orchestrator rules.

## Review Date

After the first use on a real findings tracker. Keep the decision if all of these hold; otherwise revisit:

- Every source row appears in `triage.md` and the tracker copy (none lost).
- No skip, downgrade or Won't fix was applied without owner confirmation.
- Every `code`-lane finding has an attack test that failed before the fix, or is marked `Not proven`.
- `/review security` (or `security-scan-retest`) confirms the `Fixed - pending verification` items.
- No secret value appears in any file the flow produced.

**Rollback:** the evidence so far is one small sample app, so this ships on probation. If any criterion fails on the first real tracker, remove the `## Security findings` section, its gate sentence and its orchestrator bullet from `core/modes/build.md` in a patch release. These are self-contained, so `/build` returns to its earlier behaviour, and this ADR is marked `superseded`.
