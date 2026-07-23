# MCP Opt-in Layer for All Skills

**Status:** Draft
**Owner:** Punit Singhal
**Last Updated:** 2026-06-20

## Summary
Extend the MCP vs shell opt-in pattern — already shipped in `/board` and `/git` — to every skill that touches an external system, so teams with MCP servers configured get a consistent, CLI-free experience across all pai-orbit operations.

## Requirements
1. Every skill that performs an external operation (board, docs, cloud, database) reads `.claude/pai-orbit-config.md → ## MCP` to decide whether to prefer MCP or shell.
2. Shell commands are always the fallback when an MCP call fails or the server is unreachable.
3. The MCP section in `/setup`-generated config explicitly covers all opt-in points, not just git and board.
4. No skill requires MCP — opting in is purely additive and must not break shell-only projects.

## User Stories
- As a developer with Confluence MCP configured, I want `/review` to sync docs via MCP rather than a shell script, so that doc publishing works without a CLI token.
- As a developer with a cloud MCP server, I want `/deploy` to prefer MCP calls, so that I don't need provider CLIs installed locally.
- As a developer on a shell-only project, I want every skill to fall back to CLI transparently, so that MCP opt-in never breaks my workflow.

## Features
| Feature | Status |
|---------|--------|
| `/epic` MCP opt-in | Not started |
| `/incident` MCP opt-in | Not started |
| `/data-model` MCP opt-in | Not started |
| `/review` docs-sync MCP opt-in | Not started |
| `/deploy` MCP opt-in | Not started |
| `/setup` MCP scaffolding expansion | Not started |

## Implementation notes
- `/epic` and `/incident` both route board operations through `/board`, which already has MCP. Verify whether changes to those skills are needed at all before grooming them as separate features.
- `/deploy` is the highest-complexity feature: GCP, AWS, Vercel, and fly.io each have different MCP support status. Groom this last.
- `/data-model` MCP depends on database MCP servers (e.g. a Postgres MCP), which are less standardised — confirm target servers before grooming.
- `/review` docs-sync MCP targets Confluence and Notion MCP servers, both of which are available via claude.ai integrations.

## Success Metrics
- Every skill with an external operation has a documented MCP vs shell section.
- A project with all MCP servers configured can complete a full session (board → build → review → deploy) without any CLI tools installed.
- Existing shell-only projects pass all existing skill operations unchanged.

## Decisions
- **Pattern source of truth:** `/board` and `/git` SKILL.md are the canonical examples. New MCP sections must follow the same structure: check config key → prefer MCP → fall back to shell with logged note.

## Open Questions
- [ ] Which database MCP servers should `/data-model` target? (e.g. Postgres MCP, BigQuery MCP) — owner: Punit Singhal
- [ ] Should `/deploy` MCP support be scoped to a single provider in the first iteration or attempted for all four (GCP, AWS, Vercel, fly.io)? — owner: Punit Singhal
