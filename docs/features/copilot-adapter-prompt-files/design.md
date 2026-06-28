# Copilot adapter — prompt files, instructions files, and hook surrogates

**Date:** 2026-06-28
**Owner:** Chetan Sharma
**Status:** Design — Phase 1 of the [Copilot adapter upgrade plan](../../plans/copilot-adapter-upgrade-2026-06-28.md)
**Parent epic:** [multi-tool-compat](../../epics/multi-tool-compat/EPIC.md)

This document specifies the file formats, body transformations, and emitted artefacts that Phase 2 (the adapter rewrite) will implement. Every decision referenced below (D1..D34) is already committed in the parent plan and is **not re-litigated here** — this is the build spec, not the rationale doc.

D22 is OBSOLETE (no `/test` skill exists). D32 is Reserved (rejected; resolved by D33).

Two questions stay open and are flagged in §10 as Phase-2 discovery items:
- Husky template — assume husky installed vs ship as plain `.git/hooks/pre-commit.template`.
- Broadest `applyTo:` glob Copilot honours on instructions files (`**/*` is the assumption — confirm in Phase 2).

---

## 1. Output target layout

The adapter emits into `plugins/pai-orbit/dist/copilot/` and the install CLI copies the contents into a project at the same relative paths. Counts shown are filesystem-audited 2026-06-28.

```
dist/copilot/
├── .github/
│   ├── copilot-instructions.md                  # slim rule book + Context discovery + prompt library pointer
│   ├── prompts/                                 # 25 files total
│   │   ├── <12 mode prompts>.prompt.md          # all of core/modes/ except setup, suggest-skills (D13)
│   │   ├── <6 skill prompts>.prompt.md          # analysis, board, data-model, epic, git, simplify
│   │   └── <7 service-builder prompts>.prompt.md  # mode: agent (D30) — django, express, fastapi,
│   │                                              #   generic-service, infra, nextjs, react-vite
│   └── instructions/                            # 4 files total
│       ├── git.instructions.md                  # applyTo: **/*
│       ├── data-model.instructions.md           # applyTo: **/*.sql, **/migrations/**
│       ├── arch-drift.instructions.md           # applyTo: structural-file globs (§7)
│       └── context-discovery.instructions.md    # applyTo: **/* (fall-back duplicate per R8)
├── .husky/
│   └── pre-commit.template                      # opt-in; D29 husky path
└── .pre-commit-config.yaml.template             # opt-in; D29 pre-commit-framework path
```

No `.vscode/`, no `.idea/`, no other editor-specific files are emitted (D33).

---

## 2. Frontmatter schemas

### 2.1 Prompt files (`.github/prompts/<name>.prompt.md`)

Modelled on ECC's proven shape (D1). Mode and skill prompts use the chat-mode variant. Service-builder prompts use the agent-mode variant (D30).

#### Mode and skill prompt frontmatter

```yaml
---
agent: agent
description: "[<kind>] <one-liner copied from source>"
---
```

Field meanings:
- `agent: agent` — fixed literal; tells Copilot Chat this is an invokable prompt. ECC uses the same literal across every prompt.
- `description:` — the string surfaced in Copilot's slash-command picker. **Always prefixed** per D20:
  - `[mode]` for mode prompts (12 files)
  - `[skill]` for skill prompts (6 files)
  - `[agent]` for service-builder prompts (7 files — see §2.2)

Description source-of-truth:
- For modes: derived from the headspace declaration line and the "Switch out when:" intent. The adapter constructs the one-liner from the source mode file's first non-empty line plus the mode name. Example for `groom.md`:
  - Source first line: `You are now in GROOM MODE.`
  - Emitted description: `"[mode] Groom feature requirements — purpose, scenarios, then acceptance criteria. Writes docs/features/*/requirements.md."`
- For skills: copied verbatim from the existing `description:` field in the skill's `SKILL.md` frontmatter, with the `[skill] ` prefix prepended. No re-wording — the skills already ship with curated descriptions.

The description **must stay under ~140 chars** for picker readability. The adapter truncates with an ellipsis if a skill description exceeds that limit.

No `tools:` field is emitted for mode or skill prompts. Copilot's mode/skill prompts execute in the user's current chat session; tool restriction is out of scope for v1.

#### 2.2 Service-builder prompt frontmatter (D30 — agent mode)

```yaml
---
mode: agent
description: "[agent] <service stack> implementation work — reads CLAUDE.md, scaffolds files, runs tests."
tools: ["codebase", "editFiles", "runCommands", "search"]
---
```

