# pai-orbit — OpenAI Codex adapter (EXPERIMENTAL)

This is a **condensed reference guide** for the OpenAI Codex CLI. It is not an execution environment.

## What this is

A structured `AGENTS.md` instruction file for Codex CLI. It describes pai-orbit's modes (headspace + switch-out guidance) and skills (when to invoke).

## What's lost vs the Claude Code plugin

- **No command system.** Modes cannot be invoked with a slash command — apply them by context.
- **No skill invocation.** Skills are reference documentation only.
- **No agents, no hooks, no scaffolding.** These require Claude Code's plugin infrastructure.
- **No interactive `/setup`.** Create `.codex/pai-orbit-config.md` by hand using the template in the Claude Code plugin's `templates/` directory.

## Path conventions for Codex

When instructions reference `.claude/` paths:

| Claude Code path | Codex equivalent |
|------------------|-----------------|
| `.claude/pai-orbit-config.md` | `.codex/pai-orbit-config.md` |
| `.claude/team.md` | `.codex/team.md` |
| `.claude/agents/` | `.codex/agents/` |
| `CLAUDE.md` | `AGENTS.md` |

## Experimental status

Confirm `AGENTS.md` at project root is still Codex CLI's instruction-file convention before relying on this. If the convention has changed, update `adapters/codex/build.sh`.

## How to install

Copy `AGENTS.md` to your project root (or merge with an existing `AGENTS.md`).
