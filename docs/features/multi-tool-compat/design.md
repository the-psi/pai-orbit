# Design: Multi-Tool Compatibility

**Date:** 2026-05-18
**Epic:** docs/epics/multi-tool-compat/EPIC.md
**Status:** Draft

---

## Problem

pai-orbit is currently a Claude Code plugin. Its value — mode discipline, context preservation, structured SDLC workflow — is locked to users of Claude Code. Teams using Cursor or Codex CLI get none of it.

The goal is not to port Claude Code primitives to other tools. The goal is to evolve pai-orbit into a **provider-agnostic agent runtime** where Claude, Cursor, and Codex are interchangeable execution engines, and pai-orbit is the SDLC intelligence layer that runs on top of all of them.

---

## Target Architecture

```
commands/*.md                    ◄── canonical source (Claude-native format, Phase 1)
skills/*/SKILL.md                     read directly by Claude Code via .claude-plugin/

        │
        └──► generate-adapters script
                    │
                    ├──► .cursor/rules/pai-orbit-*.mdc   (Cursor adapter)
                    ├──► .vscode/tasks.json              (Cursor hook templates)
                    ├──► AGENTS.md                       (Codex CLI adapter)
                    └──► scripts/pai                     (Codex CLI wrapper)
```

**Future (Option B):** generator also produces `.claude-plugin/plugin.json` and any Claude-specific wrappers, making all three tools symmetric. Triggered when adding a 4th tool makes the symmetry worth the migration cost.

The runtime layer is **pai-orbit's IP**. The adapters are thin generators that compile runtime definitions into each tool's native format.

---

## Core Design Principle: Skill == Semantic Capability

Do NOT equate:
```
Skill == Prompt File
```

Instead:
```
Skill == Semantic Capability with tool-specific renderings
```

A skill or command should be able to render differently for each execution engine:

| Primitive | Claude rendering | Cursor rendering | Codex rendering |
|---|---|---|---|
| `/build` command | Slash command `.md` with full headspace | `.mdc` rule, `alwaysApply: false` | `AGENTS.md` section, concise terminal-oriented |
| `/git` skill | Skill `.md` invoked by name | `.mdc` rule attached to git file patterns | Wrapper script: `pai git` → `codex exec ...` |
| `bash-guard` hook | PreToolUse hook in `settings.json` | Model instruction in rule file | Pre-execution shell wrapper |

---

## Canonical Agent Spec

The most important structural change: introduce a **canonical agent spec** in YAML front-matter on each command and skill file. This spec is tool-agnostic. The body of the file becomes the Claude rendering. Optional `## Cursor` and `## Codex` sections provide tool-specific rendering overrides.

### Command file structure (after migration)

```markdown
---
name: build
type: command
description: Implementation session — writing code, fixing bugs, shipping features
triggers:
  - "implement"
  - "build"
  - "fix"
  - "code"
cursor:
  rule_type: agent_requested   # always | auto_attached | agent_requested
  attach_patterns: []          # file globs for auto_attached rules
codex:
  include_in_agents_md: true
  section_title: "BUILD MODE"
  condensed: true              # use condensed rendering for AGENTS.md
---

# (Claude rendering — existing content unchanged)
You are now in BUILD MODE.
...

## Cursor
<!-- Optional: Cursor-specific rendering override. If absent, generator uses Claude content. -->

## Codex
<!-- Optional: concise terminal-oriented rendering for AGENTS.md. If absent, generator condenses Claude content. -->
```

If no `## Cursor` or `## Codex` section is present, the generator uses the Claude content directly (with light formatting adaptation).

---

## Adapter Designs

### Claude Adapter (existing — no change)
The current `.claude-plugin/` structure remains as-is. The Claude adapter reads the canonical front-matter but generates the same output it always has. No regression.

---

### Cursor Adapter

**Output:** `.cursor/rules/pai-orbit-<name>.mdc` for each command and skill

**Frontmatter mapping:**

| Canonical field | Cursor `.mdc` frontmatter |
|---|---|
| `name` | (filename) `pai-orbit-<name>.mdc` |
| `description` | `description:` |
| `cursor.rule_type: always` | `alwaysApply: true` |
| `cursor.rule_type: auto_attached` | `globs: [<attach_patterns>]` |
| `cursor.rule_type: agent_requested` | `alwaysApply: false`, no globs |

**Slash commands:** Cursor has no custom slash command support. Commands are surfaced as `agent_requested` rules — Cursor's agent attaches them when the task matches. The user can also type "enter build mode" or "use build mode" explicitly.

**Hooks:** Cursor has no PreToolUse/PostToolUse hook system.
- `bash-guard` → encoded as model instructions in an `always`-type rule: "Never run `git push --force`, `git add -A`, or `rm -rf` without explicit user confirmation."
- Lint hooks → VS Code task template (generated into `.vscode/tasks.json`) that runs on file save. The Cursor rule instructs the model to run the task after edits.

