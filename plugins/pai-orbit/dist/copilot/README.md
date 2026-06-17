# pai-orbit — GitHub Copilot adapter

This is a **condensed reference guide** for GitHub Copilot. It is not an execution environment.

## What this is

A structured instruction file for Copilot Chat. It describes pai-orbit's modes (headspace + switch-out guidance) and skills (when to invoke). Copilot reads `.github/copilot-instructions.md` as custom instructions.

## What's lost vs the Claude Code plugin

- **No command system.** Modes cannot be invoked with a slash command — apply them by context.
- **No skill invocation.** Skills are reference documentation only.
- **No agents, no hooks, no scaffolding.** These require Claude Code's plugin infrastructure.
- **No interactive `/setup`.** Create `.github/pai-orbit/pai-orbit-config.md` by hand using the template in the Claude Code plugin's `templates/` directory.

## Path conventions for Copilot

When instructions reference `.claude/` paths:

| Claude Code path | Copilot equivalent |
|------------------|--------------------|
| `.claude/pai-orbit-config.md` | `.github/pai-orbit/pai-orbit-config.md` |
| `.claude/team.md` | `.github/pai-orbit/team.md` |
| `.claude/agents/` | `.github/pai-orbit/agents/` |

`CLAUDE.md` stays as is — it is tool-agnostic project documentation.

## How to install

Copy `.github/copilot-instructions.md` into your project's `.github/` directory (or merge with an existing file). Copilot Chat picks it up automatically in supported editors.
