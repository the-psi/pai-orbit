#!/usr/bin/env bash
# verify-dist.sh — dist/copilot/ frontmatter and anti-drift gate.
#
# Design decisions cited by D-number in comments are recorded in
# `docs/decisions/2026-07-25-copilot-adapter-decisions.md`.
#
# Checks every *.prompt.md and *.instructions.md under dist/copilot/:
#   - Frontmatter starts at line 1 with `---` and closes with `---`.
#   - Prompt files declare `description:` whose value starts with `[mode] `,
#     `[skill] `, or `[agent] ` (prefix convention).
#   - Every prompt declares `mode: agent` (documented Copilot key). The
#     undocumented `agent:` key is explicitly rejected.
#   - Every prompt declares a `tools:` array containing `codebase` at minimum
#     (all prompts need codebase read access; specific agents like
#     /cross-repo-impact restrict to read-only tools by design).
#   - Instructions files declare `applyTo:`.
#   - Persistent-headspace mode prompts include the anti-drift block within
#     the head of the file — the verifier looks for `Do NOT` and the exact
#     `[<MODE>]` marker matching the prompt's filename (e.g., `build.prompt.md`
#     must contain `[BUILD]`, not any `[<X>]` token).
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

  # Prefix convention — every prompt description starts with [mode], [skill], or [agent].
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

  # Read the runtime shape from frontmatter (D38, 2026-07-05):
  # All Copilot prompts must declare `mode: agent` + a `tools:` array. The
  # earlier `agent: agent` shape was not a recognised Copilot key and silently
  # downgraded prompts to ask mode — fail loudly if it appears.
  local mode_field agent_field tools_field
  mode_field=$(yaml_value "$file" "mode")
  agent_field=$(yaml_value "$file" "agent")
  tools_field=$(yaml_value "$file" "tools")

  if [ -n "$agent_field" ]; then
    fail "$rel: 'agent:' frontmatter key is not a valid Copilot prompt field (D38). Use 'mode: agent' with a 'tools:' array."
    return
  fi
  if [ "$mode_field" != "agent" ]; then
    fail "$rel: prompt must declare 'mode: agent' (got mode='$mode_field'). All 29 prompts run agentically on Copilot Business — mode prompts need tool access to write docs/features/*, skills need shell for /git and /board, etc."
    return
  fi
  if [ -z "$tools_field" ]; then
    fail "$rel: 'mode: agent' prompt must declare a 'tools:' field"
    return
  fi
  # Tools list content check: must be a non-empty array containing at least
  # "codebase" (every prompt needs codebase read access). Reject the trivial
  # empty-array `[]` shape. Restricted-tools prompts like /cross-repo-impact
  # legitimately drop editFiles/runCommands, so this check is minimum-viable
  # rather than an exact-list match — the shipped tools list can be inspected
  # by opening the file.
  case "$tools_field" in
    "[]"|"[ ]"|"[  ]")
      fail "$rel: 'tools:' field is empty ('$tools_field'); prompt cannot run agentically without at least 'codebase'"
      return
      ;;
  esac
  if ! printf '%s' "$tools_field" | grep -q '"codebase"'; then
    fail "$rel: 'tools:' array must contain \"codebase\" (got: $tools_field)"
    return
  fi

  # Anti-drift block check: applies to persistent-headspace mode prompts (arch,
  # build, design, groom, review, plan, data, domain, ux, test, incident,
  # release). /setup and /suggest-skills are one-shot workflows that use a
  # Copilot-adapter-specific preamble instead — anti-drift is inapplicable.
  if [ "$kind" = "mode" ]; then
    local prompt_base
    prompt_base=$(basename "$file" .prompt.md)
    case "$prompt_base" in
      setup|suggest-skills)
        : ;;  # preamble-based, no anti-drift block required
      *)
        local head_block
        head_block=$(head -25 "$file")
        if ! printf '%s' "$head_block" | grep -q 'Do NOT'; then
          fail "$rel: mode prompt missing 'Do NOT' marker in anti-drift block"
        fi
        # The anti-drift marker must match the mode's own name (e.g.,
        # build.prompt.md must contain `[BUILD]`, not any `[<X>]` token).
        # Prevents an accidentally-swapped marker from passing verification.
        local expected_marker
        expected_marker="[$(printf '%s' "$prompt_base" | tr '[:lower:]' '[:upper:]')]"
        if ! printf '%s' "$head_block" | grep -qF "$expected_marker"; then
          fail "$rel: mode prompt missing expected marker '$expected_marker' in anti-drift block"
        fi
        ;;
    esac
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
required_present ".github/instructions/decisions.instructions.md"
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
#   14 mode prompts (12 standard + /setup + /suggest-skills; last two agent-runtime)
# +  6 skill prompts
# +  7 service-builder agent prompts
# +  2 named sub-agents (docs-writer, cross-repo-impact) — added 2026-07-05
# = 29 total prompts.
# +  5 instructions files (git, data-model, arch-drift, context-discovery, decisions)
#   — decisions.instructions.md added 2026-07-05 to mirror the always-on ADR
#   obligation rule that Cursor and Claude adapters already provide.
expected_prompts=29
expected_instructions=5

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
