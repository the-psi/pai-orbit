# Design: Azure/AWS CLI + MCP Support in `/setup`

**Issue:** [#59](https://github.com/the-psi/pai-orbit/issues/59)
**Status:** Resolved
**Owner:** Punit Singhal
**Date:** 2026-08-26
**Epic:** `docs/epics/mcp-support/EPIC.md`
**Requirements:** `docs/features/azure-aws-deploy-support/requirements.md`
**Impact analysis:** `docs/wip/analysis-azure-aws-deploy-support-2026-08-26.md`

---

## Context

Grooming scoped this feature to `/setup`-time config capture and auth verification for Azure
and AWS only (Scenarios 1–3) — not a runtime `/deploy` skill, which was parked as a separate
backlog idea. The impact analysis found two existing consumers this design must stay
compatible with: `/release` mode already reads `## Deploy → Auth check command` during
Preflight, and `/git`/`/board` already read their own key out of `## MCP`. It also found one
correctness fix that must ship in the same change: the `## MCP` all-none omission check.

---

## Decisions

### D1 — MCP reachability check: presence-in-session, not a live tool call

**Resolved — see ADR:** `docs/decisions/2026-08-26-mcp-reachability-check-pattern.md`

`/setup` checks whether the configured deploy MCP server name appears among the session's
currently connected tools. It does **not** issue a live tool call to test the provider. This
is the first proactive MCP check in pai-orbit (`/git`/`/board` only try-then-fallback at real
use) and is expected to be the pattern the epic's remaining MCP opt-in work
(`/epic`, `/incident`, `/data-model`, `/review` docs-sync) reuses.

Three verification states result, not two:
- ✅ CLI authenticated (MCP not configured, or configured and connected this session)
- ⚠️ CLI not installed / not authenticated (regardless of MCP state)
- ⚠️ MCP configured but **not connected this session** — distinct from "broken"; the message
  must say verification will be attempted again at first real use, not that the server failed

### D2 — Verification timeout: 10s

Matches the existing `bash-guard.sh` PreToolUse hook timeout already used in `/setup`'s
generated `settings.json` (`plugins/pai-orbit/core/modes/setup.md:213`). Applies to the CLI
auth-check command only — the MCP check (D1) is a local session-state lookup, not a network
call, so it has no meaningful timeout.

### D3 — Step 2 Q10 MCP naming: generic, no hardcoded product names

The Deploy category in Step 2's MCP question reads: *"Deploy: Azure MCP server name, or AWS
MCP server name, or none"* — no specific product is named, unlike Git/Board's "GitHub MCP /
GitLab MCP" style. Azure has one clear official server; AWS's MCP landscape has multiple
community/official servers with no single canonical one, so a symmetric generic prompt avoids
asserting a name that may be wrong or go stale.

### D4 — Failure messages: cause + fix action, no URLs

Each failure state names the specific cause and, where one exists, the fix command — no
install URLs (avoids stale/guessed links). Exact copy is a `/build` task; shape is:

```
⚠️  Azure CLI not installed — install it, then re-run /setup
⚠️  Azure CLI installed but not authenticated — run `az login`
⚠️  Azure MCP server "<name>" configured but not connected this session — will be attempted at first use
```
(AWS messages mirror this with `aws configure` / `aws sso login` as the fix action.)

### D5 — Correctness fix required by analysis: `## MCP` omission check

`plugins/pai-orbit/core/modes/setup.md:258` currently reads: *"Omit the `## MCP` section
entirely if all three answers are 'none'."* This must change to **four** — `git`, `board`,
`docs`, and the new `deploy` key — in the same commit as the new key is introduced. Without
this fix, a project that configures only a deploy MCP server (leaving git/board/docs "none")
would have its `## MCP` section silently omitted, dropping the deploy MCP config entirely.
This is not a separate decision with tradeoffs — it is a required correctness fix, folded in
here so it can't ship half-done (per the impact analysis's recommendation).

### D6 — Compatibility constraints carried from analysis

