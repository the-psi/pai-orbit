## Epic
Parent epic: docs/epics/mcp-support/EPIC.md
Issue: https://github.com/the-psi/pai-orbit/issues/59
<!-- Answers this epic's open question: "Should /deploy MCP support be scoped to a single provider in the first
     iteration or attempted for all four?" — this feature scopes the first iteration to Azure + AWS, config
     capture and auth verification only. GCP, Vercel, fly.io remain deferred per the epic's phasing note
     ("/deploy is the highest-complexity feature ... groom this last"). -->

## Purpose
Give pai-orbit projects deploying to Azure or AWS a documented CLI-first, MCP-opt-in path — following the same pattern already shipped for `/git` and `/board` (prefer MCP when configured, fall back to provider CLI) — so `/setup` can scaffold Azure/AWS deploy config and verify that the auth path actually works, without forcing MCP on projects that don't have it.

## Scenarios in scope
1. During `/setup`, a project configures Azure or AWS as its deploy provider and optionally specifies an Azure/AWS MCP server, and this is captured in `.claude/pai-orbit-config.md`.
2. `/setup` runs an auth-check verification against the configured Azure/AWS provider, preferring the configured MCP server and falling back to the `az`/`aws` CLI when MCP is unavailable or unconfigured. Verification is advisory (warn-only) — it does not block `/setup` from completing.
3. Verification fails (CLI not installed, CLI installed but not authenticated, or MCP configured but unreachable) — `/setup` surfaces a message that names the specific cause, still without blocking completion.

## User stories / use cases
- As a developer configuring a project that deploys to Azure or AWS, I want `/setup` to capture my cloud provider and auth-check command, so my config file has an accurate `## Deploy` section without hand-editing it.
- As a developer with an Azure or AWS MCP server configured, I want `/setup` to record it under `## MCP → deploy`, so future deploy-related work can prefer MCP the same way `/git` and `/board` already do.
- As a developer running `/setup`, I want it to verify my Azure/AWS auth path works, so I catch a broken CLI or MCP setup before I ever try to deploy.
- As a developer whose CLI or MCP isn't set up yet, I want a warning that names exactly what's missing, so I know how to fix it without guessing — and I don't want `/setup` to refuse to finish over it.

## Functional requirements
1. REQ-1 (Scenario 1): `/setup` Step 2's deployment question must let the user specify Azure or AWS as the cloud provider explicitly, and `/setup` must record it verbatim in `## Deploy → Provider`.
2. REQ-2 (Scenario 1): `/setup` Step 2's MCP servers question (item 10) must add a **Deploy** category alongside the existing Git/Board/Docs categories, accepting an Azure MCP server name, an AWS MCP server name, or "none".
3. REQ-3 (Scenario 1): When a deploy MCP server is specified, `/setup` must write it to `.claude/pai-orbit-config.md → ## MCP → deploy`, following the same key structure as `git`, `board`, `docs`.
4. REQ-4 (Scenario 1): When the deploy provider is Azure or AWS, `/setup` must populate `## Deploy → Auth check command` automatically (`az account show` for Azure, `aws sts get-caller-identity` for AWS) rather than leaving it for manual entry.
5. REQ-5 (Scenario 2): When the deploy provider is Azure or AWS, `/setup` must run a verification step after config generation that checks: (a) the provider CLI is installed, (b) the CLI is authenticated, and (c) if a deploy MCP server is configured, that it is reachable.
6. REQ-6 (Scenario 2): Verification must prefer the configured deploy MCP server when present, and fall back to the CLI auth-check command when MCP is unconfigured or unreachable — mirroring the MCP-vs-shell pattern documented in `/git` and `/board` SKILL.md.
7. REQ-7 (Scenario 2): A failed verification must not block `/setup` from completing — it produces a warning and `/setup` proceeds to Step 3 (Generate) and Step 4 (Report) normally. This differs from the existing hooks validation, which does block on failure.
8. REQ-8 (Scenario 3): The verification output must distinguish and name each failure cause separately: CLI not installed, CLI installed but not authenticated, and MCP configured but unreachable.
9. REQ-9 (Scenario 3): Verification results — success or the specific failure cause — must be surfaced in `/setup`'s Step 4 Report, using the same ✅/⚠️ convention as the existing hooks-validation output.

