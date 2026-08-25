# lint-ts-wrapper.ps1 — Windows entry for lint-ts.sh.
# Extracts touched paths via _extract-touched-paths.py, filters to
# .ts/.tsx/.js/.jsx, and forwards each as Claude-shape JSON to the core
# lint-ts.sh via bash. Advisory only. Requires python and bash on PATH.

$ErrorActionPreference = 'SilentlyContinue'

$hookDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$coreScript = Join-Path $hookDir 'lint-ts.sh'
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
    if ($path -notmatch '\.(ts|tsx|js|jsx)$') { continue }
    $payload = @{
        tool_name  = 'Edit'
        tool_input = @{ file_path = $path }
    } | ConvertTo-Json -Compress -Depth 4
    $payload | & bash $coreScript
}

exit 0
