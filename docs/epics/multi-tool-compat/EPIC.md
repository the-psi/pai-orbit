# Multi-Tool Compatibility

**Status:** In Progress
**Owner:** Punit Singhal
**Last Updated:** 2026-06-28

## Summary
Extend pai-orbit so the same mode discipline and operational skills work in Cursor, GitHub Copilot Chat, and OpenAI Codex CLI, not just Claude Code — enabling teams to use whichever AI coding tool they prefer without losing the methodology.

## Requirements
1. pai-orbit's command headspaces (`/build`, `/design`, `/plan`, etc.) are available as native constructs in Cursor, GitHub Copilot Chat, and Codex CLI
2. Skills (`/git`, `/board`, `/analysis`, etc.) are available in Cursor, Copilot Chat, and Codex CLI
3. Hooks (bash-guard, lint, arch-drift-guard) fire on the equivalent tool events in Cursor; degrade gracefully where Copilot Chat and Codex CLI have no hook system (Copilot: advisory text + opt-in pre-commit)
4. `/setup` detects or asks which tool(s) are in use and generates the right config files for each
5. A single source of truth in this repo drives all tool-specific output — no parallel hand-maintained files
6. A standalone install path exists for Copilot-only teams that do not run Claude Code or Cursor (`npx github:the-psi/pai-orbit init copilot`)

## User Stories
- As a developer using Cursor, I want `/build` and `/design` modes to enforce the same headspace discipline as in Claude Code, so that I don't lose the methodology when switching editors.
- As a developer using Copilot Chat in VS Code, I want pai-orbit's modes and skills to appear as invokable slash commands, so that I get the same methodology as Claude Code and Cursor without manual recall.
- As a developer using Codex CLI, I want pai-orbit's instructions to load automatically from `AGENTS.md`, so that I get mode-aware behaviour without manual setup.
- As a Copilot-only team with no Claude Code or Cursor install, I want a one-command install path (`npx github:the-psi/pai-orbit init copilot`), so that I can adopt pai-orbit without first installing another tool.
- As a team with mixed tooling, I want `/setup` to generate config for all tools in use, so that every engineer gets the same experience regardless of which tool they run.

## Features
| Feature | Status | Notes |
|---------|--------|-------|
| canonical-spec | Not started | Phase 1 of the broader multi-tool plan; deferred until a 4th tool warrants it (per existing decision below) |
| cursor-adapter | Done | Ships in `plugins/pai-orbit/adapters/cursor/` and `cursor-plugin/`; install guide at `docs/cursor-plugin-install-and-usage.md` |
| codex-adapter | Done (experimental) | Ships in `plugins/pai-orbit/adapters/codex/`; emits `AGENTS.md`. Hooks degrade gracefully |
| copilot-adapter-prompt-files | Done (automation green; live-Chat validation pending) | Copilot adapter emits 29 prompts (14 modes incl. `/setup` and `/suggest-skills` as agent-mode, 6 skills, 9 agent-mode prompts) + 5 instructions files + 2 hook templates + slim rule book. Working plan kept locally by the implementing team. |
| copilot-install-cli (npx) | Done (smoke-tested; live npx flow pending) | Phase 3b. `pai-orbit init|update|migrate copilot` runs end-to-end with first-run / re-run / migration detection |
| setup-multi-tool | In Progress (Copilot target shipped) | `/setup` now asks "assistant target" and writes the Copilot tree when selected. Claude/Cursor paths are unchanged. Adoption page at `docs/copilot-install-and-usage.md` |

## Success Metrics
- A Cursor project with pai-orbit rules active enforces the same mode headspace as Claude Code
- A Copilot Chat session in a pai-orbit project shows 25 invokable slash commands (`[mode]`, `[skill]`, `[agent]`) and honours mode-discipline anti-drift on at least 2 of 3 mode replies
- A Codex CLI session in a pai-orbit project reads AGENTS.md and behaves mode-aware
- `/setup` generates correct output for Claude Code, Cursor, Copilot, and Codex CLI from a single run; Claude/Cursor outputs remain byte-identical to the pre-Copilot-upgrade behaviour
- A team with no Claude Code or Cursor can install pai-orbit's Copilot adapter in one command (`npx github:the-psi/pai-orbit init copilot`)
- No pai-orbit content is duplicated — all tool outputs are generated from the canonical `.md` source files

## Decisions
- **Generator vs parallel files:** Generator approach — single source of truth in `core/modes/*.md`, `core/skills/*/SKILL.md`, and `core/templates/agents/*.md`; per-tool adapters in `adapters/<tool>/build.sh` produce Cursor / Codex / Copilot artefacts. See `docs/features/multi-tool-compat/design.md` D6.
- **Claude adapter strategy (Phase 1):** Claude reads source files directly (native format). Generator does not produce Claude output yet. Migration to full Option B deferred to a future phase when a 4th tool warrants it.
- **Cursor modes:** Surfaced as `agent_requested` Cursor rules — no custom slash commands. User types "enter build mode" or task context triggers the rule automatically.
- **Codex CLI hooks:** Terminal wrapper scripts (`pai` CLI) handle pre/post execution hooks. No native hook system in Codex CLI.
- **Copilot adapter (2026-06-28 → 2026-07-05):** D1..D36 committed in the working plan (kept locally by the implementing team). Highlights:
  - Prompt files (`agent: agent`) for 12 modes + 6 skills; service-builder prompts (`mode: agent`) for 7 stacks (D30).
  - Instructions files for `git`, `data-model`, `arch-drift`, `context-discovery` (R8 fall-back).
  - `.copilot/` metadata folder symmetric with `.claude/` and `.cursor/` (D3).
  - Standalone install via `npx github:the-psi/pai-orbit` — no npm publish (D7).
  - No editor-specific files (`.vscode/`, `.idea/`, etc.) emitted (D33).
  - Hook intent delivered as advisory text + opt-in pre-commit (husky or pre-commit framework, D29).

## Open Questions
- [ ] Should Phase 1 (canonical front-matter) be done in one PR across all commands + skills, or incrementally? — owner: Punit Singhal
- [ ] Which skills should use `auto_attached` Cursor rule type vs `agent_requested`? (e.g. data-model auto-attaches to `*.sql`) — owner: Punit Singhal
- [ ] `pai` CLI wrapper: how does it detect which Codex CLI binary is installed (`codex` vs `openai`)? — owner: Punit Singhal
- [ ] Husky template — assume husky v9+ installed (current default) vs ship as plain `.git/hooks/pre-commit.template`? Resolve from Phase 4 live-Chat validation results. — owner: Chetan Sharma
- [ ] Broadest `applyTo:` glob Copilot honours on instructions files — `**/*` is assumed; confirm or fall back to per-extension splits per design §10.2. — owner: Chetan Sharma
