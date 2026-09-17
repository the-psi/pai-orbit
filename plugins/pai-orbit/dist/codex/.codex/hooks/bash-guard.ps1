# bash-guard.ps1 — Windows PreToolUse safety guards.
# Native PowerShell port of bash-guard.sh. Reads Codex-shape JSON from stdin;
# emits a deny decision (compact JSON on stdout) for blocked patterns.
# Direct port — no wrapper. Advisory: the .sh remains the source of truth;
# this .ps1 tracks it. Update both together.

$ErrorActionPreference = 'SilentlyContinue'

$raw = [Console]::In.ReadToEnd()
try {
    $payload = $raw | ConvertFrom-Json -ErrorAction Stop
    $cmd = [string]$payload.tool_input.command
} catch {
    exit 0
}

if ([string]::IsNullOrEmpty($cmd)) { exit 0 }

# Normalise newlines so multi-line command strings don't split a blocked token across lines.
$cmdOneline = $cmd -replace '\r?\n', ' '

function Deny([string]$reason) {
    $out = @{
        hookSpecificOutput = @{
            hookEventName             = 'PreToolUse'
            permissionDecision        = 'deny'
            permissionDecisionReason  = $reason
        }
    }
    ($out | ConvertTo-Json -Compress -Depth 4)
    exit 0
}

# Force-push (git push --force / -f)
if ($cmdOneline -match 'git\s+push[^\|]*(?:--force|\s-f(?:\s|$))') {
    Deny 'Force-push detected. Never force-push to a shared branch. If you genuinely need this, run the command manually outside the agent.'
}

# Bulk staging (git add . / -A / --all / -u)
if ($cmdOneline -match '(?:^|[\s;]|&&|\|\|)git\s+add\s+(?:\.|-A|--all|-u|--update)(?:\s|;|$)') {
    Deny 'Bulk staging (git add . / -A / --all / -u) is blocked. Stage specific files to prevent .env, credentials, and generated files from leaking into commits.'
}

# Hook bypass (--no-verify on commit/push/merge/rebase)
if ($cmdOneline -match 'git\s+(?:commit|push|merge|rebase)[^\|]*--no-verify') {
    Deny 'Hook bypass (--no-verify) is blocked. If a hook is failing, fix the underlying issue rather than skipping it.'
}

# Destructive rm — rm -rf/-fr/-r -f on root/home/current
if ($cmdOneline -match 'rm\s+-(?:rf?|fr)\s+(?:\/|~|\$HOME|\.)(?:\s|$)') {
    Deny 'Potentially destructive rm detected. Refusing to run rm -rf on root, home, or current directory. Specify an explicit target path.'
}

# Project-specific blocks go below this line.

exit 0
