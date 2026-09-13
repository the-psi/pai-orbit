---
applyTo: "**/*"
---


# Git

Commit, branch, PR, and push following this project's git conventions.

Reads branching model and conventions from `.copilot/pai-orbit-config.md` → `## Git` section.

## MCP vs shell

Before executing any git or PR operation, check `.copilot/pai-orbit-config.md → ## MCP → git`:

- **`github` or `gitlab`** — prefer MCP tool calls for the operation (e.g. GitHub MCP `create_pull_request`, `push_files`). If the MCP call fails or the server is unreachable, fall back to the equivalent shell command and note the fallback: "MCP unavailable — using shell fallback."
- **`none` or section absent** — use shell commands directly; no MCP attempt.

## Commit

**Format:** `<type>: <short imperative description>`

| Type | When |
|------|------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Internal restructure, no behaviour change |
| `test` | Adding or fixing tests |
| `docs` | Documentation only |
| `chore` | Build config, dependencies, CI |
| `data` | Seed data, schema changes, migrations |
| `ops` | Deploy scripts, infra, environment config |

Rules:
- Subject line ≤ 72 characters, imperative mood ("add" not "added")
- Body optional — include only when the *why* is non-obvious from the diff
- Reference the task board item in the body: `refs #N` during development, `closes #N` in the final shipping commit only
- Stage specific files — never `git add .` or `git add -A`
- No "Co-Authored-By" lines

## Branching

Read the branching model from `.copilot/pai-orbit-config.md`. Apply accordingly:

**GitHub Flow** (default for most projects):
- Branch from `main` for every change: `feature/<slug>`, `fix/<slug>`, `hotfix/<slug>`
- PR → squash merge → delete branch
- `main` is always deployable

**GitFlow**:
- Feature branches from `develop`: `feature/<slug>`
- Releases from `develop`: `release/<version>`
- Hotfixes from `main`: `hotfix/<slug>`
- Merge release/hotfix to both `main` and `develop`

**Trunk-based**:
- Commit directly to `main` for small changes
- Short-lived branches (< 1 day) for larger changes
- Feature flags gate incomplete work

## PR process

Read PR conventions from `.copilot/pai-orbit-config.md`. Defaults:
- Draft PR for work in progress; mark ready when tests pass
- Title mirrors commit format: `feat: add user authentication`
- Body: what changed, why, how to test, closes #N
- Squash merge by default; merge commit only if history granularity matters

## Safety rules (always apply)

- Never force-push to the main/protected branch
- Never skip pre-commit hooks (`--no-verify`)
- If a hook fails, fix the underlying issue — do not bypass
- Confirm with the user before pushing to any remote
- If destructive git state is needed (reset --hard, branch -D), state what will be lost and ask first
