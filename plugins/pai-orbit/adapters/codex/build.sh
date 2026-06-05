#!/usr/bin/env bash
# OpenAI Codex CLI adapter — EXPERIMENTAL, lossy build.
# Produces AGENTS.md at the dist root (Codex CLI reads AGENTS.md from project root).
# Confirm AGENTS.md is still Codex CLI's convention at install time.
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

out="$DIST_DIR/AGENTS.md"
{
  echo "# pai-orbit — Codex CLI Instructions"
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
# pai-orbit — OpenAI Codex adapter (EXPERIMENTAL)

This is an **experimental, lossy** build of pai-orbit for the OpenAI Codex CLI.

## What's here

- `AGENTS.md` — a single concatenated instructions file (Codex CLI's project-instruction convention) containing all pai-orbit modes and a skills appendix.

## Status

**Experimental.** Confirm that `AGENTS.md` at project root is still Codex CLI's instruction-file convention before relying on this. If the convention has changed, update `adapters/codex/build.sh` to emit the new filename/location.

## What's lost vs the Claude Code plugin

- No command system, no skill invocation, no agents, no hooks, no scaffolding templates.
- Modes and skills are reference text only.

## How to install

Copy `AGENTS.md` to your project root (or merge with an existing AGENTS.md).
EOF

echo "codex: built $DIST_DIR (EXPERIMENTAL)"
