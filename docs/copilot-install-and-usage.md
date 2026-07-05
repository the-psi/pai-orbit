# GitHub Copilot Install and Usage

This guide explains how to install pai-orbit in a project that uses **GitHub Copilot Chat in VS Code**, how to use it day-to-day, and how to verify it is working.

Companion docs: [Cursor install and usage](cursor-plugin-install-and-usage.md) | [Getting started](getting-started.md) | [Capabilities reference](capabilities.md)

---

## Prerequisites

- **VS Code** (any current version with Copilot Chat support).
- **GitHub Copilot Chat extension** installed and signed in.
  - Copilot **Free** is sufficient for evaluation. Mode prompts, skill prompts, instructions files, and the always-loaded rule book all work on Free.
  - Copilot **Pro / Business** unlocks the agentic side of the seven service-builder prompts (`/fastapi-builder`, `/nextjs-builder`, etc. — `mode: agent` per D30). On Free those prompts still load as regular text and give correct manual scaffolding guidance.
  - PSI client code requires **Copilot Business** (or stricter) per company policy. Copilot Free is for personal evaluation only.
- **Node.js ≥ 18** on the machine of the dev running the install (required by the `npx` install path). Most current PSI dev machines satisfy this without action.
- **git on PATH** — `npx` clones the install bundle from GitHub.
- **Network access to `github.com`** — npx clones from GitHub. PSI firewalled environments may need allowlisting.

---

## Install (team lead, first time)

pai-orbit's Copilot install has **two flows** — pick based on your Copilot licence tier.

### Copilot Pro / Business (recommended)

```bash
# 1. Install pai-orbit files (no interview)
npx github:the-psi/pai-orbit init copilot

# 2. Reload VS Code (Ctrl+Shift+P → Developer: Reload Window)

# 3. In Copilot Chat:
#    /setup
```

The CLI drops pai-orbit files into the project (`.github/copilot-instructions.md`, `.github/prompts/`, `.github/instructions/`, `.husky/pre-commit.template`, `.pre-commit-config.yaml.template`) — no questions asked. Auto-activates `.husky/pre-commit` if the project has `.git/`.

Then `/setup` in Copilot Chat runs the **11-question interview agentically** — Copilot Business reads project files, asks questions, runs shell commands (`glab api`, `gh project field-list`) for live board column discovery, and proposes file edits (`.copilot/pai-orbit-config.md`, `.copilot/team.md`, `AGENTS.md`, `docs/architecture/*.md`) which you accept.

### Copilot Free

```bash
# Install files AND run the interview from the terminal in one command
npx github:the-psi/pai-orbit init copilot --setup
```

`--setup` triggers the full 11-question interview + rendering. Nothing to hand-edit afterwards. Free tier's `/setup` in Chat only renders advisory text (not file-edit proposals), so running the CLI with `--setup` is the fastest path to a fully-configured project.

For the fastest install with placeholder configs (edit later by hand):

```bash
npx github:the-psi/pai-orbit init copilot --setup --yes
```

### After either flow

1. Reload VS Code (`Ctrl+Shift+P` → "Developer: Reload Window") so Copilot Chat picks up the new prompts.
2. Open Copilot Chat. Type `/` — you should see 29 pai-orbit entries with `[mode]`, `[skill]`, or `[agent]` prefixes.
3. Commit the new files. Suggested message: `feat(copilot): install pai-orbit Copilot adapter`.

### Version pinning (recommended for client projects)

