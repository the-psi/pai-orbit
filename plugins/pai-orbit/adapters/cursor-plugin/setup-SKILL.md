---
name: setup
description: First-time Cursor project setup for pai-orbit — discovers repo stack, asks about board/git/deploy/docs/team, then generates .cursor/pai-orbit-config.md, .cursor/team.md, AGENTS.md, and docs/ scaffold. No Claude Code artifacts (.claude/, CLAUDE.md). TRIGGER when starting a new project with pai-orbit in Cursor, when the stack changes significantly, or when the user asks to configure or reconfigure the harness. SKIP if config files already exist and are current — offer to update specific sections instead.
---

# Setup (Cursor)

Configure pai-orbit for this project in Cursor. Run once when starting, re-run when the stack or team changes significantly.

**Cursor contract:** all project config under `.cursor/` + root `AGENTS.md`. Do not create `.claude/`, `CLAUDE.md`, or any Claude Code artifacts.

## Step 1 — Discover

Before asking anything, read what already exists:

- Scan the repo root for `package.json`, `pyproject.toml`, `requirements.txt`, `go.mod`, `Cargo.toml`, `pom.xml` — infer languages and frameworks
- Check for `docker-compose.yml`, `Makefile`, cloud config files — infer deployment
- Look for existing `AGENTS.md`, `.cursor/pai-orbit-config.md`, `.cursor/team.md` — note what is already configured
- If legacy `CLAUDE.md` or `.claude/*` exist, offer to migrate to Cursor-native paths (do not leave duplicates)
- Count top-level directories that look like services (api/, frontend/, backend/, app/, etc.)
- Check if this is a monorepo or multi-repo workspace
- Look for `.github/`, `.gitlab/`, `linear.json`, `jira-config` — infer task management platform

Report a brief summary of what was found before asking any questions.

## Step 2 — Ask (only what can't be inferred)

Ask all unresolved questions in a single block — do not ask one at a time. Cover:

1. **Repo structure** (if ambiguous): monorepo with these services, or separate repos?
2. **Tech stack** (per service, if not clear from files): language + framework?
3. **Task management**: GitHub Issues / GitHub Projects v2 / Linear / Jira / GitLab / Notion / none? Provide board URL(s). Do **not** ask for label taxonomy here — the board interview in Step 2b will query it from the API.
4. **Branching model**: GitHub Flow / GitFlow / trunk-based?
5. **Deployment**: cloud provider + target? One command or per-service?
6. **Docs home**: in-repo `docs/` / dedicated docs repo / Confluence / Notion?
7. **Multi-repo project?**: separate system docs repo? If yes, path or git URL.
8. **Architecture (optional — can be done later with `/arch init`):** services, communication, hard constraints.
9. **Team**: names, roles, handles. Default assignees.

## Step 2b — Board Column Discovery

Same as core setup: query live board taxonomy for GitLab, GitHub Projects v2, Linear; manual for Jira/GitHub Issues/Notion/none. See core setup skill for CLI commands (`glab`, `gh project field-list`, etc.).

When writing the `## Agile Board → columns` table, include all confirmed column labels and append:

```
# Re-run /setup or update this table if labels change on the board.
```

## Step 3 — Generate (Cursor only)

Create the following files. Tell the user what was created and what they need to fill in by hand.

### `.cursor/pai-orbit-config.md`

Use the template at `templates/pai-orbit-config.md.template`. Fill all sections from the answers above and the board discovery in Step 2b.

For the `## System Docs` section:
- If no multi-repo system docs: omit the section entirely.
- If relative path: warn if directory missing, write pointer anyway.
- If git URL: write as-is; user must clone locally before commands can read it.

### `.cursor/team.md`

Use the template at `templates/team.md.template`. Populate from team answers.

### `AGENTS.md`

Use the template at `templates/AGENTS.md.template`. Fill in:
- Project name and one-line description
- Sub-projects / services table (name, path, stack, purpose)
- Commands section (dev server, build, test for each service)
- Leave architecture section with clear `<!-- TODO: fill in by hand -->` markers

`AGENTS.md` is Cursor's project guide for stack, conventions, and commands.

### Stack agents (optional)

For each service, you may generate `.cursor/agents/<service>-builder.md` from `templates/agents/` if the team wants project-scoped builder agents. The pai-orbit plugin already ships generic agents; skip this unless the user asks for stack-specific builders.

### Do NOT generate

- `CLAUDE.md`
- `.claude/settings.json`
- `.claude/hooks/*`
- `.claude/agents/*`
- `.claude/pai-orbit-config.md`
- `.claude/team.md`
- Any path under `.claude/`

Hooks for Cursor come from the installed pai-orbit plugin (`hooks/hooks.json` + `scripts/`), not from project files.

### Docs scaffold

If `docs/` does not exist, copy the scaffold from `templates/docs/` to the configured docs path.

### Architecture scaffold

Copy `templates/docs/architecture/system.md`, `constraints.md`, and `stack.md` to `docs/architecture/` (replacing `{{PROJECT_NAME}}` and `{{DATE}}`).

Populate `stack.md` from detected stack info. Pre-populate `system.md` and `constraints.md` if the user answered the architecture question; otherwise leave as stubs.

Tell the user: "Run `/arch init` to complete your architecture declaration."

## Step 4 — Report

List every file created. For each:
- ✅ Complete — no action needed
- ⚠️ Stub — what the human needs to fill in

End with: "Run `/suggest-skills` after a few sessions to discover operational skills worth adding."

## Migration from legacy Claude-branded files

If the repo has `CLAUDE.md`, `.claude/pai-orbit-config.md`, or `.claude/team.md`:
1. Migrate content to `AGENTS.md`, `.cursor/pai-orbit-config.md`, and `.cursor/team.md`
2. Ask the user before deleting legacy files
3. Do not maintain both locations long-term
