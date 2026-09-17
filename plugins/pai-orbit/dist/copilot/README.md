# pai-orbit — GitHub Copilot adapter (dist)

This directory is the **built output** of the Copilot adapter. Do not hand-edit. Regenerate by running:

```bash
bash plugins/pai-orbit/build.sh
```

## What ships

- `.github/copilot-instructions.md` — slim rule book + Context discovery + prompt-library pointer
- `.github/prompts/*.prompt.md` — invokable slash commands (mode, skill, agent — 30 total)
- `.github/instructions/*.instructions.md` — auto-attaching guidance (5 total)
- `.husky/pre-commit.template` — opt-in commit-time lint + weak secret tripwire (husky variant)
- `.pre-commit-config.yaml.template` — same enforcement scope, pre-commit-framework variant

## What's covered vs the Claude Code plugin

- Full mode set (15) — arch, build, catchup, data, design, domain, groom, incident, plan, release, review, setup, suggest-skills, test, ux. `/setup` and `/suggest-skills` emit as agent-mode prompts (Business tier agentic; Free tier advisory).
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

This is the only install path for the Copilot adapter — Claude Code's and Cursor's
`/setup` scaffold only their own target.

## Upgrading from 1.5.0 or earlier

Before 1.6.0 this adapter emitted a single reference file
(`dist/copilot/.github/copilot-instructions.md`) that you copied into your project by
hand. From 1.6.0 it emits an invokable slash-command set — 30 prompts
(`.github/prompts/`), 5 auto-attaching instructions files (`.github/instructions/`), a
slimmed rule book, and two opt-in commit-hook templates — installed by an `npx` CLI.

Nothing breaks if you do nothing — an existing hand-copied `copilot-instructions.md`
keeps working as advisory text. To pick up the slash commands:

```bash
npx github:the-psi/pai-orbit init copilot
```

`init` preserves files you own (`.copilot/pai-orbit-config.md`, `.copilot/team.md`,
`AGENTS.md`) and overwrites only pai-orbit-owned ones; use `update copilot` for the same
refresh on an existing install.

If you installed a pre-release that used the older `.github/pai-orbit/` layout, `init`
detects it and migrates after asking you to confirm — or force it with `migrate copilot`.
Either way the old directory is backed up to `.github/pai-orbit.bak/<timestamp>/` and
your config moves to `.copilot/`. Full walkthrough: `docs/copilot-install-and-usage.md`.