- `## Deploy → Auth check command` must remain a **single runnable shell command** for Azure
  (`az account show`) and AWS (`aws sts get-caller-identity`) — `/release` mode's Preflight
  step runs this value directly (`plugins/pai-orbit/core/modes/release.md:20`). The
  pipe-separated form shown in the template's comment (`gcloud auth list | vercel whoami | fly
  auth whoami`) is a list of *illustrative examples for different providers*, not a literal
  multi-command value — this design must not populate a compound/piped value.
- A missing `## MCP → deploy` key (e.g. a project that ran `/setup` before this feature
  shipped) must be treated identically to `deploy: none` by any future reader — stated
  explicitly here since it's the only way already-`/setup`'d projects stay compatible without
  a migration step.

---

## Verification flow

```mermaid
sequenceDiagram
    participant U as Developer
    participant S as /setup
    participant CLI as az / aws CLI
    participant MCP as Session tool list

    U->>S: Answers Step 2 (provider: Azure/AWS, deploy MCP name or none)
    S->>S: Step 3 — generate .claude/pai-orbit-config.md<br/>(## Deploy, ## MCP incl. deploy key)
    Note over S: Only runs if provider is Azure or AWS
    S->>CLI: command -v az/aws (installed check)
    alt not installed
        S-->>U: ⚠️ CLI not installed — install it, then re-run /setup
    else installed
        S->>CLI: run auth-check command (10s timeout)
        alt not authenticated / timeout
            S-->>U: ⚠️ CLI installed but not authenticated — run `az login` / `aws configure`
        else authenticated
            S-->>U: ✅ CLI authenticated
        end
    end
    opt deploy MCP server configured
        S->>MCP: is "<server name>" in this session's connected tools?
        alt connected
            S-->>U: ✅ MCP "<server name>" connected
        else not connected
            S-->>U: ⚠️ MCP "<server name>" configured but not connected this session — will be attempted at first use
        end
    end
    S->>S: Step 4 — Report (warn-only; never blocks completion)
```

---

## File-level changes (for `/build`)

- `plugins/pai-orbit/core/modes/setup.md`
  - Step 2, item 5 (Deployment question): no change to the question itself — Azure/AWS are
    already valid answers.
  - Step 2, item 10 (MCP servers question): add a **Deploy** category (D3 wording).
  - Step 3 → MCP configuration: add `deploy: {{DEPLOY_MCP_SERVER}}` to the written `## MCP`
    block; update the omission check from "all three" to "all four" (D5).
  - Step 3 → new subsection (name TBD by `/build`, e.g. "Deploy verification"): auto-populate
    `Auth check command` for Azure/AWS (D6), then run the verification flow above (D1, D2, D4)
    — modeled on the existing "Step E — Validate hook paths" pattern but **warn-only**, never
    blocking Step 4.
  - Step 4 (Report): include the verification line(s) alongside the existing hook-validation
    ✅/⚠️ output.
- `plugins/pai-orbit/core/templates/pai-orbit-config.md.template`
  - `## MCP` section: add `deploy: {{DEPLOY_MCP_SERVER}}` with a comment matching the existing
    `git`/`board`/`docs` key style (`<!-- Choose one: azure | aws | none -->`).
- `docs/capabilities.md`
  - Update the `/setup` and `/release` capability entries to mention the new Deploy MCP
    category and verification step once `/build` ships this (not a blocking design item).

No other file needs to change — the impact analysis confirmed `claude-code`, `cursor-plugin`,
`cursor`, and `kiro-power` adapters all copy `core/modes/*.md` and `core/templates/*`
verbatim, so `bash plugins/pai-orbit/build.sh` propagates these edits automatically. `copilot`
and `codex` carry no `/setup` mode today at all (a pre-existing gap, confirmed via search, not
caused or worsened by this change) — no action required here; that gap is already tracked as
an open question in `docs/architecture/system.md`.

---

## Out of scope (reaffirmed from requirements)

- The `/deploy` skill itself (actual deploy execution via CLI/MCP) — parked in
  `docs/backlog/feature-ideas.md`.
- GCP, Vercel, Railway, fly.io, bare-VPS CLI/MCP support.
- Any change to `/git` or `/board`'s existing try-then-fallback behavior.

## Open questions

None outstanding. All three questions deferred from grooming (MCP naming, timeout, message
wording) are resolved above (D2–D4); the reachability-mechanism question that surfaced during
analysis is resolved in the linked ADR (D1).

---
Status: Resolved — ready for `/build`