---

### Codex CLI Adapter

**Output:** `AGENTS.md` at repo root (and optionally service-level `AGENTS.md` in subdirectories for monorepos)

**Structure:**
```markdown
# pai-orbit — Agent Instructions

## Modes
<!-- One section per command, condensed -->
### BUILD MODE
...
### DESIGN MODE
...

## Skills
<!-- Key skills summarised -->
### /git
...

## Output Contracts
<!-- Where each mode writes — critical for Codex to know -->

## Configuration
<!-- How to read pai-orbit-config.md -->
```

**Slash commands → CLI wrappers:** A generated `pai` shell script wraps common commands:
```bash
pai build        # codex exec with BUILD MODE context
pai design       # codex exec with DESIGN MODE context
pai review       # codex exec with REVIEW skill context
```

**Hooks:** Codex is terminal-centric — hooks work as wrapper scripts:
- Pre-execution: detect changed files, load relevant skills
- Post-execution: run tests, run security scan, summarise diff

---

## Generator

A new skill `generate-adapters` (also called by `/setup`) that:

1. Reads all `commands/*.md` and `skills/*/SKILL.md`
2. Parses the canonical front-matter YAML
3. For Cursor: writes `.cursor/rules/pai-orbit-<name>.mdc` per file + `.vscode/tasks.json` hook templates
4. For Codex: writes/updates `AGENTS.md` from all commands + key skills + generates `pai` CLI wrapper script

**Implementation:** Shell script (`scripts/generate-adapters.sh`) callable standalone or from within Claude Code. No external runtime dependencies — pure shell + standard POSIX tools. The generator is itself usable from any tool.

---

## Phasing

| Phase | Scope | Output |
|---|---|---|
| **1 — Canonical spec** | Add YAML front-matter to all existing `commands/*.md` and `skills/*/SKILL.md` | Updated source files |
| **2 — Cursor adapter** | Generator script → `.cursor/rules/*.mdc` + `.vscode/tasks.json` | Cursor-compatible rules |
| **3 — Codex adapter** | Generator script → `AGENTS.md` + `pai` CLI wrapper | Codex-compatible output |
| **4 — `/setup` integration** | `/setup` asks which tools are in use, calls generator for selected targets | Updated setup skill |

Phases 1–3 are independent of each other once the front-matter schema is agreed. Phase 4 depends on all three.

---

## Key Decisions Required

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Front-matter format | YAML (structured, parseable) vs extended markdown headers | YAML — enables automated generation without regex hacks |
| D2 | Generator implementation | Shell script vs Node.js vs Python script | Shell script — zero deps, runs in any environment including Codex CLI itself |
| D3 | Cursor hooks | `.vscode/tasks.json` template vs rule-only model instructions | Both — model instructions for blocking behaviour, VS Code tasks for lint |
| D4 | `AGENTS.md` scope | Repo root only vs service-level for monorepos | Repo root for Phase 3; service-level added in Phase 4 when `/setup` handles it |
| D5 | `pai` CLI wrapper | Bash script vs npm package | Bash script for now — no install friction |
| D6 | Claude adapter strategy | Option A (Claude = native format, no generation) now → Option B (generator produces all tool outputs including Claude) later | **Start with Option A.** Claude reads `commands/*.md` and `skills/*/SKILL.md` directly via `.claude-plugin/`. Generator only produces Cursor and Codex artefacts. Migrate to Option B in a future phase when adding a 4th tool (Gemini, Windsurf, etc.) makes the symmetry worth the cost. **Addendum 2026-07-25:** Copilot was added as the 4th tool. Option A was kept — the generator approach scaled cleanly by adding `adapters/copilot/build.sh` alongside the existing Cursor and Codex adapters. No Claude-adapter migration needed. Full context in `docs/decisions/2026-07-25-copilot-adapter-decisions.md` (D6 entry). |

---

## Open Questions

- [ ] Should Phase 1 front-matter migration be done in one PR (all commands + skills at once) or incrementally? — owner: Punit Singhal
- [ ] The `pai` CLI wrapper needs to know which Codex CLI binary is installed. How does it detect or configure this? — owner: Punit Singhal
- [ ] For Cursor `auto_attached` rules — which skills should auto-attach to which file patterns? (e.g., `/data-model` auto-attaches to `*.sql`, `migrations/**`) — owner: Punit Singhal

---

## What This Is Not

This design does not include:
- A Python/TypeScript orchestration runtime (LangGraph, etc.) — that is a future Phase 4+ investment
- Vector DB or semantic skill retrieval — future
- OpenTelemetry / agent traces — future
- Enterprise integrations (Azure DevOps, SonarQube) — future

The current scope is: **generate the right files so pai-orbit's mode discipline works in Claude Code, Cursor, and Codex CLI from a single source of truth.**
