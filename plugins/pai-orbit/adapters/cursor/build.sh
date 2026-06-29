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
#
# Each source mode now carries a canonical `description:` field in YAML
# frontmatter (see core/modes/*.md). We read that for the Cursor rule
# description, strip the source frontmatter from the emitted body, and wrap
# with Cursor's expected frontmatter (`description:`, `alwaysApply: false`).
for mode_file in "$CORE_DIR"/modes/*.md; do
  [ -f "$mode_file" ] || continue
  mode_name="$(basename "$mode_file" .md)"
  out="$DIST_DIR/.cursor/rules/${mode_name}.mdc"
  # Read description from the source frontmatter; fall back to first non-empty
  # body line for any future mode that lacks frontmatter.
  description="$(awk '/^---/{p++;next} p==1 && /^description:/{sub(/^description: */,""); print; exit}' "$mode_file" | sed 's/"/\\"/g')"
  if [ -z "$description" ]; then
    description="$(awk 'p>=2 && NF>0 {print; exit} /^---/{p++}' "$mode_file" | sed 's/^#\+ *//' | sed 's/"/\\"/g')"
  fi
  {
    echo "---"
    echo "description: ${description}"
    echo "alwaysApply: false"
    echo "---"
    echo ""
    awk '/^---/{p++;next} p>=2{print}' "$mode_file"
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

# ── install.sh — no-clone installer ────────────────────────────────────────
# Build a self-contained script that downloads exactly the files we just built.
# File list is injected at build time so the script works without JSON parsing
# or a full repo tarball.

GITHUB_REPO="${GITHUB_REPO:-the-psi/pai-orbit}"
DIST_REL="plugins/pai-orbit/dist/cursor"   # path inside the repo

# Collect rule paths relative to DIST_DIR
rule_files=()
for f in "$DIST_DIR"/.cursor/rules/*.mdc; do
  [ -f "$f" ] || continue
  rule_files+=(".cursor/rules/$(basename "$f")")
done

# Abort early if no rule files were produced (partial build, wrong DIST_DIR, etc.)
if [ ${#rule_files[@]} -eq 0 ]; then
  echo "ERROR: cursor build produced no .mdc rule files in $DIST_DIR/.cursor/rules/ — aborting install.sh generation" >&2
  exit 1
fi

# Build the RULES array literal for injection
rules_literal=""
for rf in "${rule_files[@]}"; do
  rules_literal+="  \"${rf}\""$'\n'
done

cat > "$DIST_DIR/install.sh" <<INSTALL_EOF
#!/usr/bin/env bash
# pai-orbit Cursor installer — no clone required.
# Run from the root of your project:
#
#   curl -fsSL https://raw.githubusercontent.com/${GITHUB_REPO}/main/${DIST_REL}/install.sh | bash
#
# Override the ref/tag with PAI_ORBIT_REF=v1.1.0 (defaults to main).
set -euo pipefail

REPO="${GITHUB_REPO}"
REF="\${PAI_ORBIT_REF:-main}"
BASE="https://raw.githubusercontent.com/\${REPO}/\${REF}/${DIST_REL}"

RULES=(
${rules_literal})

echo "pai-orbit: installing Cursor rules from \${REPO}@\${REF} ..."
echo ""

for file in "\${RULES[@]}"; do
  dir="\$(dirname "\$file")"
  mkdir -p "\$dir"
  curl -fsSL "\${BASE}/\${file}" -o "\${file}"
  echo "  ✓ \${file}"
done

echo ""
echo "pai-orbit: \${#RULES[@]} rule file(s) installed to .cursor/rules/"
echo ""
echo "Next steps:"
echo "  1. Download the project config template and fill it out:"
echo "     curl -fsSL \${BASE}/templates/pai-orbit-config.md.template -o .cursor/pai-orbit-config.md"
echo ""
echo "  2. Optionally download the CLAUDE.md and team roster templates:"
echo "     curl -fsSL \${BASE}/templates/CLAUDE.md.template -o CLAUDE.md.template"
echo "     curl -fsSL \${BASE}/templates/team.md.template   -o .cursor/team.md"
echo ""
echo "  3. Open Cursor — the rules are now active under .cursor/rules/."
INSTALL_EOF

chmod +x "$DIST_DIR/install.sh"

# ── README ──────────────────────────────────────────────────────────────────
INSTALL_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/main/${DIST_REL}/install.sh"

cat > "$DIST_DIR/README.md" <<EOF
# pai-orbit — Cursor adapter

This is a **lossy** build of pai-orbit for Cursor.

## Install (no clone required)

Run this from the root of your project:

\`\`\`bash
curl -fsSL ${INSTALL_URL} | bash
\`\`\`

To pin to a specific release:

\`\`\`bash
PAI_ORBIT_REF=v1.1.0 curl -fsSL ${INSTALL_URL} | bash
\`\`\`

That's it. The rule files land in \`.cursor/rules/\` and Cursor picks them up automatically.

## What's installed

- \`.cursor/rules/*.mdc\` — one rule file per pai-orbit mode (build, design, arch, etc.). \`alwaysApply: false\` so the agent picks them up by relevance, not unconditionally.
- \`.cursor/rules/skills.mdc\` — concatenated skills reference (Cursor has no skill system).

Templates (\`pai-orbit-config.md\`, \`team.md\`, \`CLAUDE.md\`) can be fetched on demand — the installer prints the exact commands after it runs.

## Manual install

If you prefer not to pipe to bash, clone or download this directory and copy \`.cursor/\` into your project root (merge with any existing \`.cursor/\`).

## What's lost vs the Claude Code plugin

- **No command system.** Modes cannot be invoked as \`/build\`, \`/design\`, etc. They become rule documents the agent reads.
- **No skill invocation.** Skills become reference documents only.
- **No agents.** Claude Code's named sub-agents (docs-writer, cross-repo-impact) have no Cursor analog.
- **No hooks.** PreToolUse/PostToolUse safety and lint hooks are dropped. Replicate with Cursor's own command-execution settings if needed.
EOF

echo "cursor: built $DIST_DIR"
