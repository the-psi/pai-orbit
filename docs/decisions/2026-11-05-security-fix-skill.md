---
status: proposed
date: 2026-11-05
deciders: [Chetan Sharma]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: Add a `security-fix` skill that wraps `/build`, instead of extending `/build`

## Context

Teams receive security assessment results as a findings tracker (often a spreadsheet of High/Critical findings) and need them fixed quickly and auditably. We tested whether `/build` alone can do this, on a small deliberately vulnerable ASP.NET Core app with 10 planted findings covering auth, token forging, IDOR, payment trust, injection, password storage, hardcoded secrets and a vulnerable dependency. A hidden grader checked each fix (attack blocked, legitimate use still works).

- **`/build` given one goal fixed all 10 correctly** in about 10–15 minutes with no operator input, wrote attack tests and ADRs, and handed back credential rotation as human work.
- What it did **not** do: triage (judging whether each finding is real and worth fixing), explicit root-cause grouping, a separate lane for ops-only work, or writing results back to the tracker. At tens of findings across several repos, these decide whether the effort is fast and auditable.
- Open PR #85 adds `security-scan` (find) and `security-scan-retest` (verify claimed fixes). Nothing covers the step in between.

## Decision

In the context of **remediating a findings tracker from a security assessment**,
facing **`/build` fixing code well but having no triage, grouping, ops routing or tracker write-back**,
we decided **to add an operational `security-fix` skill: intake → triage → grouping → lane routing → a mini-spec for `/build` → attack-test proof → tracker write-back, leaving the fixing to `/build`**,
to achieve **a findings-driven flow between `security-scan` and `security-scan-retest` with an auditable record per finding**,
accepting **one more skill (and prompt/skill counts to keep in sync across adapters), plus one confirmation checkpoint on the triage plan**.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| **(chosen) New `security-fix` skill wrapping `/build`** | `/build` stays generic; composes with `security-scan` / `security-scan-retest`; triage and ops lanes have a clear home; the mini-spec satisfies `/build`'s readiness gate without bypassing it | Two steps instead of one; the group taxonomy must be kept current |
| Extend `/build` to accept findings directly | One entry point | Mixes triage and risk acceptance (an owner decision) into an implementation mode, breaking mode discipline; adds a security branch most builds never use |
| Do nothing (`/build` with a goal is enough) | Zero work; fixes were correct | No triage, no record of "won't fix" decisions, ops work can look closed, tracker left stale |
| Fold remediation into `security-scan-retest` | Fewer skills | Retest's job is independent verification; having it write the fixes removes the independence |

## Consequences

**Positive:**
- Every finding gets an explicit, reasoned decision (fix / false positive / accepted risk / ops / design), recorded in `docs/wip/security-fix-<date>/triage.md`.
- Shared root causes (e.g. deny-by-default authorization) are fixed once.
- Ops-only work (credential rotation, history purge) is a named checklist and is never marked done by code.
- Each code fix carries a regression test named with the finding ID that performs the attack.
- The original tracker is never overwritten. An updated copy with the tracker's own columns filled in, plus `tracker-update.csv`, is written.

**Negative / trade-offs:**
- Copilot prompt count 32 → 33 and Codex skill count 23 → 24. PR #85 changes the same counts, so whichever merges second must rebase and re-count.
- Reading `.xlsx` depends on spreadsheet tooling in the target environment; the skill falls back to asking for CSV.

**Neutral:**
- Full adapter parity: the skill is one self-contained `SKILL.md` (no `references/` folder), because the Copilot adapter ships only `SKILL.md`.
- Validated on the sample app in Claude Code: 10/10 findings fixed.

## Related Decisions

- PR #85: `security-scan` and `security-scan-retest` (upstream source of findings, downstream verification).
- [2026-11-03 build orchestrator streams](2026-11-03-build-orchestrator-streams.md): the `/build` parallel streams that the skill hands off to.

## Review Date

After the first use on a real findings tracker.
