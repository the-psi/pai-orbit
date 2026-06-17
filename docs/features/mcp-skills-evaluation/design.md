# Design Spike: MCP Support for Skills (Git, Board) and External Doc Storage

**Issue:** #12  
**Status:** Draft — awaiting team input  
**Owner:** <!-- TODO: assign -->  
**Date:** 2026-06-17

---

## Context

Two related questions were raised about integrating MCP (Model Context Protocol) into pai-orbit:

1. **MCP for skills** — Should `/git` and `/board` skills use MCP tool calls (structured, typed) instead of text instructions + shell commands?
2. **MCP for docs** — Should project documentation (`requirements.md`, `design.md`, etc.) live in a centralised knowledge platform (Confluence, Notion) and be accessed via MCP, rather than being stored locally in `docs/`?

These are independent decisions that could be adopted separately.

---

## Option A: MCP-backed `/git` skill

### What changes

Replace CLI-based git operations (`git commit`, `gh pr create`, etc.) with structured MCP tool calls to a Git MCP server (e.g. the official GitHub MCP server).

### Benefits

<!-- TODO: evaluate -->
- Structured tool calls → typed inputs → fewer shell injection risks
- MCP server can enforce safety rules at the server layer (e.g. block force-push)
- Platform-agnostic: same skill works against GitHub, GitLab, or Bitbucket MCP servers
- Tool call responses are structured JSON → easier to parse and display

### Drawbacks

<!-- TODO: evaluate -->
- Requires users to configure and authenticate an MCP server (higher setup cost)
- Offline/air-gapped workflows break (no shell fallback once MCP is required)
- MCP server availability becomes a dependency — adds operational complexity
- Current `/git` skill works for any git host; MCP makes it host-specific

### Decision criteria

- [ ] Does the current shell-based approach have reliability or security gaps that MCP would fix?
- [ ] Are users already running a Git/GitHub MCP server for other purposes?
- [ ] Is the setup overhead acceptable for the typical pai-orbit user?

### Recommendation

<!-- TODO: fill in after evaluating criteria above -->

---

## Option B: MCP-backed `/board` skill

### What changes

Replace CLI-based board operations (`gh issue create`, `glab api ...`, Linear CLI) with structured MCP tool calls to a board-specific MCP server (GitHub Projects MCP, Linear MCP, Jira MCP).

### Benefits

<!-- TODO: evaluate -->
- Board MCP servers (e.g. Linear's official MCP) expose richer API surface than CLI
- Typed inputs mean the LLM is less likely to misformat issue titles, labels, etc.
- Reduces dependency on per-tool CLIs (`glab`, `linear`, `jira`) being installed

### Drawbacks

<!-- TODO: evaluate -->
- One MCP server per board platform — users on Jira need a different server than Linear users
- Auth complexity: each MCP server has its own credential/token flow
- Current CLI fallback strategy works across all platforms; MCP fragments this
- Not all board platforms have stable MCP servers (Jira MCP is less mature)

### Decision criteria

- [ ] Is the `/board` skill's current failure mode CLI-related (missing CLIs, auth issues) or logic-related?
- [ ] Are the target board platforms (Jira, Linear, GitHub) represented by production-ready MCP servers?
- [ ] Would MCP allow richer operations not possible via CLI (e.g. bulk moves, sprint management)?

### Recommendation

<!-- TODO: fill in after evaluating criteria above -->

---

## Option C: External doc storage via MCP (Confluence / Notion)

### What changes

Project documentation (requirements, design docs, ADRs) is written to and read from Confluence or Notion via MCP, rather than being committed locally to `docs/`.

### Benefits

<!-- TODO: evaluate -->
- Centralized, searchable docs accessible to non-engineers
- Real-time collaboration — multiple team members can edit simultaneously
- Docs survive repo restructuring or migration
- pai-orbit already has `docs-writer` agent with MCP sync support

### Drawbacks

<!-- TODO: evaluate -->
- **Breaks local-first principle**: docs become inaccessible offline or when MCP is unavailable
- **Version control loss**: Confluence/Notion don't have git-integrated history, blame, or PR reviews on docs
- **Setup complexity**: every project member needs MCP credentials configured
- **Search and read cost**: reading docs in LLM context requires MCP tool calls on every session, not a local `cat`
- pai-orbit's producer/consumer contracts assume local file paths — `/review` reads `constraints.md`, `/build` reads `requirements.md` etc.; these would all need MCP-read equivalents

### Decision criteria

- [ ] Does the team already use Confluence/Notion as their primary knowledge platform?
- [ ] Is the local `docs/` folder inaccessible to non-engineers on the team?
- [ ] Can MCP reads be made reliable enough for session-critical reads (requirements before /build)?
- [ ] Is the team willing to accept the offline/availability trade-off?

### Recommendation

<!-- TODO: fill in after evaluating criteria above -->

**Likely outcome:** Hybrid — keep `docs/` as the primary local source of truth; add Confluence/Notion as an *optional publishing surface* via the `docs-writer` agent's existing MCP sync capability. Do not make MCP reads mandatory in the core workflow.

---

## Overall Recommendation

<!-- TODO: fill in after team discussion -->

| Option | Recommend | Condition |
|--------|-----------|-----------|
| MCP for `/git` | <!-- TODO --> | |
| MCP for `/board` | <!-- TODO --> | |
| MCP for docs (write) | Already supported | Keep as optional via `docs-writer` |
| MCP for docs (read) | <!-- TODO --> | |

---

## Decision

<!-- TODO: record the decision here once the team reaches alignment. Then write an ADR in docs/decisions/. -->

**Proceed / Defer / Reject** — rationale:

ADR to write: `docs/decisions/YYYY-MM-DD-mcp-integration-strategy.md`