Field meanings:
- `mode: agent` — Pro/Business Copilot runs this as a multi-step agent. Free degrades to a regular prompt (graceful per D30). The literal `mode: agent` (not `agent: agent`) is the Copilot-documented agent-mode trigger.
- `description:` — `[agent] ` prefix + one-liner derived from the template's existing description.
- `tools:` — the broadest safe set for a scaffolding agent: read the codebase, edit files, run commands (tests, formatters), search. Tightening per-stack (e.g., dropping `runCommands` for the React-Vite agent) is a Phase-2 discovery item — start broad, narrow only if Pro/Business validation surfaces unsafe behaviour.

The `{{SERVICE_NAME}}`, `{{SERVICE_PATH}}`, `{{APP_MODULE}}`, etc. placeholders in the source agent templates are **left in place**. The Copilot adapter does NOT substitute them — substitution is the install-CLI's job (Phase 3b), and only happens when the user picks a target stack during `/setup` or `npx ... init`. The Phase-2 emitter just wraps frontmatter around the existing template body.

### 2.3 Instructions files (`.github/instructions/<name>.instructions.md`)

```yaml
---
applyTo: "<glob or comma-separated globs>"
---
```

Field meanings:
- `applyTo:` — Copilot's path-glob trigger. The file's body is auto-injected into Chat context whenever the user opens or edits a file matching the glob. **No `description:` field** — instructions files are not surfaced in the picker; they activate silently.

Glob shapes used in v1:
| File | `applyTo:` |
|------|------------|
| `git.instructions.md` | `"**/*"` (always-on baseline) |
| `data-model.instructions.md` | `"**/*.sql, **/migrations/**"` |
| `arch-drift.instructions.md` | structural files — see §7 |
| `context-discovery.instructions.md` | `"**/*"` (fall-back duplicate of the Context discovery directives — R8) |

`**/*` is asserted to work; if Phase 2 validation finds Copilot rejects it as too broad, the fall-back is per-extension splits (e.g., `"**/*.{ts,tsx,js,jsx,py,sql,md,yml,yaml,json,toml}"`). This is open question #2 in §10.

---

## 3. Body transformation — modes → prompt files

Source: `plugins/pai-orbit/core/modes/<name>.md`
Target: `dist/copilot/.github/prompts/<name>.prompt.md` (12 of 14 — skip `setup` and `suggest-skills` per D13)

### 3.1 Transformation steps (in order)

1. **Wrap with prompt frontmatter** (§2.1, `agent: agent`, `[mode]` description prefix).
2. **Emit the anti-drift block** as the first body content (D28). Format spelled out in §3.2.
3. **Copy the source body verbatim**, including:
   - The `You are now in <MODE> MODE.` headspace declaration line.
   - The `Switch out when:` block — **kept intact**; switch-out guidance is part of the headspace and explicitly retained per the plan's resolved-open-question list.
   - All `## Session flow`, `## Behaviour`, `## Session close`, `## Output format` sections.
4. **Apply path rewrites** — same substitutions the legacy adapter already does, updated for the new `.copilot/` layout (D3):
   - `.claude/pai-orbit-config.md` → `.copilot/pai-orbit-config.md`
   - `.claude/team.md` → `.copilot/team.md`
   - `.claude/agents/` → `.copilot/agents/` (where referenced — Copilot has no agent runtime; references remain for human readers and for Pro/Business agent-mode prompts that read these files)
   - `.claude/hooks/` → no rewrite; instead the surrogate-hook text (per §7) handles the intent — the `.claude/hooks/` references in mode bodies are stripped, since hooks have no Copilot analogue
   - `` `.claude/` `` → `` `.copilot/` `` (backtick-wrapped form)
5. **No trimming** — the entire mode body lands in the prompt file. Slimming was considered and rejected: mode prompts already average ~150 lines; that fits comfortably in Copilot's prompt-file budget, and trimming risks losing the gates and behaviour rules that make the methodology work.

### 3.2 Anti-drift block format (D28)

Inserted between the frontmatter close (`---`) and the mode's existing first line (`You are now in <MODE> MODE.`):

```markdown
> **Mode discipline — read before answering.**
>
> You are now in **<MODE>** mode. Until the user explicitly switches modes:
> - Do NOT do work that belongs to another mode. <Off-scope examples — 1 line.>
> - Redirect off-scope requests to the right mode and name it explicitly (e.g. "That's a `/design` question — switch modes?").
> - Begin every reply with the literal prefix `[<MODE>]` so mode drift is visible to the user.
>
> If the user explicitly says "switch to /<other>" or types another slash command, drop this block.
```

