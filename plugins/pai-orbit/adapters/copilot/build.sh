#!/usr/bin/env bash
# GitHub Copilot adapter — prompt files, instructions files, hook surrogates.
#
# Pin locale so string-length operations (${#var}) in truncate_description()
# and elsewhere count characters, not bytes. Multi-byte em-dashes in mode/skill
# descriptions otherwise produce different truncated bytes on different systems
# (CI's default UTF-8 locale vs LC_ALL=C).
#
# Architectural decisions cited by D-number in comments below are recorded in
# `docs/decisions/2026-07-25-copilot-adapter-decisions.md`.
#
# Emits dist/copilot/ with:
#   .github/copilot-instructions.md          slim rule book + context discovery
#   .github/prompts/<mode>.prompt.md         14 mode prompts (all of core/modes/;
#                                             /setup and /suggest-skills use agent runtime)
#   .github/prompts/<skill>.prompt.md         6 skill prompts
#   .github/prompts/<stack>-builder.prompt.md 7 service-builder agent prompts (mode: agent per D30)
#   .github/instructions/git.instructions.md
#   .github/instructions/data-model.instructions.md
#   .github/instructions/arch-drift.instructions.md
#   .github/instructions/context-discovery.instructions.md  (R8 fall-back)
#   .husky/pre-commit.template                bash-guard intent at git layer (D29)
#   .pre-commit-config.yaml.template          pre-commit-framework alternative (D29)
#
# No editor-specific files are emitted (D33).
set -euo pipefail

# Locale pin — see header comment. Applied here too in case this script
# is invoked directly (not via the top-level build.sh).
export LC_ALL=C.UTF-8
export LANG=C.UTF-8

ADAPTER_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$ADAPTER_DIR/../.." && pwd)"

CORE_DIR="${CORE_DIR:-$PLUGIN_DIR/core}"
DIST_DIR="${DIST_DIR:-$PLUGIN_DIR/dist/copilot}"
VERIFY_SCRIPT="${VERIFY_SCRIPT:-$PLUGIN_DIR/scripts/verify-dist.sh}"

if [ ! -d "$CORE_DIR" ]; then
  echo "copilot adapter: CORE_DIR not found: $CORE_DIR" >&2
  exit 1
fi

# Safety: refuse to rm -rf anything outside the plugin tree.
case "$DIST_DIR" in
  "$PLUGIN_DIR"/*) ;;
  *) echo "copilot adapter: DIST_DIR '$DIST_DIR' is outside PLUGIN_DIR — refusing rm -rf" >&2; exit 1 ;;
esac

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/.github/prompts"
mkdir -p "$DIST_DIR/.github/instructions"
mkdir -p "$DIST_DIR/.husky"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Path rewrites for the Copilot adapter. Symmetric .copilot/ folder (matching
# .claude/ and .cursor/). Hook references from shared source are stripped via
# the setup.md pipeline's Step 3/4 replacement (see D39) — Copilot has no
# native hook runtime so hook-emit logic doesn't apply.
rewrite_paths() {
  sed \
    -e 's|\.claude/pai-orbit-config\.md|.copilot/pai-orbit-config.md|g' \
    -e 's|\.claude/team\.md|.copilot/team.md|g' \
    -e 's|\.claude/agents/|.copilot/agents/|g' \
    -e 's|\.claude/skills/|.copilot/skills/|g' \
    -e 's|\.claude/rules/|.copilot/rules/|g' \
    -e 's|`\.claude/`|`.copilot/`|g'
}

# D37: rewrite standalone `CLAUDE.md` references → `AGENTS.md` for the Copilot
# target. Applied on top of `rewrite_paths` for mode/skill/agent bodies where
# inline "Read CLAUDE.md" pointers should redirect to the Copilot filename.
# For setup.md, applied AFTER `strip_non_copilot_targets` removes the Claude
# Code and Cursor target blocks — the surviving Copilot-target block uses only
# single-filename wording, so the blanket rewrite is safe.
# The `.template` filename is preserved (source-of-truth still lives under
# `templates/CLAUDE.md.template`).
rewrite_agents_md() {
  sed \
    -e 's|`CLAUDE\.md`|`AGENTS.md`|g' \
    -e 's|\([^-a-zA-Z0-9_]\)CLAUDE\.md\b|\1AGENTS.md|g' \
    -e 's|^CLAUDE\.md\b|AGENTS.md|g' \
    -e 's|AGENTS\.md\.template|CLAUDE.md.template|g'
}

# D39 (2026-07-05): Copilot's setup.prompt.md is assembled by:
#   1. Passing Steps 1, 2, and 2b of the shared core/modes/setup.md through the
#      standard path + AGENTS.md rewrites (target-agnostic content — scan,
#      interview questions, board discovery).
#   2. Stopping the pass-through at `## Step 3 — Generate` (shared source's
#      Step 3+4 are Claude-Code-specific — .claude/, hooks, .claude/settings.json
#      merge, etc. — none of it applies to Copilot).
#   3. Appending the Copilot Step 3 target block + Copilot Step 4 report, both
#      defined as heredocs below (emit_copilot_step3_block, emit_copilot_step4_report).
# This keeps the shared setup.md byte-identical to main — Claude Code and Cursor
# adapters emit it unchanged. Copilot content lives entirely in this build.sh.
transform_setup_for_copilot() {
  awk -v step3_file="$1" -v step4_file="$2" '
    # Stop passing shared source at Step 3 — everything after is Claude-specific.
    /^## Step 3 — Generate$/ {
      # Emit Copilot Step 3 + Step 4 content in place of the shared Step 3+4.
      while ((getline line < step3_file) > 0) print line
      close(step3_file)
      while ((getline line < step4_file) > 0) print line
      close(step4_file)
      exit
    }
    { print }
  '
}

# D40 (2026-07-05, extended D41 2026-07-05): Copilot-adapted preamble
# prepended to shared workflow modes (/groom, /design, /build) that need to
# resolve a board issue number reference (e.g. "#16", "issue 16", "ticket 16")
# into a feature identifier (slug + title). Board type comes from
# `.copilot/pai-orbit-config.md` and drives the tool choice (glab api / gh
# api / MCP). All three modes need this because /groom uses the slug for the
# feature folder name, /design uses it to locate the feature under active
# work, and /build uses it for the gitflow branch name (`feature/<slug>`).
# Falls back to asking the user directly if the lookup can't succeed.
emit_board_lookup_preamble() {
  cat <<'EOF'
> **Copilot-adapted preamble — board issue lookup.**
> If the user's request references a board issue by number (e.g. `#16`,
> `issue 16`, `ticket 16`, or a bare number in board context), auto-resolve
> it to a feature identifier (slug + title) before proceeding with the
> mode's main workflow — do not ask the user to name the feature manually
> if a board lookup can succeed.
>
> **Resolution steps:**
>
> 1. Read `.copilot/pai-orbit-config.md`. Find the `## Agile Board` section and
>    extract the board `type` (one of: `gitlab`, `github`, `github-projects`,
>    `linear`, `jira`, `notion`, `none`) and the board URL / project path.
> 2. Query the issue using the matching tool via `runCommands`. **Prefer the
>    direct API subcommand over the "smart" issue-view subcommand** — the
>    latter can prompt interactively for repo selection, which hangs Copilot's
>    non-interactive shell. This matches the pattern Step 2b of /setup already
>    uses to query boards.
>    - **gitlab** — `glab api /projects/<url-encoded-namespace-and-project>/issues/<n>`
>      where `<url-encoded-namespace-and-project>` is the namespace/project path
>      with `/` URL-encoded as `%2F` (example: `Internal%2Fpsi-portal`). The
>      response is JSON; read the `title` field. Do NOT use `glab issue view`
>      — it prompts for repo selection when the working directory's git remote
>      doesn't match the requested repo.
>    - **github** or **github-projects** — `gh api /repos/<owner>/<repo>/issues/<n>`.
>      Read the `title` field from the JSON response. Do NOT use `gh issue view`
>      for the same interactive-prompting reason.
>    - **linear** — Linear MCP server if configured (check for a `board:` MCP
>      entry in the `## MCP` section of the config). If no MCP is configured,
>      skip lookup — the `linear` CLI is interactive-heavy and not suitable
>      for scripted runs.
>    - **jira** — Jira MCP server if configured. If no MCP is configured, skip
>      lookup — the Atlassian CLIs are interactive-heavy.
>    - **notion** — Notion MCP required. If not configured, skip lookup.
>    - **none** — no board configured; skip lookup.
> 3. Extract the issue title from the tool output. Propose a feature slug
>    derived from the title: lowercase, whitespace → `-`, strip punctuation
>    other than `-`, no leading digits. Example: title `"Add configurable
>    billing periods per client"` → slug `billing-periods` (or
>    `add-configurable-billing-periods` if a longer form is more descriptive).
> 4. Confirm the slug + title with the user in one message before continuing.
>    The user may adjust the slug. Also check whether a folder already exists
>    at `docs/features/<slug>/` — if yes, prefer refining existing files over
>    creating new ones.
> 5. Once the slug + title are confirmed, proceed with the mode's normal
>    workflow using that slug:
>    - **/groom** — create or refine `docs/features/<slug>/requirements.md`.
>    - **/design** — create or refine `docs/features/<slug>/design.md`; also
>      read existing `requirements.md` in the same folder for context.
>    - **/build** — derive the branch name from the slug per the configured
>      branching model (gitflow → `feature/<slug>`, github-flow → `<slug>`),
>      confirm the branch action with the user, then proceed to code edits.
>
> **Fallback behaviour** — if ANY of the following happens, skip the lookup
> and ask the user for the feature slug directly (the shared mode behaviour
> below covers this path):
>
> - The user's message does not reference an issue number.
> - The board `type` is `none` or missing.
> - The required CLI tool is not installed (`command -v <tool>` fails).
> - The board query returns an error (auth, network, issue not found).
> - No MCP server is configured for a board type that requires one (Notion).
>
> Do not fabricate an issue title if the lookup fails — always fall back to
> asking. Do not proceed to the mode's main workflow with an unconfirmed slug.

