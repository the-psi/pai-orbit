# pai-orbit — GitHub Copilot adapter (dist)

This directory is the **built output** of the Copilot adapter. Do not hand-edit. Regenerate by running:

```bash
bash plugins/pai-orbit/build.sh
```

## What ships

- `.github/copilot-instructions.md` — slim rule book + Context discovery + prompt-library pointer
- `.github/prompts/*.prompt.md` — invokable slash commands (mode, skill, agent — 25 total)
- `.github/instructions/*.instructions.md` — auto-attaching guidance (4 total)
- `.husky/pre-commit.template` — opt-in git-level enforcement (husky variant)
- `.pre-commit-config.yaml.template` — opt-in git-level enforcement (pre-commit framework variant)

See the parent plan and design doc for the full rationale:

- `docs/plans/copilot-adapter-upgrade-2026-06-28.md`
- `docs/features/copilot-adapter-prompt-files/design.md`

## What's lost vs the Claude Code plugin

- No runtime hook system. `bash-guard` becomes always-loaded instruction text plus the optional `.husky/pre-commit` or `.pre-commit-config.yaml`. `arch-drift` is split between `copilot-instructions.md` and `instructions/arch-drift.instructions.md`. Lint hooks rely on the project's own linter config invoked from the pre-commit hook.
- No agent runtime parity. Service-builder prompts emit with `mode: agent` (D30): on Copilot Pro/Business they run as multi-step agents; on Free they degrade to regular prompts that give correct manual scaffolding guidance.
- No `/setup` or `/suggest-skills` (D13). The standalone `npx github:the-psi/pai-orbit init copilot` CLI replaces `/setup` for Copilot-only teams.
- No editor-specific files (D33). VS Code users follow the 4-line lint-on-save recipe in the adoption page.

## How to install

End users run the standalone install CLI from the project root:

```bash
npx github:the-psi/pai-orbit init copilot
```

Or, inside Claude Code / Cursor, run `/setup` and pick Copilot as a target.
