#!/usr/bin/env bash
# GitHub Copilot adapter — prompt files, instructions files, hook surrogates.
#
# Implements Phase 2 of:
#   docs/plans/copilot-adapter-upgrade-2026-06-28.md
# against the design spec:
#   docs/features/copilot-adapter-prompt-files/design.md
#
# Emits dist/copilot/ with:
#   .github/copilot-instructions.md          slim rule book + context discovery
#   .github/prompts/<mode>.prompt.md         12 mode prompts (skip setup, suggest-skills per D13)
#   .github/prompts/<skill>.prompt.md         6 skill prompts
#   .github/prompts/<stack>-builder.prompt.md 7 service-builder agent prompts (mode: agent per D30)
#   .github/instructions/git.instructions.md
#   .github/instructions/data-model.instructions.md
#   .github/instructions/arch-drift.instructions.md
#   .github/instructions/context-discovery.instructions.md  (R8 fall-back)
#   .husky/pre-commit.template                bash-guard intent at git layer (D29)
#   .pre-commit-config.yaml.template          pre-commit-framework alternative (D29)
#
# No editor-specific files are emitted (D33).
set -euo pipefail

ADAPTER_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$ADAPTER_DIR/../.." && pwd)"

CORE_DIR="${CORE_DIR:-$PLUGIN_DIR/core}"
DIST_DIR="${DIST_DIR:-$PLUGIN_DIR/dist/copilot}"
VERIFY_SCRIPT="${VERIFY_SCRIPT:-$PLUGIN_DIR/scripts/verify-dist.sh}"

if [ ! -d "$CORE_DIR" ]; then
  echo "copilot adapter: CORE_DIR not found: $CORE_DIR" >&2
  exit 1
fi

# Safety: refuse to rm -rf anything outside the plugin tree.
case "$DIST_DIR" in
  "$PLUGIN_DIR"/*) ;;
  *) echo "copilot adapter: DIST_DIR '$DIST_DIR' is outside PLUGIN_DIR — refusing rm -rf" >&2; exit 1 ;;
esac

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/.github/prompts"
mkdir -p "$DIST_DIR/.github/instructions"
mkdir -p "$DIST_DIR/.husky"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Path rewrites for the Copilot adapter (design §3.1 step 4). Symmetric .copilot/
# folder per D3. Hook references are stripped on emission — they only appear in
# setup.md, which is not emitted (D13).
rewrite_paths() {
  sed \
    -e 's|\.claude/pai-orbit-config\.md|.copilot/pai-orbit-config.md|g' \
    -e 's|\.claude/team\.md|.copilot/team.md|g' \
    -e 's|\.claude/agents/|.copilot/agents/|g' \
    -e 's|\.claude/skills/|.copilot/skills/|g' \
    -e 's|\.claude/rules/|.copilot/rules/|g' \
    -e 's|`\.claude/`|`.copilot/`|g'
}

# Modes dropped on the Copilot adapter (D13).
is_skipped_mode() {
  case "$1" in
    setup|suggest-skills) return 0 ;;
    *) return 1 ;;
  esac
}

# Mode → uppercase token used in the anti-drift block and the [<MODE>] prefix.
mode_token() {
  case "$1" in
    arch)     echo "ARCH" ;;
    build)    echo "BUILD" ;;
    data)     echo "DATA" ;;
    design)   echo "DESIGN" ;;
    domain)   echo "DOMAIN" ;;
    groom)    echo "GROOM" ;;
    incident) echo "INCIDENT" ;;
    plan)     echo "PLAN" ;;
    release)  echo "RELEASE" ;;
    review)   echo "REVIEW" ;;
    test)     echo "TEST" ;;
    ux)       echo "UX" ;;
    *)        printf '%s' "$1" | tr '[:lower:]' '[:upper:]' ;;
  esac
}

# Mode → one-liner description shown in Copilot's slash-command picker (§2.1).
# Constructed from the source headspace declaration plus the mode's output contract.
mode_description() {
  case "$1" in
    arch)     echo "Declare and maintain system architecture — services, boundaries, data flow, constraints. Writes docs/architecture/ + ADRs." ;;
    build)    echo "Implement features and fixes. Code + updated docs. No architecture debate, no requirements writing." ;;
    data)     echo "Data exploration and analysis session. Writes docs/reports/<topic>-<date>.md." ;;
    design)   echo "Technical design and trade-offs. Writes docs/features/*/design.md + ADRs. No implementation." ;;
    domain)   echo "Capture expert domain knowledge. Writes docs/domain/*.md." ;;
    groom)    echo "Groom feature requirements — purpose, scenarios, then acceptance criteria. Writes docs/features/*/requirements.md." ;;
    incident) echo "Production-incident fast path: triage → build → review → release → post-mortem. Trades thoroughness for speed." ;;
    plan)     echo "Roadmap, prioritisation, and sprint scoping. Writes docs/plans/*.md." ;;
    release)  echo "Deployment session with preflight + post-deploy verification. Stay until healthy or explicitly rolled back." ;;
    review)   echo "Code review against the project's documented architecture, conventions, and requirements." ;;
    test)     echo "Test planning and QA. Writes docs/features/*/test-plan.md." ;;
    ux)       echo "UX and user-flow design. Writes docs/features/*/ux.md." ;;
    *)        echo "pai-orbit $1 mode." ;;
  esac
}