EOF
}

emit_copilot_step3_block() {
  cat <<'EOF'
## Step 2c — Copilot install questions

Before scaffolding, additionally ask:

- **"Install the optional `.husky/pre-commit` hook (commit-time lint + weak secret tripwire; does NOT block `git push --force` or `git add -A`)?"** Default: `yes` if the project has `.git/`, `no` otherwise.
- **"Choose pre-commit installer: husky / pre-commit framework / both / neither"**. Detection-driven defaults: `husky` if `.husky/` exists or `package.json` has a husky dep; `pre-commit` if `.pre-commit-config.yaml` already exists; `husky` otherwise.

## Step 3 — Generate

Create the following files. Tell the user what was created and what they need to fill in by hand.

The Copilot adapter output lives in `plugins/pai-orbit/dist/copilot/` and is copied verbatim into the project, then `.copilot/` config files are rendered from the Step 2 interview answers.

### Files to write

Copy from the built `dist/copilot/` tree:

| Source | Destination | Behaviour |
|--------|-------------|-----------|
| `dist/copilot/.github/copilot-instructions.md` | `<project>/.github/copilot-instructions.md` | **Overwrite** — pai-orbit owns this. |
| `dist/copilot/.github/prompts/` | `<project>/.github/prompts/` | **Overwrite** the pai-orbit-emitted `*.prompt.md` files. Leave any user-authored prompts alone. |
| `dist/copilot/.github/instructions/` | `<project>/.github/instructions/` | **Overwrite** the pai-orbit-emitted `*.instructions.md` files. Leave any user-authored instructions alone. |
| `dist/copilot/.husky/pre-commit.template` | `<project>/.husky/pre-commit.template` | **Always copy** as the inert `.template`. If the user opted in to `husky`, additionally rename to `.husky/pre-commit`, `chmod +x`, and run `git update-index --add --chmod=+x .husky/pre-commit` so the exec bit is tracked. |
| `dist/copilot/.pre-commit-config.yaml.template` | `<project>/.pre-commit-config.yaml.template` | **Always copy** as the inert `.template`. If the user opted in to `pre-commit framework`, rename to `.pre-commit-config.yaml` and instruct the user to run `pre-commit install` (this step does NOT install Python tooling itself). |

Render from templates using the Step 2 answers:

### `.copilot/pai-orbit-config.md`

Use the template at `templates/pai-orbit-config.md.template`. Fill all sections from the answers above and the board discovery in Step 2b.

For the `## Agile Board → columns` table, use **only** the column names and labels confirmed in Step 2b — never write placeholder or example values. Delete the tool-specific comment blocks that don't apply to the chosen board type.

For the `## System Docs` section:
- If the user answered **no** to the multi-repo question: omit the `## System Docs` section entirely from the generated file (do not write it with blank values).
- If the user answered **yes** and provided a **relative path**: check whether that directory exists before writing. If it does not exist, warn the user ("System docs path not found — writing the pointer anyway; ensure the repo is cloned before running commands") and write it as given.
- If the user answered **yes** and provided a **git URL**: write it as-is. Do not attempt to clone or validate — note that the user must clone the repo locally before commands can read from it.

### `.copilot/team.md`

Use the template at `templates/team.md.template`. Populate from team answers.

### `.copilot/settings.json`

Write the following JSON, replacing placeholders:

```json
{
  "pai_orbit_version": "<version from plugins/pai-orbit/core/plugin.json>",
  "target": "copilot",
  "installed_at": "<ISO-8601 UTC timestamp at scaffold time>",
  "husky_opted_in": <true if user picked husky or both, else false>,
  "detected_languages": [<languages inferred from Step 1 file scan>],
  "precommit_installer": "<husky | pre-commit | both | neither>"
}
```

This file is read on subsequent re-runs (`/setup` or `npx … init copilot`) to know what was previously installed and to drive the diff report.

### `AGENTS.md`

Use the template at `templates/CLAUDE.md.template` (source template kept under its historical name; the emitted file for the Copilot target is `AGENTS.md`). Fill in:
- Project name and one-line description
- Sub-projects / services table (name, path, stack, purpose)
- Commands section (dev server, build, test for each service)
- Leave architecture section with clear `<!-- TODO: fill in by hand -->` markers

If a `CLAUDE.md` already exists at repo root (legacy pre-D37 install), do not overwrite it. Create `AGENTS.md` alongside and tell the user to migrate content by hand — the Copilot adapter's `copilot-instructions.md` reads `AGENTS.md` first and falls back to `CLAUDE.md`, so both files can coexist.

### MCP configuration

If the user provided MCP server answers in Step 2, write an `## MCP` section to `.copilot/pai-orbit-config.md`:

```markdown
## MCP

git: {{GIT_MCP_SERVER}}
<!-- Choose one: github | gitlab | none -->

board: {{BOARD_MCP_SERVER}}
<!-- Choose one: github | linear | jira | none -->

docs: {{DOCS_MCP_SERVER}}
<!-- Choose one: confluence | notion | none -->
```

Omit the `## MCP` section entirely if all three answers are "none".

### Docs scaffold

If `docs/` does not exist, copy the scaffold from `templates/docs/` to the configured docs path.
If a dedicated docs repo path was given, create the scaffold there.
If Confluence or Notion: skip the scaffold, note the MCP setup required (see Getting Started).

### Architecture scaffold

Copy `templates/docs/architecture/system.md`, `constraints.md`, and `stack.md` to `docs/architecture/` (replacing `{{PROJECT_NAME}}` and `{{DATE}}`).

Populate `stack.md` from the language and framework info discovered in Step 1.

If the user answered the architecture question (Step 2, item 8), pre-populate the service table in `system.md` and the rules in `constraints.md` from those answers. Otherwise leave as stubs.

Tell the user: "Run `/arch init` to complete your architecture declaration. Once declared, `/build` and `/review` will read `constraints.md` to enforce architectural rules automatically."

### What is NOT written for the Copilot target

- **No `.claude/` folder.** That is the Claude Code path.
- **No `.cursor/` folder.** That is the Cursor path.
- **No native hooks (`.claude/hooks/`).** Copilot has no hook event surface. `bash-guard` intent lives in `.github/copilot-instructions.md` as always-loaded advisory text plus the optional `.husky/pre-commit` (or `.pre-commit-config.yaml`). `arch-drift` intent lives in `.github/copilot-instructions.md` and `.github/instructions/arch-drift.instructions.md`. Lint hooks rely on the project's own linter config invoked at commit time by the pre-commit hook — the linter config (`pyproject.toml`, `.eslintrc.json`) is owned by the project, never authored by pai-orbit.
- **No editor-specific files (`.vscode/`, `.idea/`, etc.).** Editor settings are owned by the team. VS Code users who want lint-on-save follow the 4-line copy-paste recipe in `docs/copilot-install-and-usage.md`.
- **Service-builder prompts already ship as `.github/prompts/<stack>-builder.prompt.md`** under the Copilot adapter. On Pro/Business Copilot they run as multi-step agents (read `AGENTS.md`, detect the service, propose file edits); on Free they degrade to regular prompts that still give correct manual scaffolding guidance.

### Standalone install alternative

If the team does not use Claude Code or Cursor, the `/setup` mode is unreachable. Tell the user about the equivalent CLI entry point:

```bash
npx github:the-psi/pai-orbit init copilot
```

It runs the same interview, renders the same files, and is the supported path for Copilot-only teams.

EOF
}

