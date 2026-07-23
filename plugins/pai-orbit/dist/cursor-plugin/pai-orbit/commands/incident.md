---
name: incident
description: You are now in INCIDENT MODE.
---

You are now in INCIDENT MODE.

Production issue fast-path: triage → BUILD → REVIEW → RELEASE → post-mortem. This mode bypasses the normal GROOM → DESIGN → BUILD flow. It trades thoroughness for speed. Use it only when something is broken in production right now.

Switch out when:
- Fix is ready to implement → `/build` (return to INCIDENT after shipping to complete verify + post-mortem)
- Fix needs review → `/review` (narrow focus: symptom, risk, rollback — not full conventions review)
- Fix is ready to deploy → `/release`
- Situation de-escalates to a planned fix → `/board` to file, then normal sprint flow

**Before switching out:** note the incident issue number so you can return to it after each fast-path step.

---

## Procedure

### 1. Triage (do this first, before touching any code)

Answer:
- **What is broken?** Describe the user-visible symptom in one sentence.
- **Who is affected?** All users / specific subset / single user?
- **Severity:** P1 (data loss, security breach, complete outage) / P2 (major feature broken, significant users affected) / P3 (degraded, workaround exists)?
- **Since when?** Check recent deploys, git log, error logs.
- **Known cause?** If yes — state it. If no — what do you suspect?

Write a one-paragraph triage summary before proceeding.

### 2. Open a tracking issue

Use `/board` to create an incident issue immediately:
- Title: `incident: <one-line symptom>`
- Label: `incident` + severity (`p1` / `p2` / `p3`)
- Body: triage summary from step 1
- Assignee: on-call or engineering lead

This issue is the paper trail. Update it as the situation evolves.

### 3. Fast-path BUILD

Before writing any code, create a `hotfix/<slug>` branch (or `fix/<slug>` for non-production incidents) using `/git` — never fix directly on `main`. Then switch to `/build` with the incident issue as context. Rules that differ from normal build:

- **Scope tightly.** Fix the symptom. Do not refactor while fixing. Do not address related tech debt.
- **Preserve rollback path.** If the fix is risky, consider a feature flag or a two-step deploy.
- **No new tests required to ship**, but do not delete existing ones. Add a regression test if it takes under 5 minutes.
- **Check the fix locally** before proceeding. For a data issue: verify the fix on a sample before running it at scale.

### 4. Fast-path REVIEW

Switch to `/review` with `focus: incident` — this narrows the review to:
- Does the fix address the reported symptom?
- Does it introduce any new risk (data loss, security, cascading failure)?
- Is rollback possible if this deploy makes things worse?

A full architecture/conventions review is skipped. One engineer approves, not the full team.

### 5. RELEASE

Use `/release`. Before running:
- Confirm the environment is production (not staging)
- Confirm what rollback looks like if the deploy makes things worse — state it explicitly
- Watch the health check output; do not walk away during the deploy window

### 6. Verify

After deploying:
- Confirm the symptom is resolved (reproduce the original failure path)
- Watch error rates / logs for 10 minutes before declaring resolved
- Update the tracking issue: resolved, deploy time, what was changed

### 7. Post-mortem

For P1 and P2 incidents, write `docs/wip/postmortem-<slug>-<date>.md`:

```
## Incident: <title>
Date: <date>
Severity: P1 / P2
Duration: <start> → <resolved>
Affected: <who and how many>

## Timeline
- HH:MM — symptom first observed / reported
- HH:MM — triage complete
- HH:MM — root cause identified
- HH:MM — fix deployed
- HH:MM — resolved

## Root cause
One paragraph. What broke, why it broke, what allowed it to reach production.

## Fix
What was changed and why this resolves the root cause.

## Follow-up items
Issues filed as a result of this incident (link to board items):
- [ ] #N — <description>

## What went well
What helped us resolve this quickly.

## What could be better
Process or tooling gaps this incident exposed.
```

File follow-up items on the board via `/board` before closing the incident issue.
