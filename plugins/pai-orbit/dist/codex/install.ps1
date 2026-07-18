# pai-orbit Codex installer — Windows / PowerShell no-clone installer.
# Run from the root of your project:
#
#   irm https://raw.githubusercontent.com/the-psi/pai-orbit/main/plugins/pai-orbit/dist/codex/install.ps1 | iex
#
# Override the ref/tag with \$env:PAI_ORBIT_REF='v1.4.0' before running.

$ErrorActionPreference = 'Stop'

$Repo   = 'the-psi/pai-orbit'
$Ref    = if ($env:PAI_ORBIT_REF) { $env:PAI_ORBIT_REF } else { 'main' }
$Base   = "https://raw.githubusercontent.com/$Repo/$Ref/plugins/pai-orbit/dist/codex"

$Files = @(
    '.agents/skills/analysis/SKILL.md',
    '.agents/skills/arch/agents/openai.yaml',
    '.agents/skills/arch/SKILL.md',
    '.agents/skills/board/SKILL.md',
    '.agents/skills/build/agents/openai.yaml',
    '.agents/skills/build/SKILL.md',
    '.agents/skills/data/agents/openai.yaml',
    '.agents/skills/data/SKILL.md',
    '.agents/skills/data-model/SKILL.md',
    '.agents/skills/design/agents/openai.yaml',
    '.agents/skills/design/SKILL.md',
    '.agents/skills/domain/agents/openai.yaml',
    '.agents/skills/domain/SKILL.md',
    '.agents/skills/epic/SKILL.md',
    '.agents/skills/git/SKILL.md',
    '.agents/skills/groom/agents/openai.yaml',
    '.agents/skills/groom/SKILL.md',
    '.agents/skills/incident/agents/openai.yaml',
    '.agents/skills/incident/SKILL.md',
    '.agents/skills/orbit-plan/agents/openai.yaml',
    '.agents/skills/orbit-plan/SKILL.md',
    '.agents/skills/orbit-review/agents/openai.yaml',
    '.agents/skills/orbit-review/SKILL.md',
    '.agents/skills/release/agents/openai.yaml',
    '.agents/skills/release/SKILL.md',
    '.agents/skills/setup/agents/openai.yaml',
    '.agents/skills/setup/SKILL.md',
    '.agents/skills/simplify/SKILL.md',
    '.agents/skills/suggest-skills/agents/openai.yaml',
    '.agents/skills/suggest-skills/SKILL.md',
    '.agents/skills/test/agents/openai.yaml',
    '.agents/skills/test/SKILL.md',
    '.agents/skills/ux/agents/openai.yaml',
    '.agents/skills/ux/SKILL.md',
    '.codex/agents/cross-repo-impact.toml',
    '.codex/agents/docs-writer.toml',
    '.codex/config.toml',
    '.codex/hooks/arch-drift-guard.sh',
    '.codex/hooks/arch-drift-wrapper.ps1',
    '.codex/hooks/arch-drift-wrapper.sh',
    '.codex/hooks/bash-guard.ps1',
    '.codex/hooks/bash-guard.sh',
    '.codex/hooks/lint-python-wrapper.ps1',
    '.codex/hooks/lint-python-wrapper.sh',
    '.codex/hooks/lint-python.sh',
    '.codex/hooks/lint-ts-wrapper.ps1',
    '.codex/hooks/lint-ts-wrapper.sh',
    '.codex/hooks/lint-ts.sh',
    '.codex/hooks/_extract-touched-paths.py',
    '.codex/hooks.json',
    '.codex/pai-orbit-config.md',
    '.codex/team.md',
    '.codex/templates/agents/django-builder.md',
    '.codex/templates/agents/express-builder.md',
    '.codex/templates/agents/fastapi-builder.md',
    '.codex/templates/agents/generic-service-builder.md',
    '.codex/templates/agents/infra-builder.md',
    '.codex/templates/agents/nextjs-builder.md',
    '.codex/templates/agents/react-vite-builder.md',
    '.codex/templates/AGENTS.md.template',
    '.codex/templates/docs/architecture/constraints.md',
    '.codex/templates/docs/architecture/stack.md',
    '.codex/templates/docs/architecture/system.md',
    '.codex/templates/docs/backlog/.gitkeep',
    '.codex/templates/docs/backlog/feature-ideas.md',
    '.codex/templates/docs/decisions/.gitkeep',
    '.codex/templates/docs/decisions/ADR.md',
    '.codex/templates/docs/domain/.gitkeep',
    '.codex/templates/docs/epics/.gitkeep',
    '.codex/templates/docs/epics/EPIC.md',
    '.codex/templates/docs/features/.gitkeep',
    '.codex/templates/docs/ops/.gitkeep',
    '.codex/templates/docs/plans/.gitkeep',
    '.codex/templates/docs/reports/.gitkeep',
    '.codex/templates/docs/wip/.gitkeep',
    '.codex/templates/pai-orbit-config.md.template',
    '.codex/templates/rules/decisions.md',
    '.codex/templates/skills/domain-operational.template.md',
    '.codex/templates/team.md.template',
    'AGENTS.md'
)

Write-Host "pai-orbit (Codex): installing $($Files.Count) files from $Repo@$Ref ..."
Write-Host ""

if ((Test-Path '.agents/skills') -and -not $env:PAI_ORBIT_FORCE) {
    Write-Host "WARNING: .agents/skills/ already exists in this project." -ForegroundColor Yellow
    Write-Host "Set \$env:PAI_ORBIT_FORCE='1' to overwrite. Aborting."
    exit 1
}

foreach ($rel in $Files) {
    $dir = Split-Path -Parent $rel
    if ($dir -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    Invoke-WebRequest -UseBasicParsing -Uri "$Base/$rel" -OutFile $rel
    Write-Host "  installed $rel"
}

Write-Host ""
Write-Host "pai-orbit (Codex) installed."
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Launch codex in this directory. Trust the project when prompted."
Write-Host "  2. Run /hooks to review and trust the 4 registered hooks."
Write-Host "  3. Run \$setup to fill in .codex/pai-orbit-config.md, .codex/team.md,"
Write-Host "     and the lint hooks' repo= configuration."
Write-Host "  4. Run /skills to see the 20 available skills."
