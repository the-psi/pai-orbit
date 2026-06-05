#!/usr/bin/env bash
# Cursor adapter — lossy build.
# Modes become .cursor/rules/*.mdc rule files (no command system in Cursor).
# Skills are concatenated into a single skills.mdc.
# Agents and hooks are dropped (no analog).
set -euo pipefail

ADAPTER_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$ADAPTER_DIR/../.." && pwd)"

CORE_DIR="${CORE_DIR:-$PLUGIN_DIR/core}"
DIST_DIR="${DIST_DIR:-$PLUGIN_DIR/dist/cursor}"

if [ ! -d "$CORE_DIR" ]; then
  echo "cursor adapter: CORE_DIR not found: $CORE_DIR" >&2
  exit 1
fi

case "$DIST_DIR" in
  "$PLUGIN_DIR"/*) ;;
  *) echo "cursor adapter: DIST_DIR '$DIST_DIR' is outside PLUGIN_DIR — refusing rm -rf" >&2; exit 1 ;;
esac

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/.cursor/rules"

# Modes → individual rule files
for mode_file in "$CORE_DIR"/modes/*.md; do
  [ -f "$mode_file" ] || continue
  mode_name="$(basename "$mode_file" .md)"
  out="$DIST_DIR/.cursor/rules/${mode_name}.mdc"
  # First non-empty line becomes the description.
  description="$(grep -m1 -v '^[[:space:]]*$' "$mode_file" | sed 's/^#\+ *//' | sed 's/"/\\"/g')"
  {
    echo "---"
    echo "description: ${description}"
    echo "alwaysApply: false"
    echo "---"
    echo ""
    cat "$mode_file"
  } > "$out"
done

# Skills → single concatenated rule
skills_out="$DIST_DIR/.cursor/rules/skills.mdc"
{
  echo "---"
  echo "description: pai-orbit operational skills (callable procedures)"
  echo "alwaysApply: false"
  echo "---"
  echo ""
  echo "# pai-orbit Skills"
  echo ""
  echo "Cursor has no skill system. The following are procedures from the Claude Code plugin, preserved here as reference documents the agent can consult."
  echo ""
  for skill_md in "$CORE_DIR"/skills/*/SKILL.md; do
    [ -f "$skill_md" ] || continue
    skill_name="$(basename "$(dirname "$skill_md")")"
    echo ""
    echo "## /${skill_name}"
    echo ""
    cat "$skill_md"
    echo ""
  done
} > "$skills_out"

# Templates copied verbatim for user reference (e.g., during /setup-equivalent flows)
cp -R "$CORE_DIR/templates" "$DIST_DIR/templates"

cat > "$DIST_DIR/README.md" <<'EOF'
# pai-orbit — Cursor adapter

This is a **lossy** build of pai-orbit for Cursor.

## What's here

- `.cursor/rules/*.mdc` — one rule file per pai-orbit mode (build, design, arch, etc.). Set `alwaysApply: false` so the agent picks them up by relevance, not unconditionally.
- `.cursor/rules/skills.mdc` — concatenated skills reference (Cursor has no skill system).
- `templates/` — project scaffolding templates, copied verbatim.

## What's lost vs the Claude Code plugin

- **No command system.** Modes cannot be invoked as `/build`, `/design`, etc. They become rule documents the agent reads.
- **No skill invocation.** Skills become reference documents only.
- **No agents.** Claude Code's named sub-agents (docs-writer, cross-repo-impact) have no Cursor analog.
- **No hooks.** PreToolUse/PostToolUse safety and lint hooks are dropped. Replicate with Cursor's own command-execution settings if needed.

## How to install

Copy this directory's `.cursor/` into your project root (or merge with existing `.cursor/`).
EOF

echo "cursor: built $DIST_DIR"