Per-mode customisation of the "Do NOT do" line — the emitter substitutes a one-line off-scope example based on the mode:

| Mode | "Do NOT do" example line |
|------|--------------------------|
| `/arch` | Do NOT implement features or design specific solutions — that's `/design` or `/build`. |
| `/build` | Do NOT debate architecture or re-design — that's `/design`. Do NOT write requirements — that's `/groom`. |
| `/data` | Do NOT design feature implementations — that's `/design`. Do NOT execute deploys — that's `/release`. |
| `/design` | Do NOT implement code — that's `/build`. Do NOT re-litigate requirements — that's `/groom`. |
| `/domain` | Do NOT propose technical solutions or designs — those belong to `/design`. |
| `/groom` | Do NOT propose solutions or implementations — that's `/design`. Do NOT write code — that's `/build`. |
| `/incident` | Do NOT plan new features — that's `/plan`. Do NOT refactor opportunistically — focus on the incident. |
| `/plan` | Do NOT design solutions for the items you're prioritising — that's `/design`. |
| `/release` | Do NOT design new features mid-release — that's `/design`. Do NOT add scope. |
| `/review` | Do NOT design replacements for the code under review — flag, don't rewrite. |
| `/test` | Do NOT implement the feature under test — that's `/build`. |
| `/ux` | Do NOT design backend or data layers — that's `/design`. |

The mode-specific "Do NOT" line lives in a table inside the adapter script (one-line per mode) — no per-mode source file change required.

### 3.3 The two skipped modes (D13)

- `setup.md` — replaced by the standalone npx CLI (Phase 3b). Emitting it as a Copilot prompt would offer users an inferior entry point.
- `suggest-skills.md` — a Claude-Code introspection feature that lists installed plugin skills. Copilot has no equivalent surface to inspect, so the prompt has no useful output.

Both files remain in `core/modes/` and are emitted by the Claude and Cursor adapters.

---

## 4. Body transformation — skills → prompt and/or instructions files

Source: `plugins/pai-orbit/core/skills/<name>/SKILL.md`
Target: one or both of:
- `dist/copilot/.github/prompts/<name>.prompt.md`
- `dist/copilot/.github/instructions/<name>.instructions.md`

Six skills total. None are dropped. Two emit twice.

### 4.1 Skill → folder mapping (D10)

| Skill | Prompt file? | Instructions file? | Instructions `applyTo:` | Reason for split |
|-------|--------------|--------------------|-------------------------|------------------|
| `analysis` | yes | no | — | Cross-repo impact assessment — only relevant when the user asks. |
| `board` | yes | no | — | Task management — only relevant when the user asks. |
| `data-model` | yes | yes | `"**/*.sql, **/migrations/**"` | Schema/migration conventions should auto-attach when SQL or migration files are open, *and* be invokable as `/data-model`. |
| `epic` | yes | no | — | Epic lifecycle CRUD — only relevant when the user asks. |
| `git` | yes | yes | `"**/*"` | Commit/branch/PR rules should be always-on (every file in every commit needs them), *and* invokable as `/git` for explicit actions. |
| `simplify` | yes | no | — | Review-and-cleanup pass — only relevant when the user asks. |

Net count: **6 prompt files** + **2 instructions files derived from skills**. The other 2 instructions files (`arch-drift`, `context-discovery`) are not skill-derived (§6, §7).

### 4.2 Body transformation — prompt variant

1. **Strip the existing `SKILL.md` frontmatter** (`name:`, `description:`).
2. **Emit new prompt frontmatter** per §2.1 (`agent: agent`, `description: "[skill] <original description>"`).
3. **Copy the body verbatim**, applying the same path rewrites as §3.1 step 4.
4. **No anti-drift block** — anti-drift is mode-only (D28). Skills are intentionally orthogonal to modes and should be usable from any mode.

### 4.3 Body transformation — instructions variant

1. **Strip the existing `SKILL.md` frontmatter**.
2. **Emit new instructions frontmatter** per §2.3 (`applyTo: "<glob>"`).
3. **Copy the body verbatim**, applying the same path rewrites.
4. **No description, no anti-drift block** — instructions files are silent-attach context, not invokable prompts.

The same source body is emitted to both locations for the two dual-use skills (`git`, `data-model`). They are not symlinked or content-deduped — Copilot reads them independently, and the file system cost is trivial.

---

## 5. Body transformation — agent templates → service-builder prompts

