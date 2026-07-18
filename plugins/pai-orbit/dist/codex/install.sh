#!/usr/bin/env bash
# pai-orbit Codex installer — no clone required.
# Run from the root of your project:
#
#   curl -fsSL https://raw.githubusercontent.com/the-psi/pai-orbit/main/plugins/pai-orbit/dist/codex/install.sh | bash
#
# Override the ref/tag with PAI_ORBIT_REF=v1.4.0 (defaults to main).
set -euo pipefail

REPO="the-psi/pai-orbit"
REF="${PAI_ORBIT_REF:-main}"
BASE="https://raw.githubusercontent.com/${REPO}/${REF}/plugins/pai-orbit/dist/codex"

FILES=(
  ".agents/skills/analysis/SKILL.md"
  ".agents/skills/arch/agents/openai.yaml"
  ".agents/skills/arch/SKILL.md"
  ".agents/skills/board/SKILL.md"
  ".agents/skills/build/agents/openai.yaml"
  ".agents/skills/build/SKILL.md"
  ".agents/skills/data/agents/openai.yaml"
  ".agents/skills/data/SKILL.md"
  ".agents/skills/data-model/SKILL.md"
  ".agents/skills/design/agents/openai.yaml"
  ".agents/skills/design/SKILL.md"
  ".agents/skills/domain/agents/openai.yaml"
  ".agents/skills/domain/SKILL.md"
  ".agents/skills/epic/SKILL.md"
  ".agents/skills/git/SKILL.md"
  ".agents/skills/groom/agents/openai.yaml"
  ".agents/skills/groom/SKILL.md"
  ".agents/skills/incident/agents/openai.yaml"
  ".agents/skills/incident/SKILL.md"
  ".agents/skills/orbit-plan/agents/openai.yaml"
  ".agents/skills/orbit-plan/SKILL.md"
  ".agents/skills/orbit-review/agents/openai.yaml"
  ".agents/skills/orbit-review/SKILL.md"
  ".agents/skills/release/agents/openai.yaml"
  ".agents/skills/release/SKILL.md"
  ".agents/skills/setup/agents/openai.yaml"
  ".agents/skills/setup/SKILL.md"
  ".agents/skills/simplify/SKILL.md"
  ".agents/skills/suggest-skills/agents/openai.yaml"
  ".agents/skills/suggest-skills/SKILL.md"
  ".agents/skills/test/agents/openai.yaml"
  ".agents/skills/test/SKILL.md"
  ".agents/skills/ux/agents/openai.yaml"
  ".agents/skills/ux/SKILL.md"
  ".codex/agents/cross-repo-impact.toml"
  ".codex/agents/docs-writer.toml"
  ".codex/config.toml"
  ".codex/hooks/arch-drift-guard.sh"
  ".codex/hooks/arch-drift-wrapper.ps1"
  ".codex/hooks/arch-drift-wrapper.sh"
  ".codex/hooks/bash-guard.ps1"
  ".codex/hooks/bash-guard.sh"
  ".codex/hooks/lint-python-wrapper.ps1"
  ".codex/hooks/lint-python-wrapper.sh"
  ".codex/hooks/lint-python.sh"
  ".codex/hooks/lint-ts-wrapper.ps1"
  ".codex/hooks/lint-ts-wrapper.sh"
  ".codex/hooks/lint-ts.sh"
  ".codex/hooks/_extract-touched-paths.py"
  ".codex/hooks.json"
  ".codex/pai-orbit-config.md"
  ".codex/team.md"
  ".codex/templates/agents/django-builder.md"
  ".codex/templates/agents/express-builder.md"
  ".codex/templates/agents/fastapi-builder.md"
  ".codex/templates/agents/generic-service-builder.md"
  ".codex/templates/agents/infra-builder.md"
  ".codex/templates/agents/nextjs-builder.md"
  ".codex/templates/agents/react-vite-builder.md"
  ".codex/templates/AGENTS.md.template"
  ".codex/templates/docs/architecture/constraints.md"
  ".codex/templates/docs/architecture/stack.md"
  ".codex/templates/docs/architecture/system.md"
  ".codex/templates/docs/backlog/.gitkeep"
  ".codex/templates/docs/backlog/feature-ideas.md"
  ".codex/templates/docs/decisions/.gitkeep"
  ".codex/templates/docs/decisions/ADR.md"
  ".codex/templates/docs/domain/.gitkeep"
  ".codex/templates/docs/epics/.gitkeep"
  ".codex/templates/docs/epics/EPIC.md"
  ".codex/templates/docs/features/.gitkeep"
  ".codex/templates/docs/ops/.gitkeep"
  ".codex/templates/docs/plans/.gitkeep"
  ".codex/templates/docs/reports/.gitkeep"
  ".codex/templates/docs/wip/.gitkeep"
  ".codex/templates/pai-orbit-config.md.template"
  ".codex/templates/rules/decisions.md"
  ".codex/templates/skills/domain-operational.template.md"
  ".codex/templates/team.md.template"
  "AGENTS.md"
)

echo "pai-orbit (Codex): installing ${#FILES[@]} files from ${REPO}@${REF} ..."
echo ""

# Sanity check: refuse to overwrite an existing .agents/skills/ directory
# without confirmation — it could be another tool's plugin.
if [ -d ".agents/skills" ] && [ -z "${PAI_ORBIT_FORCE:-}" ]; then
  echo "WARNING: .agents/skills/ already exists in this project."
  echo "Set PAI_ORBIT_FORCE=1 to overwrite. Aborting."
  exit 1
fi

for rel in "${FILES[@]}"; do
  dir="$(dirname "$rel")"
  mkdir -p "$dir"
  curl -fsSL "${BASE}/${rel}" -o "${rel}"
  echo "  installed ${rel}"
done

# Ensure hook scripts are executable
chmod +x .codex/hooks/*.sh 2>/dev/null || true

echo ""
echo "pai-orbit (Codex) installed."
echo ""
echo "Next steps:"
echo "  1. Launch codex in this directory. Trust the project when prompted."
echo "  2. Run /hooks to review and trust the 4 registered hooks."
echo "  3. Run \$setup to fill in .codex/pai-orbit-config.md, .codex/team.md,"
echo "     and the lint hooks' repo= configuration."
echo "  4. Run /skills to see the 20 available skills."
echo "     Six operational (analysis, board, data-model, epic, git, simplify)"
echo "     fire implicitly on description match."
echo "     Fourteen modes (arch, build, ..., orbit-plan, orbit-review) are"
echo "     explicit-only: type \$mode-name to enter."
echo ""
