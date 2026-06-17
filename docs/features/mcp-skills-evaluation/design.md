# Design: MCP Support for Git, Board Skills and External Doc Storage

**Issue:** #12  
**Status:** Partially resolved — see decisions below  
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

## Option B: MCP for `/board` — under evaluation

**Not yet resolved.**

### What changes (if adopted)

Replace (or augment) CLI-based board operations (`gh issue create`, `glab api ...`, Linear CLI) with structured MCP tool calls to a board-specific MCP server.

### Benefits

- Board MCP servers (e.g. Linear's official MCP) expose a richer API surface than the CLI
- Typed inputs reduce the chance of malformed issue titles, labels, or state transitions
- Reduces dependency on per-tool CLIs (`glab`, `linear`, `jira`) being installed

### Drawbacks

- One MCP server per board platform — fragmented per-user setup
- Auth complexity: each MCP server has its own credential/token flow
- Not all board platforms have stable MCP servers (Jira MCP is less mature than Linear or GitHub)

### Decision criteria

- [ ] Is the `/board` skill's current failure mode CLI-related (missing CLIs, auth issues) or logic-related?
- [ ] Are the target board platforms (Jira, Linear, GitHub) represented by production-ready MCP servers?
- [ ] Would MCP allow richer operations not possible via CLI (e.g. bulk moves, sprint management)?

### Recommendation

<!-- TODO: fill in after evaluating criteria above -->
Likely: same opt-in pattern as git — shell CLI remains default, MCP preferred when configured. `/setup` already captures board MCP server in the `## MCP` section.

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
| MCP for `/board` | 🔲 Evaluate | Same opt-in pattern likely; pending board platform MCP maturity check |
| MCP for docs (write) | ✅ Already supported | `docs-writer` agent handles outbound sync via MCP |
| MCP for docs (read) | ❌ Reject for core flow | Local file reads stay; MCP reads optional for non-critical lookups |

---

## Implementation

- [x] `/setup` captures MCP server config (git, board, docs) in `## MCP` section of `pai-orbit-config.md`
- [x] `/git` skill reads `## MCP → git` and prefers MCP when configured, falls back to shell
- [ ] `/board` skill updated once Option B is resolved
- [ ] ADR written once Option B is decided: `docs/decisions/YYYY-MM-DD-mcp-integration-strategy.md`
