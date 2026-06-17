# Design: MCP Support for Git, Board Skills and External Doc Storage

**Issue:** #12  
**Status:** Resolved  
**Owner:** <!-- TODO: assign -->  
**Date:** 2026-06-17

---

## Context

Two related questions were raised about integrating MCP (Model Context Protocol) into pai-orbit:

1. **MCP for skills** — Should `/git` and `/board` skills use MCP tool calls in addition to (or instead of) CLI shell commands?
2. **MCP for docs** — Should project documentation (`requirements.md`, `design.md`, etc.) live in a centralised knowledge platform (Confluence, Notion) and be accessed via MCP?

These are independent decisions and are resolved separately below.

---

## Decision A: MCP for `/git` — opt-in, configured during `/setup`

**Resolved.** MCP will not replace shell-based git operations. Shell commands (`git commit`, `gh pr create`, etc.) remain the default and always-available path.

MCP is offered as an **optional enhancement**: if a user has a GitHub MCP server (or equivalent) configured, `/setup` captures it and writes it to `pai-orbit-config.md → ## MCP`. The `/git` skill checks this config at runtime and prefers MCP tool calls when available, falling back to shell commands if the MCP server is unavailable or unconfigured.

### Why opt-in, not replace

- Shell commands work offline, across all git hosts, and with no additional setup
- MCP requires a running server and authentication — mandatory MCP breaks the default install experience
- Users who already run the GitHub MCP server for other purposes can get the benefits (structured tool calls, typed responses) without forcing that overhead on everyone

### What `/setup` captures (new question in Step 2)

> "Do you have any MCP servers configured for this project?  
> Git: GitHub MCP / GitLab MCP / none  
> Board: GitHub Projects MCP / Linear MCP / Jira MCP / none  
> Docs: Confluence MCP / Notion MCP / none"

This is written to `## MCP` in `.claude/pai-orbit-config.md`. Skills read it at runtime to decide whether to prefer MCP or shell.

### Runtime behaviour in `/git`

1. Read `.claude/pai-orbit-config.md → ## MCP → git`
2. If a server is configured: attempt the operation via MCP tool call
3. If MCP call fails or server is unconfigured: fall back to shell command, note the fallback

---

## Decision B: MCP for `/board` — ✅ Adopted as opt-in layer

**Resolved.** Same pattern as `/git`: CLI shell commands remain the default and fallback. If a board MCP server is configured in `## MCP → board`, the `/board` skill prefers MCP tool calls at runtime and falls back to CLI with an explicit note if the server is unavailable.

Per-platform MCP preference:
- `github` → GitHub MCP (`create_issue`, `add_issue_comment`, `update_issue`, etc.); fallback: `gh` CLI
- `linear` → Linear MCP; fallback: `linear` CLI
- `jira` → Jira MCP; fallback: `jira` CLI
- `none` / absent → CLI directly, no MCP attempt

The GitLab label resolution step and column→label map logic remain unchanged regardless of MCP setting — those are board-logic concerns, not transport concerns.

---

## Option C: External doc storage via MCP (Confluence / Notion)

**Resolved: hybrid.**

Keep `docs/` as the primary local source of truth. Add Confluence/Notion as an *optional outbound publishing surface* via the `docs-writer` agent's existing MCP sync capability. MCP reads are not mandatory in the core workflow — `/review` reads `constraints.md`, `/build` reads `requirements.md`, etc. all stay as local file reads.

**Rationale:**
- Making MCP reads mandatory in the core session loop breaks offline work and adds latency on every session
- The local-first principle is load-bearing — git history, diffs, and PR reviews all depend on docs being in the repo
- Outbound-only sync (write to Confluence after writing locally) gives non-engineers visibility without breaking the workflow

---

## Overall Recommendation

| Option | Decision | Notes |
|--------|----------|-------|
| MCP for `/git` | ✅ Adopt as opt-in | Configured during `/setup`; shell fallback always available |
| MCP for `/board` | ✅ Adopt as opt-in | Same pattern as `/git`; shell CLI stays default; MCP preferred when configured |
| MCP for docs (write) | ✅ Already supported | `docs-writer` agent handles outbound sync via MCP |
| MCP for docs (read) | ❌ Reject for core flow | Local file reads stay; MCP reads optional for non-critical lookups |

---

## Implementation

- [x] `/setup` captures MCP server config (git, board, docs) in `## MCP` section of `pai-orbit-config.md`
- [x] `/git` skill reads `## MCP → git` and prefers MCP when configured, falls back to shell
- [x] `/board` skill reads `## MCP → board` and prefers MCP when configured, falls back to CLI
- [ ] ADR to be written: `docs/decisions/YYYY-MM-DD-mcp-integration-strategy.md`
