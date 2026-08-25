# OpenAI Codex CLI — Install and Usage

pai-orbit ships a full-parity build for OpenAI Codex CLI: skills, hooks, subagents, MCP, and always-on rules all land natively. This guide covers install, verification, day-to-day usage, and the parity gaps you should know about.

**Requires:** Codex CLI v0.144.6 or later. Older versions are untested — several primitives this adapter uses (multi-agent collaboration tools, `commandWindows` hook overrides, `agents/openai.yaml` policy respect) were confirmed against v0.144.6 during Phase 0.

---

## Install

### Recommended: single command, cross-platform

Run from the root of the project you want to install into:

```bash
npx github:the-psi/pai-orbit init codex
```

That's it. Works on macOS, Linux, WSL, and native Windows PowerShell. **Requires Node.js 18+** on your machine — npx fetches the repo, then a small Node CLI copies files into your project. No `curl`, no shell script, no platform-specific binary.

### Pin a specific release

Append a git ref (branch, tag, or SHA) with `#`:

```bash
npx github:the-psi/pai-orbit#v1.4.0 init codex
```

```bash
# Install from a pre-merge branch:
npx github:the-psi/pai-orbit#feat/codex-adapter init codex
```

### Re-install / upgrade

The `init` subcommand refuses to overwrite ANY existing top-level entry (`AGENTS.md`, `.agents/`, `.codex/`, `README.md`, or any other dist entry that already exists in your project). This protects hand-written project files and other tools that may already own paths like `.agents/`. Use `update` to overwrite:

```bash
npx github:the-psi/pai-orbit update codex
```

`update` is idempotent — safe to run after every pai-orbit upgrade.

### Local development install

If you're hacking on pai-orbit itself, run the CLI directly from a checkout:

```bash
git clone https://github.com/the-psi/pai-orbit
cd your-project
node /path/to/pai-orbit/plugins/pai-orbit/adapters/codex/install.js init codex
```

Rebuild the dist after editing anything under `plugins/pai-orbit/core/`:

```bash
bash /path/to/pai-orbit/plugins/pai-orbit/build.sh
```

### Manual install (no npx)

If your team policy forbids running `npx` against a `github:` URL:

```bash
git clone https://github.com/the-psi/pai-orbit
cp -R pai-orbit/plugins/pai-orbit/dist/codex/. your-project/
chmod +x your-project/.codex/hooks/*.sh
```

That places the same files the CLI would.

---

## What lands in your project

```
project-root/
├── AGENTS.md                             # Codex reads at project root — slim rule book with absorbed hook intents
├── .agents/                              # Codex-native skills location (repo-scoped)
│   └── skills/
│       ├── analysis/       SKILL.md      # 6 operational skills — implicit invocation allowed
│       ├── board/          SKILL.md      # (no agents/openai.yaml — Codex default is implicit on)
│       ├── data-model/     SKILL.md
│       ├── epic/           SKILL.md
│       ├── git/            SKILL.md
│       ├── simplify/       SKILL.md
│       │
│       ├── arch/           SKILL.md + agents/openai.yaml   # 14 mode skills — explicit only
│       ├── build/          SKILL.md + agents/openai.yaml   # (allow_implicit_invocation: false)
│       ├── data/           SKILL.md + agents/openai.yaml
│       ├── design/         SKILL.md + agents/openai.yaml
│       ├── domain/         SKILL.md + agents/openai.yaml
│       ├── groom/          SKILL.md + agents/openai.yaml
│       ├── incident/       SKILL.md + agents/openai.yaml
│       ├── orbit-plan/     SKILL.md + agents/openai.yaml   # renamed from `plan` (Codex has a built-in /plan)
│       ├── orbit-review/   SKILL.md + agents/openai.yaml   # renamed from `review` (Codex has a built-in /review)
│       ├── release/        SKILL.md + agents/openai.yaml
│       ├── setup/          SKILL.md + agents/openai.yaml
│       ├── suggest-skills/ SKILL.md + agents/openai.yaml
│       ├── test/           SKILL.md + agents/openai.yaml
│       └── ux/             SKILL.md + agents/openai.yaml
│
└── .codex/
    ├── AGENTS.override.md              # (optional) local-dev overrides for AGENTS.md — add to .gitignore
    ├── config.toml                     # approvals, sandbox, multi-agent bounds, [mcp_servers] commented
    ├── pai-orbit-config.md             # template — $setup fills it in
    ├── team.md                         # template — $setup fills it in
    ├── hooks.json                      # 4 registrations, official nested schema, with commandWindows
    ├── hooks/
    │   ├── _extract-touched-paths.py   # shared path-extraction helper (used by all 3 wrappers)
    │   ├── bash-guard.sh               # direct Claude Code port (PreToolUse)
    │   ├── bash-guard.ps1              # native Windows PowerShell equivalent
    │   ├── arch-drift-guard.sh         # core (called by wrapper)
    │   ├── arch-drift-wrapper.sh       # PostToolUse wrapper (stdin bridge)
    │   ├── arch-drift-wrapper.ps1      # Windows entry
    │   ├── lint-python.sh              # core (called by wrapper)
    │   ├── lint-python-wrapper.sh      # PostToolUse wrapper
    │   ├── lint-python-wrapper.ps1     # Windows entry
    │   ├── lint-ts.sh                  # core (called by wrapper)
    │   ├── lint-ts-wrapper.sh          # PostToolUse wrapper
    │   └── lint-ts-wrapper.ps1         # Windows entry
    ├── agents/                         # subagents (Codex-native TOML)
    │   ├── docs-writer.toml
    │   └── cross-repo-impact.toml
    └── templates/                      # scaffolding templates ($setup consumes)
        ├── AGENTS.md.template
        ├── agents/
        ├── docs/
        ├── rules/
        └── skills/
```

