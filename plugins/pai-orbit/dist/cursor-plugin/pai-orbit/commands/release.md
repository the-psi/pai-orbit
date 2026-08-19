---
name: release
description: You are now in RELEASE MODE.
---

You are now in RELEASE MODE.

This is a deployment session with preflight checks and post-deploy verification. Stay in this mode until the deployment is confirmed healthy or explicitly rolled back.

Switch out when:
- Tests need to run before deploying → `/test` (return after test sign-off)
- A build fix is needed before shipping → `/build` (return after fix)
- An incident occurs post-deploy → `/incident`

## Behaviour

Reads deployment targets and commands from `.cursor/pai-orbit-config.md` → `## Deploy` section.

---

### 1. Preflight

Before deploying anything:
- Confirm the user intends to deploy to the target environment (staging vs production)
- Check authentication: run the configured auth check command (e.g., `gcloud auth list`, `vercel whoami`, `fly auth whoami`)
- Verify the correct project/organisation is active — flag and stop if wrong
- Check for uncommitted changes: `git status`. Warn if deploying with a dirty working tree
- Run tests if a test command is configured and tests haven't run recently in this session

### 2. Build and deploy

Run the deployment commands from `.cursor/pai-orbit-config.md` in the configured order.

For multi-service projects:
- Show which services are being deployed and ask for confirmation if deploying all at once
- Deploy services in dependency order (infrastructure before applications, API before frontend)
- Stop on first failure — do not continue deploying downstream services if an upstream fails

### 3. Post-deploy verification

After each service deploys:
- Run the configured health check (e.g., `curl https://<url>/health`, smoke test command)
- Report: service URL, response status, any warnings from deploy output
- If health check fails: surface the logs, do not silently proceed

### 4. Report

List every service deployed with:
- ✅ Deployed and healthy — URL
- ❌ Failed — error summary and recommended next step

### 5. Sweep `docs/wip/`

A release is when issues close, which makes it the only point in the workflow where "is this
working note still live?" has an answer. Without this step nothing ever sweeps `wip/` and it grows
without bound.

**Gate:** only run this step if every service in Step 4 reported ✅. If any service is ❌, skip the
sweep entirely and say why — a partial or failed deploy is not the "issues closed" moment this step
exists for, and referenced issues have not actually closed. Re-offer the sweep next time `/release`
completes clean.

For each file in `docs/wip/`, excluding `docs/wip/archive/` itself, resolve what it's tied to:

- Has a `Related issue: #N` field → resolve by that issue's state. If no board is configured
  (`.cursor/pai-orbit-config.md` has no `## Board` section), you cannot check issue state — fall
  through to the branch/feature resolution below instead.
- No issue field, or no board to check it against (older files, or a type that predates this
  field) → resolve by the branch or feature it names instead: still in progress → treat as open;
  merged, shipped, or abandoned → treat as closed.

Then, for each file, propose one of the following and wait for confirmation before moving anything
— this changes the working tree, so it follows the same confirm-before-acting rule as every other
step in this mode:

- Still open → leave it.
- Closed, content is dead → move it to `docs/wip/archive/`.
- Closed, content is still true and has a subject → promote it to the subject folder per
  `.cursor/rules/docs-taxonomy.md` — except `docs/ops/`, which is human-owned; never promote into
  it even if the table's routing would otherwise send it there.

Never delete — `docs/wip/archive/` is the floor. Report what moved. If the project has a
`docs-taxonomy.md` rule, its routing table governs where promoted files land.

---

## Safety rules

- Never deploy to production without explicit confirmation in this session
- Never deploy with active failing tests unless the user explicitly overrides
- Never skip auth checks — a deployment to the wrong project is hard to undo
- If a deploy command would be destructive (drop tables, delete storage), state it explicitly and require confirmation
