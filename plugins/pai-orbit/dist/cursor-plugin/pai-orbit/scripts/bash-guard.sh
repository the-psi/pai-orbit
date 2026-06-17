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
" "$1" 2>/dev/null || \
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$1"
  exit 0
}

# Normalise newlines so multi-line command strings don't split a blocked token across lines.
cmd_oneline=$(printf '%s' "$cmd" | tr '\n' ' ')

# Force-push block
if printf '%s' "$cmd_oneline" | grep -qE 'git[[:space:]]+push.*(--force|[[:space:]]-f([[:space:]]|$))'; then
  deny "Force-push detected. Never force-push to a shared branch. If you genuinely need this, run the command manually outside Claude."
fi

# Bulk-staging block (-u/--update included: re-stages all tracked files including previously-committed secrets)
if printf '%s' "$cmd_oneline" | grep -qE '(^|[[:space:]]|;|&&|\|\|)git[[:space:]]+add[[:space:]]+(\.|-A|--all|-u|--update)([[:space:]]|;|$)'; then
  deny "Bulk staging (git add . / -A / --all / -u) is blocked. Stage specific files to prevent .env, credentials, and generated files from leaking into commits."
fi

# Hook-bypass block (covers commit, push, merge, and rebase)
if printf '%s' "$cmd_oneline" | grep -qE 'git[[:space:]]+(commit|push|merge|rebase).*--no-verify'; then
  deny "Hook bypass (--no-verify) is blocked. If a hook is failing, fix the underlying issue rather than skipping it."
fi

# Destructive rm block — matches -rf, -fr, and -r regardless of flag order
if printf '%s' "$cmd_oneline" | grep -qE 'rm[[:space:]]+-(rf?|fr)[[:space:]]+(\/|~|\$HOME|\.)([[:space:]]|$)'; then
  deny "Potentially destructive rm detected. Refusing to run rm -rf on root, home, or current directory. Specify an explicit target path."
fi

# --- Project-specific blocks go below this line ---
# Example:
# if printf '%s' "$cmd_oneline" | grep -q "my-protected-resource"; then
#   deny "Reason why this is blocked for this project."
# fi

exit 0