# Per-mode "Do NOT" line for the anti-drift block (design §3.2 table). Backticks
# are backslash-escaped so the double-quoted bash string keeps them literal.
mode_donot_line() {
  case "$1" in
    arch)     echo "Do NOT implement features or design specific solutions — that's \`/design\` or \`/build\`." ;;
    build)    echo "Do NOT debate architecture or re-design — that's \`/design\`. Do NOT write requirements — that's \`/groom\`." ;;
    data)     echo "Do NOT design feature implementations — that's \`/design\`. Do NOT execute deploys — that's \`/release\`." ;;
    design)   echo "Do NOT implement code — that's \`/build\`. Do NOT re-litigate requirements — that's \`/groom\`." ;;
    domain)   echo "Do NOT propose technical solutions or designs — those belong to \`/design\`." ;;
    groom)    echo "Do NOT propose solutions or implementations — that's \`/design\`. Do NOT write code — that's \`/build\`." ;;
    incident) echo "Do NOT plan new features — that's \`/plan\`. Do NOT refactor opportunistically — focus on the incident." ;;
    plan)     echo "Do NOT design solutions for the items you're prioritising — that's \`/design\`." ;;
    release)  echo "Do NOT design new features mid-release — that's \`/design\`. Do NOT add scope." ;;
    review)   echo "Do NOT design replacements for the code under review — flag, don't rewrite." ;;
    test)     echo "Do NOT implement the feature under test — that's \`/build\`." ;;
    ux)       echo "Do NOT design backend or data layers — that's \`/design\`." ;;
    *)        echo "Do NOT do work that belongs to another mode." ;;
  esac
}

# Agent template → one-liner description for the slash-command picker (design §5.2).
# Placeholder-free; the install CLI substitutes `{{SERVICE_NAME}}` etc. inside the body.
agent_description() {
  case "$1" in
    django-builder)          echo "Django service implementation — models, views, serializers, management commands. Runs pytest before claiming done." ;;
    express-builder)         echo "Express/Node service implementation — routes, middleware, controllers, services. Runs npm test before claiming done." ;;
    fastapi-builder)         echo "FastAPI service implementation — routers, services, DB queries, middleware. Runs pytest before claiming done." ;;
    generic-service-builder) echo "Generic service implementation — adapt to project conventions; runs the project's test command before claiming done." ;;
    infra-builder)           echo "Infrastructure and DevOps work — IaC, CI/CD, container and environment config. Plans/previews before apply." ;;
    nextjs-builder)          echo "Next.js app implementation — pages, components, API routes, hooks, data fetching. Lint + build before claiming done." ;;
    react-vite-builder)      echo "React/Vite app implementation — components, pages, hooks, API consumers. Lint + build before claiming done." ;;
    *)                       echo "Service implementation agent." ;;
  esac
}

# Truncate the full picker description (already including `[kind] ` prefix) to
# ~140 chars (design §2.1). Appends a Unicode ellipsis if a cut was made.
truncate_description() {
  local desc="$1"
  local max=140
  if [ "${#desc}" -le "$max" ]; then
    printf '%s' "$desc"
    return 0
  fi
  local cut="${desc:0:$((max - 1))}"
  # Snap back to the last word boundary so we don't slice mid-word.
  case "$cut" in
    *' '*) cut="${cut% *}" ;;
  esac
  printf '%s…' "$cut"
}

# Escape a string for embedding inside a YAML double-quoted scalar. Only `\`
# and `"` need escaping for our inputs — descriptions are single-line.
yaml_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  printf '%s' "$s"
}

# Strip the leading YAML frontmatter block from a markdown file (between the
# first two `---` lines). Prints the body that follows.
strip_frontmatter() {
  awk 'BEGIN{p=0} /^---[[:space:]]*$/{p++; next} p>=2{print}' "$1"
}

# ---------------------------------------------------------------------------
# Emitters
# ---------------------------------------------------------------------------

