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

# Claude-Code-only: `isolation` and per-agent `model` are Claude Code Task features, so the
# sub-agent rules are injected into build.md at the core marker; other adapters keep the generic text.
BUILD_MD="$DIST_DIR/commands/build.md"
MARKER='<!-- CLAUDE_CODE_ONLY: build-subagent-rules -->'
if ! grep -qxF "$MARKER" "$BUILD_MD"; then
  echo "claude-code adapter: marker '$MARKER' missing from core/modes/build.md" >&2
  exit 1
fi
RULES_FILE="$(mktemp)"
cat > "$RULES_FILE" <<'EOF'
- **Isolate parallel builders:** pass `isolation: "worktree"` on every builder sub-agent. Each agent works on its own branch in its own worktree, so concurrent uncommitted changes can't stomp each other. If the agent makes no changes the worktree is auto-cleaned; otherwise its branch name is returned — merge it or open a PR.
- **Tier the model to the task:** `haiku` for simple, well-scoped work (docs updates, seed-data scripts, minor UI copy, single-file fixes with no architectural decisions); `sonnet` (default) for multi-file changes, logic-heavy work, or anything needing design trade-off reasoning.
EOF
awk -v m="$MARKER" -v f="$RULES_FILE" '$0==m { while ((getline l < f) > 0) print l; next } { print }' "$BUILD_MD" > "$BUILD_MD.tmp"
mv "$BUILD_MD.tmp" "$BUILD_MD"
rm -f "$RULES_FILE"

cp -R "$CORE_DIR/skills"    "$DIST_DIR/"
cp -R "$CORE_DIR/agents"    "$DIST_DIR/"
cp -R "$CORE_DIR/hooks"     "$DIST_DIR/"
cp -R "$CORE_DIR/templates" "$DIST_DIR/"
cp -R "$CORE_DIR/reference" "$DIST_DIR/"
cp    "$CORE_DIR/plugin.json" "$DIST_DIR/.claude-plugin/plugin.json"

# arch-drift-guard.sh is not +x in source; restore exec bit on all dist hooks.
chmod +x "$DIST_DIR"/hooks/*.sh

echo "claude-code: built $DIST_DIR"
