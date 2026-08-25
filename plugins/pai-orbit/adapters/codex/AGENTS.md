# AGENTS.md

pai-orbit — Codex CLI project rule book. Always loaded at project root.

## What this project uses

- **Skills** live at `.agents/skills/`. Six operational skills (`analysis`, `board`, `data-model`, `epic`, `git`, `simplify`) can be invoked as `$skill-name` or fire implicitly on description match. Fourteen mode skills (`arch`, `build`, `data`, `design`, `domain`, `groom`, `incident`, `orbit-plan`, `orbit-review`, `release`, `setup`, `suggest-skills`, `test`, `ux`) are explicit-only — the user invokes them as `$mode-name` when they want to enter that headspace.
- **Subagents** live at `.codex/agents/`. `docs-writer` handles documentation work; `cross-repo-impact` handles read-only cross-repository analysis. Codex spawns them via natural-language requests; use `/agent` to switch active agent threads.
- **Hooks** live at `.codex/hooks/` (registered in `.codex/hooks.json`). Trust them via `/hooks` on first install. Every hook script edit invalidates trust — re-run `/hooks` after upgrades.
- **Project config** lives at `.codex/pai-orbit-config.md` (board type, git model, deploy targets, docs home) and `.codex/team.md` (roster).

## Always-on rules (defense in depth alongside the hooks)

These duplicate the intent of the `bash-guard` PreToolUse hook. Follow them even before the user runs `/hooks` to trust the actual scripts:

- Never run `git push --force` or `git push -f` on a shared branch. If a rebase is genuinely needed, tell the user to run it manually outside the agent.
- Never use `git add .`, `git add -A`, `git add --all`, or `git add -u`. Always stage specific files by name — bulk staging can leak `.env`, credentials, or generated files.
- Never bypass hooks with `--no-verify` on `git commit`, `git push`, `git merge`, or `git rebase`. If a hook is failing, fix the underlying issue.
- Never run `rm -rf` (or `-fr` / `-r -f`) with root (`/`), home (`~` / `$HOME`), or the current directory (`.`) as the target. Specify an explicit path.

Absorbed intent of the `arch-drift-guard` PostToolUse hook (advisory only, not blocking):

- When you edit a structural file (`docker-compose.yml`, `package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`, `requirements.txt`, `fly.toml`, `vercel.json`, `app.yaml`, top-level entry points like `main.py`, `app.py`, `index.ts`, `server.ts`), mention it in your reply. Suggest running `$arch` (arch mode) to validate the change against declared constraints in `docs/architecture/constraints.md`.

## Mode discipline

Modes are intentional headspace switches. Don't drift between modes mid-session — if the user asks for something outside the current mode's contract, note it and ask whether to switch. For example, don't do design work inside `$build`; ask to switch to `$design` first.

Every mode declares its **Reads** (inputs) and **Writes** (outputs). Respect those contracts. Don't write to `docs/ops/` or `docs/backlog/` unless explicitly instructed — those are human-owned.

## Documentation lives in files, not chat

pai-orbit's founding rule: if it matters, it goes to a file. Session captures at `docs/wip/session-capture-<date>.md`. ADRs at `docs/decisions/YYYY-MM-DD-<slug>.md`. Feature docs at `docs/features/<feature>/`. When a mode says "write X to Y", write it — don't summarize it in chat only.

## Path conventions

| Purpose | Path |
|---------|------|
| Project config | `.codex/pai-orbit-config.md` |
| Team roster | `.codex/team.md` |
| Codex CLI config | `.codex/config.toml` |
| Skills | `.agents/skills/<name>/SKILL.md` |
| Subagents | `.codex/agents/<name>.toml` |
| Hook scripts | `.codex/hooks/*.sh` (+ `.ps1` on Windows) |
| Hook registration | `.codex/hooks.json` |
| Documentation | `docs/` |

## First-run checklist

1. Run `$setup` to fill in `.codex/pai-orbit-config.md`, `.codex/team.md`, and the lint hooks' `repo=` block.
2. Run `/hooks` to review and trust the four registered hooks (`bash-guard`, `arch-drift-wrapper`, `lint-python-wrapper`, `lint-ts-wrapper`).
3. Run `/skills` to see the 20 available skills. Type `$build`, `$design`, etc. to enter mode headspaces.

If the project scope for `.codex/hooks.json` doesn't load (project untrusted in Codex), user-scope `~/.codex/hooks.json` is an **additive complement** — both layers fire together when trusted, not one-or-the-other. Set up whichever fits your workflow.
