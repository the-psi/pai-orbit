#!/usr/bin/env bash
# pai-orbit Cursor installer — no clone required.
# Run from the root of your project:
#
#   curl -fsSL https://raw.githubusercontent.com/the-psi/pai-orbit/main/plugins/pai-orbit/dist/cursor/install.sh | bash
#
# Override the ref/tag with PAI_ORBIT_REF=v1.1.0 (defaults to main).
set -euo pipefail

REPO="the-psi/pai-orbit"
REF="${PAI_ORBIT_REF:-main}"
BASE="https://raw.githubusercontent.com/${REPO}/${REF}/plugins/pai-orbit/dist/cursor"

RULES=(
  ".cursor/rules/arch.mdc"
  ".cursor/rules/build.mdc"
  ".cursor/rules/data.mdc"
  ".cursor/rules/design.mdc"
  ".cursor/rules/domain.mdc"
  ".cursor/rules/groom.mdc"
  ".cursor/rules/plan.mdc"
  ".cursor/rules/skills.mdc"
  ".cursor/rules/ux.mdc"
)

echo "pai-orbit: installing Cursor rules from ${REPO}@${REF} ..."
echo ""

for file in "${RULES[@]}"; do
  dir="$(dirname "$file")"
  mkdir -p "$dir"
  curl -fsSL "${BASE}/${file}" -o "${file}"
  echo "  ✓ ${file}"
done

echo ""
echo "pai-orbit: ${#RULES[@]} rule file(s) installed to .cursor/rules/"
echo ""
echo "Next steps:"
echo "  1. Download the project config template and fill it out:"
echo "     curl -fsSL ${BASE}/templates/pai-orbit-config.md.template -o .cursor/pai-orbit-config.md"
echo ""
echo "  2. Optionally download the CLAUDE.md and team roster templates:"
echo "     curl -fsSL ${BASE}/templates/CLAUDE.md.template -o CLAUDE.md.template"
echo "     curl -fsSL ${BASE}/templates/team.md.template   -o .cursor/team.md"
echo ""
echo "  3. Open Cursor — the rules are now active under .cursor/rules/."
