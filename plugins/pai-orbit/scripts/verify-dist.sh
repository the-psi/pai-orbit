#!/usr/bin/env bash
# verify-dist.sh — dist/copilot/ frontmatter and anti-drift gate.
#
# Phase 2 of the Copilot adapter upgrade
#   docs/plans/copilot-adapter-upgrade-2026-06-28.md
# Spec:
#   docs/features/copilot-adapter-prompt-files/design.md (§9)
#
# Checks every *.prompt.md and *.instructions.md under dist/copilot/:
#   - Frontmatter starts at line 1 with `---` and closes with `---`.
#   - Prompt files declare `description:` whose value starts with `[mode] `,
#     `[skill] `, or `[agent] ` (D20 prefix convention).
#   - Mode/skill prompts declare `agent: agent`.
#   - Agent (service-builder) prompts declare `mode: agent` and a `tools:` line (D30).
#   - Instructions files declare `applyTo:`.
#   - Mode prompts include the anti-drift block (D28) within the head of the
#     file — the verifier looks for `Do NOT` and `[<MODE>]` markers near the
#     top of each mode prompt.
#
# Exits non-zero on the first failure, with a clear message naming the file
# and the missing field.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DIST_DIR="${DIST_DIR:-$PLUGIN_DIR/dist/copilot}"

if [ ! -d "$DIST_DIR" ]; then
  echo "verify-dist: DIST_DIR not found: $DIST_DIR" >&2
  exit 1
fi

errors=0
fail() {
  echo "verify-dist: FAIL — $1" >&2
  errors=$((errors + 1))
}

# Extract the YAML frontmatter block (everything between the first two `---` lines).
# Prints the block (excluding the fences) to stdout, or nothing if absent.
extract_frontmatter() {
  awk 'BEGIN{p=0} /^---[[:space:]]*$/{p++; if(p==2)exit; next} p==1{print}' "$1"
}

# Read a single-line YAML scalar value for `key:` — returns the raw value (no
# unwrapping of quotes). Empty string if the key is missing.
yaml_value() {
  local file="$1"; local key="$2"
  extract_frontmatter "$file" \
    | awk -v k="$key" 'BEGIN{p="^" k ":[[:space:]]*"} $0 ~ p {sub(p, ""); print; exit}'
}

# Strip surrounding double or single quotes from a YAML scalar.
unquote() {
  local s="$1"
  case "$s" in
    \"*\") s="${s#\"}"; s="${s%\"}" ;;
    \'*\') s="${s#\'}"; s="${s%\'}" ;;
  esac
  printf '%s' "$s"
}

verify_prompt_file() {
  local file="$1"
  local rel="${file#"$DIST_DIR/"}"

  # Must open with `---` at line 1.
  local first
  first="$(head -1 "$file")"
  if [ "$first" != "---" ]; then
    fail "$rel: missing opening '---' on line 1"
    return
  fi

  local fm
  fm=$(extract_frontmatter "$file")
  if [ -z "$fm" ]; then
    fail "$rel: empty or unterminated frontmatter"
    return
  fi

  local desc_raw desc
  desc_raw=$(yaml_value "$file" "description")
  desc=$(unquote "$desc_raw")
  if [ -z "$desc" ]; then
    fail "$rel: missing 'description:' field"
    return
  fi

  # D20 — every prompt description starts with [mode], [skill], or [agent].
  local kind=""
  case "$desc" in
    "[mode] "*)  kind="mode" ;;
    "[skill] "*) kind="skill" ;;
    "[agent] "*) kind="agent" ;;
    *)
      fail "$rel: description must start with '[mode] ', '[skill] ', or '[agent] ' (got: $desc)"
      return
      ;;
  esac

  # Read the runtime shape from frontmatter fields (independent of prefix kind):
  #   - `mode: agent` + `tools:` → agent-mode prompt (Copilot Business multi-step
  #     agent). Used by service-builder prompts and by /setup.
  #   - `agent: agent` → standard prompt-following (mode or skill).
  local mode_field agent_field tools_field
  mode_field=$(yaml_value "$file" "mode")
  agent_field=$(yaml_value "$file" "agent")
  tools_field=$(yaml_value "$file" "tools")

  local is_agent_runtime="false"
  if [ "$mode_field" = "agent" ]; then
    is_agent_runtime="true"
    if [ -z "$tools_field" ]; then
      fail "$rel: 'mode: agent' prompt must declare a 'tools:' field"
    fi
  elif [ "$agent_field" = "agent" ]; then
    is_agent_runtime="false"
  else
    fail "$rel: prompt must declare either 'mode: agent' + tools (agent runtime) or 'agent: agent' (standard). Got mode='$mode_field' agent='$agent_field'"
    return
  fi

  # Prefix-kind sanity: `[agent]` prefix implies agent runtime. `[mode]` or
  # `[skill]` prefix can use either runtime (setup mode uses agent runtime).
  if [ "$kind" = "agent" ] && [ "$is_agent_runtime" = "false" ]; then
    fail "$rel: '[agent]' prefix must pair with 'mode: agent' frontmatter"
  fi

  # Anti-drift block check: applies to mode prompts using the STANDARD runtime
  # (agent: agent). Agent-runtime prompts like /setup are one-shot workflows,
  # not persistent headspaces — anti-drift is inapplicable and must not be
  # required.
  if [ "$kind" = "mode" ] && [ "$is_agent_runtime" = "false" ]; then
    local head_block
    head_block=$(head -25 "$file")
    if ! printf '%s' "$head_block" | grep -q 'Do NOT'; then
      fail "$rel: mode prompt missing 'Do NOT' marker in anti-drift block (D28)"
    fi
    if ! printf '%s' "$head_block" | grep -qE '\[[A-Z]+\]'; then
      fail "$rel: mode prompt missing '[<MODE>]' marker in anti-drift block (D28)"
    fi
  fi
}

