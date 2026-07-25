#!/usr/bin/env bash
# Top-level build for the pai-orbit plugin.
# Iterates adapters/*/build.sh and invokes each. Fails fast.
set -euo pipefail

# Pin locale so string-length operations (${#var}) count characters
# consistently on Windows Git Bash, Linux, macOS, and CI. Multi-byte
# characters in mode/skill descriptions (em-dashes, curly quotes) would
# otherwise produce different truncation output under different LC_CTYPE
# settings — the committed dist/ tree only reproduces under a pinned locale.
export LC_ALL=C.UTF-8
export LANG=C.UTF-8

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -d "$PLUGIN_DIR/core" ]; then
  echo "build: core/ not found at $PLUGIN_DIR/core" >&2
  exit 1
fi

shopt -s nullglob
adapters=("$PLUGIN_DIR"/adapters/*/build.sh)
if [ ${#adapters[@]} -eq 0 ]; then
  echo "build: no adapters found under $PLUGIN_DIR/adapters/*/build.sh" >&2
  exit 1
fi

for adapter_script in "${adapters[@]}"; do
  adapter_name="$(basename "$(dirname "$adapter_script")")"
  echo "build: running $adapter_name adapter..."
  # Invoke via bash so we don't depend on the exec bit being set in the working copy.
  # Unset CORE_DIR/DIST_DIR so a caller's exported values don't silently override adapter defaults.
  env -u CORE_DIR -u DIST_DIR bash "$adapter_script"
done

echo "build: all adapters complete"
