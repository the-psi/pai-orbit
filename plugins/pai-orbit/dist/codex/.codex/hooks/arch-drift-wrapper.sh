#!/usr/bin/env bash
# arch-drift-wrapper.sh — Codex→Claude stdin bridge for arch-drift-guard.sh.
# Reads a Codex apply_patch PostToolUse payload from stdin, extracts touched
# paths via _extract-touched-paths.py (Primary/Fallback/Future-proof triad),
# and pipes a Claude-shape payload per path into the underlying core
# arch-drift-guard.sh (which does the structural-filename filter itself).
# Advisory only. Never blocks.

set +e

wrapper_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
core_script="$wrapper_dir/arch-drift-guard.sh"
extractor="$wrapper_dir/_extract-touched-paths.py"

[ -x "$core_script" ] || exit 0
[ -f "$extractor" ] || exit 0

input=$(cat)
[ -z "$input" ] && exit 0

paths=$(printf '%s' "$input" | python3 "$extractor" 2>/dev/null)
[ -z "$paths" ] && exit 0

while IFS= read -r path; do
  [ -z "$path" ] && continue
  encoded=$(python3 -c 'import sys, json; print(json.dumps(sys.argv[1]))' "$path" 2>/dev/null)
  [ -z "$encoded" ] && continue
  printf '{"tool_name":"Edit","tool_input":{"file_path":%s}}' "$encoded" | "$core_script"
done <<< "$paths"

exit 0