emit_copilot_step4_report() {
  cat <<'EOF'
## Step 4 — Report

List every file created. For each:
- ✅ Complete — no action needed
- ⚠️ Stub — what the human needs to fill in

Architecture files:
- ⚠️ Stub — `docs/architecture/system.md` — run `/arch init` to complete
- ⚠️ Stub — `docs/architecture/constraints.md` — run `/arch init` to define rules
- ✅ Generated — `docs/architecture/stack.md` (populated from detected stack)

Methodology surfaces (always written):
- ✅ Generated — `.github/copilot-instructions.md` — slim rule book + Context discovery + prompt-library pointer
- ✅ Generated — `.github/prompts/` — 29 invokable slash commands (14 modes, 6 skills, 7 service-builder agent prompts, 2 named agents: `docs-writer`, `cross-repo-impact`)
- ✅ Generated — `.github/instructions/` — 5 auto-attaching guidance files (`git`, `data-model`, `arch-drift`, `context-discovery`, `decisions`)
- ✅ Generated — `.copilot/pai-orbit-config.md` — board, branch model, deploy targets, docs home, team conventions
- ✅ Generated — `.copilot/team.md` — team members, owners, default assignees
- ✅ Generated — `.copilot/settings.json` — version, target, install timestamp, husky opt-in, detected languages, pre-commit installer choice

Pre-commit hooks (commit-time lint + weak secret tripwire, depends on the user's Step 2 answer):
- ✅ Generated — `.husky/pre-commit.template` — inert template; rename to `.husky/pre-commit` + `chmod +x` to activate (the exec bit is tracked in git)
- ✅ Generated — `.pre-commit-config.yaml.template` — inert template; rename to `.pre-commit-config.yaml` + run `pre-commit install` to activate
- If user opted into `husky`: ✅ Active — `.husky/pre-commit` is in place, executable, and the exec bit is tracked in git. **Scope:** runs `ruff` / `eslint` on staged files (blocks on lint failure) plus a weak regex secret tripwire. **Does NOT** block `git push --force`, `git add -A`, `--no-verify`, or `rm -rf` — those are pre-push / staging-phase / shell operations that no pre-commit hook can see.
- If user opted into `pre-commit framework`: ✅ Active — `.pre-commit-config.yaml` is in place; remind the user to run `pre-commit install`. Same scope caveats as husky.
- If user picked `both`: both active paths above.
- If user picked `neither`: both inert templates only; user can opt in later.

**Explicit non-emissions:**
- ❌ No `.vscode/`, no `.idea/`, no editor-specific folders. Editor settings are owned by the team. VS Code users follow the 4-line lint-on-save recipe in `docs/copilot-install-and-usage.md`.

**Honest gap statement (read aloud to the user):** Copilot has no runtime hook system. The `bash-guard` intent is delivered **as advisory text only** in `.github/copilot-instructions.md` — Copilot is instructed to refuse `git push --force`, `git add -A`, `--no-verify`, and destructive `rm`, and usually obeys, but this is not enforced. The optional `.husky/pre-commit` (or `.pre-commit-config.yaml`) adds real enforcement **at commit time only**, and its scope is narrow: lint failures block the commit and a weak regex catches obvious credential patterns — it does NOT and cannot block `git push --force` (wrong git phase), `git add -A` (staging happens before the hook), or shell commands like `rm -rf`. For hard enforcement of those patterns, use Claude Code, a separate pre-push hook, or server-side branch protection.

End with: "Run `/suggest-skills` after a few sessions to discover operational skills worth adding."
EOF
}

# Modes skipped on emission for the Copilot adapter.
#
# All core modes emit for Copilot. `/setup` emits as an agent-mode prompt so
# Copilot Business can re-configure inside Chat (Free degrades to advisory
# text). `/suggest-skills` emits as an agent-mode prompt with a Copilot-
# adapted preamble that redirects skill scaffolding from `.claude/skills/`
# to `.github/prompts/` (Copilot's user-prompt surface).
# Nothing is currently skipped — every mode in core/modes/ emits.
is_skipped_mode() {
  case "$1" in
    *) return 1 ;;
  esac
}

# Modes that require Copilot agent mode (mode: agent frontmatter + tools).
# /setup drives file writes and shell commands. /suggest-skills scaffolds a
# suggested skill file at the end of its run (also needs editFiles + codebase).
# Other modes use the standard `mode: agent` shape too (D38) but with an
# anti-drift block instead of a workflow preamble — they are persistent
# headspaces, not one-shot workflows.
needs_agent_mode() {
  case "$1" in
    setup|suggest-skills) return 0 ;;
    *) return 1 ;;
  esac
}

# Modes whose Claude-specific target directory needs a Copilot-specific
# rewrite: `.claude/skills/` → `.github/prompts/`. Applied on top of the
# standard rewrite_paths (which maps to `.copilot/skills/` — the wrong target
# for suggest-skills scaffolding on Copilot).
needs_skills_target_rewrite() {
  case "$1" in
    suggest-skills) return 0 ;;
    *) return 1 ;;
  esac
}

# D40 (2026-07-05, extended D41 2026-07-05): modes that need the shared
# board-issue-lookup preamble prepended. All three workflow modes (groom,
# design, build) resolve board issue numbers into feature identifiers — /groom
# uses the slug for the feature folder, /design uses it to locate the feature,
# /build uses it for the gitflow branch name. Copilot's model is more literal
# about following prompts than Claude Code / Cursor (Anthropic Sonnet-based),
# so the preamble tells it explicitly how to query the board via `glab api` /
# `gh api` / MCP based on the configured board type. Falls back to asking the
# user directly if the lookup can't succeed.
needs_copilot_preamble() {
  case "$1" in
    groom|design|build) return 0 ;;
    *) return 1 ;;
  esac
}

# Mode → uppercase token used in the anti-drift block and the [<MODE>] prefix.
mode_token() {
  case "$1" in
    arch)     echo "ARCH" ;;
    build)    echo "BUILD" ;;
    data)     echo "DATA" ;;
    design)   echo "DESIGN" ;;
    domain)   echo "DOMAIN" ;;
    groom)    echo "GROOM" ;;
    incident) echo "INCIDENT" ;;
    plan)     echo "PLAN" ;;
    release)  echo "RELEASE" ;;
    review)   echo "REVIEW" ;;
    test)     echo "TEST" ;;
    ux)       echo "UX" ;;
    *)        printf '%s' "$1" | tr '[:lower:]' '[:upper:]' ;;
  esac
}

