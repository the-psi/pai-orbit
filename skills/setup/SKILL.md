---
name: setup
description: First-time project setup for PAI-Orbit — interrogates repo structure and tech stack, asks short questions about task management, branching, deployment, docs, and team, then generates .claude/pai-orbit-config.md, .claude/team.md, a CLAUDE.md stub, stack-specific agents, and a docs/ scaffold. TRIGGER when starting a new project with PAI-Orbit, when the stack changes significantly, or when the user asks to configure or reconfigure the harness. SKIP if config files already exist and are current — offer to update specific sections instead.
---

# Setup

Configure `PAI-Orbit` for this project. Run once when starting, re-run when the stack or team changes significantly.

## Step 1 — Discover

Before asking anything, read what already exists:

- Scan the repo root for `package.json`, `pyproject.toml`, `requirements.txt`, `go.mod`, `Cargo.toml`, `pom.xml` — infer languages and frameworks
- Check for `docker-compose.yml`, `Makefile`, cloud config files (`fly.toml`, `vercel.json`, `app.yaml`) — infer deployment
- Look for existing `CLAUDE.md`, `.claude/pai-orbit-config.md`, `.claude/team.md` — note what is already configured
- Count top-level directories that look like services (api/, frontend/, backend/, app/, etc.)
- Check if this is a monorepo or multi-repo workspace
- Look for `.github/`, `.gitlab/`, `linear.json`, `jira-config` — infer task management platform

Report a brief summary of what was found before asking any questions.

## Step 2 — Ask (only what can't be inferred)

Ask all unresolved questions in a single block — do not ask one at a time. Cover:

1. **Repo structure** (if ambiguous): monorepo with these services, or separate repos?
2. **Tech stack** (per service, if not clear from files): language + framework?
3. **Task management**: GitHub Issues / Linear / Jira / Notion / none? Provide board URL(s) and label taxonomy if GitHub Issues or Jira.
4. **Branching model**: GitHub Flow (feature branches → main) / GitFlow (develop + release branches) / trunk-based (direct to main with flags)?
5. **Deployment**: cloud provider + target (Cloud Run, Vercel, Railway, AWS ECS, bare VPS, etc.)? One command or per-service?
6. **Docs home**: in-repo `docs/` / dedicated docs repo (provide path) / Confluence (provide space URL) / Notion (provide workspace)?
7. **Multi-repo project?**: Does this service repo belong to a larger multi-repo project with a separate repo for system-level docs (cross-cutting ADRs, epics spanning services, system-wide domain knowledge)? If yes, what is the path or git URL to that system docs repo?
8. **Architecture (optional — can be done later with `/arch init`):** What services exist and how do they communicate? Any hard constraints — things that must never happen across the codebase? (e.g., "services must not share DBs", "frontend talks only to api-gateway")
9. **Team**: names, roles, and handles (GitHub username / Linear ID / Jira user ID as relevant). Who is the default assignee for code issues? Who owns domain/expert decisions?

## Step 3 — Generate

Create the following files. Tell the user what was created and what they need to fill in by hand.

### `.claude/pai-orbit-config.md`

Use the template at `templates/pai-orbit-config.md.template`. Fill all sections from the answers above.

For the `## System Docs` section:
- If the user answered **no** to the multi-repo question: omit the `## System Docs` section entirely from the generated file (do not write it with blank values).
- If the user answered **yes** and provided a **relative path**: check whether that directory exists before writing. If it does not exist, warn the user ("System docs path not found — writing the pointer anyway; ensure the repo is cloned before running commands") and write it as given.
- If the user answered **yes** and provided a **git URL**: write it as-is. Do not attempt to clone or validate — note that the user must clone the repo locally before commands can read from it.

### `.claude/team.md`

Use the template at `templates/team.md.template`. Populate from team answers.

### `CLAUDE.md`

Use the template at `templates/CLAUDE.md.template`. Fill in:
- Project name and one-line description
- Sub-projects / services table (name, path, stack, purpose)
- Commands section (dev server, build, test for each service)
- Leave architecture section with clear `<!-- TODO: fill in by hand -->` markers

### Stack agents

For each service, pick the closest agent template from `templates/agents/`:
- FastAPI → `fastapi-builder.md`
- Next.js → `nextjs-builder.md`
- Django → `django-builder.md`
- Express/Node → `express-builder.md`
- React/Vite (frontend only) → `react-vite-builder.md`
- Anything else → `generic-service-builder.md`

Write the generated agent to `.claude/agents/<service>-builder.md`. Replace all `{{PLACEHOLDER}}` markers with actual values.

### Lint hooks

For each language detected:
- Python → generate `.claude/hooks/lint-python.sh` using `hooks/lint-python.sh` as a base; update repo paths
- TypeScript/JavaScript → generate `.claude/hooks/lint-ts.sh` using `hooks/lint-ts.sh` as a base; update repo paths

Update `.claude/settings.json` to wire the hooks:
```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": ".claude/hooks/bash-guard.sh", "timeout": 10 }] }
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write", "hooks": [
        { "type": "command", "command": ".claude/hooks/lint-python.sh", "timeout": 30, "async": true },
        { "type": "command", "command": ".claude/hooks/lint-ts.sh", "timeout": 60, "async": true },
        { "type": "command", "command": ".claude/hooks/arch-drift-guard.sh", "timeout": 5, "async": true }
      ]}
    ]
  }
}
```

Copy `.claude-plugin/hooks/bash-guard.sh` to `.claude/hooks/bash-guard.sh`.
Copy `.claude-plugin/hooks/arch-drift-guard.sh` to `.claude/hooks/arch-drift-guard.sh`.

### Docs scaffold

If `docs/` does not exist, copy the scaffold from `templates/docs/` to the configured docs path.
If a dedicated docs repo path was given, create the scaffold there.
If Confluence or Notion: skip the scaffold, note the MCP setup required (see Getting Started).

### Architecture scaffold

Copy `templates/docs/architecture/system.md`, `constraints.md`, and `stack.md` to `docs/architecture/` (replacing `{{PROJECT_NAME}}` and `{{DATE}}`).

Populate `stack.md` from the language and framework info discovered in Step 1.

If the user answered the architecture question (Step 2, item 8), pre-populate the service table in `system.md` and the rules in `constraints.md` from those answers. Otherwise leave as stubs.

Tell the user: "Run `/arch init` to complete your architecture declaration. Once declared, `/build` and `/review` will read `constraints.md` to enforce architectural rules automatically."

## Step 4 — Report

List every file created. For each:
- ✅ Complete — no action needed
- ⚠️ Stub — what the human needs to fill in

Architecture files:
- ⚠️ Stub — `docs/architecture/system.md` — run `/arch init` to complete
- ⚠️ Stub — `docs/architecture/constraints.md` — run `/arch init` to define rules
- ✅ Generated — `docs/architecture/stack.md` (populated from detected stack)

End with: "Run `/suggest-skills` after a few sessions to discover operational skills worth adding."
