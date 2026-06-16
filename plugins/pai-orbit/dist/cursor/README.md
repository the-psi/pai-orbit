# pai-orbit — Cursor adapter

This is a **lossy** build of pai-orbit for Cursor.

## Install (no clone required)

Run this from the root of your project:

```bash
curl -fsSL https://raw.githubusercontent.com/the-psi/pai-orbit/main/plugins/pai-orbit/dist/cursor/install.sh | bash
```

To pin to a specific release:

```bash
PAI_ORBIT_REF=v1.1.0 curl -fsSL https://raw.githubusercontent.com/the-psi/pai-orbit/main/plugins/pai-orbit/dist/cursor/install.sh | bash
```

That's it. The rule files land in `.cursor/rules/` and Cursor picks them up automatically.

## What's installed

- `.cursor/rules/*.mdc` — one rule file per pai-orbit mode (build, design, arch, etc.). `alwaysApply: false` so the agent picks them up by relevance, not unconditionally.
- `.cursor/rules/skills.mdc` — concatenated skills reference (Cursor has no skill system).

Templates (`pai-orbit-config.md`, `team.md`, `CLAUDE.md`) can be fetched on demand — the installer prints the exact commands after it runs.

## Manual install

If you prefer not to pipe to bash, clone or download this directory and copy `.cursor/` into your project root (merge with any existing `.cursor/`).

## What's lost vs the Claude Code plugin

- **No command system.** Modes cannot be invoked as `/build`, `/design`, etc. They become rule documents the agent reads.
- **No skill invocation.** Skills become reference documents only.
- **No agents.** Claude Code's named sub-agents (docs-writer, cross-repo-impact) have no Cursor analog.
- **No hooks.** PreToolUse/PostToolUse safety and lint hooks are dropped. Replicate with Cursor's own command-execution settings if needed.