Source: `plugins/pai-orbit/core/templates/agents/<stack>-builder.md`
Target: `dist/copilot/.github/prompts/<stack>-builder.prompt.md`

Seven templates: `django`, `express`, `fastapi`, `generic-service`, `infra`, `nextjs`, `react-vite` (filesystem-audited 2026-06-28).

### 5.1 Transformation steps

1. **Replace the template's frontmatter** with the service-builder prompt frontmatter per §2.2 (`mode: agent`, `[agent]` description prefix, `tools:` list).
2. **Copy the body verbatim, including the `{{...}}` placeholders.** The Copilot adapter does NOT substitute placeholders — the install CLI does that at scaffold time, after asking the user for stack-specific values. This keeps `dist/copilot/.github/prompts/<stack>-builder.prompt.md` reproducible and lets the same dist serve every project.
3. **Apply path rewrites** as in §3.1 step 4. Hook references are stripped.
4. **No anti-drift block.** Agent-mode prompts run as multi-step agents on Pro/Business and as regular prompts on Free; the anti-drift block is mode-discipline machinery that doesn't translate to agent runs.

### 5.2 Description construction

Source template description (example, `fastapi-builder.md`):
```
Implementation work in the {{SERVICE_NAME}} FastAPI service ({{SERVICE_PATH}}). Use for adding/modifying routers, services, database queries, middleware, and background tasks. Runs pytest before claiming completion. Does not touch other sub-repos.
```

Emitted prompt description (`{{SERVICE_NAME}}` substitution deferred to install-CLI):
```
[agent] FastAPI service implementation — routers, services, DB queries, middleware. Runs pytest before claiming done.
```

The adapter constructs a generic, placeholder-free one-liner per stack (one hard-coded per file in the emitter) so the picker shows a clean description even before the install CLI substitutes the live service name. The full templated description appears in the body, where `{{SERVICE_NAME}}` is fine because it's substituted at install time.

---

## 6. Slim `copilot-instructions.md` outline

