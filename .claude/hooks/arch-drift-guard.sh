#!/usr/bin/env bash
# arch-drift-guard.sh — PostToolUse (async, advisory)
# Fires after Edit/Write on files that commonly signal architectural change.
# Never blocks. Prints a one-line advisory to stdout only.

set +e

input=$(cat)
FILE_PATH=$(printf '%s' "$input" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path') or d.get('tool_input', {}).get('path') or '')
except Exception:
    print('')
" 2>/dev/null || echo "")

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

FILENAME=$(basename "$FILE_PATH")

# Structural signal patterns — files whose change often reflects an architectural shift
STRUCTURAL_PATTERNS=(
  "docker-compose.yml"
  "docker-compose.yaml"
  "fly.toml"
  "vercel.json"
  "app.yaml"
  "requirements.txt"
  "package.json"
  "go.mod"
  "Cargo.toml"
  "pyproject.toml"
  "main.py"
  "app.py"
  "index.ts"
  "index.js"
  "server.ts"
  "server.js"
)

for pattern in "${STRUCTURAL_PATTERNS[@]}"; do
  if [[ "$FILENAME" == "$pattern" ]]; then
    echo ""
    echo "[arch-drift-guard] Structural file edited: $FILE_PATH"
    echo "  Consider running /arch validate after this session to check architecture alignment."
    exit 0
  fi
done

exit 0