# Mode → one-liner description shown in Copilot's slash-command picker (§2.1).
# Constructed from the source headspace declaration plus the mode's output contract.
mode_description() {
  case "$1" in
    arch)     echo "Declare and maintain system architecture — services, boundaries, data flow, constraints. Writes docs/architecture/ + ADRs." ;;
    build)    echo "Implement features and fixes. Code + updated docs. No architecture debate, no requirements writing." ;;
    data)     echo "Data exploration and analysis session. Writes docs/reports/<topic>-<date>.md." ;;
    design)   echo "Technical design and trade-offs. Writes docs/features/*/design.md + ADRs. No implementation." ;;
    domain)   echo "Capture expert domain knowledge. Writes docs/domain/*.md." ;;
    groom)    echo "Groom feature requirements — purpose, scenarios, then acceptance criteria. Writes docs/features/*/requirements.md." ;;
    incident) echo "Production-incident fast path: triage → build → review → release → post-mortem. Trades thoroughness for speed." ;;
    plan)     echo "Roadmap, prioritisation, and sprint scoping. Writes docs/plans/*.md." ;;
    release)  echo "Deployment session with preflight + post-deploy verification. Stay until healthy or explicitly rolled back." ;;
    review)   echo "Code review against the project's documented architecture, conventions, and requirements." ;;
    test)     echo "Test planning and QA. Writes docs/features/*/test-plan.md." ;;
    ux)       echo "UX and user-flow design. Writes docs/features/*/ux.md." ;;
    setup)    echo "Configure pai-orbit for this project (interactive interview — Business tier agentic; Free tier advisory only)." ;;
    suggest-skills) echo "Analyse this project's workflows and propose invokable skills (git log + docs review). Scaffolds to .github/prompts/." ;;
    *)        echo "pai-orbit $1 mode." ;;
  esac
}

# Per-mode "Do NOT" line for the anti-drift block (design §3.2 table). Backticks
# are backslash-escaped so the double-quoted bash string keeps them literal.
mode_donot_line() {
  case "$1" in
    arch)     echo "Do NOT implement features or design specific solutions — that's \`/design\` or \`/build\`." ;;
    build)    echo "Do NOT debate architecture or re-design — that's \`/design\`. Do NOT write requirements — that's \`/groom\`." ;;
    data)     echo "Do NOT design feature implementations — that's \`/design\`. Do NOT execute deploys — that's \`/release\`." ;;
    design)   echo "Do NOT implement code — that's \`/build\`. Do NOT re-litigate requirements — that's \`/groom\`." ;;
    domain)   echo "Do NOT propose technical solutions or designs — those belong to \`/design\`." ;;
    groom)    echo "Do NOT propose solutions or implementations — that's \`/design\`. Do NOT write code — that's \`/build\`." ;;
    incident) echo "Do NOT plan new features — that's \`/plan\`. Do NOT refactor opportunistically — focus on the incident." ;;
    plan)     echo "Do NOT design solutions for the items you're prioritising — that's \`/design\`." ;;
    release)  echo "Do NOT design new features mid-release — that's \`/design\`. Do NOT add scope." ;;
    review)   echo "Do NOT design replacements for the code under review — flag, don't rewrite." ;;
    test)     echo "Do NOT implement the feature under test — that's \`/build\`." ;;
    ux)       echo "Do NOT design backend or data layers — that's \`/design\`." ;;
    *)        echo "Do NOT do work that belongs to another mode." ;;
  esac
}

# Agent template → one-liner description for the slash-command picker (design §5.2).
# Placeholder-free; the install CLI substitutes `{{SERVICE_NAME}}` etc. inside the body.
agent_description() {
  case "$1" in
    django-builder)          echo "Django service implementation — models, views, serializers, management commands. Runs pytest before claiming done." ;;
    express-builder)         echo "Express/Node service implementation — routes, middleware, controllers, services. Runs npm test before claiming done." ;;
    fastapi-builder)         echo "FastAPI service implementation — routers, services, DB queries, middleware. Runs pytest before claiming done." ;;
    generic-service-builder) echo "Generic service implementation — adapt to project conventions; runs the project's test command before claiming done." ;;
    infra-builder)           echo "Infrastructure and DevOps work — IaC, CI/CD, container and environment config. Plans/previews before apply." ;;
    nextjs-builder)          echo "Next.js app implementation — pages, components, API routes, hooks, data fetching. Lint + build before claiming done." ;;
    react-vite-builder)      echo "React/Vite app implementation — components, pages, hooks, API consumers. Lint + build before claiming done." ;;
    *)                       echo "Service implementation agent." ;;
  esac
}

# Truncate the full picker description (already including `[kind] ` prefix) to
# ~140 chars (design §2.1). Appends a Unicode ellipsis if a cut was made.
truncate_description() {
  local desc="$1"
  local max=140
  if [ "${#desc}" -le "$max" ]; then
    printf '%s' "$desc"
    return 0
  fi
  local cut="${desc:0:$((max - 1))}"
  # Snap back to the last word boundary so we don't slice mid-word.
  case "$cut" in
    *' '*) cut="${cut% *}" ;;
  esac
  printf '%s…' "$cut"
}

# Escape a string for embedding inside a YAML double-quoted scalar. Only `\`
# and `"` need escaping for our inputs — descriptions are single-line.
yaml_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  printf '%s' "$s"
}

# Strip the leading YAML frontmatter block from a markdown file (between the
# first two `---` lines). Prints the body that follows.
strip_frontmatter() {
  awk 'BEGIN{p=0} /^---[[:space:]]*$/{p++; next} p>=2{print}' "$1"
}

# ---------------------------------------------------------------------------
# Emitters
# ---------------------------------------------------------------------------