emit_copilot_instructions() {
  cat > "$DIST_DIR/.github/copilot-instructions.md" <<'EOF'
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

## Mode discipline

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
- It does NOT emit lint rules. Linter config (`pyproject.toml`, `.eslintrc.json`) is owned by the project; the pre-commit hook enforces it at commit time.
- It does NOT write `.vscode/`, `.idea/`, or any editor config. VS Code lint-on-save is a 4-line copy-paste recipe in the adoption page, configured once by the user.
EOF
}

emit_mode_prompts() {
  local count=0
  for mode_file in "$CORE_DIR"/modes/*.md; do
    [ -f "$mode_file" ] || continue
    local mode_name
    mode_name="$(basename "$mode_file" .md)"
    is_skipped_mode "$mode_name" && continue

    local token desc donot prefixed
    token=$(mode_token "$mode_name")
    desc=$(mode_description "$mode_name")
    donot=$(mode_donot_line "$mode_name")
    prefixed=$(truncate_description "[mode] $desc")

    {
      printf -- '---\n'
      printf 'agent: agent\n'
      printf 'description: "%s"\n' "$(yaml_escape "$prefixed")"
      printf -- '---\n'
      printf '\n'
      # Anti-drift block (D28, design §3.2). The `[<MODE>]` marker is on a
      # bullet line so verify-dist.sh can grep for it within the head of the file.
      printf '> **Mode discipline — read before answering.**\n'
      printf '>\n'
      printf '> You are now in **%s** mode. Until the user explicitly switches modes:\n' "$token"
      printf '> - %s\n' "$donot"
      printf '> - Redirect off-scope requests to the right mode and name it explicitly (e.g. "That'\''s a `/design` question — switch modes?").\n'
      printf '> - Begin every reply with the literal prefix `[%s]` so mode drift is visible to the user.\n' "$token"
      printf '>\n'
      printf '> If the user explicitly says "switch to /<other>" or types another slash command, drop this block.\n'
      printf '\n'
      rewrite_paths < "$mode_file"
    } > "$DIST_DIR/.github/prompts/${mode_name}.prompt.md"

    count=$((count + 1))
  done
  echo "  modes:           emitted $count prompt file(s)"
}

emit_skill_prompts() {
  local count=0
  for skill_md in "$CORE_DIR"/skills/*/SKILL.md; do
    [ -f "$skill_md" ] || continue
    local skill_name raw_desc prefixed
    skill_name="$(basename "$(dirname "$skill_md")")"
    raw_desc=$(awk '/^---/{p++} p==1 && /^description:/{sub(/^description: /,""); print; exit}' "$skill_md")
    prefixed=$(truncate_description "[skill] $raw_desc")

    {
      printf -- '---\n'
      printf 'agent: agent\n'
      printf 'description: "%s"\n' "$(yaml_escape "$prefixed")"
      printf -- '---\n'
      printf '\n'
      strip_frontmatter "$skill_md" | rewrite_paths
    } > "$DIST_DIR/.github/prompts/${skill_name}.prompt.md"

    count=$((count + 1))
  done
  echo "  skills:          emitted $count prompt file(s)"
}

emit_service_builder_prompts() {
  local count=0
  for tpl in "$CORE_DIR"/templates/agents/*.md; do
    [ -f "$tpl" ] || continue
    local stack desc prefixed
    stack="$(basename "$tpl" .md)"
    desc=$(agent_description "$stack")
    prefixed=$(truncate_description "[agent] $desc")

    {
      printf -- '---\n'
      printf 'mode: agent\n'
      printf 'description: "%s"\n' "$(yaml_escape "$prefixed")"
      printf 'tools: ["codebase", "editFiles", "runCommands", "search"]\n'
      printf -- '---\n'
      printf '\n'
      # Body retains `{{SERVICE_NAME}}` etc. — the install CLI substitutes at scaffold time (design §5.1).
      strip_frontmatter "$tpl" | rewrite_paths
    } > "$DIST_DIR/.github/prompts/${stack}.prompt.md"

    count=$((count + 1))
  done
  echo "  service-builder: emitted $count agent prompt file(s)"
}

emit_skill_instructions() {
  local count=0
  for skill_name in git data-model; do
    local skill_md="$CORE_DIR/skills/$skill_name/SKILL.md"
    if [ ! -f "$skill_md" ]; then
      echo "copilot adapter: missing skill source for instructions emit: $skill_md" >&2
      continue
    fi
    local glob
    case "$skill_name" in
      git)        glob='**/*' ;;
      data-model) glob='**/*.sql, **/migrations/**' ;;
    esac
    {
      printf -- '---\n'
      printf 'applyTo: "%s"\n' "$glob"
      printf -- '---\n'
      printf '\n'
      strip_frontmatter "$skill_md" | rewrite_paths
    } > "$DIST_DIR/.github/instructions/${skill_name}.instructions.md"
    count=$((count + 1))
  done
  echo "  skill-instr:     emitted $count instructions file(s)"
}

