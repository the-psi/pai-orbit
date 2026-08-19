---
name: git-skill
description: pai-orbit git skill - Git operations — commit, branch, PR, push — following the project's configured branching model and conventions. TRIGGER when committing, creating a branch, opening a PR, or managing git state. SKIP read-only git inspection (git log, git diff, git status) — those don't need a skill.
inclusion: manual
---

# pai-orbit git Skill


# Git

Commit, branch, PR, and push following this project's git conventions.

Reads branching model and conventions from `.claude/pai-orbit-config.md` → `## Git` section.

## MCP vs shell

Before executing any git or PR operation, check `.claude/pai-orbit-config.md → ## MCP → git`:

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

Read the branching model from `.claude/pai-orbit-config.md`. Apply accordingly:

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

Read PR conventions from `.claude/pai-orbit-config.md`. Defaults:
- Draft PR for work in progress; mark ready when tests pass
- Title mirrors commit format: `feat: add user authentication`
- Body: what changed, why, how to test, closes #N
- Squash merge by default; merge commit only if history granularity matters

## Board sync

`closes #N` in a commit is a text convention, not a status update. It auto-closes an issue
on GitHub and GitLab but does nothing on Jira, Linear, or Notion, does not move a card into
a review or done column on any board, and is easily lost when a squash merge rewrites the
body. So the board is updated explicitly at two points:

- **After creating a PR** — run the Board Sync Checkpoint at stage `review_open` via `/board`.
  The pre-filled comment carries the PR URL.
- **After merging to the base branch** — run it at stage `merged`, with the merge SHA.

Both are mandatory steps, not offers. Do not treat `closes #N` in the commit body as a
substitute, and do not defer the sync to the end of the session.

Deployment is a separate stage owned by `/release` — do not mark anything `deployed` here.
Merging is not shipping.

## Safety rules (always apply)

- Never force-push to the main/protected branch
- Never skip pre-commit hooks (`--no-verify`)
- If a hook fails, fix the underlying issue — do not bypass
- Confirm with the user before pushing to any remote
- If destructive git state is needed (reset --hard, branch -D), state what will be lost and ask first

## Usage in Kiro
Activate this skill by using `#git-skill` in your conversation or by requesting "git" operations.
