#!/usr/bin/env bash
# lint-python-wrapper.sh — Codex→Claude stdin bridge for lint-python.sh.
# Extracts touched paths via _extract-touched-paths.py, filters to *.py, and
# pipes a Claude-shape payload per path into the core lint-python.sh (which
# resolves the repo= setup and runs ruff check). Advisory only.

set +e

wrapper_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
core_script="$wrapper_dir/lint-python.sh"
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
    *.py) ;;
    *) continue ;;
  esac
  encoded=$(python3 -c 'import sys, json; print(json.dumps(sys.argv[1]))' "$path" 2>/dev/null)
  [ -z "$encoded" ] && continue
  printf '{"tool_name":"Edit","tool_input":{"file_path":%s}}' "$encoded" | "$core_script"
done <<< "$paths"

exit 0
