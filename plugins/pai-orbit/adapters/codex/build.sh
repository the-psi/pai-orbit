#!/usr/bin/env bash
# OpenAI Codex CLI adapter — full-parity build.
#
# Emits dist/codex/ containing:
#   AGENTS.md, .agents/skills/ (20 skills), .codex/agents/ (2 TOML subagents),
#   .codex/hooks/ + .codex/hooks.json, .codex/config.toml, .codex/templates/,
#   README.md.
#
# Install is via the npx CLI at plugins/pai-orbit/adapters/codex/install.js
# (declared in the root package.json bin entry). No install.sh / install.ps1
# is emitted; one cross-platform install path via `npx github:<repo> init codex`.
#
# Adapter is zero-core-edit: everything Codex-specific happens here.

set -euo pipefail

ADAPTER_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$ADAPTER_DIR/../.." && pwd)"

CORE_DIR="${CORE_DIR:-$PLUGIN_DIR/core}"
DIST_DIR="${DIST_DIR:-$PLUGIN_DIR/dist/codex}"

GITHUB_REPO="${GITHUB_REPO:-the-psi/pai-orbit}"
DIST_REL="plugins/pai-orbit/dist/codex"

if [ ! -d "$CORE_DIR" ]; then
  echo "codex adapter: CORE_DIR not found: $CORE_DIR" >&2
  exit 1
fi

