#!/usr/bin/env bash
# lint-ts-wrapper.sh — Codex→Claude stdin bridge for lint-ts.sh.
# Extracts touched paths via _extract-touched-paths.py, filters to
# *.ts|*.tsx|*.js|*.jsx, and pipes a Claude-shape payload per path into
# the core lint-ts.sh (which resolves the repo= setup and runs eslint).
# Advisory only.

set +e

wrapper_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
core_script="$wrapper_dir/lint-ts.sh"
extractor="$wrapper_dir/_extract-touched-paths.py"

[ -x "$core_script" ] || exit 0
[ -f "$extractor" ] || exit 0

input=$(cat)
[ -z "$input" ] && exit 0

paths=$(printf '%s' "$input" | python3 "$extractor" 2>/dev/null)
[ -z "$paths" ] && exit 0

while IFS= read -r path; do
  [ -z "$path" ] && continue
  case "$path" in
    *.ts|*.tsx|*.js|*.jsx) ;;
    *) continue ;;
  esac
  encoded=$(python3 -c 'import sys, json; print(json.dumps(sys.argv[1]))' "$path" 2>/dev/null)
  [ -z "$encoded" ] && continue
  printf '{"tool_name":"Edit","tool_input":{"file_path":%s}}' "$encoded" | "$core_script"
done <<< "$paths"

exit 0
