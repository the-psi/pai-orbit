# pai-orbit — OpenAI Codex CLI adapter

Full-parity build of pai-orbit for OpenAI Codex CLI (v0.144.6+).

## Install (no clone required)

**macOS / Linux / WSL / Git Bash:**

```bash
curl -fsSL https://raw.githubusercontent.com/the-psi/pai-orbit/main/plugins/pai-orbit/dist/codex/install.sh | bash
```

**Windows (native PowerShell):**

```powershell
irm https://raw.githubusercontent.com/the-psi/pai-orbit/main/plugins/pai-orbit/dist/codex/install.ps1 | iex
```

Pin a specific release with `PAI_ORBIT_REF=v1.4.0` (bash) or `$env:PAI_ORBIT_REF='v1.4.0'` (PowerShell) before running.

## Layout installed into your project

```
project-root/
├── AGENTS.md                             # Codex reads at project root
├── .agents/skills/                       # 6 operational + 14 mode skills
├── .codex/agents/                        # docs-writer.toml, cross-repo-impact.toml
├── .codex/hooks/                         # bash-guard, arch-drift-wrapper, lint-*-wrapper (+ .ps1 variants)
├── .codex/hooks.json                     # official nested schema with commandWindows overrides
├── .codex/config.toml                    # approval + sandbox + multi-agent bounds
└── .codex/templates/                     # scaffolding templates (setup consumes these)
```

## First-run steps

1. Launch `codex` in the project. Trust the project when prompted.
2. Run `/hooks` to trust the four registered hooks. Every hook edit invalidates trust — re-run after upgrades.
3. Run `\$setup` to scaffold `.codex/pai-orbit-config.md`, `.codex/team.md`, and to fill in the lint hooks' `repo=` block.
4. Run `/skills` to see the 20 skills.

## Skills

**6 operational skills** — fire implicitly on description match OR explicit as `\$skill-name`:

- `analysis`, `board`, `data-model`, `epic`, `git`, `simplify`

**14 mode skills** — explicit-only (invoked as `\$mode-name`; `agents/openai.yaml` disables implicit invocation):

- `arch`, `build`, `data`, `design`, `domain`, `groom`, `incident`, `orbit-plan`, `orbit-review`, `release`, `setup`, `suggest-skills`, `test`, `ux`

Two modes are renamed in the Codex build to avoid ergonomic collision with Codex's built-in slash commands:

- `plan` → `orbit-plan` (Codex `/plan` is a built-in planning mode)
- `review` → `orbit-review` (Codex `/review` is a built-in code review command)

The rename is preventive: `/plan` and `\$plan` live in different namespaces so they don't hard-collide, but the ergonomic overlap causes confusion. Retrain your fingers: on Codex, `\$orbit-plan` and `\$orbit-review`.

## Multi-agent primitives (Codex-native)

Codex enables five collaboration tools via `features.multi_agent` (stable, default true): `spawn_agent`, `send_input`, `resume_agent`, `wait_agent`, `close_agent`. The primary agent orchestrates subagents through these tools; use `/agent` to switch active agent threads. pai-orbit ships `docs-writer` and `cross-repo-impact` as native Codex subagents in `.codex/agents/`.

## Hooks

Registered in `.codex/hooks.json` (nested schema; `commandWindows` for Windows overrides):

| Event | Matcher | Script |
|---|---|---|
| `PreToolUse` | `^Bash$` | `bash-guard.sh` (blocks force-push, bulk staging, hook bypass, destructive rm) |
| `PostToolUse` | `^(apply_patch|Edit|Write)$` | `arch-drift-wrapper.sh` (advisory on structural file edits) |
| `PostToolUse` | `^(apply_patch|Edit|Write)$` | `lint-python-wrapper.sh` (runs `ruff check` on touched `.py`) |
| `PostToolUse` | `^(apply_patch|Edit|Write)$` | `lint-ts-wrapper.sh` (runs `eslint` on touched `.ts`/`.tsx`/`.js`/`.jsx`) |

Wrappers extract touched paths from the `apply_patch` payload using a Primary/Fallback/Future-proof triad and forward per-file Claude-shape JSON to the underlying core lint / arch-drift scripts.

## Path conventions

| Purpose | Codex path |
|---------|-----------|
| Project config | `.codex/pai-orbit-config.md` |
| Team roster | `.codex/team.md` |
| CLI config | `.codex/config.toml` |
| Skills | `.agents/skills/<name>/SKILL.md` |
| Subagents | `.codex/agents/<name>.toml` |
| Hook scripts | `.codex/hooks/*.sh` (+ `.ps1` on Windows) |
| Hook registration | `.codex/hooks.json` |

## Windows notes

- `bash-guard.ps1` is a native PowerShell port and works without Bash. It blocks the same dangerous commands as `bash-guard.sh`.
- The advisory wrappers (`arch-drift-wrapper.ps1`, `lint-*-wrapper.ps1`) invoke the Python extractor natively but shell out to `bash` for the core scripts. Install Git Bash or WSL if you want the advisory hooks to run. Without Bash they silently no-op.
- `codex-windows-sandbox-setup.exe` may fail to launch when `codex exec` runs from an unusual working directory. Workaround: pass `--dangerously-bypass-approvals-and-sandbox` for automation contexts, or invoke Codex from a directory inside its install root.

## AGENTS.md.override.md

Codex reads `AGENTS.override.md` in preference to `AGENTS.md` in the same directory when both exist. Useful for local-dev overrides without editing the tracked `AGENTS.md`. Add `AGENTS.override.md` to your `.gitignore` if you use it.

## What's still lost vs the Claude Code plugin

- **Slash-command mode invocation.** Modes ship as `\$mode-name` skills only; there's no `/build`, `/design`, etc. Codex removed the flat `~/.codex/prompts/*.md` custom-prompt form at 0.117.0. A namespaced `/prompts:<name>` form remains in current versions but pai-orbit does not use it.
- **Hook auto-trust.** Codex requires explicit `/hooks` trust on first install and after every script edit. Claude Code hooks are active by default.
- **Per-subagent tool restriction.** Claude Code agents can declare `tools: Read, Grep`. Codex subagents inherit tools from the parent by default; finer scoping is possible via `mcp_servers` / `skills.config` overrides but is coarser.

## Rebuild

```bash
bash plugins/pai-orbit/build.sh
```

Rebuilds all adapters. To rebuild only Codex: `bash plugins/pai-orbit/adapters/codex/build.sh`.
