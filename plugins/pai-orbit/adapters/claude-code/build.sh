#!/usr/bin/env bash
# Claude Code adapter — full-fidelity build.
# Reproduces the layout Claude Code's plugin loader expects:
#   .claude-plugin/plugin.json + commands/ + skills/ + agents/ + hooks/ + templates/
set -euo pipefail

ADAPTER_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$ADAPTER_DIR/../.." && pwd)"

CORE_DIR="${CORE_DIR:-$PLUGIN_DIR/core}"
DIST_DIR="${DIST_DIR:-$PLUGIN_DIR/dist/claude-code}"

if [ ! -d "$CORE_DIR" ]; then
  echo "claude-code adapter: CORE_DIR not found: $CORE_DIR" >&2
  exit 1
fi

case "$DIST_DIR" in
  "$PLUGIN_DIR"/*) ;;
  *) echo "claude-code adapter: DIST_DIR '$DIST_DIR' is outside PLUGIN_DIR — refusing rm -rf" >&2; exit 1 ;;
esac

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/.claude-plugin"

# core/modes/ is the tool-agnostic name; Claude Code expects commands/
mkdir -p "$DIST_DIR/commands"
cp -R "$CORE_DIR/modes/." "$DIST_DIR/commands/"

cp -R "$CORE_DIR/skills"    "$DIST_DIR/"
cp -R "$CORE_DIR/agents"    "$DIST_DIR/"
cp -R "$CORE_DIR/hooks"     "$DIST_DIR/"
cp -R "$CORE_DIR/templates" "$DIST_DIR/"
cp    "$CORE_DIR/plugin.json" "$DIST_DIR/.claude-plugin/plugin.json"

# arch-drift-guard.sh is not +x in source; restore exec bit on all dist hooks.
chmod +x "$DIST_DIR"/hooks/*.sh

echo "claude-code: built $DIST_DIR"