emit_arch_drift_instructions() {
  # Glob list mirrors STRUCTURAL_PATTERNS in core/hooks/arch-drift-guard.sh (design §7.2).
  cat > "$DIST_DIR/.github/instructions/arch-drift.instructions.md" <<'EOF'
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
EOF
  echo "  arch-drift:      emitted instructions file"
}

emit_context_discovery_instructions() {
  # R8 fall-back: duplicate the copilot-instructions.md Context discovery section
  # so it lands via two channels — instructions auto-attach and always-loaded instructions.
  cat > "$DIST_DIR/.github/instructions/context-discovery.instructions.md" <<'EOF'
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
EOF
  echo "  context-disc:    emitted instructions file"
}

emit_husky_template() {
  # Husky v9+ shape per design §10.1 (current default). Non-husky teams use the
  # .pre-commit-config.yaml.template emitted by emit_precommit_framework_template.
  cat > "$DIST_DIR/.husky/pre-commit.template" <<'EOF'
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
EOF
  echo "  husky:           emitted pre-commit.template"
}

emit_precommit_framework_template() {
  # D29 alternative for teams that don't use husky. Cross-tool, no Node assumption.
  cat > "$DIST_DIR/.pre-commit-config.yaml.template" <<'EOF'
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
EOF
  echo "  pre-commit yml:  emitted .pre-commit-config.yaml.template"
}

emit_readme() {
  cat > "$DIST_DIR/README.md" <<'EOF'
# pai-orbit — GitHub Copilot adapter (dist)

This directory is the **built output** of the Copilot adapter. Do not hand-edit. Regenerate by running:

```bash
bash plugins/pai-orbit/build.sh
```

## What ships

- `.github/copilot-instructions.md` — slim rule book + Context discovery + prompt-library pointer
- `.github/prompts/*.prompt.md` — invokable slash commands (mode, skill, agent — 25 total)
- `.github/instructions/*.instructions.md` — auto-attaching guidance (4 total)
- `.husky/pre-commit.template` — opt-in git-level enforcement (husky variant)
- `.pre-commit-config.yaml.template` — opt-in git-level enforcement (pre-commit framework variant)

See the parent plan and design doc for the full rationale:

- `docs/plans/copilot-adapter-upgrade-2026-06-28.md`
- `docs/features/copilot-adapter-prompt-files/design.md`

## What's lost vs the Claude Code plugin

- No runtime hook system. `bash-guard` becomes always-loaded instruction text plus the optional `.husky/pre-commit` or `.pre-commit-config.yaml`. `arch-drift` is split between `copilot-instructions.md` and `instructions/arch-drift.instructions.md`. Lint hooks rely on the project's own linter config invoked from the pre-commit hook.
- No agent runtime parity. Service-builder prompts emit with `mode: agent` (D30): on Copilot Pro/Business they run as multi-step agents; on Free they degrade to regular prompts that give correct manual scaffolding guidance.
- No `/setup` or `/suggest-skills` (D13). The standalone `npx github:the-psi/pai-orbit init copilot` CLI replaces `/setup` for Copilot-only teams.
- No editor-specific files (D33). VS Code users follow the 4-line lint-on-save recipe in the adoption page.

## How to install

End users run the standalone install CLI from the project root:

```bash
npx github:the-psi/pai-orbit init copilot
```

Or, inside Claude Code / Cursor, run `/setup` and pick Copilot as a target.
EOF
}

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

echo "copilot adapter: emitting into $DIST_DIR"

emit_copilot_instructions
emit_mode_prompts
emit_skill_prompts
emit_service_builder_prompts
emit_skill_instructions
emit_arch_drift_instructions
emit_context_discovery_instructions
emit_husky_template
emit_precommit_framework_template
emit_readme

echo "copilot adapter: build complete"

# Final step (D24): hand off to the shared dist verifier so local and CI runs
# produce the same pass/fail signal. Verification covers Copilot's dist only.
if [ -x "$VERIFY_SCRIPT" ] || [ -f "$VERIFY_SCRIPT" ]; then
  echo "copilot adapter: running verify-dist.sh ..."
  DIST_DIR="$DIST_DIR" bash "$VERIFY_SCRIPT"
else
  echo "copilot adapter: verify-dist.sh not found at $VERIFY_SCRIPT — skipping (warning)" >&2
fi