Track a release tag instead of `main` so updates are deliberate, not surprise. Substitute `<tag>` with the tag your team has decided to pin — pai-orbit maintains release tags in the format `vMAJOR.MINOR.PATCH` (see the [Releases page](https://github.com/the-psi/pai-orbit/releases)):

```bash
npx github:the-psi/pai-orbit#<tag> init copilot
```

For full reproducibility, pin a specific commit:

```bash
npx github:the-psi/pai-orbit#a1b2c3d init copilot
```

Your team's wiki should record the version the team is tracking; updates become an explicit `git tag bump → re-run` motion rather than a silent drift.

### Non-interactive / CI

```bash
npx github:the-psi/pai-orbit init copilot --setup --yes --board=gitlab --branch=github-flow
```

Available flags:

| Flag | Purpose |
|------|---------|
| `--setup` | **Run the 11-question interview** after files install. Without this flag the CLI installs files only (recommended for Copilot Business/Pro — configure via `/setup` in Chat afterwards). Required for Copilot Free users who don't want to hand-edit config files. |
| `--yes` / `--no-interactive` | Auto-answer interview questions with defaults. **Only meaningful with `--setup`** (no-op without it). Use for CI or fastest install. |
| `--board=<value>` | `gitlab` / `github` / `linear` / `jira` / `none` — implies `--setup` |
| `--branch=<value>` | `github-flow` / `gitflow` / `trunk` — implies `--setup` |
| `--re-init-agents-md` | Force rewrite of `AGENTS.md` — implies `--setup`. Alias: `--re-init-claude-md` (kept for backward compat). |
| `--install-husky` | Install the `.husky/pre-commit` hook even if previously opted out |
| `--reinstall-husky` | Overwrite an existing `.husky/pre-commit` |
| `--install-precommit-framework` | Install `.pre-commit-config.yaml` even if previously opted out (D29) |
| `--reinstall-precommit-framework` | Overwrite an existing `.pre-commit-config.yaml` |
| `--ignore-existing` | Forces npx to re-fetch from GitHub (bypasses the npx cache) |

**Re-run behaviour:** `pai-orbit update copilot` (no `--setup`) refreshes pai-orbit-owned files and preserves your `.copilot/*` + `AGENTS.md`. `pai-orbit update copilot --setup` refreshes files **and** re-runs the interview, overwriting `.copilot/pai-orbit-config.md` and `.copilot/team.md` with new answers.

### Alternative: use `/setup` inside Claude Code or Cursor

If your team already uses Claude Code or Cursor, run `/setup` inside the host tool and select `copilot` (or `multiple`) as a target. The same templates and same `dist/copilot/` output land in the project. The `npx` CLI exists for **Copilot-only teams** that have neither tool installed.

### `/setup` inside Copilot Chat — for re-configuration after first install

**Copilot Business:** once pai-orbit is installed via the npx CLI, `/setup` appears in Copilot Chat's slash-command picker as a **`[mode]`** entry with `mode: agent` frontmatter. Invoking it runs the same 11-question interview inside Chat — Copilot reads project files, asks questions, runs shell commands via `runCommands` (e.g. `glab api` for live board column discovery), and proposes file edits you accept. Useful when you need to re-configure the board, team, deploy targets, etc. without switching to a terminal.

**Copilot Free:** `/setup` still appears in the picker but degrades to advisory text — Copilot describes the steps and points you at the terminal command `npx github:the-psi/pai-orbit init copilot` (or `update copilot`) which does the same job with atomic writes and reliable API queries.

**Why both entry points?** First-time install has to happen from a terminal (the `.prompt.md` files that make `/setup` invokable don't exist yet). Once they do, either entry point works — pick whichever fits the moment.

---

## Joining a team that already has pai-orbit installed (every other dev)

When pai-orbit's files are already committed to the repo (`.github/copilot-instructions.md`, `.github/prompts/`, `.github/instructions/`, `.copilot/`, `AGENTS.md`), new team members **do NOT run the npx command**. They:

1. `git pull` to get the latest files.
2. Open the project in VS Code.
3. Reload the window (`Ctrl+Shift+P` → "Developer: Reload Window").
4. Smoke-test: open Copilot Chat, type `/groom`, confirm the slash picker shows pai-orbit's prompts.

Re-running the npx install is unnecessary and would only matter if the team lead changes the pai-orbit version pin and wants every dev to refresh — in which case **all** devs run `npx github:the-psi/pai-orbit#<new-tag> init copilot` once. The `.copilot/` config is preserved on re-run, so this is safe.

---

## Path conventions

| Path | Owned by | Purpose |
|------|----------|---------|
| `.copilot/` | pai-orbit | Team metadata (`pai-orbit-config.md`, `team.md`, `settings.json`). Read by the prompts via the Context-discovery directives. |
| `.github/copilot-instructions.md` | pai-orbit | Always-loaded rule book + Context-discovery + prompt-library pointer. Refreshed on every re-run. |
| `.github/prompts/*.prompt.md` | pai-orbit | 25 invokable slash commands (12 modes + 6 skills + 7 service-builder agents). Refreshed on every re-run. |
| `.github/instructions/*.instructions.md` | pai-orbit | 4 auto-attaching guidance files. Refreshed on every re-run. |
| `.husky/` and `.pre-commit-config.yaml(.template)` | pai-orbit (templates) / user (active files) | Inert templates are owned by pai-orbit and refreshed on re-run. The active `.husky/pre-commit` or `.pre-commit-config.yaml` is **preserved** once installed. |
| `AGENTS.md` | user (after first scaffold) | Project documentation for Copilot: stack, services, key files, data model, auth. **Same content shape** as Claude Code's `CLAUDE.md` — only the filename differs to match each tool's convention. (D37 supersedes D26 for the Copilot target.) |
| `docs/` | user | Methodology output (requirements, design, ADRs, plans). Never overwritten on re-run. |

**Note on `.github/`:** Copilot reads from `.github/copilot-instructions.md`, `.github/prompts/`, and `.github/instructions/` regardless of where the repo is hosted. `.github/` is a Copilot product path — it works on GitHub, GitLab, Bitbucket, Azure DevOps, and self-hosted git equally.

**Note on `AGENTS.md`:** The file's content describes the project itself (stack, services, key files, data model, auth) — none of which is Copilot-specific. Copilot's `.github/copilot-instructions.md` references it under `## Context discovery`, with a fall-back to `CLAUDE.md` for legacy installs. Claude Code and Cursor adapters continue to emit `CLAUDE.md` — the content shape is identical across tools; only the root filename differs.

---

## AGENTS.md, CLAUDE.md, and multi-tool projects

The Copilot adapter emits `AGENTS.md` at repo root. The Claude Code and Cursor adapters emit `CLAUDE.md` at repo root. The Codex adapter also uses `AGENTS.md` (its native convention).

- **Single-tool project (Copilot only):** `AGENTS.md` is your project-context file. `CLAUDE.md` is not created.
- **Multi-tool project (Claude + Copilot in the same repo):** Both files exist side-by-side, holding the same content. Keep them in sync by hand, or maintain one and add a one-line import (e.g., `@AGENTS.md` inside `CLAUDE.md`) so Claude Code auto-attaches the AGENTS content.
- **Migrating from a Copilot-only install that pre-dates D37:** Existing `CLAUDE.md` is left in place. Re-running the installer creates `AGENTS.md` alongside — you can hand-migrate the content or leave both.

Copilot Chat in VS Code reads its usual four surfaces:

- `.github/copilot-instructions.md` (always-loaded baseline)
- `.github/prompts/*.prompt.md` (invokable slash commands)
- `.github/instructions/*.instructions.md` (auto-attaching guidance)
- `AGENTS.md` at repo root (via the pointer in `copilot-instructions.md` — Copilot does not auto-load it by convention, so the pointer is what makes it discoverable)

---

## Multi-assistant teams (Claude Code + Cursor + Copilot in the same repo)

pai-orbit supports it. A single project can have `.claude/`, `.cursor/`, and `.copilot/` simultaneously alongside `.github/copilot-instructions.md` — each assistant reads its own folder, no conflict.

The tool-agnostic surface is shared:

- `docs/` — every assistant writes here.
- Project-context file — Claude and Cursor read `CLAUDE.md`; Copilot reads `AGENTS.md`. Content is identical; only the filename differs.

To set up multiple assistants:

- Inside Claude Code or Cursor: run `/setup` and select multiple targets in Step 2.
- For the Copilot half on a machine without Claude Code or Cursor: `npx github:the-psi/pai-orbit init copilot` adds the Copilot files non-destructively to a project that already has `.claude/` or `.cursor/`.

Re-running one assistant's install does not touch the others.

---

## Daily workflow

Type `/<command>` in Copilot Chat. Same vocabulary as Claude Code or Cursor:

- **Modes** drive headspace and outputs:
  - `/groom` — feature requirements (purpose → scenarios → acceptance criteria; writes `docs/features/<feature>/requirements.md`)
  - `/design` — technical design and trade-offs (writes `docs/features/<feature>/design.md` + ADRs)
  - `/build` — implementation work (code + docs)
  - `/arch`, `/data`, `/domain`, `/incident`, `/plan`, `/release`, `/review`, `/test`, `/ux` — see [`capabilities.md`](capabilities.md)
- **Skills** are reusable operational procedures, invokable from any mode:
  - `/git`, `/board`, `/analysis`, `/data-model`, `/epic`, `/simplify`
- **Service-builder agents** scaffold a service on Pro/Business; act as regular prompts on Free:
  - `/django-builder`, `/express-builder`, `/fastapi-builder`, `/generic-service-builder`, `/infra-builder`, `/nextjs-builder`, `/react-vite-builder`

### Mode discipline (D28)

Every mode prompt opens with an anti-drift block. When you invoke `/build`, Copilot:

- Prefixes every reply with `[BUILD]` so drift is visible.
- Refuses off-scope requests and redirects to the right mode (e.g., an architecture question gets redirected to `/design`).
- Holds the mode until you explicitly switch with another slash command.

If a reply lacks the `[<MODE>]` prefix, treat it as drift and re-issue the mode command.

---

## Skill rendering split — prompts AND/OR instructions

A skill in pai-orbit is a piece of operational guidance. In Copilot it can render into two places:

| Folder | When Copilot uses it | Trigger |
|--------|----------------------|---------|
| `.github/prompts/<skill>.prompt.md` | User explicitly invokes it | User types `/<skill>` |
| `.github/instructions/<skill>.instructions.md` | Auto-attaches based on file path | User opens or edits a file matching the `applyTo:` glob |

The two are **not mutually exclusive** — the same skill body may appear in both folders. Mapping for v1:

| Skill | Prompt (invokable) | Instructions (auto-attached) | Auto-attach glob |
|-------|--------------------|------------------------------|------------------|
| `/analysis` | ✅ | ❌ | — |
| `/board` | ✅ | ❌ | — |
| `/data-model` | ✅ | ✅ | `**/*.sql, **/migrations/**` |
| `/epic` | ✅ | ❌ | — |
| `/git` | ✅ | ✅ | `**/*` (always-on baseline) |
| `/simplify` | ✅ | ❌ | — |

Plus two instructions files that are not skill-derived:

- `arch-drift.instructions.md` — auto-attaches to structural files (`docker-compose.yml`, `package.json`, `go.mod`, …) and warns of architectural drift
- `context-discovery.instructions.md` — `applyTo: "**/*"`; fall-back duplicate of the `## Context discovery` block inside `copilot-instructions.md` (R8 — two channels for the same critical content)

---

## Hook coverage in Copilot

Copilot has **no tool-use event triggers** — prompt files only fire when the user types `/<name>`, instructions files only activate when matching files are open. So pai-orbit's `.sh` hooks **cannot be ported as-is**. Each hook's intent lands in a different layer:

| Hook intent | Where it lives | Coverage |
|-------------|---------------|----------|
| Block dangerous bash patterns (`git push --force`, `git add -A`, `--no-verify`, destructive `rm`) | `.github/copilot-instructions.md` (always-loaded text) | **Advisory only** — Copilot is instructed to refuse these; usually obeys, no guarantee |
| Secret / credential tripwire on staged files | `.husky/pre-commit` (opt-in) | **Enforced at commit time** — weak regex heuristic (`AWS_SECRET_ACCESS_KEY`, `PRIVATE KEY-----`); blocks the commit if matched |
| Lint Python at commit | `.husky/pre-commit` + project's `pyproject.toml` (existing) | **Enforced at commit time** if `ruff` is on PATH — every editor |
| Lint TypeScript/JS at commit | `.husky/pre-commit` + project's `.eslintrc.json` (existing) | **Enforced at commit time** if `eslint` is available — every editor |
| Lint at save (VS Code users only, optional) | User's own VS Code settings (recipe below) | **Convenience**, user opts in |
| Warn on architectural drift | `.github/copilot-instructions.md` + `.github/instructions/arch-drift.instructions.md` | **Advisory** |

**Honest restatement:** Copilot's Chat surface is advisory only — no real interception point. The `.husky/pre-commit` hook adds real enforcement at commit time, but its scope is **narrow**: lint failures block the commit and the light secret tripwire blocks known credential patterns. **The husky hook does NOT block `git push --force` (wrong git phase — pre-commit runs on `git commit`, not `git push`), does NOT block `git add -A` (staging happens before the hook fires), and cannot intercept destructive shell commands like `rm -rf`.** Those live only as advisory text in `copilot-instructions.md`. For hard enforcement of those patterns, use Claude Code or a separate pre-push hook. If your team needs `git push --force` blocked, consider a server-side branch protection rule instead.

### Linting across editors

pai-orbit does **NOT** author lint rules and does **NOT** emit editor-specific config files (D33). Your project's existing linter config (`pyproject.toml`, `.eslintrc.json`, `.editorconfig`) is the source of truth, read natively by every modern editor with linter integration. Enforcement happens at **commit time** via the pre-commit hook — editor-agnostic, runs regardless of who or what produced the change.

**VS Code users who want save-time feedback** add four lines to their own VS Code settings (User or Workspace — their choice; pai-orbit does not write either):

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.ruff": "explicit",
    "source.fixAll.eslint": "explicit"
  }
}
```

Same philosophy as pai-orbit's Claude Code and Cursor adapters — pai-orbit never touches editor configuration. JetBrains and Visual Studio users get equivalent save-time behaviour from their editor's own settings UI; one-time setup, documented in their tool's docs, not pai-orbit's responsibility.

---

## Updating pai-orbit later

To update pai-orbit in this project, re-run the install command from the project root:

```bash
npx github:the-psi/pai-orbit init copilot
```

(Or the explicit `update copilot` subcommand — same code path, re-run-specific status messages.)

The CLI detects your existing install, refreshes pai-orbit-owned files (prompts, instructions, rule book) to the latest version, and **preserves your team's customisations** (`.copilot/pai-orbit-config.md`, `.copilot/team.md`, `AGENTS.md`).

If you pinned a version (e.g., `#<tag>`), bump to the newer tag in your install command before re-running.

If you tracked `main` and the result feels stale, npx's GitHub-install cache may be the cause:

- Add `--ignore-existing` to force a fresh fetch.
- Or bump or change the ref (`#<newer-tag>`, `#<commit-sha>`) — a different ref always fetches fresh.

### File-ownership table (re-run behaviour)

| File category | First run | Re-run behaviour |
|---------------|-----------|------------------|
| `.github/copilot-instructions.md` | Write | **Overwrite** — pai-orbit owns it |
| `.github/prompts/*.prompt.md` | Write | **Overwrite** — pai-orbit owns them |
| `.github/instructions/*.instructions.md` | Write | **Overwrite** — pai-orbit owns them |
| `.copilot/pai-orbit-config.md` | Create from interview | **Preserve** when re-running without `--setup`; **overwrite** when `--setup` is passed (that flag is an explicit re-interview gesture) |
| `.copilot/team.md` | Create from interview | Same as above — preserve without `--setup`, overwrite with `--setup` |
| `.copilot/settings.json` | Write | Same as above — refreshed on every `--setup` re-run to reflect the latest answers |
| `AGENTS.md` | Create from template | **Preserve** — `--re-init-agents-md` (or legacy `--re-init-claude-md`) to reset |
| `docs/` scaffold | Create empty folders | **Skip if exists** — never touch user docs |
| `.husky/pre-commit` (active) | Optional install | **Preserve** unless `--reinstall-husky` |
| `.husky/pre-commit.template` (inert) | Write | **Overwrite** — latest wins |
| `.pre-commit-config.yaml` (active) | Optional install (D29) | **Preserve** unless `--reinstall-precommit-framework` |
| `.pre-commit-config.yaml.template` (inert) | Write | **Overwrite** — latest wins |

---

## Uninstalling pai-orbit from a project

If a team decides to remove pai-orbit, delete these paths from the repo and commit:

- `.copilot/` (entire folder)
- `.github/copilot-instructions.md`
- `.github/prompts/` — **only the pai-orbit-emitted `*.prompt.md` files**. Leave any user-authored prompts alone.
- `.github/instructions/` — **only the pai-orbit-emitted `*.instructions.md` files**. Leave any user-authored instructions alone.
- `.husky/pre-commit` (only if it is the pai-orbit-emitted version) and `.husky/pre-commit.template`
- `.pre-commit-config.yaml.template` (and the active `.pre-commit-config.yaml` if it was the pai-orbit version)

`AGENTS.md` (and any legacy `CLAUDE.md`) is **NOT** auto-removed — it is your project's documentation. Decide separately whether to keep it.

`docs/` is **NOT** auto-removed — your team's documentation lives there. Decide separately.

Future work: a `pai-orbit uninstall copilot` subcommand may be added later. For now, uninstall is a manual `git rm` operation.

---

## Known gaps vs Claude Code

pai-orbit's Copilot adapter delivers **~85% of the methodology benefit on Free, ~90% on Pro/Business**. The honest gap list:

- **No native hooks** — Copilot has no tool-use event system. Hook intent is split between always-loaded instruction text (**advisory** — Copilot usually obeys, no guarantee) and the optional `.husky/pre-commit` (enforces lint failures + a weak secret tripwire at commit time). Force-push, `git add -A`, `--no-verify`, and destructive shell commands cannot be blocked by any pre-commit hook — they require Claude Code's PreToolUse blocking, a pre-push hook, or server-side branch protection. See the Hook coverage matrix above.
- **Agents work only on Pro/Business** — service-builder prompts emit with `mode: agent` (D30). Pro/Business runs them as multi-step agents; Free degrades them to regular prompts that still give correct manual scaffolding guidance.
- **Mode discipline is text-based, not runtime-enforced** — the anti-drift block (D28) tightens but does not enforce. Copilot Free tier may drift on some replies; check for the `[<MODE>]` prefix and re-issue the mode command if missing.
- **`/setup` availability** — `/setup` IS emitted for Copilot as of 2026-07-04 (D13 fully superseded), as an agent-mode prompt. First-time install still starts from the terminal (`npx ... init copilot`) because the prompt files don't exist yet at first-run. On subsequent runs, `/setup` in Copilot Chat gives Copilot Business teams a reconfiguration UX equal to Claude Code's. Copilot Free degrades to advisory text.
- **`/suggest-skills` availability** — also emitted for Copilot as of 2026-07-04, as an agent-mode prompt with a Copilot-adapted preamble. Analysis inputs (`AGENTS.md` — legacy `CLAUDE.md` as fall-back, `docs/`, `git log`, existing `.github/prompts/`, `docs/wip/`, `docs/ops/`) are portable; the preamble redirects scaffold output from Claude's `.claude/skills/<name>/SKILL.md` target to Copilot's `.github/prompts/<name>.prompt.md` target and skips the "Claude Code built-in" step (no equivalent). Business tier scaffolds files agentically; Free tier produces the ranked suggestion list as text.
- **Named sub-agents `/docs-writer` and `/cross-repo-impact`** — emitted for Copilot as of 2026-07-05 as agent-mode prompts. `/docs-writer` runs with `editFiles` capability (writes documentation into `docs/`); `/cross-repo-impact` runs with **read-only tools** (`codebase` + `search`, no `editFiles` / `runCommands`) — matching the source agent's read-only contract. Business tier runs both multi-step; Free tier renders as advisory text.
- **ADR obligation rules** — `.github/instructions/decisions.instructions.md` with `applyTo: "**/*"` (always attached). Mirrors the Cursor plugin's `rules/decisions.mdc` (alwaysApply: true) and Claude Code's `rules/decisions.md`. Copilot now reads the "when to write an ADR" rules on every turn — same behaviour as the other adapters.
- **No editor-specific files** — pai-orbit never authors editor config (D33). VS Code lint-on-save is the 4-line recipe above; JetBrains/Visual Studio use their own editor settings.

---

## Troubleshooting

### Prompts don't show up in Copilot Chat

1. Did you reload VS Code? (`Ctrl+Shift+P` → "Developer: Reload Window")
2. Open `.github/copilot-instructions.md` in VS Code. It should exist and start with `# pai-orbit — GitHub Copilot rule book`.
3. List `.github/prompts/` — there should be 25 `*.prompt.md` files (12 mode + 6 skill + 7 agent).
4. Check the VS Code Copilot Chat settings — `chat.promptFiles` and `chat.instructionsFilesLocations` should be enabled. If they're disabled (org policy), prompt files won't be invokable; use the `## Modes` reference in `copilot-instructions.md` as a fall-back.

### `npx` fails

- Node version: ensure `node -v` is ≥ 18.
- `git` on PATH: `git --version` must succeed (npx clones via git).
- Firewall: npx hits `github.com`. PSI firewalled environments may need allowlisting.
- Stale cache: pass `--ignore-existing` or pin a different ref (`#<newer-tag>`, `#<commit-sha>`).

### A re-run unexpectedly overwrote something

The file-ownership table above lists exactly what re-run overwrites vs preserves. If something was clobbered:

```bash
git diff <file>            # see what changed
git checkout -- <file>     # restore from git
```

If the file was tracked, git always has the prior version. If it was untracked (e.g., a personal note), that content is unrecoverable — file an issue so we can tighten the ownership rules.

### Copilot ignores Context discovery and gives generic answers

Copilot may sometimes ignore the always-loaded Context discovery directives (a known Copilot Free-tier risk). Recovery:

1. Restart Chat (close + reopen the Chat panel in VS Code).
2. Verify `.github/copilot-instructions.md` exists and contains the `## Context discovery` section.
3. Verify `.copilot/pai-orbit-config.md` exists with the expected content.
4. If still failing, check that `.github/instructions/context-discovery.instructions.md` is present (the R8 fall-back) — it auto-attaches to every file via `applyTo: "**/*"`.
5. If both channels fail on Copilot Free, this is a known Free-tier limitation. Switch to Pro/Business for production use, or document the gap and proceed with caveat.

### Failed-install recovery (per D27)

If `npx` crashed mid-write (Ctrl-C, network blip, OOM) and you have a partial install:

```bash
git status                                                                                 # see what was written
git clean -fd .copilot/ .github/copilot-instructions.md .github/prompts/ .github/instructions/ .husky/
git checkout -- <any-tracked-file>                                                          # restore tracked files
```

Then re-run `npx github:the-psi/pai-orbit init copilot`. No special rollback subcommand is provided in v1 — git is the rollback tool.

### Migration from the old `.github/pai-orbit/` layout

`init copilot` auto-detects the old layout (the pre-upgrade adapter wrote config to `.github/pai-orbit/` instead of `.copilot/`). It prints a dry-run plan, prompts for confirmation, backs up the original to `.github/pai-orbit.bak/<timestamp>/`, and moves content into `.copilot/`. The backup directory is auto-added to `.gitignore` so it never accidentally lands in a commit (D23).

If auto-detection misses or misclassifies your layout, use the explicit subcommand:

```bash
npx github:the-psi/pai-orbit migrate copilot --yes
```

The backup folder is **not** auto-cleaned — remove it once you've confirmed the new install:

```bash
rm -rf .github/pai-orbit.bak/
```
