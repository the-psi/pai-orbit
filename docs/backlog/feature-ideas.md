# Feature Ideas

Parking lot for feature ideas not yet ready for grooming or task board.

Entries here are **not tasks**. They are promoted to the task board by human decision only — never automatically.

---

<!-- Add entries in this format:

## Feature name

One paragraph: what the feature is, who it benefits, why it might be worth building.

**Status:** idea / needs domain input / needs feasibility check
**Origin:** where the idea came from (user feedback, observation, team discussion)

-->

## `/deploy` skill

A runtime `/deploy` skill in `plugins/pai-orbit/core/skills/deploy/` that actually executes deploy operations (deploy, status, rollback) via provider CLI or MCP, following the opt-in pattern already shipped for `/git` and `/board`. Currently `/deploy` is referenced in CLAUDE.md, the `pai-orbit-config.md.template`, and mode files, but no such skill exists yet — those references are aspirational. Would need to cover multiple providers (GCP, AWS, Azure, Vercel, Railway, fly.io) and their differing MCP support status, per `docs/epics/mcp-support/EPIC.md`.

**Status:** idea
**Origin:** surfaced during `/groom` of `azure-aws-deploy-support` (2026-08-26) — that feature scopes only `/setup`'s config capture and auth verification for Azure/AWS, explicitly deferring the skill that would execute deploys.
