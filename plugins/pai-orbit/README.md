# pai-orbit (plugin)

This directory is the pai-orbit plugin source. It is structured as a tool-agnostic `core/` plus per-tool `adapters/` that compile to `dist/`.

```
plugins/pai-orbit/
├── core/                       # tool-agnostic source of truth
│   ├── plugin.json             # canonical plugin manifest (used by Claude Code adapter)
│   ├── modes/                  # the working modes — /arch, /build, /design, …
│   ├── skills/                 # operational procedures
│   ├── agents/                 # named sub-agents
│   ├── hooks/                  # PreToolUse / PostToolUse shell hooks
│   └── templates/              # scaffolds emitted by /setup
├── adapters/
│   ├── claude-code/build.sh    # full-fidelity; emits Claude Code plugin layout
│   ├── cursor-plugin/build.sh  # Cursor plugin; emits dist/cursor-plugin/pai-orbit/
│   ├── cursor/build.sh         # lossy legacy; emits .cursor/rules/*.mdc
│   ├── copilot/build.sh        # full: emits .github/{copilot-instructions.md, prompts/, instructions/} + husky/pre-commit templates
│   └── codex/build.sh          # experimental; emits AGENTS.md
├── dist/                       # built outputs (committed)
│   ├── claude-code/
│   ├── cursor-plugin/
│   ├── cursor/
│   ├── copilot/
│   └── codex/
└── build.sh                    # runs every adapter in sequence
```

## Building

```bash
bash plugins/pai-orbit/build.sh
```

Each adapter clears its own `dist/<adapter>/` subdir and rebuilds from `core/`. The build is intended to be deterministic — `git status` after a no-op rebuild should be clean. If it isn't, the adapter is non-deterministic and should be fixed.

## Adapter fidelity

| Adapter | Modes | Skills | Agents | Hooks | Templates |
|---------|-------|--------|--------|-------|-----------|
| claude-code | ✅ as `/commands/` | ✅ | ✅ | ✅ | ✅ |
| cursor-plugin | ✅ rules + commands | ✅ | ✅ | ⚠️ mapped | ✅ |
| cursor (legacy) | ⚠️ as rules (`.cursor/rules/*.mdc`) | ⚠️ as one rule | ❌ | ❌ | ✅ (verbatim) |
| copilot | ✅ as `.github/prompts/*.prompt.md` (invokable — full mode set incl. `/setup` and `/suggest-skills` as agent-mode prompts; D13 fully reversed 2026-07-04) | ✅ `/prompts/` + `/instructions/` auto-attach for `git`+`data-model`; ADR obligation rules in `decisions.instructions.md` (always attached) | ✅ 9 `[agent]` prompts (Pro/Business agentic; Free = regular prompt) — 7 service-builders + `/docs-writer` (edits) + `/cross-repo-impact` (read-only); `/setup` and `/suggest-skills` also run agentic | ⚠️ advisory in Chat + opt-in `.husky/pre-commit` (lint + weak secret tripwire; NOT force-push / `git add -A`) | ✅ (rendered via `pai-orbit init copilot` CLI; full parity with `/setup` — all 11 Step 2 questions incl. live board discovery) |
| codex       | ⚠️ as instructions | ⚠️ as appendix | ❌ | ❌ | ❌ |

`⚠️` means either "carried over as reference text only" (cursor legacy, codex) or "partial — see cell text" (copilot agents/hooks; cursor-plugin hooks). The receiving tool's runtime capabilities determine fidelity. See each `dist/<adapter>/README.md` for specifics.

## Adding a new adapter

1. `mkdir plugins/pai-orbit/adapters/<tool>` and write a `build.sh`.
2. Read from `${CORE_DIR:-../../core}`, write to `${DIST_DIR:-../../dist/<tool>}`.
3. Emit a `dist/<tool>/README.md` documenting what was lossy.
4. The top-level `build.sh` auto-discovers it via `adapters/*/build.sh`.