The current adapter dumps every mode and skill inline. The new shape is ~150–200 lines (matching ECC's ~115-line example, allowing for our extra Context discovery section).

### 6.1 Outline

```markdown
# pai-orbit — GitHub Copilot rule book

pai-orbit is a mode-driven developer workflow. The mode prompts in `.github/prompts/` carry the headspace and behaviour rules for each mode (`/groom`, `/design`, `/build`, etc.). This file is the always-loaded baseline that applies to every Copilot Chat turn.

## Path conventions

- pai-orbit metadata lives in `.copilot/`: `pai-orbit-config.md`, `team.md`, `settings.json`.
- Project documentation lives in `docs/`.
- `CLAUDE.md` at repo root is **tool-agnostic** project docs, named for historical reasons. Read it for project stack, key files, and conventions.

## Context discovery — read at session start

When a Copilot Chat session begins, look up these files in order. Read each that exists. If a referenced file does not exist, proceed without it — do not invent its contents.

1. `.copilot/pai-orbit-config.md` — board, branch model, deploy targets, docs home, team conventions
2. `.copilot/team.md` — team members, owners, default assignees
3. `CLAUDE.md` — project description, stack, key files, data model, auth
4. `docs/architecture/constraints.md` — architectural rules (read before any structural change)
5. `docs/architecture/system.md` — service inventory and inter-service communication
6. `docs/architecture/stack.md` — language and framework choices
7. `docs/decisions/` — ADRs relevant to the task
8. `docs/domain/*.md` — business rules and expert knowledge
9. `docs/features/<feature>/requirements.md` — when working on a known feature

## Forbidden patterns (bash-guard intent, advisory)

Never suggest, generate, or run commands matching these patterns. If a user asks for one, refuse and explain.

- `git push --force` / `git push -f` on any branch.
- `git add .`, `git add -A`, `git add --all`, `git add -u`.
- `git commit --no-verify`, `git push --no-verify`, `git merge --no-verify`, `git rebase --no-verify`.
- `rm -rf /`, `rm -rf ~`, `rm -rf $HOME`, `rm -rf .` (current directory wipe).

This is advisory only — Copilot's compliance is not guaranteed. Real enforcement lives in `.husky/pre-commit` (or `.pre-commit-config.yaml`), opted in at install.

## Architectural drift (arch-drift intent, advisory)

When editing or proposing changes to structural files — `docker-compose.yml`, `docker-compose.yaml`, `package.json`, `go.mod`, `pom.xml`, `Cargo.toml`, `pyproject.toml`, `requirements.txt`, `fly.toml`, `vercel.json`, `app.yaml`, `main.py`, `app.py`, `index.ts`, `index.js`, `server.ts`, `server.js` — warn the user that the change may affect architecture and suggest running `/arch validate` after the session.

The path-scoped detail lives in `.github/instructions/arch-drift.instructions.md`, which auto-attaches when these files are open.

## Prompt library

All mode and skill prompts live in `.github/prompts/`. Invoke them by typing `/<name>` in Copilot Chat. The slash-command picker prefixes them so kind is visible:

- `[mode]` — pai-orbit working modes (12): `/arch`, `/build`, `/data`, `/design`, `/domain`, `/groom`, `/incident`, `/plan`, `/release`, `/review`, `/test`, `/ux`
- `[skill]` — invokable procedures (6): `/analysis`, `/board`, `/data-model`, `/epic`, `/git`, `/simplify`
- `[agent]` — service-builder prompts (7, Pro/Business agentic; Free regular): `/django-builder`, `/express-builder`, `/fastapi-builder`, `/generic-service-builder`, `/infra-builder`, `/nextjs-builder`, `/react-vite-builder`

Auto-attaching instructions files in `.github/instructions/`:
- `git.instructions.md` — git conventions on every file
- `data-model.instructions.md` — SQL and migration conventions
- `arch-drift.instructions.md` — structural-file warnings
- `context-discovery.instructions.md` — fall-back duplicate of the Context discovery directives above

## Mode discipline (D28)

Each mode prompt opens with an anti-drift block. When in a mode, Copilot:
- Prefixes every reply with `[<MODE>]`
- Refuses off-scope requests and redirects to the right mode
- Holds the mode until the user explicitly switches

If a Copilot reply lacks the `[<MODE>]` prefix in mode context, treat it as drift and re-issue the mode command.

## Skill rendering

A skill may exist in both `prompts/` (invokable) and `instructions/` (auto-attached). `/git` and `/data-model` are dual-use today. Other skills are prompts-only.

## What this file does NOT do

- It does NOT replace mode prompts. Mode behaviour lives in `.github/prompts/<mode>.prompt.md`.
- It does NOT carry full skill bodies. Skill behaviour lives in `.github/prompts/<skill>.prompt.md` (and `.github/instructions/<skill>.instructions.md` for dual-use ones).
- It does NOT emit lint rules. Linter config (`pyproject.toml`, `.eslintrc.json`) is owned by the project; the pre-commit hook (D29) enforces it at commit time.
- It does NOT write `.vscode/`, `.idea/`, or any editor config (D33). VS Code lint-on-save is a 4-line copy-paste recipe in the adoption page, configured once by the user.
```

### 6.2 What was dropped vs the current adapter

| Section in current `copilot-instructions.md` | Status in new version | Lands where instead |
|----------------------------------------------|-----------------------|---------------------|
| `## Modes` (full inline dump of all 14 modes) | **Dropped** | Each mode now a separate file in `prompts/` |
| `## Skills (reference)` table | **Kept, slimmed** — replaced by the "Prompt library" section above | Skill bodies live in `prompts/` and `instructions/` |
| `## Path conventions` | **Kept**, updated for `.copilot/` (D3) | — |
| Forbidden patterns | **New** — added (was implicit before) | Always-loaded text |
| Context discovery | **New** — added per D17 | Always-loaded text |
| Arch-drift baseline | **New** — added | Always-loaded text + `instructions/arch-drift.instructions.md` |

---

## 7. Hook coverage — surrogate text and templates

Lifted from the parent plan's "Hook coverage in Copilot" section. This is the authoritative table for Phase 2 implementation.

### 7.1 Hook → Copilot-surface mapping

| pai-orbit hook (source) | Lands in (Copilot surface) | Mechanism | Enforcement |
|-------------------------|----------------------------|-----------|-------------|
| `bash-guard.sh` (block force-push, `git add -A`, hook-bypass, destructive `rm -rf`) | `copilot-instructions.md` → `## Forbidden patterns` (§6.1) | Always-loaded text every Copilot Chat turn reads | **Advisory.** Copilot is told never to suggest these; usually obeys. |
| `bash-guard.sh` — real enforcement | `.husky/pre-commit.template` and/or `.pre-commit-config.yaml.template` (D29) | Git pre-commit hook, optional opt-in at install | **Enforced** at commit time, regardless of which AI tool produced the change. |
| `lint-python.sh` (post-edit `ruff check`) | Project's `pyproject.toml` (existing) + pre-commit hook (D29) | Commit-time invocation of project's linter | **Enforced at commit time for every editor.** VS Code save-time is a user-opt-in recipe in the adoption page. |
| `lint-ts.sh` (post-edit `eslint`) | Project's `.eslintrc.json` (existing) + pre-commit hook (D29) | Commit-time invocation of project's linter | **Enforced at commit time for every editor.** VS Code save-time is a user-opt-in recipe in the adoption page. |
| `arch-drift-guard.sh` (advisory nudge on structural edits) | `copilot-instructions.md` → `## Architectural drift` section (§6.1) + `.github/instructions/arch-drift.instructions.md` (path-scoped) | Always-loaded text + path-scoped auto-attach | **Advisory.** Copilot self-warns before suggesting structural changes. |

### 7.2 `instructions/arch-drift.instructions.md` body

```yaml
---
applyTo: "**/docker-compose.yml, **/docker-compose.yaml, **/package.json, **/go.mod, **/pom.xml, **/Cargo.toml, **/pyproject.toml, **/requirements.txt, **/fly.toml, **/vercel.json, **/app.yaml, **/main.py, **/app.py, **/index.ts, **/index.js, **/server.ts, **/server.js"
---

# Architectural drift guard

This file just changed or is about to change. It is a **structural signal** — its edits often reflect architectural changes (dependencies added, services moved, framework swapped, runtime configured).

Before proposing or accepting an edit here:
1. Confirm the change is actually needed — not a side-effect of an unrelated task.
2. Note that this change may shift architecture. Suggest the user run `/arch validate` after the session to check alignment with `docs/architecture/system.md` and `docs/architecture/constraints.md`.
3. Cross-check `docs/architecture/constraints.md` if it exists — the constraint may forbid the change.
4. If the edit adds a new service, language, or major dependency, suggest writing an ADR in `docs/decisions/` before merging.

This is advisory — proceed if the user confirms, but make the architectural cost visible.
```

The glob list mirrors `STRUCTURAL_PATTERNS` in `core/hooks/arch-drift-guard.sh` (audited 2026-06-28). Phase 2 must keep these in sync; a drift between the hook script and the instructions file is a future bug.

### 7.3 `.husky/pre-commit.template` content

```bash
#!/usr/bin/env bash
# pai-orbit pre-commit hook (husky variant)
# Rename this file to .husky/pre-commit and `chmod +x` to activate.
# After install on Windows, also run:
#   git update-index --add --chmod=+x .husky/pre-commit
# so the exec bit is tracked in the repo (D21).
set -e

# bash-guard intent — block force-push, bulk staging, hook-bypass, destructive rm

# Reject if any staged change includes an attempt to force-push elsewhere is moot here —
# pre-commit only sees the commit content, not the push. The force-push block lives in the
# pre-push hook conceptually; for now we focus on what pre-commit can actually catch.

# Block: a commit that contains a hook-bypass instruction in its body or any staged file content
if git log -1 --format=%B HEAD 2>/dev/null | grep -q -- '--no-verify' ; then
  : # Informational only — pre-commit cannot block the current commit's message.
fi

# Block: presence of common secret patterns in staged files (light heuristic — full secret-scanning
# is the project's responsibility via dedicated tools; this is a tripwire).
if git diff --cached --name-only -z | xargs -0 -I{} grep -l -E '(AWS_SECRET_ACCESS_KEY|PRIVATE KEY-----)' {} 2>/dev/null | head -1 | grep -q . ; then
  echo "pai-orbit pre-commit: suspected secret in staged file. Refusing commit." >&2
  echo "  If this is intentional (test fixture, doc example), un-stage and re-stage with explicit confirmation." >&2
  exit 1
fi

# Lint Python — invoke project's ruff if pyproject.toml exists in repo root
if [ -f pyproject.toml ] && command -v ruff >/dev/null 2>&1 ; then
  ruff check --quiet $(git diff --cached --name-only --diff-filter=ACM | grep -E '\.py$' || true) || {
    echo "pai-orbit pre-commit: ruff lint failed. Fix or amend." >&2
    exit 1
  }
fi

# Lint JS/TS — invoke project's eslint if .eslintrc.json or .eslintrc.cjs exists
if { [ -f .eslintrc.json ] || [ -f .eslintrc.cjs ] || [ -f eslint.config.js ]; } && command -v npx >/dev/null 2>&1 ; then
  staged_js_ts=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|jsx|ts|tsx|mjs|cjs)$' || true)
  if [ -n "$staged_js_ts" ]; then
    npx --no-install eslint $staged_js_ts || {
      echo "pai-orbit pre-commit: eslint failed. Fix or amend." >&2
      exit 1
    }
  fi