verify_instructions_file() {
  local file="$1"
  local rel="${file#"$DIST_DIR/"}"

  local first
  first="$(head -1 "$file")"
  if [ "$first" != "---" ]; then
    fail "$rel: missing opening '---' on line 1"
    return
  fi

  local fm
  fm=$(extract_frontmatter "$file")
  if [ -z "$fm" ]; then
    fail "$rel: empty or unterminated frontmatter"
    return
  fi

  local apply_raw apply
  apply_raw=$(yaml_value "$file" "applyTo")
  apply=$(unquote "$apply_raw")
  if [ -z "$apply" ]; then
    fail "$rel: missing 'applyTo:' field"
  fi
}

# ---------------------------------------------------------------------------
# Required artefacts (design §1).
# ---------------------------------------------------------------------------

required_present() {
  local path="$1"
  if [ ! -f "$DIST_DIR/$path" ]; then
    fail "missing required file: $path"
  fi
}

required_present ".github/copilot-instructions.md"
required_present ".github/instructions/git.instructions.md"
required_present ".github/instructions/data-model.instructions.md"
required_present ".github/instructions/arch-drift.instructions.md"
required_present ".github/instructions/context-discovery.instructions.md"
required_present ".husky/pre-commit.template"
required_present ".pre-commit-config.yaml.template"

# ---------------------------------------------------------------------------
# Walk every prompt and instructions file.
# ---------------------------------------------------------------------------

shopt -s nullglob

prompt_count=0
for f in "$DIST_DIR"/.github/prompts/*.prompt.md; do
  verify_prompt_file "$f"
  prompt_count=$((prompt_count + 1))
done

instructions_count=0
for f in "$DIST_DIR"/.github/instructions/*.instructions.md; do
  verify_instructions_file "$f"
  instructions_count=$((instructions_count + 1))
done

# Counts must match the target layout:
#   13 mode prompts (12 standard + /setup which uses agent runtime)
# +  6 skill prompts
# +  7 service-builder agent prompts
# = 26 total prompts. D13 originally dropped /setup (giving 12 modes = 25 prompts);
#   superseded 2026-07-04 — /setup is emitted as an agent-runtime mode prompt
#   for Copilot Business tier. /suggest-skills stays dropped.
expected_prompts=26
expected_instructions=4

if [ "$prompt_count" -ne "$expected_prompts" ]; then
  fail "expected $expected_prompts prompt files, found $prompt_count"
fi
if [ "$instructions_count" -ne "$expected_instructions" ]; then
  fail "expected $expected_instructions instructions files, found $instructions_count"
fi

if [ "$errors" -gt 0 ]; then
  echo "verify-dist: $errors failure(s)." >&2
  exit 1
fi

echo "verify-dist: OK — $prompt_count prompt file(s), $instructions_count instructions file(s)."
