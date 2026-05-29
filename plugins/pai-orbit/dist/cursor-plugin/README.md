# pai-orbit — Cursor plugin adapter

Full Cursor plugin build of pai-orbit. Install as a **user-level or team marketplace plugin**, not by copying into project `.cursor/`.

## Layout

```
dist/cursor-plugin/pai-orbit/
├── .cursor-plugin/plugin.json
├── rules/           # modes as .mdc (alwaysApply: false) + project-config rule
├── commands/        # modes as invocable /commands
├── skills/          # one SKILL.md per skill
├── agents/
├── hooks/hooks.json
├── scripts/         # hook shell scripts
└── templates/
```

## Install (GitHub repo root)

The repository root includes `.cursor-plugin/marketplace.json`, which points at this directory. In Cursor, install from `https://github.com/the-psi/pai-orbit` (or your fork) on `main`, then reload. Reinstall if you previously got Claude-style `/setup` (`.claude/` paths).

See `docs/cursor-plugin-install-and-usage.md` in the repo.

## Install (local development)

**Windows (PowerShell):**

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.cursor\plugins\local" | Out-Null
cmd /c mklink /D "$env:USERPROFILE\.cursor\plugins\local\pai-orbit" "D:\path\to\pai-orbit\plugins\pai-orbit\dist\cursor-plugin\pai-orbit"
```

**macOS / Linux:**

```bash
mkdir -p ~/.cursor/plugins/local
ln -sf ~/src/pai-orbit/plugins/pai-orbit/dist/cursor-plugin/pai-orbit ~/.cursor/plugins/local/pai-orbit
```

Reload Cursor (Command Palette → Developer: Reload Window). Verify rules and skills under **Settings → Rules**.

## Legacy install

If you cannot use the plugin format, the lossy bundle remains at `dist/cursor/` (copy `.cursor/rules` into your project).

**Do not** install both the user-level plugin and committed legacy rules — duplicate mode guidance will conflict.

## Parity vs Claude Code

| Feature | Claude Code | Cursor plugin |
|---------|-------------|---------------|
| `/setup` interactive board query | Full | Full — writes `.cursor/pai-orbit-config.md`, `.cursor/team.md`, and `AGENTS.md` (no `.claude/` or `CLAUDE.md`) |
| Live `/board` label resolution | Full | Depends on agent + CLI |
| Hook blocking (bash-guard) | PreToolUse | `beforeShellExecution` — script expects Claude stdin JSON; test per Cursor version |
| Subagent parallel tasks | Yes | Cursor subagents — test per version |

## Rebuild

```bash
bash plugins/pai-orbit/build.sh
```
