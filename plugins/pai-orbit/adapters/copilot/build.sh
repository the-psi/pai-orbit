#!/usr/bin/env bash
# GitHub Copilot adapter — condensed reference guide build.
# Produces a ~200-line .github/copilot-instructions.md with mode summaries and skill reference.
# Full mode/skill content is NOT dumped — Copilot has no command system; condensed is more useful.
# Agents, hooks, and scaffolding templates are dropped.
set -euo pipefail

ADAPTER_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$ADAPTER_DIR/../.." && pwd)"

CORE_DIR="${CORE_DIR:-$PLUGIN_DIR/core}"
DIST_DIR="${DIST_DIR:-$PLUGIN_DIR/dist/copilot}"

if [ ! -d "$CORE_DIR" ]; then
  echo "copilot adapter: CORE_DIR not found: $CORE_DIR" >&2
  exit 1
fi

case "$DIST_DIR" in
  "$PLUGIN_DIR"/*) ;;
  *) echo "copilot adapter: DIST_DIR '$DIST_DIR' is outside PLUGIN_DIR — refusing rm -rf" >&2; exit 1 ;;
esac

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/.github"

# Path substitution for Copilot: .claude/ -> .github/pai-orbit/
rewrite_paths() {
  sed \
    -e 's|\.claude/pai-orbit-config\.md|.github/pai-orbit/pai-orbit-config.md|g' \
    -e 's|\.claude/team\.md|.github/pai-orbit/team.md|g' \
    -e 's|\.claude/agents/|.github/pai-orbit/agents/|g' \
    -e 's|\.claude/hooks/|.github/pai-orbit/hooks/|g' \
    -e 's|\.claude/skills/|.github/pai-orbit/skills/|g' \
    -e 's|\.claude/rules/|.github/pai-orbit/rules/|g' \
    -e 's|`\.claude/`|`.github/pai-orbit/`|g'
}

# Extract mode summary: declaration line + switch-out lines + reads/writes if present
emit_mode_summary() {
  local file="$1"
  # First line is the headspace declaration
  head -1 "$file"
  echo ""
  # Switch-out guidance
  if grep -q "^Switch out when:" "$file"; then
    awk '/^Switch out when:/{p=1} p && /^---/{exit} p && /^##/{exit} p{print}' "$file" | head -8
  fi
  # Reads/Writes lines if present in a ## Behaviour or header section
  grep -E "^\*\*Reads:\*\*|\*\*Writes:\*\*" "$file" | head -2 || true
}

out="$DIST_DIR/.github/copilot-instructions.md"
{
  cat <<'HEADER'
# pai-orbit — GitHub Copilot Reference Guide

pai-orbit is a mode-driven developer workflow. Each mode puts the assistant into a specific headspace with declared inputs and outputs. Modes do not bleed into each other.

> **Copilot note:** This is a reference guide, not an executable plugin. Modes are not invokable commands — apply them by context. When these instructions reference `.claude/` paths, use `.github/pai-orbit/` instead (e.g. `.claude/pai-orbit-config.md` → `.github/pai-orbit/pai-orbit-config.md`). `CLAUDE.md` is tool-agnostic and stays as is.

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

Skills are operational procedures. Copilot has no skill-invocation system — apply these as instructions when the context matches the trigger.

| Skill | When to invoke |
|-------|---------------|
SKILLS_HEADER

  for skill_md in "$CORE_DIR"/skills/*/SKILL.md; do
    [ -f "$skill_md" ] || continue
    skill_name="$(basename "$(dirname "$skill_md")")"
    # Extract description from YAML frontmatter (first description: line)
    desc=$(awk '/^---/{p++} p==1 && /^description:/{sub(/^description: /,""); print; exit}' "$skill_md")
    # Truncate to first sentence (up to first period or 100 chars)
    short_desc=$(echo "$desc" | sed 's/\. .*//' | cut -c1-100)
    printf "| \`/%s\` | %s |\n" "$skill_name" "$short_desc"
  done

  echo ""
} > "$out"

cat > "$DIST_DIR/README.md" <<'EOF'
# pai-orbit — GitHub Copilot adapter

This is a **condensed reference guide** for GitHub Copilot. It is not an execution environment.

## What this is

A structured instruction file for Copilot Chat. It describes pai-orbit's modes (headspace + switch-out guidance) and skills (when to invoke). Copilot reads `.github/copilot-instructions.md` as custom instructions.

## What's lost vs the Claude Code plugin

- **No command system.** Modes cannot be invoked with a slash command — apply them by context.
- **No skill invocation.** Skills are reference documentation only.
- **No agents, no hooks, no scaffolding.** These require Claude Code's plugin infrastructure.
- **No interactive `/setup`.** Create `.github/pai-orbit/pai-orbit-config.md` by hand using the template in the Claude Code plugin's `templates/` directory.

## Path conventions for Copilot

When instructions reference `.claude/` paths:

| Claude Code path | Copilot equivalent |
|------------------|--------------------|
| `.claude/pai-orbit-config.md` | `.github/pai-orbit/pai-orbit-config.md` |
| `.claude/team.md` | `.github/pai-orbit/team.md` |
| `.claude/agents/` | `.github/pai-orbit/agents/` |

`CLAUDE.md` stays as is — it is tool-agnostic project documentation.

## How to install

Copy `.github/copilot-instructions.md` into your project's `.github/` directory (or merge with an existing file). Copilot Chat picks it up automatically in supported editors.
EOF

echo "copilot: built $DIST_DIR"