case "$DIST_DIR" in
  "$PLUGIN_DIR"/dist/*) ;;
  *) echo "codex adapter: DIST_DIR '$DIST_DIR' is outside plugin dist — refusing rm -rf" >&2; exit 1 ;;
esac

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/.agents/skills" \
         "$DIST_DIR/.codex/agents" \
         "$DIST_DIR/.codex/hooks" \
         "$DIST_DIR/.codex/templates"

# ── Path rewrites ───────────────────────────────────────────────────────────
# Every emitted file under dist gets these substitutions applied.
# Rewrites do NOT touch docs/plans/ path strings (guarded via post-build check).
rewrite_paths_in_place() {
  local file="$1"
  [ -f "$file" ] || return 0
  # macOS/BSD sed vs GNU sed: -i takes different args. Use a temp file for portability.
  # Order matters: specific rewrites first (skills, settings), then the catch-all
  # `.claude/` → `.codex/`. Anything under .claude/ that isn't specifically remapped
  # (e.g. .claude/rules/, .claude/hooks without trailing slash) falls through to .codex/.
  local tmp="${file}.rewrite.tmp"
  sed \
    -e 's|\.claude/skills/|.agents/skills/|g' \
    -e 's|\.claude/settings\.local\.json|.codex/config.toml|g' \
    -e 's|\.claude/settings\.json|.codex/config.toml|g' \
    -e 's|\.claude/|.codex/|g' \
    -e 's|\bCLAUDE\.md\b|AGENTS.md|g' \
    "$file" > "$tmp"
  mv "$tmp" "$file"
}

# Mode-name rewrites — only applied to files derived from core/modes/plan.md
# and core/modes/review.md (the collided-name modes). Cross-reference rewrites
# (e.g. `/plan` → `$orbit-plan` in other mode bodies) happen in a separate pass.
rewrite_mode_body_plan() {
  local file="$1"
  local tmp="${file}.rewrite.tmp"
  sed \
    -e 's|PLAN MODE|ORBIT-PLAN MODE|g' \
    -e 's|name: plan|name: orbit-plan|g' \
    "$file" > "$tmp"
  mv "$tmp" "$file"
}

rewrite_mode_body_review() {
  local file="$1"
  local tmp="${file}.rewrite.tmp"
  sed \
    -e 's|REVIEW MODE|ORBIT-REVIEW MODE|g' \
    -e 's|name: review|name: orbit-review|g' \
    "$file" > "$tmp"
  mv "$tmp" "$file"
}

# Cross-reference rewrites — inside every emitted mode/skill body, rewrite
# `/plan` → `$orbit-plan` and `/review` → `$orbit-review` (including any
# sub-mode suffix like `/review security`, `/review full`) where they appear
# as switch-out targets (backtick-quoted invocation). Anchoring to backticks
# avoids trampling docs/plans/ path strings. The `[^`]*` group captures any
# whitespace/word suffix up to the closing backtick, so `/review security`
# becomes `$orbit-review security`.
rewrite_slash_cross_refs() {
  local file="$1"
  local tmp="${file}.rewrite.tmp"
  sed \
    -e 's|`/plan\([^`]*\)`|`$orbit-plan\1`|g' \
    -e 's|`/review\([^`]*\)`|`$orbit-review\1`|g' \
    "$file" > "$tmp"
  mv "$tmp" "$file"
}

# ── Mode-skill descriptions ─────────────────────────────────────────────────
# Hand-crafted descriptions surfaced in Codex's /skills picker. Under 400 chars
# each; total mode-skill sum well under the 8000-char budget policy (checked
# in the post-build guard).
declare -A MODE_DESCRIPTIONS
MODE_DESCRIPTIONS[arch]="Declare and maintain system architecture. Use when discussing architecture decisions, constraints, tech-stack choices, or system-level design. Writes docs/architecture/ and ADRs to docs/decisions/. Explicit invocation only."
MODE_DESCRIPTIONS[build]="Implement features and fixes. Use for coding sessions where requirements and design are already clear and it's time to write code. Writes code and updates docs/features/<feature>/. Explicit invocation only."
MODE_DESCRIPTIONS[data]="Explore data before coding. Use when a question about the data model, query results, or dataset shape must be answered before implementing. Writes docs/reports/. Explicit invocation only."
MODE_DESCRIPTIONS[design]="Architect a technical solution for a specific feature. Use to weigh trade-offs and record ADRs. Writes docs/features/<feature>/design.md and docs/decisions/. Explicit invocation only."
MODE_DESCRIPTIONS[domain]="Capture domain and expert knowledge. Use when eliciting business rules, invariants, or specialist knowledge from a subject matter expert. Writes docs/domain/. Explicit invocation only."
MODE_DESCRIPTIONS[groom]="Formalize acceptance criteria. Use to convert vague feature requests into structured requirements with unambiguous acceptance criteria. Writes docs/features/<feature>/requirements.md. Explicit invocation only."
MODE_DESCRIPTIONS[incident]="Investigate and record a production incident. Use for post-mortems, root-cause analysis, and remediation planning. Writes docs/reports/incident-<date>.md. Explicit invocation only."
MODE_DESCRIPTIONS[orbit-plan]="Prioritize and sequence work. Use to build a work plan, sequence features, or arrange sprints. Writes docs/plans/. Renamed from plan to avoid Codex's built-in /plan slash command. Explicit invocation only."
MODE_DESCRIPTIONS[orbit-review]="Review code, PRs, or design against pai-orbit conventions and architectural constraints. Writes review notes; suggests follow-ups. Renamed from review to avoid Codex's built-in /review slash command. Explicit invocation only."
MODE_DESCRIPTIONS[release]="Coordinate a release. Use for release planning, cut list, changelog assembly, and deploy sequencing. Writes docs/plans/release-<version>.md. Explicit invocation only."
MODE_DESCRIPTIONS[setup]="Interactive first-run scaffolding. Generates .codex/pai-orbit-config.md, .codex/team.md, .codex/config.toml, docs/ scaffold; fills lint hook repo paths and stack-builder agents. Explicit invocation only."
MODE_DESCRIPTIONS[suggest-skills]="Recommend which pai-orbit skill or mode fits the user's current problem. Use when unsure what to invoke or wanting a guided walkthrough of the framework. Explicit invocation only."
MODE_DESCRIPTIONS[test]="Write test plans and QA scaffolding. Use to plan test coverage, generate scenarios, and design integration tests. Writes docs/features/<feature>/test-plan.md. Explicit invocation only."
MODE_DESCRIPTIONS[ux]="Define user flows and interface behaviour. Use to design UX for a feature before implementation. Writes docs/features/<feature>/ux.md. Explicit invocation only."

# ── 1. AGENTS.md at project root ────────────────────────────────────────────
cp "$ADAPTER_DIR/AGENTS.md" "$DIST_DIR/AGENTS.md"
rewrite_paths_in_place "$DIST_DIR/AGENTS.md"

# ── 2. .codex/config.toml + .codex/pai-orbit-config.md + .codex/team.md ────
# Emit config templates at the target install locations (users fill via $setup).
cp "$ADAPTER_DIR/config.toml.template" "$DIST_DIR/.codex/config.toml"

if [ -f "$CORE_DIR/templates/pai-orbit-config.md.template" ]; then
  cp "$CORE_DIR/templates/pai-orbit-config.md.template" "$DIST_DIR/.codex/pai-orbit-config.md"
  rewrite_paths_in_place "$DIST_DIR/.codex/pai-orbit-config.md"
fi

if [ -f "$CORE_DIR/templates/team.md.template" ]; then
  cp "$CORE_DIR/templates/team.md.template" "$DIST_DIR/.codex/team.md"
  rewrite_paths_in_place "$DIST_DIR/.codex/team.md"
fi

# ── 3. .codex/hooks.json ────────────────────────────────────────────────────
cp "$ADAPTER_DIR/hooks.json.template" "$DIST_DIR/.codex/hooks.json"

# ── 4. .codex/hooks/ scripts ────────────────────────────────────────────────
# Copy the 4 core hook scripts (path-rewritten) plus the 3 wrapper .sh, the 4
# .ps1 variants (including bash-guard.ps1), and the shared Python extractor.
for hook in bash-guard.sh arch-drift-guard.sh lint-python.sh lint-ts.sh; do
  cp "$CORE_DIR/hooks/$hook" "$DIST_DIR/.codex/hooks/$hook"
done

cp "$ADAPTER_DIR/hook-wrappers/arch-drift-wrapper.sh"    "$DIST_DIR/.codex/hooks/arch-drift-wrapper.sh"
cp "$ADAPTER_DIR/hook-wrappers/lint-python-wrapper.sh"   "$DIST_DIR/.codex/hooks/lint-python-wrapper.sh"
cp "$ADAPTER_DIR/hook-wrappers/lint-ts-wrapper.sh"       "$DIST_DIR/.codex/hooks/lint-ts-wrapper.sh"
cp "$ADAPTER_DIR/hook-wrappers/bash-guard.ps1"           "$DIST_DIR/.codex/hooks/bash-guard.ps1"
cp "$ADAPTER_DIR/hook-wrappers/arch-drift-wrapper.ps1"   "$DIST_DIR/.codex/hooks/arch-drift-wrapper.ps1"
cp "$ADAPTER_DIR/hook-wrappers/lint-python-wrapper.ps1"  "$DIST_DIR/.codex/hooks/lint-python-wrapper.ps1"
cp "$ADAPTER_DIR/hook-wrappers/lint-ts-wrapper.ps1"      "$DIST_DIR/.codex/hooks/lint-ts-wrapper.ps1"
cp "$ADAPTER_DIR/hook-wrappers/_extract-touched-paths.py" "$DIST_DIR/.codex/hooks/_extract-touched-paths.py"

# Path-rewrite the Bash scripts (in case any reference .claude/ paths)
for f in "$DIST_DIR"/.codex/hooks/*.sh; do
  rewrite_paths_in_place "$f"
done

chmod +x "$DIST_DIR"/.codex/hooks/*.sh 2>/dev/null || true

# ── 5. .agents/skills/ — 6 operational skills ──────────────────────────────
for skill_dir in "$CORE_DIR"/skills/*/; do
  skill_name="$(basename "$skill_dir")"
  dest_dir="$DIST_DIR/.agents/skills/$skill_name"
  mkdir -p "$dest_dir"
  cp -R "$skill_dir"/. "$dest_dir/"
  # Path-rewrite + slash-command cross-ref rewrite on every text file under the
  # skill dir (operational skills may reference /plan, /review, etc. as
  # switch-out targets — those must become $orbit-plan, $orbit-review on Codex).
  while IFS= read -r -d '' f; do
    rewrite_paths_in_place "$f"
    rewrite_slash_cross_refs "$f"
  done < <(find "$dest_dir" \( -name '*.md' -o -name '*.mdc' -o -name '*.template' \) -print0)