---

## First-run steps

Once the installer finishes (or you've copied the dist manually):

### 1. Launch Codex and trust the project

```bash
codex
```

If Codex prompts you to trust the project, accept. `.codex/hooks.json` only loads when the project is trusted. If you don't trust the project, you can still keep hooks in `~/.codex/hooks.json` (user-scope) — they load additively when both layers are trusted, not one-or-the-other.

### 2. Trust the hooks

In the Codex TUI, type:

```
/hooks
```

Four registrations should appear:

- `PreToolUse ^Bash$` → `.codex/hooks/bash-guard.sh` (blocks force-push, bulk staging, hook bypass, destructive rm)
- `PostToolUse ^(apply_patch|Edit|Write)$` → `arch-drift-wrapper.sh` (advisory on structural file edits)
- `PostToolUse ^(apply_patch|Edit|Write)$` → `lint-python-wrapper.sh` (runs `ruff check` on touched `.py`)
- `PostToolUse ^(apply_patch|Edit|Write)$` → `lint-ts-wrapper.sh` (runs `eslint` on touched `.ts`/`.tsx`/`.js`/`.jsx`)

Trust each. **Codex records trust against the current hook-script hash**, so any script edit invalidates trust — you'll need to re-run `/hooks` after every upgrade or manual script change.

### 3. Run `$setup`

```
$setup
```

The setup skill will:

- Ask about your repo structure, task management, branching model, deploy target, docs home, and team.
- Fill `.codex/pai-orbit-config.md` and `.codex/team.md` from the templates.
- Fill the `--- CONFIGURE: add your repo paths here ---` block in `.codex/hooks/lint-python.sh` and `.codex/hooks/lint-ts.sh` with your project's actual repo paths. **Without this, the lint hooks exit early and never run** — this is the single most-important setup step.
- Scaffold `docs/` if it doesn't exist.

### 4. Verify

```
/skills
```

You should see all 20 skills. Six operational (`analysis`, `board`, `data-model`, `epic`, `git`, `simplify`) plus 14 mode skills. The two renamed modes (`orbit-plan`, `orbit-review`) are in the list; `plan` and `review` are NOT (those would invoke Codex's built-ins).

---

## Day-to-day usage

### Invoking skills

**Operational skills** — invoke two ways:

- **Explicitly:** type `$skill-name` in the composer. E.g., `$git` to run through a commit flow; `$analysis` to run a change-impact assessment.
- **Implicitly:** Codex fires the skill when your natural-language prompt matches its description. E.g., "commit these changes" triggers `$git`; "what would break if I remove this endpoint?" triggers `$analysis`.

**Mode skills** — explicit only. Type `$mode-name`:

| Mode | Type | Purpose |
|------|------|---------|
| `$arch` | Explicit | Declare/maintain system architecture |
| `$build` | Explicit | Implement features and fixes |
| `$data` | Explicit | Explore data before coding |
| `$design` | Explicit | Architect a technical solution |
| `$domain` | Explicit | Capture domain/expert knowledge |
| `$groom` | Explicit | Formalize acceptance criteria |
| `$incident` | Explicit | Investigate a production incident |
| `$orbit-plan` | Explicit | Prioritize and sequence work (renamed from `plan`) |
| `$orbit-review` | Explicit | Review code, PRs, design (renamed from `review`) |
| `$release` | Explicit | Coordinate a release |
| `$setup` | Explicit | First-run scaffolding |
| `$suggest-skills` | Explicit | Recommend a skill for your problem |
| `$test` | Explicit | Write test plans / QA scaffolding |
| `$ux` | Explicit | Define user flows and interface behaviour |

Mode skills ship with `agents/openai.yaml` `allow_implicit_invocation: false`, so Codex will not fire them on description match. Modes are deliberate context switches — you type `$mode-name` when you want that headspace.

### Multi-agent primitives

Codex enables five collaboration tools by default via `features.multi_agent` (stable): `spawn_agent`, `send_input`, `resume_agent`, `wait_agent`, `close_agent`. The primary agent uses these to orchestrate subagents. Type `/agent` in the TUI to switch active agent threads.

pai-orbit ships two subagents:

- **`docs-writer`** — writes documentation in the project's `docs/` directory. Reads `.codex/pai-orbit-config.md → ## Docs` for the docs home configuration.
- **`cross-repo-impact`** — read-only analysis across multiple repos. Given an interface change, searches all configured repos for usages and classifies each as breaking, compatible, or unknown.

Ask Codex naturally: "Have the docs-writer subagent update the release notes." No special tool call needed.

### AGENTS.override.md

Codex reads `AGENTS.override.md` in preference to `AGENTS.md` in the same directory when both exist. Useful for local-dev overrides without editing the tracked `AGENTS.md` (e.g., an extra rule for your machine, a temporary constraint). Add `AGENTS.override.md` to `.gitignore` if you use it.

---

## Parity vs Claude Code

| Feature | Claude Code | Codex |
|---------|-------------|-------|
| Modes | `/build`, `/design`, ... as slash commands | `$build`, `$design`, ... as explicit skill invocations |
| Operational skills implicit fire | Yes | Yes (via `description` match) |
| Mode skills implicit fire | No | No (`agents/openai.yaml` policy — verified respected on v0.144.6) |
| Hooks | Auto-active on plugin install | Manual `/hooks` trust required; re-trust after every script edit |
| PreToolUse Bash guard | Yes | Yes (direct port; native PowerShell variant included) |
| PostToolUse lint / arch-drift | Yes | Yes (via wrappers that bridge Codex's `apply_patch` payload to the core Claude-shape scripts) |
| Subagents | Yes (Markdown+frontmatter with `tools:`) | Yes (TOML with 3 required + 6 optional fields; `tools:` dropped, tool inheritance from parent) |
| Multi-agent primitives as tools | Task tool (ephemeral) | `spawn_agent`, `send_input`, `resume_agent`, `wait_agent`, `close_agent` (via `features.multi_agent`) |
| Parallel execution | Task tool concurrency | Parallel supported; worktree isolation not officially documented on v0.144.6 |
| MCP servers | Yes | Yes (`[mcp_servers.<name>]` in `.codex/config.toml`) |
| `AGENTS.md` / `CLAUDE.md` | `CLAUDE.md` at project root | `AGENTS.md` at project root (with `AGENTS.override.md` precedence) |
| Slash command mode invocation | `/build`, `/design`, etc. | Removed at Codex 0.117.0 (`~/.codex/prompts/*.md` flat form). A namespaced `/prompts:<name>` form remains but pai-orbit does not use it. |

### What's still lost vs Claude Code (honest list)

1. **Slash-command mode invocation.** Modes are `$mode-name` skills only; there's no `/build`, `/design`, etc. Ergonomic regression from Claude Code (`/build` → `$build`); operational skills recover it via implicit invocation for the 6 operational cases.
2. **Hook auto-load.** Codex requires manual `/hooks` trust on first install and after every script edit. Skipped step = hooks silently disabled.
3. **Per-subagent tool restriction.** Claude Code agents can declare `tools: Read, Grep`. Codex subagents inherit tools from the parent by default; finer scoping via `mcp_servers` / `skills.config` overrides but coarser.
4. **Wrapper coupling.** `lint-python.sh`, `lint-ts.sh`, `arch-drift-guard.sh` cannot run directly on Codex — they run through wrapper scripts that parse touched paths from the `apply_patch` `tool_response` plaintext block or the patch body headers.
5. **Claude Code's interactive `/setup`.** Codex has no equivalent scaffolding UI. `$setup` still works but users hand-edit some steps.
6. **Some hook events.** Claude Code exposes hook events that Codex doesn't currently support (e.g., `Notification` at specific tool phases). None of pai-orbit's four hooks use them, so this is theoretical.

Everything else — skills, hooks (with wrappers), subagents, MCP, always-on rules — lands with real fidelity.

---

## Troubleshooting

**`/skills` doesn't list any pai-orbit skills.**
Check that `.agents/skills/` exists at your project root — this is Codex's skills path (Claude Code's skills path does not apply here). Codex looks at `.agents/skills/` first. Rerun the installer if the directory is missing.

**Skills appear in `/skills` but `$build` (or any `$mode-name`) doesn't do anything.**
The mode skill loaded but its body may be corrupted. Open `.agents/skills/build/SKILL.md` and confirm it has a `name:` and `description:` YAML frontmatter block, followed by the mode body. Reinstall if the file is empty or truncated.

**Hooks don't fire even after trusting them.**
Two common causes:

- The **project is not trusted** in Codex — `.codex/hooks.json` won't load. Trust the project when prompted, or set the trust manually via the CLI.
- A **script was edited after being trusted** — Codex records trust against the hash. Re-run `/hooks` and re-trust each entry.

**`lint-python.sh` fires but `ruff` never runs.**
The `repo=` block inside `.codex/hooks/lint-python.sh` is not filled in. Run `$setup` (or hand-edit the `--- CONFIGURE ---` block) to add your project's repo paths. Same applies to `.codex/hooks/lint-ts.sh` for TypeScript.

**Codex on native Windows: the advisory hooks silently no-op.**
The `.ps1` wrappers shell out to `bash` for the core scripts. If Git Bash / WSL isn't on `PATH`, the wrappers exit cleanly without running lint or arch-drift. `bash-guard.ps1` is a self-contained PowerShell port and works without Bash. Install Git Bash for full parity: `winget install --id Git.Git`.

**`codex exec --sandbox workspace-write` errors: `codex-windows-sandbox-setup.exe not found`.**
Windows-only edge case: the sandbox helper isn't discoverable from certain working directories. Workarounds: run `codex exec` with `--dangerously-bypass-approvals-and-sandbox` for automation contexts, or invoke Codex from a directory inside its install root.

**The installer aborts with `ERROR: refusing to overwrite existing project files.`**
`init codex` refuses to overwrite if ANY top-level dist entry already exists in your project (`AGENTS.md`, `.agents/`, `.codex/`, `README.md`, etc.). The installer prints the full list of conflicting entries. Two ways to proceed:

- **You already have pai-orbit installed** — run `npx github:the-psi/pai-orbit update codex` to overwrite.
- **A different tool owns one of the conflicts** (e.g. a hand-written `AGENTS.md`, or another tool using `.agents/`) — back up or rename the conflicting entries first, then re-run `init codex`.

This safety guard was added after a review flagged that early versions only checked `.agents/skills/` — meaning a hand-written `AGENTS.md` could be silently clobbered on first install. Every top-level entry is now checked individually.

**I typed `/plan` in Codex and got an unexpected planner.**
That's Codex's **built-in `/plan`** command. pai-orbit's plan mode is `$orbit-plan` on Codex (renamed to avoid this exact collision). Same for `/review` (Codex built-in) vs `$orbit-review` (pai-orbit).

**Skills-list description looks cut off in `/skills`.**
Codex's initial skills-list budget is ~2% of the context window (~8k chars). If the total exceeds that, Codex auto-shortens descriptions. pai-orbit's adapter build enforces a total budget of 8000 chars across all 20 skills (currently ~4988), so you should not see truncation. If you do, check whether you added custom skills without re-running the total-budget check.

---

## Uninstall

Remove everything pai-orbit installed:

**macOS / Linux / WSL:**

```bash
rm -rf AGENTS.md .agents .codex/config.toml .codex/hooks.json .codex/hooks .codex/agents .codex/pai-orbit-config.md .codex/team.md .codex/templates
```

**Windows (PowerShell):**

```powershell
Remove-Item -Recurse -Force AGENTS.md, .agents, .codex\config.toml, .codex\hooks.json, .codex\hooks, .codex\agents, .codex\pai-orbit-config.md, .codex\team.md, .codex\templates
```

Leave `~/.codex/` alone unless you also want to clear user-scope Codex config.

---

## Version compatibility

- **Pinned baseline:** Codex CLI v0.144.6
- **Minimum tested:** v0.144.6
- **Untested / older:** anything below 0.144.6 — several primitives this adapter uses were validated on that pin. Older versions may work partially, but multi-agent primitives, `commandWindows`, and `agents/openai.yaml` respect are all version-dependent.
- **Newer versions:** should work if the primitives above stay stable. When a new Codex release lands, re-run the full checklist under [First-run steps](#first-run-steps) plus the interactive validation described in the adapter's Test plan.