fi

exit 0
```

Open question #1: this template assumes husky has rendered the husky shim line (`#!/usr/bin/env bash` is enough on husky v8+; older husky needed `. "$(dirname -- "$0")/_/husky.sh"`). Phase 2 picks one of two paths:
- **Husky-only path** — assume husky v9+ (current stable), ship the above shape. Simpler.
- **Vanilla git path** — ship a parallel `.git/hooks/pre-commit.template` shape that doesn't depend on husky's `_/husky.sh` loader. Bulkier but works for teams that don't use husky.

This is committed to be resolved during Phase 2 emitter implementation; the husky-only path is the current assumption per D29 (husky is one of two D29 installer options).

### 7.4 `.pre-commit-config.yaml.template` content (D29)

```yaml
# pai-orbit pre-commit-framework config
# Rename this file to .pre-commit-config.yaml and run `pre-commit install` to activate.
# Cross-tool — no Node ecosystem assumption; works for Python, .NET, Go, mixed repos.

repos:
  - repo: local
    hooks:
      - id: pai-orbit-block-bulk-staging
        name: pai-orbit — block bulk staging in commit messages
        entry: bash -c 'git log -1 --format=%B HEAD 2>/dev/null | grep -qE "(git add[[:space:]]+\.|git add[[:space:]]+-A|git add[[:space:]]+--all)" && { echo "Bulk-staging mention detected in commit body. Stage specific files."; exit 1; } || exit 0'
        language: system
        stages: [commit-msg]

      - id: pai-orbit-block-no-verify-mention
        name: pai-orbit — block --no-verify in commit body (advisory)
        entry: bash -c 'git log -1 --format=%B HEAD 2>/dev/null | grep -qE -- "--no-verify" && { echo "Commit body mentions --no-verify. Refusing."; exit 1; } || exit 0'
        language: system
        stages: [commit-msg]

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.6.9
    hooks:
      - id: ruff
        args: [--quiet]
        # Only runs if the repo has Python files staged
        types_or: [python, pyi]

  - repo: https://github.com/pre-commit/mirrors-eslint
    rev: v9.13.0
    hooks:
      - id: eslint
        files: \.(js|jsx|ts|tsx|mjs|cjs)$
        # Picks up the project's eslint config
        additional_dependencies: []
```