done

# ── 6. .agents/skills/ — 14 mode skills (with openai.yaml gate) ────────────
emit_mode_skill() {
  local mode_source="$1"        # e.g. .../core/modes/build.md
  local skill_dirname="$2"      # e.g. build, orbit-plan, orbit-review
  local frontmatter_name="$3"   # e.g. build, orbit-plan, orbit-review
  local skill_dir="$DIST_DIR/.agents/skills/$skill_dirname"
  local skill_md="$skill_dir/SKILL.md"
  local desc="${MODE_DESCRIPTIONS[$skill_dirname]:-}"

  if [ -z "$desc" ]; then
    echo "codex adapter: missing description for mode skill '$skill_dirname'" >&2
    exit 1
  fi

  mkdir -p "$skill_dir/agents"

  # Emit SKILL.md with synthesized YAML frontmatter + mode body
  {
    echo "---"
    printf 'name: "%s"\n' "$frontmatter_name"
    # Quote description; escape any inner double quotes.
    printf 'description: "%s"\n' "${desc//\"/\\\"}"
    echo "---"
    echo ""
    cat "$mode_source"
  } > "$skill_md"

  # Emit agents/openai.yaml gate — mode skills are explicit invocation only.
  cat > "$skill_dir/agents/openai.yaml" <<YAML
interface:
  display_name: "${frontmatter_name}"
  short_description: "pai-orbit mode: ${frontmatter_name}"
  default_prompt: "Use \$${frontmatter_name} to enter this mode."

policy:
  allow_implicit_invocation: false
YAML

  # Apply orbit-plan / orbit-review body rewrites where relevant
  case "$skill_dirname" in
    orbit-plan)   rewrite_mode_body_plan   "$skill_md" ;;
    orbit-review) rewrite_mode_body_review "$skill_md" ;;
  esac

  # Standard path rewrites + cross-reference rewrites on every mode body
  rewrite_paths_in_place "$skill_md"
  rewrite_slash_cross_refs "$skill_md"
}