emit_copilot_instructions() {
  cat > "$DIST_DIR/.github/copilot-instructions.md" <<'EOF'
# pai-orbit — GitHub Copilot rule book

pai-orbit is a mode-driven developer workflow. The mode prompts in `.github/prompts/` carry the headspace and behaviour rules for each mode (`/groom`, `/design`, `/build`, etc.). This file is the always-loaded baseline that applies to every Copilot Chat turn.

## Path conventions

- pai-orbit metadata lives in `.copilot/`: `pai-orbit-config.md`, `team.md`, `settings.json`.
- Project documentation lives in `docs/`.
- `AGENTS.md` at repo root is **project context** for Copilot: project stack, services, key files, data model, auth. (Claude Code + Cursor adapters use `CLAUDE.md` at their target — same content, different filename per tool default.)

## Context discovery — read at session start

When a Copilot Chat session begins, look up these files in order. Read each that exists. If a referenced file does not exist, proceed without it — do not invent its contents.

1. `.copilot/pai-orbit-config.md` — board, branch model, deploy targets, docs home, team conventions
2. `.copilot/team.md` — team members, owners, default assignees
3. `AGENTS.md` — project description, stack, key files, data model, auth (fall back to `CLAUDE.md` if `AGENTS.md` is absent — legacy installs)
4. `docs/architecture/constraints.md` — architectural rules (read before any structural change)
5. `docs/architecture/system.md` — service inventory and inter-service communication
6. `docs/architecture/stack.md` — language and framework choices
7. `docs/decisions/` — ADRs relevant to the task
8. `docs/domain/*.md` — business rules and expert knowledge
9. `docs/features/<feature>/requirements.md` — when working on a known feature

## Forbidden patterns (bash-guard intent, advisory)

Never suggest, generate, or run commands matching these patterns. If a user asks for one, refuse and explain.

- `git push --force` / `git push -f` on any branch.
- `git add .`, `git add -A`, `git add --all`, `git add -u`.
- `git commit --no-verify`, `git push --no-verify`, `git merge --no-verify`, `git rebase --no-verify`.
- `rm -rf /`, `rm -rf ~`, `rm -rf $HOME`, `rm -rf .` (current directory wipe).

This is advisory only — Copilot's compliance is not guaranteed. Real enforcement lives in `.husky/pre-commit` (or `.pre-commit-config.yaml`), opted in at install.

## Architectural drift (arch-drift intent, advisory)

When editing or proposing changes to structural files — `docker-compose.yml`, `docker-compose.yaml`, `package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`, `requirements.txt`, `fly.toml`, `vercel.json`, `app.yaml`, `main.py`, `app.py`, `index.ts`, `index.js`, `server.ts`, `server.js` — warn the user that the change may affect architecture and suggest running `/arch validate` after the session.

The path-scoped detail lives in `.github/instructions/arch-drift.instructions.md`, which auto-attaches when these files are open.

## Prompt library

All mode and skill prompts live in `.github/prompts/`. Invoke them by typing `/<name>` in Copilot Chat. The slash-command picker prefixes them so kind is visible:

- `[mode]` — pai-orbit working modes (14): `/arch`, `/build`, `/data`, `/design`, `/domain`, `/groom`, `/incident`, `/plan`, `/release`, `/review`, `/setup`, `/suggest-skills`, `/test`, `/ux` (`/setup` and `/suggest-skills` run in agent mode on Business tier)
- `[skill]` — invokable procedures (6): `/analysis`, `/board`, `/data-model`, `/epic`, `/git`, `/simplify`
- `[agent]` — agent-mode prompts (9, Pro/Business agentic; Free regular):
  - Service builders (7): `/django-builder`, `/express-builder`, `/fastapi-builder`, `/generic-service-builder`, `/infra-builder`, `/nextjs-builder`, `/react-vite-builder`
  - Named sub-agents (2): `/docs-writer` (writes documentation; edits files in `docs/`), `/cross-repo-impact` (read-only cross-repo analysis; no file edits)

Auto-attaching instructions files in `.github/instructions/`:

- `git.instructions.md` — git conventions on every file
- `data-model.instructions.md` — SQL and migration conventions
- `arch-drift.instructions.md` — structural-file warnings
- `context-discovery.instructions.md` — fall-back duplicate of the Context discovery directives above
- `decisions.instructions.md` — ADR obligation rules (when to write one, how) — always attached

## Mode discipline

Each mode prompt opens with an anti-drift block. When in a mode, Copilot:

- Prefixes every reply with `[<MODE>]`
- Refuses off-scope requests and redirects to the right mode
- Holds the mode until the user explicitly switches

If a Copilot reply lacks the `[<MODE>]` prefix in mode context, treat it as drift and re-issue the mode command.

## Skill rendering

A skill may exist in both `prompts/` (invokable) and `instructions/` (auto-attached). `/git` and `/data-model` are dual-use today. Other skills are prompts-only.

## What this file does NOT do

- It does NOT replace mode prompts. Mode behaviour lives in `.github/prompts/<mode>.prompt.md`.
- It does NOT carry full skill bodies. Skill behaviour lives in `.github/prompts/<skill>.prompt.md` (and `.github/instructions/<skill>.instructions.md` for dual-use ones).
- It does NOT emit lint rules. Linter config (`pyproject.toml`, `.eslintrc.json`) is owned by the project; the pre-commit hook enforces it at commit time.
- It does NOT write `.vscode/`, `.idea/`, or any editor config. VS Code lint-on-save is a 4-line copy-paste recipe in the adoption page, configured once by the user.
EOF
}

