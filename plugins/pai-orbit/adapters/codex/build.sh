#!/usr/bin/env bash
# OpenAI Codex CLI adapter — EXPERIMENTAL, condensed reference guide build.
# Produces AGENTS.md at the dist root (Codex CLI reads AGENTS.md from project root).
# Confirm AGENTS.md is still Codex CLI's convention at install time.
# Full mode/skill content is NOT dumped — condensed summaries are more useful without a command system.
set -euo pipefail

ADAPTER_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$ADAPTER_DIR/../.." && pwd)"

CORE_DIR="${CORE_DIR:-$PLUGIN_DIR/core}"
DIST_DIR="${DIST_DIR:-$PLUGIN_DIR/dist/codex}"

if [ ! -d "$CORE_DIR" ]; then
  echo "codex adapter: CORE_DIR not found: $CORE_DIR" >&2
  exit 1
fi

case "$DIST_DIR" in
  "$PLUGIN_DIR"/*) ;;
  *) echo "codex adapter: DIST_DIR '$DIST_DIR' is outside PLUGIN_DIR — refusing rm -rf" >&2; exit 1 ;;
esac

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# Path substitution for Codex: .claude/ -> .codex/, CLAUDE.md -> AGENTS.md
rewrite_paths() {
  sed \
    -e 's|\.claude/pai-orbit-config\.md|.codex/pai-orbit-config.md|g' \
    -e 's|\.claude/team\.md|.codex/team.md|g' \
    -e 's|\.claude/agents/|.codex/agents/|g' \
    -e 's|\.claude/hooks/|.codex/hooks/|g' \
    -e 's|\.claude/skills/|.codex/skills/|g' \
    -e 's|\.claude/rules/|.codex/rules/|g' \
    -e 's|`\.claude/`|`.codex/`|g' \
    -e 's|\bCLAUDE\.md\b|AGENTS.md|g'
}

# Extract mode summary: declaration line + switch-out lines + reads/writes if present.
# Sources now carry YAML frontmatter (`---\ndescription: ...\n---`) — the headspace
# declaration line is the first non-empty line of the *body*, not of the file.
emit_mode_summary() {
  local file="$1"
  # First non-empty body line is the headspace declaration ("You are now in X MODE.")
  awk '/^---/{p++;next} p>=2 && NF>0 {print; exit}' "$file"
  echo ""
  # Switch-out guidance
  if grep -q "^Switch out when:" "$file"; then
    awk '/^Switch out when:/{p=1} p && /^---/{exit} p && /^##/{exit} p{print}' "$file" | head -8
  fi
  # Reads/Writes lines if present
  grep -E "^\*\*Reads:\*\*|\*\*Writes:\*\*" "$file" | head -2 || true
}

out="$DIST_DIR/AGENTS.md"
{
  cat <<'HEADER'
# pai-orbit — Codex CLI Reference Guide (EXPERIMENTAL)

pai-orbit is a mode-driven developer workflow. Each mode puts the assistant into a specific headspace with declared inputs and outputs. Modes do not bleed into each other.

> **Codex note:** This is a reference guide, not an executable plugin. Modes are not invokable commands — apply them by context. When these instructions reference `.claude/` paths, use `.codex/` instead. `CLAUDE.md` is referenced as `AGENTS.md` in this file to match Codex CLI's convention.
>
> **Experimental:** Confirm that `AGENTS.md` at project root is still Codex CLI's instruction-file convention before relying on this build.

---

## Modes

HEADER

  for mode_file in "$CORE_DIR"/modes/*.md; do
    [ -f "$mode_file" ] || continue
    mode_name="$(basename "$mode_file" .md)"
    echo "### /${mode_name}"
    echo ""
    emit_mode_summary "$mode_file" | rewrite_paths
    echo ""
    echo "---"
    echo ""
  done

  cat <<'SKILLS_HEADER'
## Skills (reference)

Skills are operational procedures. Codex CLI has no skill-invocation system — apply these as instructions when the context matches the trigger.

| Skill | When to invoke |
|-------|---------------|
SKILLS_HEADER

  for skill_md in "$CORE_DIR"/skills/*/SKILL.md; do
    [ -f "$skill_md" ] || continue
    skill_name="$(basename "$(dirname "$skill_md")")"
    # Extract description from YAML frontmatter
    desc=$(awk '/^---/{p++} p==1 && /^description:/{sub(/^description: /,""); print; exit}' "$skill_md")
    short_desc=$(echo "$desc" | sed 's/\. .*//' | cut -c1-100)
    printf "| \`/%s\` | %s |\n" "$skill_name" "$short_desc"
  done

  echo ""
} > "$out"

cat > "$DIST_DIR/README.md" <<'EOF'
# pai-orbit — OpenAI Codex adapter (EXPERIMENTAL)

This is a **condensed reference guide** for the OpenAI Codex CLI. It is not an execution environment.

## What this is

A structured `AGENTS.md` instruction file for Codex CLI. It describes pai-orbit's modes (headspace + switch-out guidance) and skills (when to invoke).

## What's lost vs the Claude Code plugin

- **No command system.** Modes cannot be invoked with a slash command — apply them by context.
- **No skill invocation.** Skills are reference documentation only.
- **No agents, no hooks, no scaffolding.** These require Claude Code's plugin infrastructure.
- **No interactive `/setup`.** Create `.codex/pai-orbit-config.md` by hand using the template in the Claude Code plugin's `templates/` directory.

## Path conventions for Codex

When instructions reference `.claude/` paths:

| Claude Code path | Codex equivalent |
|------------------|-----------------|
| `.claude/pai-orbit-config.md` | `.codex/pai-orbit-config.md` |
| `.claude/team.md` | `.codex/team.md` |
| `.claude/agents/` | `.codex/agents/` |
| `CLAUDE.md` | `AGENTS.md` |

## Experimental status

Confirm `AGENTS.md` at project root is still Codex CLI's instruction-file convention before relying on this. If the convention has changed, update `adapters/codex/build.sh`.

## How to install

Copy `AGENTS.md` to your project root (or merge with an existing `AGENTS.md`).
EOF

echo "codex: built $DIST_DIR (EXPERIMENTAL)"