# Emit all 14 mode skills. plan → orbit-plan; review → orbit-review.
for mode_file in "$CORE_DIR"/modes/*.md; do
  mode_name="$(basename "$mode_file" .md)"
  case "$mode_name" in
    plan)   emit_mode_skill "$mode_file" orbit-plan   orbit-plan ;;
    review) emit_mode_skill "$mode_file" orbit-review orbit-review ;;
    *)      emit_mode_skill "$mode_file" "$mode_name" "$mode_name" ;;
  esac
done

# Append Codex-specific fragments to setup and suggest-skills skills.
cat "$ADAPTER_DIR/setup-append.md"          >> "$DIST_DIR/.agents/skills/setup/SKILL.md"
cat "$ADAPTER_DIR/suggest-skills-append.md" >> "$DIST_DIR/.agents/skills/suggest-skills/SKILL.md"

# ── 7. .codex/agents/ — TOML subagents from core Markdown+frontmatter ──────
markdown_agent_to_toml() {
  local src="$1"   # core/agents/<name>.md
  local dest="$2"  # dist/codex/.codex/agents/<name>.toml

  # Extract frontmatter fields
  local name description
  name=$(awk '/^---/{p++} p==1 && /^name:/{sub(/^name: */,""); print; exit}' "$src")
  description=$(awk '/^---/{p++} p==1 && /^description:/{sub(/^description: */,""); print; exit}' "$src")

  if [ -z "$name" ] || [ -z "$description" ]; then
    echo "codex adapter: agent $src is missing name or description in frontmatter" >&2
    exit 1
  fi

  # Extract body (everything after the closing ---)
  local body
  body=$(awk 'BEGIN{p=0} /^---/{p++; next} p>=2{print}' "$src")

  # Apply path rewrites to the body
  local body_rewritten
  body_rewritten=$(printf '%s\n' "$body" | sed \
    -e 's|\.claude/skills/|.agents/skills/|g' \
    -e 's|\.claude/settings\.local\.json|.codex/config.toml|g' \
    -e 's|\.claude/settings\.json|.codex/config.toml|g' \
    -e 's|\.claude/|.codex/|g' \
    -e 's|\bCLAUDE\.md\b|AGENTS.md|g')

  # Escape any occurrences of """ inside the body so the TOML triple-quoted
  # string closes correctly. Rare, but defensive.
  body_rewritten=$(printf '%s' "$body_rewritten" | sed 's|"""|\\"\\"\\"|g')

  # Escape " in name/description for TOML
  local name_toml=${name//\"/\\\"}
  local desc_toml=${description//\"/\\\"}

  {
    printf 'name = "%s"\n' "$name_toml"
    printf 'description = "%s"\n' "$desc_toml"
    printf 'developer_instructions = """\n'
    printf '%s\n' "$body_rewritten"
    printf '"""\n'
  } > "$dest"
}

for agent_file in "$CORE_DIR"/agents/*.md; do
  agent_name="$(basename "$agent_file" .md)"
  markdown_agent_to_toml "$agent_file" "$DIST_DIR/.codex/agents/${agent_name}.toml"
done

# ── 8. .codex/templates/ — copy core/templates/ with path rewrites + rename ─
cp -R "$CORE_DIR/templates"/. "$DIST_DIR/.codex/templates/"

# Rename CLAUDE.md.template → AGENTS.md.template
if [ -f "$DIST_DIR/.codex/templates/CLAUDE.md.template" ]; then
  mv "$DIST_DIR/.codex/templates/CLAUDE.md.template" "$DIST_DIR/.codex/templates/AGENTS.md.template"
fi

# Path-rewrite every text file under templates/
while IFS= read -r -d '' f; do
  rewrite_paths_in_place "$f"
done < <(find "$DIST_DIR/.codex/templates" \( -name '*.md' -o -name '*.mdc' -o -name '*.template' \) -print0)

# ── 9. README.md ───────────────────────────────────────────────────────────
# Install is via the npx-distributed Node CLI at
# plugins/pai-orbit/adapters/codex/install.js. This adapter no longer emits
# install.sh / install.ps1 into dist — one cross-platform install path via
# `npx github:the-psi/pai-orbit init codex`.

cat > "$DIST_DIR/README.md" <<EOF
# pai-orbit — OpenAI Codex CLI adapter

Full-parity build of pai-orbit for OpenAI Codex CLI (v0.144.6+).

## Install (no clone required)

Single command, cross-platform (requires Node.js 18+):

\`\`\`bash
npx github:${GITHUB_REPO} init codex
\`\`\`

Pin a specific release with a git ref suffix:

\`\`\`bash
npx github:${GITHUB_REPO}#v1.4.0 init codex
\`\`\`

To re-install and overwrite existing files (upgrade path):

\`\`\`bash
npx github:${GITHUB_REPO} update codex
\`\`\`

The CLI copies every file under \`dist/codex/\` into your project's root.
Under the hood it just runs Node's \`fs.copyFile\`; there's no network fetch
beyond \`npx\`'s initial repo download, no shell requirement, and no
platform-specific script.

## Layout installed into your project

\`\`\`
project-root/
├── AGENTS.md                             # Codex reads at project root
├── .agents/skills/                       # 6 operational + 14 mode skills
├── .codex/agents/                        # docs-writer.toml, cross-repo-impact.toml
├── .codex/hooks/                         # bash-guard, arch-drift-wrapper, lint-*-wrapper (+ .ps1 variants)
├── .codex/hooks.json                     # official nested schema with commandWindows overrides
├── .codex/config.toml                    # approval + sandbox + multi-agent bounds
└── .codex/templates/                     # scaffolding templates (setup consumes these)
\`\`\`

## First-run steps

1. Launch \`codex\` in the project. Trust the project when prompted.
2. Run \`/hooks\` to trust the four registered hooks. Every hook edit invalidates trust — re-run after upgrades.
3. Run \`\\\$setup\` to scaffold \`.codex/pai-orbit-config.md\`, \`.codex/team.md\`, and to fill in the lint hooks' \`repo=\` block.
4. Run \`/skills\` to see the 20 skills.

## Skills

**6 operational skills** — fire implicitly on description match OR explicit as \`\\\$skill-name\`:

- \`analysis\`, \`board\`, \`data-model\`, \`epic\`, \`git\`, \`simplify\`

**14 mode skills** — explicit-only (invoked as \`\\\$mode-name\`; \`agents/openai.yaml\` disables implicit invocation):

- \`arch\`, \`build\`, \`data\`, \`design\`, \`domain\`, \`groom\`, \`incident\`, \`orbit-plan\`, \`orbit-review\`, \`release\`, \`setup\`, \`suggest-skills\`, \`test\`, \`ux\`

Two modes are renamed in the Codex build to avoid ergonomic collision with Codex's built-in slash commands:

- \`plan\` → \`orbit-plan\` (Codex \`/plan\` is a built-in planning mode)
- \`review\` → \`orbit-review\` (Codex \`/review\` is a built-in code review command)

The rename is preventive: \`/plan\` and \`\\\$plan\` live in different namespaces so they don't hard-collide, but the ergonomic overlap causes confusion. Retrain your fingers: on Codex, \`\\\$orbit-plan\` and \`\\\$orbit-review\`.

## Multi-agent primitives (Codex-native)

Codex enables five collaboration tools via \`features.multi_agent\` (stable, default true): \`spawn_agent\`, \`send_input\`, \`resume_agent\`, \`wait_agent\`, \`close_agent\`. The primary agent orchestrates subagents through these tools; use \`/agent\` to switch active agent threads. pai-orbit ships \`docs-writer\` and \`cross-repo-impact\` as native Codex subagents in \`.codex/agents/\`.

## Hooks

Registered in \`.codex/hooks.json\` (nested schema; \`commandWindows\` for Windows overrides):

| Event | Matcher | Script |
|---|---|---|
| \`PreToolUse\` | \`^Bash$\` | \`bash-guard.sh\` (blocks force-push, bulk staging, hook bypass, destructive rm) |
| \`PostToolUse\` | \`^(apply_patch|Edit|Write)$\` | \`arch-drift-wrapper.sh\` (advisory on structural file edits) |
| \`PostToolUse\` | \`^(apply_patch|Edit|Write)$\` | \`lint-python-wrapper.sh\` (runs \`ruff check\` on touched \`.py\`) |
| \`PostToolUse\` | \`^(apply_patch|Edit|Write)$\` | \`lint-ts-wrapper.sh\` (runs \`eslint\` on touched \`.ts\`/\`.tsx\`/\`.js\`/\`.jsx\`) |

Wrappers extract touched paths from the \`apply_patch\` payload using a Primary/Fallback/Future-proof triad and forward per-file Claude-shape JSON to the underlying core lint / arch-drift scripts.

## Path conventions

| Purpose | Codex path |
|---------|-----------|
| Project config | \`.codex/pai-orbit-config.md\` |
| Team roster | \`.codex/team.md\` |
| CLI config | \`.codex/config.toml\` |
| Skills | \`.agents/skills/<name>/SKILL.md\` |
| Subagents | \`.codex/agents/<name>.toml\` |
| Hook scripts | \`.codex/hooks/*.sh\` (+ \`.ps1\` on Windows) |
| Hook registration | \`.codex/hooks.json\` |

## Windows notes

- \`bash-guard.ps1\` is a native PowerShell port and works without Bash. It blocks the same dangerous commands as \`bash-guard.sh\`.
- The advisory wrappers (\`arch-drift-wrapper.ps1\`, \`lint-*-wrapper.ps1\`) invoke the Python extractor natively but shell out to \`bash\` for the core scripts. Install Git Bash or WSL if you want the advisory hooks to run. Without Bash they silently no-op.
- \`codex-windows-sandbox-setup.exe\` may fail to launch when \`codex exec\` runs from an unusual working directory. Workaround: pass \`--dangerously-bypass-approvals-and-sandbox\` for automation contexts, or invoke Codex from a directory inside its install root.

## AGENTS.md.override.md

Codex reads \`AGENTS.override.md\` in preference to \`AGENTS.md\` in the same directory when both exist. Useful for local-dev overrides without editing the tracked \`AGENTS.md\`. Add \`AGENTS.override.md\` to your \`.gitignore\` if you use it.

## What's still lost vs the Claude Code plugin

- **Slash-command mode invocation.** Modes ship as \`\\\$mode-name\` skills only; there's no \`/build\`, \`/design\`, etc. Codex removed the flat \`~/.codex/prompts/*.md\` custom-prompt form at 0.117.0. A namespaced \`/prompts:<name>\` form remains in current versions but pai-orbit does not use it.
- **Hook auto-trust.** Codex requires explicit \`/hooks\` trust on first install and after every script edit. Claude Code hooks are active by default.
- **Per-subagent tool restriction.** Claude Code agents can declare \`tools: Read, Grep\`. Codex subagents inherit tools from the parent by default; finer scoping is possible via \`mcp_servers\` / \`skills.config\` overrides but is coarser.

## Rebuild

\`\`\`bash
bash plugins/pai-orbit/build.sh
\`\`\`

Rebuilds all adapters. To rebuild only Codex: \`bash plugins/pai-orbit/adapters/codex/build.sh\`.
EOF

# ── 12. Post-build guards ──────────────────────────────────────────────────
echo ""
echo "codex adapter: running post-build guards ..."

# Guard A: no .claude/ or CLAUDE.md leaks in emitted files
if grep -rE '\.claude/|CLAUDE\.md' "$DIST_DIR" >/dev/null 2>&1; then
  echo "GUARD FAILED: .claude/ or CLAUDE.md string leaked into $DIST_DIR" >&2
  grep -rnE '\.claude/|CLAUDE\.md' "$DIST_DIR" >&2 | head -20
  exit 1
fi

# Guard B: no emitted skill still tells the user to run /plan or /review
# (Codex's built-ins). Anchor to backtick to avoid matching /planet, etc.
if grep -rE '`/plan`|`/review`' "$DIST_DIR/.agents/skills" >/dev/null 2>&1; then
  echo "GUARD FAILED: emitted skill still references built-in /plan or /review" >&2
  grep -rnE '`/plan`|`/review`' "$DIST_DIR/.agents/skills" >&2 | head -20
  exit 1
fi

# Guard C: docs/plans/ paths still intact (over-rewrite check)
# We don't emit any docs/plans/ references, but if the templates contain them
# they must survive the rewrite pass.
# (Nothing to assert on absence — just don't emit warnings.)

# Guard D: every mode skill has agents/openai.yaml; operational skills do NOT
mode_skills=(arch build data design domain groom incident orbit-plan orbit-review release setup suggest-skills test ux)
operational_skills=(analysis board data-model epic git simplify)

for m in "${mode_skills[@]}"; do
  if [ ! -f "$DIST_DIR/.agents/skills/$m/agents/openai.yaml" ]; then
    echo "GUARD FAILED: missing agents/openai.yaml for mode skill '$m'" >&2
    exit 1
  fi
done

for s in "${operational_skills[@]}"; do
  if [ -f "$DIST_DIR/.agents/skills/$s/agents/openai.yaml" ]; then
    echo "GUARD FAILED: operational skill '$s' should NOT have agents/openai.yaml (implicit invocation default on)" >&2
    exit 1
  fi
done

# Guard E: hooks.json 'command' / 'commandWindows' fields never point at the
# core lint-*.sh / arch-drift-guard.sh scripts directly — they must go through
# the wrappers. (bash-guard.sh is fine; it's a direct PreToolUse port.)
if grep -oE '"(command|commandWindows)"[[:space:]]*:[[:space:]]*"[^"]*"' "$DIST_DIR/.codex/hooks.json" \
   | grep -qE '"[^"]*(lint-python|lint-ts|arch-drift-guard)\.(sh|ps1)"'; then
  echo "GUARD FAILED: hooks.json 'command' or 'commandWindows' points at a core script; must go through wrappers only" >&2
  grep -nE '(lint-python|lint-ts|arch-drift-guard)\.(sh|ps1)' "$DIST_DIR/.codex/hooks.json" >&2 || true
  exit 1
fi

# Guard F: skill description budget policy — sum of descriptions ≤ 8000 chars
total_desc=0
over_500=()
for skill_md in "$DIST_DIR"/.agents/skills/*/SKILL.md; do
  skill_name="$(basename "$(dirname "$skill_md")")"
  desc=$(awk '/^---/{p++} p==1 && /^description:/{sub(/^description: */,""); gsub(/^"|"$/,""); print; exit}' "$skill_md")
  len=${#desc}
  if [ "$len" -gt 500 ]; then
    over_500+=("$skill_name ($len chars)")
  fi
  total_desc=$(( total_desc + len ))
done

if [ "$total_desc" -gt 8000 ]; then
  echo "GUARD FAILED: total skill description length is $total_desc chars, exceeds 8000-char budget" >&2
  exit 1
fi

if [ "${#over_500[@]}" -gt 0 ]; then
  echo "WARNING: the following skill descriptions exceed 500 chars (soft warn):" >&2
  for entry in "${over_500[@]}"; do
    echo "  - $entry" >&2
  done
fi

echo ""
echo "codex adapter: built $DIST_DIR"
echo "  20 skills / description sum: $total_desc chars (budget 8000)"
echo "  2 subagents / 4 hooks + 3 wrappers + PS1 variants"
echo "  README.md, config.toml, hooks.json"
echo "  install: npx github:${GITHUB_REPO} init codex"
