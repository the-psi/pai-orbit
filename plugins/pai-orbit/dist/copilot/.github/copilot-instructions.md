# pai-orbit — GitHub Copilot rule book

pai-orbit is a mode-driven developer workflow. The mode prompts in `.github/prompts/` carry the headspace and behaviour rules for each mode (`/groom`, `/design`, `/build`, etc.). This file is the always-loaded baseline that applies to every Copilot Chat turn.

## Path conventions

- pai-orbit metadata lives in `.copilot/`: `pai-orbit-config.md`, `team.md`, `settings.json`.
- Project documentation lives in `docs/`.
- `CLAUDE.md` at repo root is **tool-agnostic** project docs, named for historical reasons. Read it for project stack, key files, and conventions.

## Context discovery — read at session start

When a Copilot Chat session begins, look up these files in order. Read each that exists. If a referenced file does not exist, proceed without it — do not invent its contents.

1. `.copilot/pai-orbit-config.md` — board, branch model, deploy targets, docs home, team conventions
2. `.copilot/team.md` — team members, owners, default assignees
3. `CLAUDE.md` — project description, stack, key files, data model, auth
4. `docs/architecture/constraints.md` — architectural rules (read before any structural change)
5. `docs/architecture/system.md` — service inventory and inter-service communication
6. `docs/architecture/stack.md` — language and framework choices
7. `docs/decisions/` — ADRs relevant to the task
8. `docs/domain/*.md` — business rules and expert knowledge
9. `docs/features/<feature>/requirements.md` — when working on a known feature

## Forbidden patterns (bash-guard intent, advisory)

Never suggest, generate, or run commands matching these patterns. If a user asks for one, refuse and explain.

- `git push --force` / `git push -f` on any branch.
- `git add .`, `git add -A`, `git add --all`, `git add -u`.
- `git commit --no-verify`, `git push --no-verify`, `git merge --no-verify`, `git rebase --no-verify`.
- `rm -rf /`, `rm -rf ~`, `rm -rf $HOME`, `rm -rf .` (current directory wipe).

This is advisory only — Copilot's compliance is not guaranteed. Real enforcement lives in `.husky/pre-commit` (or `.pre-commit-config.yaml`), opted in at install.

## Architectural drift (arch-drift intent, advisory)

When editing or proposing changes to structural files — `docker-compose.yml`, `docker-compose.yaml`, `package.json`, `go.mod`, `pom.xml`, `Cargo.toml`, `pyproject.toml`, `requirements.txt`, `fly.toml`, `vercel.json`, `app.yaml`, `main.py`, `app.py`, `index.ts`, `index.js`, `server.ts`, `server.js` — warn the user that the change may affect architecture and suggest running `/arch validate` after the session.

The path-scoped detail lives in `.github/instructions/arch-drift.instructions.md`, which auto-attaches when these files are open.

## Prompt library

All mode and skill prompts live in `.github/prompts/`. Invoke them by typing `/<name>` in Copilot Chat. The slash-command picker prefixes them so kind is visible:

- `[mode]` — pai-orbit working modes (14): `/arch`, `/build`, `/data`, `/design`, `/domain`, `/groom`, `/incident`, `/plan`, `/release`, `/review`, `/setup`, `/suggest-skills`, `/test`, `/ux` (`/setup` and `/suggest-skills` run in agent mode on Business tier)
- `[skill]` — invokable procedures (6): `/analysis`, `/board`, `/data-model`, `/epic`, `/git`, `/simplify`
- `[agent]` — agent-mode prompts (9, Pro/Business agentic; Free regular):
  - Service builders (7): `/django-builder`, `/express-builder`, `/fastapi-builder`, `/generic-service-builder`, `/infra-builder`, `/nextjs-builder`, `/react-vite-builder`
  - Named sub-agents (2): `/docs-writer` (writes documentation; edits files in `docs/`), `/cross-repo-impact` (read-only cross-repo analysis; no file edits)

Auto-attaching instructions files in `.github/instructions/`:

- `git.instructions.md` — git conventions on every file
- `data-model.instructions.md` — SQL and migration conventions
- `arch-drift.instructions.md` — structural-file warnings
- `context-discovery.instructions.md` — fall-back duplicate of the Context discovery directives above
- `decisions.instructions.md` — ADR obligation rules (when to write one, how) — always attached

## Mode discipline

Each mode prompt opens with an anti-drift block. When in a mode, Copilot:

- Prefixes every reply with `[<MODE>]`
- Refuses off-scope requests and redirects to the right mode
- Holds the mode until the user explicitly switches

If a Copilot reply lacks the `[<MODE>]` prefix in mode context, treat it as drift and re-issue the mode command.

## Skill rendering

A skill may exist in both `prompts/` (invokable) and `instructions/` (auto-attached). `/git` and `/data-model` are dual-use today. Other skills are prompts-only.

## What this file does NOT do

- It does NOT replace mode prompts. Mode behaviour lives in `.github/prompts/<mode>.prompt.md`.
- It does NOT carry full skill bodies. Skill behaviour lives in `.github/prompts/<skill>.prompt.md` (and `.github/instructions/<skill>.instructions.md` for dual-use ones).
- It does NOT emit lint rules. Linter config (`pyproject.toml`, `.eslintrc.json`) is owned by the project; the pre-commit hook enforces it at commit time.
- It does NOT write `.vscode/`, `.idea/`, or any editor config. VS Code lint-on-save is a 4-line copy-paste recipe in the adoption page, configured once by the user.
