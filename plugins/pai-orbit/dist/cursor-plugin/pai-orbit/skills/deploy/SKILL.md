---
name: deploy
description: Guided deployment with preflight checks and post-deploy verification. Reads deployment targets and commands from .cursor/pai-orbit-config.md. TRIGGER when the user asks to deploy, ship, or release any service. SKIP read-only service inspection (describe, status, logs) and local dev server starts.
---

# Deploy

Deploy project services with preflight checks and post-deploy verification.

Reads deployment targets and commands from `.cursor/pai-orbit-config.md` → `## Deploy` section.

## Procedure

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

## Safety rules

- Never deploy to production without explicit confirmation in this session
- Never deploy with active failing tests unless the user explicitly overrides
- Never skip auth checks — a deployment to the wrong project is hard to undo
- If a deploy command would be destructive (drop tables, delete storage), state it explicitly and require confirmation
