# arch-drift-wrapper.ps1 — Windows entry for arch-drift-guard.sh.
# Reads a Codex PostToolUse payload from stdin, extracts touched paths via
# the shared Python helper, and forwards each path (as Claude-shape JSON) to
# the core arch-drift-guard.sh via bash. The core script does the structural
# filename check itself. Advisory only. Requires python and bash on PATH.

$ErrorActionPreference = 'SilentlyContinue'

$hookDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$coreScript = Join-Path $hookDir 'arch-drift-guard.sh'
$extractor = Join-Path $hookDir '_extract-touched-paths.py'

if (-not (Test-Path $coreScript) -or -not (Test-Path $extractor)) { exit 0 }
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { exit 0 }
if (-not (Get-Command bash -ErrorAction SilentlyContinue)) { exit 0 }

$stdin = [Console]::In.ReadToEnd()
if ([string]::IsNullOrEmpty($stdin)) { exit 0 }

$paths = $stdin | & python $extractor 2>$null
if (-not $paths) { exit 0 }

foreach ($path in ($paths -split "`r?`n")) {
    if ([string]::IsNullOrWhiteSpace($path)) { continue }
    $payload = @{
        tool_name  = 'Edit'
        tool_input = @{ file_path = $path }
    } | ConvertTo-Json -Compress -Depth 4
    $payload | & bash $coreScript
}

exit 0
