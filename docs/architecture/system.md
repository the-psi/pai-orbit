# System Architecture: pai-orbit
Last updated: 2026-08-18
Status: declared

## Services

| Service | Path / Repo | Stack | Purpose |
|---------|-------------|-------|---------|
| core | `plugins/pai-orbit/core/` | Markdown (modes/skills/agents) + bash (hooks) | Tool-agnostic source of truth for all modes, skills, agents, hooks, templates |
| claude-code adapter | `plugins/pai-orbit/adapters/claude-code/` → `dist/claude-code/` | bash build script | Full-fidelity compile of core to the Claude Code plugin format |
| cursor-plugin adapter | `plugins/pai-orbit/adapters/cursor-plugin/` → `dist/cursor-plugin/` | bash build script | Cursor plugin (rules, skills, commands, agents, hooks) |
| kiro-power adapter | `plugins/pai-orbit/adapters/kiro-power/` → `dist/kiro-power/` | bash build script | Kiro Power (skills + auto-loading steering); no agent or hook fidelity today |
| cursor adapter (legacy) | `plugins/pai-orbit/adapters/cursor/` → `dist/cursor/` | bash build script | Lossy `.cursor/rules/*.mdc` compile |
| copilot adapter | `plugins/pai-orbit/adapters/copilot/` → `dist/copilot/` | bash build script | Lossy `.github/copilot-instructions.md` compile |
| codex adapter | `plugins/pai-orbit/adapters/codex/` → `dist/codex/` | bash build script + Node install CLI | Full-parity native compile (skills, hooks, subagents, `AGENTS.md`) with `npx` installer |

## Communication

| From | To | Protocol | Notes |
|------|----|----------|-------|
| top-level `build.sh` | each `adapters/*/build.sh` | shell invocation | Discovers and runs every adapter automatically |
| adapter build.sh | `core/` | filesystem read | Reads `${CORE_DIR:-../../core}` |
| adapter build.sh | `dist/<tool>/` | filesystem write | Writes `${DIST_DIR:-../../dist/<tool>}`, which is committed |

## Data Stores

None — this is a static content pipeline (markdown/bash in, markdown/bash out). No database, cache, or queue.

## Data Flow

```mermaid
graph LR
    core[core/ — modes, skills, agents, hooks, templates] --> claudecode[adapters/claude-code/build.sh]
    core --> cursorplugin[adapters/cursor-plugin/build.sh]
    core --> kiropower[adapters/kiro-power/build.sh]
    core --> cursor[adapters/cursor/build.sh]
    core --> copilot[adapters/copilot/build.sh]
    core --> codex[adapters/codex/build.sh]
    claudecode --> distcc[dist/claude-code/]
    cursorplugin --> distcp[dist/cursor-plugin/]
    kiropower --> distkp[dist/kiro-power/]
    cursor --> distc[dist/cursor/]
    copilot --> distco[dist/copilot/]
    codex --> distcx[dist/codex/]
```

## System Boundaries

**Inside this system:** `core/`, `adapters/*/`, `dist/*/`, and `docs/` in this repo.

**Outside this system (not owned, treated as external):**
- The Claude Code host application/runtime that loads the plugin
- GitHub (Issues, Projects v2) — used as the board, not owned by this repo
- The Claude Code plugin marketplace mechanism (`marketplace.json` resolution)
- Consuming target-project repos — they install `dist/claude-code/` (or another adapter's bundle) and generate their own `.claude/` config via `/setup`; this repo has no visibility into or control over that generated config

## Open Questions

- [x] ~~`constraints.md` rule 6 requires full adapter parity, but `cursor` (legacy) is documented as "lossy" and `codex` as "experimental" today — both are known to fall short. Bring them to parity, or revisit the rule.~~ — **Partially resolved 2026-07-30 by the codex adapter upgrade.** Codex is now full-parity (native skills, hooks, subagents, npx installer) — see `docs/decisions/2026-07-19-codex-adapter-decisions.md`. `cursor` (legacy) remains a documented lossy path retained only for teams that cannot install the `cursor-plugin` build; the Cursor plugin adapter is full-parity and is the recommended install for Cursor users. Rule 6 is now met by all recommended install paths (`claude-code`, `cursor-plugin`, `codex`); the legacy `cursor` fallback is a deliberate documented exception.
- [ ] `kiro-power` ships with no agent or hook fidelity (`❌`/`❌` in `plugins/pai-orbit/README.md`'s adapter fidelity table) — the same gap `copilot` carries, and the gap `codex` carried until the 2026-07-30 upgrade above. Accepted at introduction per `docs/decisions/2026-08-18-add-kiro-power-adapter.md` rather than blocking the adapter's addition; revisit when Kiro gains an agent/hook-equivalent primitive. — owner: unassigned
