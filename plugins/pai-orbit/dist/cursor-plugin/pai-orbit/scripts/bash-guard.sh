#!/usr/bin/env bash
# PreToolUse hook — Bash safety guards
# Reads JSON from stdin; emits a deny decision for blocked patterns.
# Copy to .claude/hooks/bash-guard.sh in your project. Add project-specific
# blocks below the generic ones.

set -e

input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c "import sys, json; print(json.load(sys.stdin).get('tool_input', {}).get('command', ''))" 2>/dev/null || echo "")

deny() {
  python3 -c "
import json, sys
print(json.dumps({
    'hookSpecificOutput': {
        'hookEventName': 'PreToolUse',
        'permissionDecision': 'deny',
        'permissionDecisionReason': sys.argv[1]
    }
}))
" "$1"
  exit 0
}

# Force-push block
if echo "$cmd" | grep -qE 'git[[:space:]]+push.*(--force|[[:space:]]-f([[:space:]]|$))'; then
  deny "Force-push detected. Never force-push to a shared branch. If you genuinely need this, run the command manually outside Claude."
fi

# Bulk-staging block
if echo "$cmd" | grep -qE '(^|[[:space:]]|;|&&|\|\|)git[[:space:]]+add[[:space:]]+(\.|-A|--all)([[:space:]]|$)'; then
  deny "Bulk staging (git add . / -A / --all) is blocked. Stage specific files to prevent .env, credentials, and generated files from leaking into commits."
fi

# Hook-bypass block
if echo "$cmd" | grep -qE 'git[[:space:]]+(commit|push).*--no-verify'; then
  deny "Hook bypass (--no-verify) is blocked. If a hook is failing, fix the underlying issue rather than skipping it."
fi

# Destructive rm block (recursive without explicit path)
if echo "$cmd" | grep -qE 'rm[[:space:]]+-rf?[[:space:]]+(\/|~|\$HOME|\.)([[:space:]]|$)'; then
  deny "Potentially destructive rm detected. Refusing to run rm -rf on root, home, or current directory. Specify an explicit target path."
fi

# --- Project-specific blocks go below this line ---
# Example:
# if echo "$cmd" | grep -q "my-protected-resource"; then
#   deny "Reason why this is blocked for this project."
# fi

exit 0