## Non-functional requirements
- **NFR-1 (Reliability):** Verification calls (CLI or MCP) must run with a bounded timeout so a hung command doesn't stall `/setup` indefinitely. Exact timeout value is a design decision.
- **NFR-2 (Security):** No secrets or credentials (tokens, access keys) surfaced by the CLI or MCP verification call may be written to `.claude/pai-orbit-config.md` or printed in `/setup`'s report — only pass/fail state and cause.

## Context
- Builds on the opt-in MCP pattern already shipped for `/git` and `/board` (see `docs/features/mcp-skills-evaluation/design.md`, resolved 2026-06-17: shell stays the default/fallback, MCP is an opt-in preference read from `.claude/pai-orbit-config.md → ## MCP`).
- `plugins/pai-orbit/core/templates/pai-orbit-config.md.template` already lists Azure and AWS as valid `## Deploy → Provider` values and already has an `## MCP` section structure (`git`, `board`, `docs` keys) to extend with a `deploy` key.
- `/setup`'s existing hooks-validation step (`plugins/pai-orbit/core/modes/setup.md`, "Step E — Validate hook paths") is the precedent for a post-generation verification step with ✅/⚠️ output — this feature follows that shape but is warn-only rather than blocking.
- Creating the `/deploy` skill itself does not exist yet in `plugins/pai-orbit/core/skills/` (only referenced in CLAUDE.md, the config template, and mode files) — building that skill, which would actually execute deploys via CLI/MCP, is out of scope here and was parked as a separate feature idea during grooming (see `docs/backlog/feature-ideas.md`).

## Out of scope
- Creating the `/deploy` skill itself (the runtime skill that would execute deploys via CLI/MCP) — a separate, larger feature; parked to `docs/backlog/feature-ideas.md`.
- GCP, Vercel, Railway, fly.io, bare-VPS CLI/MCP support — deferred per the `mcp-support` epic's phasing note.
- Actual deploy execution (running deploy commands, pushing releases) — this feature is config capture and auth verification only.

## Open questions
- [ ] What are the canonical MCP server product names to present as Step 2 options for Azure and AWS (matching how the Board question names "GitHub Projects MCP / Linear MCP / Jira MCP")? — owner: Punit Singhal — design question, does not affect AC testability, deferred to `/design`.
- [ ] What timeout value should the auth-check verification use? — owner: Punit Singhal — design question, deferred to `/design`.
- [ ] Exact wording/format of the three distinguished failure messages (REQ-8) — owner: Punit Singhal — design question, deferred to `/design`.

## Acceptance criteria
- AC-1 (Scenario 1): Running `/setup` with Azure or AWS selected as provider produces `## Deploy → Provider: Azure` (or `AWS`) in `.claude/pai-orbit-config.md`.
- AC-2 (Scenario 1): If the user specifies an Azure or AWS MCP server at Step 2, `.claude/pai-orbit-config.md → ## MCP → deploy` contains that server name; if the user answers "none", the `deploy` key is still present with value `none`, consistent with how `git`/`board`/`docs` are written.
- AC-3 (Scenario 1): `## Deploy → Auth check command` is populated with `az account show` for Azure or `aws sts get-caller-identity` for AWS without manual entry.
- AC-4 (Scenario 2): When Azure/AWS provider is selected, `/setup`'s Step 4 Report includes a verification line for the deploy CLI/MCP path, marked ✅ or ⚠️.
- AC-5 (Scenario 2): When a deploy MCP server is configured and reachable, verification uses the MCP path and does not invoke the CLI auth-check command.
- AC-6 (Scenario 2): When no deploy MCP server is configured, or it is unreachable, verification runs the CLI auth-check command as fallback.
- AC-7 (Scenario 2): A failed verification (any cause) does not prevent `/setup` from writing config files or completing Steps 3–4 — `/setup` finishes and reports the warning.
- AC-8 (Scenario 3): When the CLI is not installed, the warning explicitly states "not installed" as the cause.
- AC-9 (Scenario 3): When the CLI is installed but not authenticated, the warning explicitly states "not authenticated" as the cause.
- AC-10 (Scenario 3): When a deploy MCP server is configured but unreachable, the warning explicitly states "MCP unreachable" and confirms the CLI fallback was attempted.

---
Status: Groomed — ready for /design