emit_mode_prompts() {
  local count=0
  for mode_file in "$CORE_DIR"/modes/*.md; do
    [ -f "$mode_file" ] || continue
    local mode_name
    mode_name="$(basename "$mode_file" .md)"
    is_skipped_mode "$mode_name" && continue

    local token desc donot prefixed
    token=$(mode_token "$mode_name")
    desc=$(mode_description "$mode_name")
    donot=$(mode_donot_line "$mode_name")
    prefixed=$(truncate_description "[mode] $desc")

    if needs_agent_mode "$mode_name"; then
      # Agent-mode prompts (/setup, /suggest-skills): emit `mode: agent`
      # frontmatter + tools so Copilot Business can read files, run shell
      # commands, and propose file edits. No anti-drift block — these are
      # one-shot workflows, not persistent headspaces.
      {
        printf -- '---\n'
        printf 'mode: agent\n'
        printf 'description: "%s"\n' "$(yaml_escape "$prefixed")"
        printf 'tools: ["codebase", "editFiles", "runCommands", "search"]\n'
        printf -- '---\n'
        printf '\n'
        # Per-mode preamble: setup and suggest-skills need different framings
        # because their Claude-Code-native workflows scaffold to different
        # targets (.claude/ vs .github/prompts/) and one has a "Claude Code
        # built-in" step that doesn't exist for Copilot.
        case "$mode_name" in
          setup)
            printf '> **Agent-mode prompt.** On Copilot Pro/Business this runs as a multi-step agent that reads project files, asks questions in Chat, runs shell commands (e.g. `glab api`, `gh project field-list`, `chmod`), and proposes file edits you accept. On Copilot Free it degrades to advisory text — Copilot describes the steps and you run them manually. The equivalent terminal path is `npx github:the-psi/pai-orbit init copilot`.\n'
            printf '\n'
            # D39: assemble Copilot's setup.prompt.md from shared source
            # (Steps 1-2, 2b, Step 3 intro + Step 4 header/closing) + Copilot's
            # own Step 3 + Step 4 content emitted from build.sh. Then apply
            # standard path + AGENTS.md rewrites.
            local step3_tmp="$DIST_DIR/.copilot_step3.tmp" step4_tmp="$DIST_DIR/.copilot_step4.tmp"
            emit_copilot_step3_block > "$step3_tmp"
            emit_copilot_step4_report > "$step4_tmp"
            transform_setup_for_copilot "$step3_tmp" "$step4_tmp" < "$mode_file" \
              | rewrite_paths | rewrite_agents_md
            rm -f "$step3_tmp" "$step4_tmp"
            ;;
          suggest-skills)
            printf '> **Agent-mode prompt (Copilot-adapted).** On Copilot Pro/Business this runs as a multi-step agent that reads `AGENTS.md` (or `CLAUDE.md` on legacy installs), `docs/`, `git log`, `.github/prompts/`, `docs/wip/`, and `docs/ops/` to identify workflow patterns worth encoding as skills. On Copilot Free it degrades to advisory text.\n'
            printf '>\n'
            printf '> **Copilot-adapted target:** when scaffolding a suggested skill, write it as a Copilot prompt file at `.github/prompts/<suggested-name>.prompt.md` (NOT `.claude/skills/<name>/SKILL.md` — that is the Claude Code target).\n'
            printf '>\n'
            printf '> **When scanning existing skills to avoid duplicates,** look in `.github/prompts/*.prompt.md`. Ignore prompt files whose `description:` starts with `[mode]` or `[agent]` (those are pai-orbit modes/agent prompts, not skills). Also ignore user-authored prompts without pai-orbit prefixes only if their names clearly overlap with a suggestion.\n'
            printf '>\n'
            printf '> **On the shared mode body below referring to "Claude Code'"'"'s built-in suggest-skills capability":** Copilot has no equivalent introspection surface as a separate step. Do the full file-based analysis (docs, git log, `.github/prompts/`, `docs/wip/`, `docs/ops/`) as if you ARE the built-in — you extend the workflow by performing the analysis directly, not by calling out to a separate tool. Do not skip the analysis; only skip the "invoke a separate built-in" phrasing.\n'
            printf '\n'
            # Copilot-adapted skill template — inlined from
            # core/templates/skills/domain-operational.template.md with the
            # frontmatter converted from Claude Code's `name: / description:`
            # shape to Copilot's `mode: agent / description: "[skill] ..." / tools: [...]`
            # shape. Copilot uses this as the base pattern when scaffolding a
            # suggested skill (Gap 3, 2026-07-05 fix; frontmatter updated D38).
            printf '## Skill template (base pattern for scaffolding)\n'
            printf '\n'
            printf 'When the user picks a suggestion to scaffold, use this template shape. Substitute each `{{PLACEHOLDER}}` with the real value inferred from your analysis; leave `<!-- TODO -->` markers only where the team genuinely needs to fill in project-specific detail.\n'
            printf '\n'
            printf '````markdown\n'
            printf -- '---\n'
            printf 'mode: agent\n'
            printf 'description: "[skill] {{SKILL_DESCRIPTION}} TRIGGER when {{TRIGGER_CONDITIONS}}. SKIP {{SKIP_CONDITIONS}}."\n'
            printf 'tools: ["codebase", "editFiles", "runCommands", "search"]\n'
            printf -- '---\n'
            printf '\n'
            printf '# {{SKILL_TITLE}}\n'
            printf '\n'
            printf '<!-- Domain-operational skill. Multi-step procedure too specific for a generic mode\n'
            printf '     but recurring enough to deserve its own invokable prompt. Examples: data backfill,\n'
            printf '     seed data insertion, schema migration, domain review, incident response. -->\n'
            printf '\n'
            printf '{{CONTEXT_PARAGRAPH}}\n'
            printf '<!-- One paragraph: what the procedure is, when it is needed, what it produces. -->\n'
            printf '\n'
            printf '## Prerequisites\n'
            printf '\n'
            printf '<!-- What must be true before running this skill? -->\n'
            printf '%s\n' '- {{PREREQ_1}}'
            printf '<!-- e.g.: Authenticated with gcloud | Database connection active | Tests passing -->\n'
            printf '\n'
            printf '## Steps\n'
            printf '\n'
            printf '### 1. {{STEP_1_NAME}}\n'
            printf '\n'
            printf '<!-- What to do, and why. Include commands where applicable. -->\n'
            printf '{{STEP_1_DETAIL}}\n'
            printf '\n'
            printf '```bash\n'
            printf '# Example command\n'
            printf '{{EXAMPLE_CMD_1}}\n'
            printf '```\n'
            printf '\n'
            printf '### 2. {{STEP_2_NAME}}\n'
            printf '\n'
            printf '{{STEP_2_DETAIL}}\n'
            printf '\n'
            printf '### 3. Verify\n'
            printf '\n'
            printf '<!-- What does success look like? How do you confirm the procedure completed correctly? -->\n'
            printf '{{VERIFICATION_DETAIL}}\n'
            printf '\n'
            printf '```bash\n'
            printf '# Verification command\n'
            printf '{{VERIFY_CMD}}\n'
            printf '```\n'
            printf '\n'
            printf '## Dry run\n'
            printf '\n'
            printf '<!-- If applicable: how to test this procedure without committing changes. -->\n'
            printf '{{DRY_RUN_INSTRUCTIONS}}\n'
            printf '\n'
            printf '## Rollback\n'
            printf '\n'
            printf '<!-- What to do if something goes wrong mid-procedure. -->\n'
            printf '{{ROLLBACK_INSTRUCTIONS}}\n'
            printf '\n'
            printf '## Notes\n'
            printf '\n'
            printf '<!-- Gotchas, edge cases, or constraints the engineer must know. -->\n'
            printf '%s\n' '- {{NOTE_1}}'
            printf '````\n'
            printf '\n'
            # The default rewrite_paths maps .claude/skills/ to .copilot/skills/
            # (a symmetric metadata folder). For /suggest-skills specifically we
            # want .claude/skills/ → .github/prompts/ so the mode body points at
            # Copilot's real prompt directory. Apply additional rewrites:
            #   - Any residual .copilot/skills/ or .claude/skills/ → .github/prompts/
            #   - Claude's `<name>/SKILL.md` convention → flat `<name>.prompt.md`
            #   - "using templates/skills/domain-operational.template.md" →
            #     "using the skill template above" (Gap 3: template is now
            #     inlined in the preamble, no need to reference an external file)
            rewrite_paths < "$mode_file" | rewrite_agents_md | sed \
              -e 's|\.copilot/skills/|.github/prompts/|g' \
              -e 's|`\.claude/skills/`|`.github/prompts/`|g' \
              -e 's|\.claude/skills/|.github/prompts/|g' \
              -e 's|\.github/prompts/\([^/ `]*\)/SKILL\.md|.github/prompts/\1.prompt.md|g' \
              -e 's|using `templates/skills/domain-operational\.template\.md` as the base pattern|using the skill template shown in the preamble above|g'
            ;;
          *)
            rewrite_paths < "$mode_file" | rewrite_agents_md
            ;;
        esac
      } > "$DIST_DIR/.github/prompts/${mode_name}.prompt.md"
    else
      # Standard mode prompts: mode: agent + tools + anti-drift block (D28).
      # (D38, 2026-07-05) Frontmatter uses documented Copilot key `mode: agent`
      # with an explicit `tools:` array — the earlier `agent: agent` shape was
      # not recognised by VS Code and silently downgraded these prompts to ask
      # mode with no tool access. Mode prompts (arch, build, design, groom,
      # review, …) write docs/features/*, docs/architecture/*, docs/decisions/*,
      # so they need editFiles + runCommands access to actually perform edits.
      # The anti-drift block below still runs as prompt text — Copilot still
      # prefixes `[<MODE>]` and refuses off-scope requests.
      {
        printf -- '---\n'
        printf 'mode: agent\n'
        printf 'description: "%s"\n' "$(yaml_escape "$prefixed")"
        printf 'tools: ["codebase", "editFiles", "runCommands", "search"]\n'
        printf -- '---\n'
        printf '\n'
        # Anti-drift block (D28, design §3.2). The `[<MODE>]` marker is on a
        # bullet line so verify-dist.sh can grep for it within the head of the file.
        printf '> **Mode discipline — read before answering.**\n'
        printf '>\n'
        printf '> You are now in **%s** mode. Until the user explicitly switches modes:\n' "$token"
        printf '> - %s\n' "$donot"
        printf '> - Redirect off-scope requests to the right mode and name it explicitly (e.g. "That'\''s a `/design` question — switch modes?").\n'
        printf '> - Begin every reply with the literal prefix `[%s]` so mode drift is visible to the user.\n' "$token"
        printf '>\n'
        printf '> If the user explicitly says "switch to /<other>" or types another slash command, drop this block.\n'
        printf '\n'
        # D40/D41: Copilot-adapted board-lookup preamble for workflow modes
        # (groom, design, build) that resolve a board issue number into a
        # feature identifier (slug + title) before their main workflow starts.
        if needs_copilot_preamble "$mode_name"; then
          emit_board_lookup_preamble
        fi
        rewrite_paths < "$mode_file" | rewrite_agents_md
      } > "$DIST_DIR/.github/prompts/${mode_name}.prompt.md"
    fi

    count=$((count + 1))
  done
  echo "  modes:           emitted $count prompt file(s)"
}

emit_skill_prompts() {
  local count=0
  for skill_md in "$CORE_DIR"/skills/*/SKILL.md; do
    [ -f "$skill_md" ] || continue
    local skill_name raw_desc prefixed
    skill_name="$(basename "$(dirname "$skill_md")")"
    raw_desc=$(awk '/^---/{p++} p==1 && /^description:/{sub(/^description: /,""); print; exit}' "$skill_md")
    prefixed=$(truncate_description "[skill] $raw_desc")

    # (D38, 2026-07-05) Skill prompts use `mode: agent` + tools like modes and
    # service-builders. Skills like /git and /board run shell commands; /board
    # queries live APIs; /data-model edits SQL migrations. All need tool access.
    {
      printf -- '---\n'
      printf 'mode: agent\n'
      printf 'description: "%s"\n' "$(yaml_escape "$prefixed")"
      printf 'tools: ["codebase", "editFiles", "runCommands", "search"]\n'
      printf -- '---\n'
      printf '\n'
      strip_frontmatter "$skill_md" | rewrite_paths | rewrite_agents_md
    } > "$DIST_DIR/.github/prompts/${skill_name}.prompt.md"

    count=$((count + 1))
  done
  echo "  skills:          emitted $count prompt file(s)"
}