Both templates implement the same intent (block dangerous patterns at commit time, run project linters). The user picks at install time which to activate (D29) — or activates both, or neither.

---

## 8. `context-discovery.instructions.md` body (R8 fall-back)

```yaml
---
applyTo: "**/*"
---

# Context discovery — fall-back

If `.github/copilot-instructions.md` is loaded, you already have these directives from its `## Context discovery` section. This file duplicates the directives so they reach Copilot via two channels — instructions files (auto-attach) and the always-loaded instructions file.

At session start, read each of the following that exists. If absent, proceed without — do not invent contents.

1. `.copilot/pai-orbit-config.md` — board, branch model, deploy targets, docs home, team conventions
2. `.copilot/team.md` — team members, owners, default assignees
3. `CLAUDE.md` — project description, stack, key files, data model, auth
4. `docs/architecture/constraints.md` — architectural rules
5. `docs/architecture/system.md` — service inventory and inter-service communication
6. `docs/architecture/stack.md` — language and framework choices
7. `docs/decisions/` — ADRs
8. `docs/domain/*.md` — business rules and expert knowledge
9. `docs/features/<feature>/requirements.md` — when working on a known feature

When the user asks a project-specific question (deploy target, team owner, architecture rule, business rule), answer from these files. Do not fall back to generic knowledge unless the user explicitly asks for a generic answer.
```

This duplication is intentional and is the documented fall-back for the medium-likelihood risk that Copilot Free does not honour `copilot-instructions.md`'s `## Context discovery` section consistently. Validated in Phase 4 task 8.

---

## 9. Description prefix convention (D20)

The Copilot slash-command picker shows 25 entries — without prefixes, users cannot tell mode from skill from agent at a glance.

| Prefix | Used by | Count |
|--------|---------|-------|
| `[mode]` | Mode prompts | 12 |
| `[skill]` | Skill prompts | 6 |
| `[agent]` | Service-builder agent prompts | 7 |

Prefix is **lower-case, square-bracketed, single space before the description text**. Examples:

- `description: "[mode] Groom feature requirements — purpose, scenarios, then acceptance criteria."`
- `description: "[skill] Git operations — commit, branch, PR, push — following project conventions."`
- `description: "[agent] FastAPI service implementation — routers, services, DB queries, middleware."`

The `verify-dist.sh` script (Phase 2 deliverable, not this design's scope) asserts that every emitted prompt file's `description:` matches `^\[(mode|skill|agent)\] `.

---

## 10. Open questions to resolve during Phase 2

These two items are intentionally Phase-2 discovery items, not Phase-1 design gaps. They require running the build script and inspecting/validating output to resolve — design can specify both possibilities but cannot pick without empirical signal.

### 10.1 Husky template style

**Question.** Should `.husky/pre-commit.template` assume husky v9+ is installed (and rely on husky's shim machinery), or ship as a plain `.git/hooks/pre-commit.template` shape that works in any git repo without husky?

**Default for Phase 2:** husky v9+ shape (as written in §7.3). Rationale:
- Husky v9 is current stable and lets `#!/usr/bin/env bash` work without `. "$(dirname -- "$0")/_/husky.sh"`.
- Non-husky teams already have the `.pre-commit-config.yaml.template` (D29) path, which doesn't require husky at all.
- Shipping a third "vanilla git hooks" template would triplicate effort for low marginal value.

**Trigger for revisit:** if Phase 4 validation finds husky v8 or earlier is common in PSI projects, swap to the explicit shim format.

### 10.2 `applyTo:` glob breadth

**Question.** What is the broadest `applyTo:` glob Copilot accepts on `.github/instructions/*.instructions.md`? `**/*` is the assumption.

**Default for Phase 2:** ship `**/*` for the two always-on instructions files (`git`, `context-discovery`) and observe Copilot's behaviour during Phase 4 validation.

**Fall-back if `**/*` is rejected:**
- For `git.instructions.md`: per-language splits — `"**/*.{md,yml,yaml,json,toml,sh,bash,gitignore,gitattributes}"` plus a separate `git-code.instructions.md` for code files (`"**/*.{ts,tsx,js,jsx,py,go,cs,rs,java}"`).
- For `context-discovery.instructions.md`: same per-language split.

Both fall-backs are mechanical — they don't require redesigning the body, only re-emitting the frontmatter glob. Phase 2 implementation should structure the emitter so the glob is a constant at the top of the script, not hardcoded across multiple call sites.

---

## 11. Out of scope for this design

These are explicitly excluded from Phase 1's design surface:
- **Adapter script implementation** — Phase 2. This doc specifies what the script must emit; the bash plumbing is Phase 2's problem.
- **Install CLI** (`npx ... init copilot`) — Phase 3b. This doc specifies what the install layout looks like; the CLI's interview flow, lifecycle detection, and rendering logic are Phase 3b's problem.
- **`/setup` mode update** — Phase 3.
- **Adoption page** — Phase 5.
- **`verify-dist.sh` and `dist-freshness.yml`** — Phase 2 deliverables. This doc references them as guardrails; their content is out of scope here.
- **Validation in a live test project** — Phase 4. Resolves the two §10 discovery items empirically.
- **Security-review skill** — does not exist in `core/skills/` (audit 2026-06-28). Filed as a follow-up feature, not in v1 Copilot output.
- **Canonical YAML frontmatter across all modes/skills** — Phase 1 of the broader multi-tool-compat epic. This adapter reads existing source files as they are.

---

## 12. Cross-references

- Parent plan: [docs/plans/copilot-adapter-upgrade-2026-06-28.md](../../plans/copilot-adapter-upgrade-2026-06-28.md)
- Epic: [docs/epics/multi-tool-compat/EPIC.md](../../epics/multi-tool-compat/EPIC.md)
- Reference implementation: [github.com/affaan-m/ecc](https://github.com/affaan-m/ecc)
- Existing adapter (to be rewritten): [plugins/pai-orbit/adapters/copilot/build.sh](../../../plugins/pai-orbit/adapters/copilot/build.sh)
- Source mode files: [plugins/pai-orbit/core/modes/](../../../plugins/pai-orbit/core/modes/)
- Source skill files: [plugins/pai-orbit/core/skills/](../../../plugins/pai-orbit/core/skills/)
- Source agent templates: [plugins/pai-orbit/core/templates/agents/](../../../plugins/pai-orbit/core/templates/agents/)
- Source hooks: [plugins/pai-orbit/core/hooks/](../../../plugins/pai-orbit/core/hooks/)
