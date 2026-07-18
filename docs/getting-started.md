# Getting Started

## Prerequisites

- Claude Code installed and authenticated
- A software project with at least one service (the project doesn't need to be new)
- Git initialised in your project directory

## Install pai-orbit

### Claude Code (recommended)

pai-orbit ships as a Claude Code marketplace hosted on GitHub. Install in two commands — no clone required:

```bash
/plugin marketplace add the-psi/pai-orbit
/plugin install pai-orbit@the-psi
/reload-plugins
```

That's the full install. Claude Code fetches the repo, reads `.claude-plugin/marketplace.json`, and resolves the plugin from the committed build at `plugins/pai-orbit/dist/claude-code/`.

### Developing against a local checkout

If you're hacking on pai-orbit itself, clone and add the local path as a marketplace:

```bash
git clone https://github.com/the-psi/pai-orbit
/plugin marketplace add /absolute/path/to/pai-orbit
/plugin install pai-orbit@the-psi
```

After editing anything under `plugins/pai-orbit/core/`, rebuild with:

```bash
bash plugins/pai-orbit/build.sh
/reload-plugins
```

### Cursor (plugin)

Full Cursor plugin at `plugins/pai-orbit/dist/cursor-plugin/pai-orbit/` — install from the **repo root** via `.cursor-plugin/marketplace.json`, symlink to `~/.cursor/plugins/local/pai-orbit`, or use Team Marketplace. See [`docs/cursor-plugin-install-and-usage.md`](cursor-plugin-install-and-usage.md).

Legacy copy-rules install (lossy): `plugins/pai-orbit/dist/cursor/` — use only if you cannot install the plugin.

### OpenAI Codex CLI (full parity)

pai-orbit ships as a full Codex CLI install — skills, hooks, subagents, MCP, and always-on rules all land natively. Requires Codex CLI v0.144.6 or later.

**macOS / Linux / WSL / Git Bash:**

```bash
curl -fsSL https://raw.githubusercontent.com/the-psi/pai-orbit/main/plugins/pai-orbit/dist/codex/install.sh | bash
```

**Windows (native PowerShell):**

```powershell
irm https://raw.githubusercontent.com/the-psi/pai-orbit/main/plugins/pai-orbit/dist/codex/install.ps1 | iex
```

Pin a specific release with `PAI_ORBIT_REF=v1.4.0` (bash) or `$env:PAI_ORBIT_REF='v1.4.0'` (PowerShell) before running.

After install, launch `codex` in the project, trust the project when prompted, then:

1. Run `/hooks` and trust the four hook registrations.
2. Run `$setup` to fill in `.codex/pai-orbit-config.md`, `.codex/team.md`, and the lint hooks' repo paths.
3. Run `/skills` — you should see all 20 skills (6 operational + 14 modes).

Two modes are renamed to avoid ergonomic overlap with Codex's built-in slash commands: **`plan` → `orbit-plan`** (`/plan` is Codex's built-in planner) and **`review` → `orbit-review`** (`/review` is Codex's built-in code review). Invoke them as `$orbit-plan` and `$orbit-review`.

See [`docs/codex-install-and-usage.md`](codex-install-and-usage.md) for the full walkthrough and honest parity notes vs Claude Code.

### Other coding assistants (lossy)

GitHub Copilot is reference instructions only:

- GitHub Copilot: `plugins/pai-orbit/dist/copilot/`

---

## First run: `/setup`

Open Claude Code in your project directory and type `/setup`.

Setup will:

1. **Discover** what's already there — languages, frameworks, services, git remotes, existing config files. It reads before asking.

2. **Ask a short set of questions** (only what it couldn't infer):
   - Repo structure (monorepo vs multi-repo, service names)
   - Task management (GitHub Issues / Linear / Jira — provide board URL(s))
   - Branching model (GitHub Flow / GitFlow / trunk-based)
   - Deployment target (cloud provider and services)
   - Docs home (in-repo `docs/` / dedicated repo / Confluence / Notion)
   - Team (names, roles, handles)

3. **Generate** the following files:

   | File | What it is |
   |------|------------|
   | `.claude/pai-orbit-config.md` | Board config, git model, deploy targets, docs home |
   | `.claude/team.md` | Team roster used for assignments and handoffs |
   | `CLAUDE.md` | Project spec stub — some sections need filling by hand |
   | `.claude/agents/<service>-builder.md` | One agent per detected service |
   | `.claude/hooks/bash-guard.sh` | Bash safety guard |
   | `.claude/hooks/lint-python.sh` | Python lint hook (if Python detected) |
   | `.claude/hooks/lint-ts.sh` | TypeScript lint hook (if TS detected) |
   | `.claude/settings.json` | Hook wiring |
   | `docs/` scaffold | Directory structure with starter files |

4. **Report** what was created and what still needs your attention (marked ⚠️).

### After setup: fill in CLAUDE.md

Setup generates a stub with `<!-- TODO: fill in by hand -->` markers. The sections that always need human input:

- **Architecture** — the Mermaid diagram and key architectural decisions
- **Key files and patterns** — what an engineer needs to know about navigating the codebase
- **Data model** — primary data stores, key tables, gotchas
- **Authentication** — how auth works, how to test locally

A good CLAUDE.md takes 30–60 minutes to write well. It pays back over hundreds of sessions.

---

## If your docs home is Confluence or Notion

Setup will configure outbound sync but cannot install the MCP server for you. Do this after setup:

**Confluence:**
```bash
/plugin install confluence@claude-plugins-official
```
Then add your Confluence credentials to `.claude/settings.local.json` (not committed).

**Notion:**
```bash
/plugin install notion@claude-plugins-official
```
Then add your Notion integration token to `.claude/settings.local.json`.

The `docs-writer` agent will use MCP tools for remote writes and keep a local markdown copy as source of truth. Edits on the remote platform are not pulled back — see [Process & Practices](process-and-practices.md) for why.

---

## First session

After setup and filling in CLAUDE.md, try a real session:

```
/build
```

Claude will read CLAUDE.md, check the task board, and ask what you want to work on. If the task board is empty, switch to `/plan` to prioritise, or `/groom` to define a feature.

---

## Growing your harness

After a few weeks of work, run:

```
/suggest-skills
```

It analyses your git log and session captures to identify recurring multi-step procedures worth encoding as skills. Common first suggestions: data backfill, seed data insertion, deployment verification, structured entity review.

---

## Updating the harness

Re-run `/setup` anytime:
- A new service is added to the project
- The team changes (new member, role change)
- You switch task management tools
- The branching model changes

Setup is idempotent — it reads existing config and updates only what changed. It will not overwrite CLAUDE.md sections you've written by hand.

---

## Troubleshooting

**Modes don't appear after install:**
Run `/reload-plugins`. If still missing, check `/plugin` → Errors tab.

**`/agile-board` doesn't know my board:**
Run `/setup` and answer the task management question. Or edit `.claude/pai-orbit-config.md → ## Agile Board` directly.

**Lint hooks aren't running:**
Check `.claude/settings.json` has the hooks wired. Check hook scripts are executable: `chmod +x .claude/hooks/*.sh`.

**Agent uses wrong stack assumptions:**
Edit `.claude/agents/<service>-builder.md` directly — these are generated stubs meant to be tuned as the project evolves.