emit_service_builder_prompts() {
  local count=0
  for tpl in "$CORE_DIR"/templates/agents/*.md; do
    [ -f "$tpl" ] || continue
    local stack desc prefixed
    stack="$(basename "$tpl" .md)"
    desc=$(agent_description "$stack")
    prefixed=$(truncate_description "[agent] $desc")

    {
      printf -- '---\n'
      printf 'mode: agent\n'
      printf 'description: "%s"\n' "$(yaml_escape "$prefixed")"
      printf 'tools: ["codebase", "editFiles", "runCommands", "search"]\n'
      printf -- '---\n'
      printf '\n'
      # D42 (2026-07-05): Runtime-resolution note prepended to every service-
      # builder prompt. The body below retains `{{SERVICE_NAME}}`,
      # `{{SERVICE_PATH}}`, `{{LANGUAGE}}` etc. as literal markers — the
      # Copilot install CLI does NOT substitute them at install time (unlike
      # Claude Code's /setup which pre-fills per-service copies into
      # `.claude/agents/`). Instead, Copilot Business's agent runtime resolves
      # these markers per invocation by reading `AGENTS.md` and detecting the
      # active service context. This note tells the user reading the file
      # (or Copilot itself) that the markers are substitution points, not
      # blanks to complete manually.
      cat <<'RUNTIME_NOTE_EOF'
> **Generic template — resolved at runtime.** The `{{SERVICE_NAME}}`, `{{SERVICE_PATH}}`, `{{LANGUAGE}}`, `{{FRAMEWORK}}`, and other `{{PLACEHOLDER}}` markers below are NOT substituted at install time. Copilot's agent runtime resolves them per invocation by reading `AGENTS.md` and detecting the target service context (in a monorepo: the service whose folder contains the files currently being edited).
>
> Do not hand-fill the markers — they are substitution points, not blanks to complete. If Copilot cannot resolve a marker (ambiguous service context in a monorepo, missing `AGENTS.md` service table, unclear stack), it will ask you to disambiguate before proceeding.

RUNTIME_NOTE_EOF
      strip_frontmatter "$tpl" | rewrite_paths | rewrite_agents_md
    } > "$DIST_DIR/.github/prompts/${stack}.prompt.md"

    count=$((count + 1))
  done
  echo "  service-builder: emitted $count agent prompt file(s)"
}

# Named sub-agents from core/agents/ — docs-writer, cross-repo-impact, etc.
# On Claude Code these appear as sub-agents you can spawn; on Cursor as
# rules/prompts. Copilot equivalent is `mode: agent` prompt files that
# Business tier runs multi-step and Free tier renders as advisory text.
# Tools list is per-agent — cross-repo-impact is read-only and gets no
# editFiles / runCommands.
emit_named_agent_prompts() {
  local count=0
  for agent_md in "$CORE_DIR"/agents/*.md; do
    [ -f "$agent_md" ] || continue
    local agent_name raw_desc prefixed tools_list
    agent_name="$(basename "$agent_md" .md)"
    raw_desc=$(awk '/^---/{p++} p==1 && /^description:/{sub(/^description: /,""); print; exit}' "$agent_md")
    prefixed=$(truncate_description "[agent] $raw_desc")

    # Tool set per agent — cross-repo-impact is documented read-only in its
    # own frontmatter (Read, Grep, Bash, Glob — no Edit/Write). Reflect that
    # in the Copilot tools list so agent runs don't propose file edits.
    case "$agent_name" in
      cross-repo-impact) tools_list='["codebase", "search"]' ;;
      *)                 tools_list='["codebase", "editFiles", "runCommands", "search"]' ;;
    esac

    {
      printf -- '---\n'
      printf 'mode: agent\n'
      printf 'description: "%s"\n' "$(yaml_escape "$prefixed")"
      printf 'tools: %s\n' "$tools_list"
      printf -- '---\n'
      printf '\n'
      strip_frontmatter "$agent_md" | rewrite_paths | rewrite_agents_md
    } > "$DIST_DIR/.github/prompts/${agent_name}.prompt.md"

    count=$((count + 1))
  done
  echo "  named agents:    emitted $count agent prompt file(s)"
}

emit_skill_instructions() {
  local count=0
  for skill_name in git data-model; do
    local skill_md="$CORE_DIR/skills/$skill_name/SKILL.md"
    if [ ! -f "$skill_md" ]; then
      echo "copilot adapter: missing skill source for instructions emit: $skill_md" >&2
      continue
    fi
    local glob
    case "$skill_name" in
      git)        glob='**/*' ;;
      data-model) glob='**/*.sql, **/migrations/**' ;;
    esac
    {
      printf -- '---\n'
      printf 'applyTo: "%s"\n' "$glob"
      printf -- '---\n'
      printf '\n'
      strip_frontmatter "$skill_md" | rewrite_paths | rewrite_agents_md
    } > "$DIST_DIR/.github/instructions/${skill_name}.instructions.md"
    count=$((count + 1))
  done
  echo "  skill-instr:     emitted $count instructions file(s)"
}

emit_decisions_instructions() {
  # ADR obligation rules — sourced from core/templates/rules/decisions.md.
  # Emitted as an always-attached instructions file so Copilot always knows
  # when a code change warrants an ADR. Mirrors the Cursor-plugin adapter's
  # rules/decisions.mdc with alwaysApply: true.
  local src="$CORE_DIR/templates/rules/decisions.md"
  if [ ! -f "$src" ]; then
    echo "copilot adapter: missing $src — skipping decisions instructions" >&2
    return 0
  fi
  {
    printf -- '---\n'
    printf 'applyTo: "**/*"\n'
    printf -- '---\n'
    printf '\n'
    rewrite_paths < "$src" | rewrite_agents_md
  } > "$DIST_DIR/.github/instructions/decisions.instructions.md"
  echo "  decisions:       emitted instructions file (ADR obligation rules)"
}

emit_arch_drift_instructions() {
  # Glob list mirrors STRUCTURAL_PATTERNS in core/hooks/arch-drift-guard.sh.
  # Keep in sync — the hook is the source of truth. Update both when adding
  # or removing a structural file pattern.
  cat > "$DIST_DIR/.github/instructions/arch-drift.instructions.md" <<'EOF'
---
applyTo: "**/docker-compose.yml, **/docker-compose.yaml, **/package.json, **/go.mod, **/Cargo.toml, **/pyproject.toml, **/requirements.txt, **/fly.toml, **/vercel.json, **/app.yaml, **/main.py, **/app.py, **/index.ts, **/index.js, **/server.ts, **/server.js"
---

# Architectural drift guard

This file just changed or is about to change. It is a **structural signal** — its edits often reflect architectural changes (dependencies added, services moved, framework swapped, runtime configured).

Before proposing or accepting an edit here:

1. Confirm the change is actually needed — not a side-effect of an unrelated task.
2. Note that this change may shift architecture. Suggest the user run `/arch validate` after the session to check alignment with `docs/architecture/system.md` and `docs/architecture/constraints.md`.
3. Cross-check `docs/architecture/constraints.md` if it exists — the constraint may forbid the change.
4. If the edit adds a new service, language, or major dependency, suggest writing an ADR in `docs/decisions/` before merging.

This is advisory — proceed if the user confirms, but make the architectural cost visible.
EOF
  echo "  arch-drift:      emitted instructions file"
}

emit_context_discovery_instructions() {
  # R8 fall-back: duplicate the copilot-instructions.md Context discovery section
  # so it lands via two channels — instructions auto-attach and always-loaded instructions.
  cat > "$DIST_DIR/.github/instructions/context-discovery.instructions.md" <<'EOF'
---
applyTo: "**/*"
---

# Context discovery — fall-back

If `.github/copilot-instructions.md` is loaded, you already have these directives from its `## Context discovery` section. This file duplicates the directives so they reach Copilot via two channels — instructions files (auto-attach) and the always-loaded instructions file.

At session start, read each of the following that exists. If absent, proceed without — do not invent contents.

1. `.copilot/pai-orbit-config.md` — board, branch model, deploy targets, docs home, team conventions
2. `.copilot/team.md` — team members, owners, default assignees
3. `AGENTS.md` — project description, stack, key files, data model, auth (fall back to `CLAUDE.md` if `AGENTS.md` is absent — legacy installs)
4. `docs/architecture/constraints.md` — architectural rules
5. `docs/architecture/system.md` — service inventory and inter-service communication
6. `docs/architecture/stack.md` — language and framework choices
7. `docs/decisions/` — ADRs
8. `docs/domain/*.md` — business rules and expert knowledge
9. `docs/features/<feature>/requirements.md` — when working on a known feature

When the user asks a project-specific question (deploy target, team owner, architecture rule, business rule), answer from these files. Do not fall back to generic knowledge unless the user explicitly asks for a generic answer.
EOF
  echo "  context-disc:    emitted instructions file"
}

