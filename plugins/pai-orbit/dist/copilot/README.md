# pai-orbit — GitHub Copilot adapter (dist)

This directory is the **built output** of the Copilot adapter. Do not hand-edit. Regenerate by running:

```bash
bash plugins/pai-orbit/build.sh
```

## What ships

- `.github/copilot-instructions.md` — slim rule book + Context discovery + prompt-library pointer
- `.github/prompts/*.prompt.md` — invokable slash commands (mode, skill, agent — 29 total)
- `.github/instructions/*.instructions.md` — auto-attaching guidance (5 total)
- `.husky/pre-commit.template` — opt-in commit-time lint + weak secret tripwire (husky variant)
- `.pre-commit-config.yaml.template` — same enforcement scope, pre-commit-framework variant

## What's covered vs the Claude Code plugin

- Full mode set (14) — arch, build, data, design, domain, groom, incident, plan, release, review, setup, suggest-skills, test, ux. `/setup` and `/suggest-skills` emit as agent-mode prompts (Business tier agentic; Free tier advisory).
- Full skill set (6) — analysis, board, data-model, epic, git, simplify. `git` and `data-model` also render as always-attached instructions files.
- Named sub-agents (2) — `docs-writer` (edit tools), `cross-repo-impact` (read-only tools).
- Service-builder templates (7) — django, express, fastapi, generic-service, infra, nextjs, react-vite.
- ADR obligation rules — `.github/instructions/decisions.instructions.md` (always attached).

## Honest limitations vs Claude Code

- No runtime hook system in Copilot Chat. `bash-guard` intent lives as advisory text in `.github/copilot-instructions.md` — Copilot usually obeys, no guarantee. The opt-in `.husky/pre-commit` adds real enforcement at commit time (lint + weak secret regex) but cannot block `git push --force`, `git add -A`, or shell `rm -rf` — those need Claude Code's PreToolUse, a pre-push hook, or server-side branch protection.
- Agent runtime parity is tier-dependent. `mode: agent` prompts run agentically on Copilot Pro/Business; on Free they degrade to regular prompts that still give correct manual guidance.
- No editor-specific files (D33). VS Code users follow the 4-line lint-on-save recipe in the adoption page.

## How to install

End users run the standalone install CLI from the project root:

```bash
npx github:the-psi/pai-orbit init copilot
```

Or, inside Claude Code / Cursor, run `/setup` and pick Copilot as a target.
