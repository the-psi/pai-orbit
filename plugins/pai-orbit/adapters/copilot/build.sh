#!/usr/bin/env bash
# GitHub Copilot adapter — lossy build.
# Concatenates all modes (+ skills appendix) into a single .github/copilot-instructions.md.
# Agents, hooks, and templates are dropped.
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

out="$DIST_DIR/.github/copilot-instructions.md"
{
  echo "# pai-orbit — GitHub Copilot Instructions"
  echo ""
  echo "This file is generated from the pai-orbit plugin. pai-orbit defines a mode-driven developer workflow: each \"mode\" puts the assistant into a specific headspace with declared inputs and outputs. Modes do not bleed into each other."
  echo ""
  echo "Below are the mode definitions, followed by a skills appendix."
  echo ""
  echo "---"
  echo ""
  echo "## Modes"
  echo ""
  for mode_file in "$CORE_DIR"/modes/*.md; do
    [ -f "$mode_file" ] || continue
    mode_name="$(basename "$mode_file" .md)"
    echo ""
    echo "### /${mode_name}"
    echo ""
    cat "$mode_file"
    echo ""
  done

  echo ""
  echo "---"
  echo ""
  echo "## Skills (reference)"
  echo ""
  echo "Skills are operational procedures from the Claude Code plugin. Copilot has no skill-invocation system; treat these as reference documents."
  echo ""
  for skill_md in "$CORE_DIR"/skills/*/SKILL.md; do
    [ -f "$skill_md" ] || continue
    skill_name="$(basename "$(dirname "$skill_md")")"
    echo ""
    echo "### /${skill_name}"
    echo ""
    cat "$skill_md"
    echo ""
  done
} > "$out"

cat > "$DIST_DIR/README.md" <<'EOF'
# pai-orbit — GitHub Copilot adapter

This is a **lossy** build of pai-orbit for GitHub Copilot.

## What's here

- `.github/copilot-instructions.md` — a single concatenated instructions file containing all pai-orbit modes and a skills appendix.

## What's lost vs the Claude Code plugin

- **No command system.** Modes are reference instructions only, not invokable commands.
- **No skill invocation.** Skills become reference documents.
- **No agents, no hooks, no scaffolding templates.** Copilot's custom-instructions surface is a single Markdown file.

## How to install

Copy `.github/copilot-instructions.md` into your project's `.github/` directory (or merge with an existing file). Copilot Chat will pick it up automatically in supported editors.
EOF

echo "copilot: built $DIST_DIR"