emit_husky_template() {
  # Husky v9+ shape per design §10.1 (current default). Non-husky teams use the
  # .pre-commit-config.yaml.template emitted by emit_precommit_framework_template.
  cat > "$DIST_DIR/.husky/pre-commit.template" <<'EOF'
#!/usr/bin/env bash
# pai-orbit pre-commit hook (husky variant)
# Rename this file to .husky/pre-commit and `chmod +x` to activate.
# After install on Windows, also run:
#   git update-index --add --chmod=+x .husky/pre-commit
# so the exec bit is tracked in the repo.
set -e

# bash-guard intent — block force-push, bulk staging, hook-bypass, destructive rm

# Reject if any staged change includes an attempt to force-push elsewhere is moot here —
# pre-commit only sees the commit content, not the push. The force-push block lives in the
# pre-push hook conceptually; for now we focus on what pre-commit can actually catch.

# Block: a commit that contains a hook-bypass instruction in its body or any staged file content
if git log -1 --format=%B HEAD 2>/dev/null | grep -q -- '--no-verify' ; then
  : # Informational only — pre-commit cannot block the current commit's message.
fi

# Block: presence of common secret patterns in staged files (light heuristic — full secret-scanning
# is the project's responsibility via dedicated tools; this is a tripwire).
if git diff --cached --name-only -z | xargs -0 -I{} grep -l -E '(AWS_SECRET_ACCESS_KEY|PRIVATE KEY-----)' {} 2>/dev/null | head -1 | grep -q . ; then
  echo "pai-orbit pre-commit: suspected secret in staged file. Refusing commit." >&2
  echo "  If this is intentional (test fixture, doc example), un-stage and re-stage with explicit confirmation." >&2
  exit 1
fi

# Lint Python — invoke project's ruff if pyproject.toml exists in repo root
if [ -f pyproject.toml ] && command -v ruff >/dev/null 2>&1 ; then
  ruff check --quiet $(git diff --cached --name-only --diff-filter=ACM | grep -E '\.py$' || true) || {
    echo "pai-orbit pre-commit: ruff lint failed. Fix or amend." >&2
    exit 1
  }
fi

# Lint JS/TS — invoke project's eslint if .eslintrc.json or .eslintrc.cjs exists
if { [ -f .eslintrc.json ] || [ -f .eslintrc.cjs ] || [ -f eslint.config.js ]; } && command -v npx >/dev/null 2>&1 ; then
  staged_js_ts=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|jsx|ts|tsx|mjs|cjs)$' || true)
  if [ -n "$staged_js_ts" ]; then
    npx --no-install eslint $staged_js_ts || {
      echo "pai-orbit pre-commit: eslint failed. Fix or amend." >&2
      exit 1
    }
  fi
fi

exit 0
EOF
  echo "  husky:           emitted pre-commit.template"
}

emit_precommit_framework_template() {
  # D29 alternative for teams that don't use husky. Cross-tool, no Node assumption.
  cat > "$DIST_DIR/.pre-commit-config.yaml.template" <<'EOF'
# pai-orbit pre-commit-framework config
# Rename this file to .pre-commit-config.yaml and run `pre-commit install` to activate.
# Cross-tool — no Node ecosystem assumption; works for Python, .NET, Go, mixed repos.

repos:
  - repo: local
    hooks:
      - id: pai-orbit-block-bulk-staging
        name: pai-orbit — block bulk staging in commit messages
        entry: bash -c 'git log -1 --format=%B HEAD 2>/dev/null | grep -qE "(git add[[:space:]]+\.|git add[[:space:]]+-A|git add[[:space:]]+--all)" && { echo "Bulk-staging mention detected in commit body. Stage specific files."; exit 1; } || exit 0'
        language: system
        stages: [commit-msg]

      - id: pai-orbit-block-no-verify-mention
        name: pai-orbit — block --no-verify in commit body (advisory)
        entry: bash -c 'git log -1 --format=%B HEAD 2>/dev/null | grep -qE -- "--no-verify" && { echo "Commit body mentions --no-verify. Refusing."; exit 1; } || exit 0'
        language: system
        stages: [commit-msg]

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.6.9
    hooks:
      - id: ruff
        args: [--quiet]
        # Only runs if the repo has Python files staged
        types_or: [python, pyi]

  - repo: https://github.com/pre-commit/mirrors-eslint
    rev: v9.13.0
    hooks:
      - id: eslint
        files: \.(js|jsx|ts|tsx|mjs|cjs)$
        # Picks up the project's eslint config
        additional_dependencies: []
EOF
  echo "  pre-commit yml:  emitted .pre-commit-config.yaml.template"
}

emit_readme() {
  cat > "$DIST_DIR/README.md" <<'EOF'
# pai-orbit — GitHub Copilot adapter (dist)

This directory is the **built output** of the Copilot adapter. Do not hand-edit. Regenerate by running:

```bash
bash plugins/pai-orbit/build.sh
```

## What ships

- `.github/copilot-instructions.md` — slim rule book + Context discovery + prompt-library pointer
- `.github/prompts/*.prompt.md` — invokable slash commands (mode, skill, agent — 29 total)
- `.github/instructions/*.instructions.md` — auto-attaching guidance (5 total)
- `.husky/pre-commit.template` — opt-in commit-time lint + weak secret tripwire (husky variant)
- `.pre-commit-config.yaml.template` — same enforcement scope, pre-commit-framework variant

## What's covered vs the Claude Code plugin

- Full mode set (14) — arch, build, data, design, domain, groom, incident, plan, release, review, setup, suggest-skills, test, ux. `/setup` and `/suggest-skills` emit as agent-mode prompts (Business tier agentic; Free tier advisory).
- Full skill set (6) — analysis, board, data-model, epic, git, simplify. `git` and `data-model` also render as always-attached instructions files.
- Named sub-agents (2) — `docs-writer` (edit tools), `cross-repo-impact` (read-only tools).
- Service-builder templates (7) — django, express, fastapi, generic-service, infra, nextjs, react-vite.
- ADR obligation rules — `.github/instructions/decisions.instructions.md` (always attached).

## Honest limitations vs Claude Code

- No runtime hook system in Copilot Chat. `bash-guard` intent lives as advisory text in `.github/copilot-instructions.md` — Copilot usually obeys, no guarantee. The opt-in `.husky/pre-commit` adds real enforcement at commit time (lint + weak secret regex) but cannot block `git push --force`, `git add -A`, or shell `rm -rf` — those need Claude Code's PreToolUse, a pre-push hook, or server-side branch protection.
- Agent runtime parity is tier-dependent. `mode: agent` prompts run agentically on Copilot Pro/Business; on Free they degrade to regular prompts that still give correct manual guidance.
- No editor-specific files (D33). VS Code users follow the 4-line lint-on-save recipe in the adoption page.

## How to install

End users run the standalone install CLI from the project root:

```bash
npx github:the-psi/pai-orbit init copilot
```

Or, inside Claude Code / Cursor, run `/setup` and pick Copilot as a target.
EOF
}

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

echo "copilot adapter: emitting into $DIST_DIR"

emit_copilot_instructions
emit_mode_prompts
emit_skill_prompts
emit_service_builder_prompts
emit_named_agent_prompts
emit_skill_instructions
emit_decisions_instructions
emit_arch_drift_instructions
emit_context_discovery_instructions
emit_husky_template
emit_precommit_framework_template
emit_readme

echo "copilot adapter: build complete"

# Final step: hand off to the shared dist verifier so local and CI runs
# produce the same pass/fail signal. Verification covers Copilot's dist only.
if [ -x "$VERIFY_SCRIPT" ] || [ -f "$VERIFY_SCRIPT" ]; then
  echo "copilot adapter: running verify-dist.sh ..."
  DIST_DIR="$DIST_DIR" bash "$VERIFY_SCRIPT"
else
  echo "copilot adapter: verify-dist.sh not found at $VERIFY_SCRIPT — skipping (warning)" >&2
fi
