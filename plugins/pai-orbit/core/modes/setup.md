You are now in SETUP MODE.

Configure `pai-orbit` for this project. Run once when starting, re-run when the stack or team changes significantly.

Switch out when:
- Setup is complete → return to whatever you were doing, or run `/arch init` next
- Architecture needs to be declared → `/arch init`

---

## Step 1 — Discover

Before asking anything, read what already exists:

- Scan the repo root for `package.json`, `pyproject.toml`, `requirements.txt`, `go.mod`, `Cargo.toml`, `pom.xml` — infer languages and frameworks
- Check for `docker-compose.yml`, `Makefile`, cloud config files (`fly.toml`, `vercel.json`, `app.yaml`) — infer deployment
- Look for existing `CLAUDE.md`, `.claude/pai-orbit-config.md`, `.claude/team.md` — note what is already configured
- Count top-level directories that look like services (api/, frontend/, backend/, app/, etc.)
- Check if this is a monorepo or multi-repo workspace
- Look for `.github/`, `.gitlab/`, `linear.json`, `jira-config` — infer task management platform

Report a brief summary of what was found before asking any questions.

## Step 2 — Ask (only what can't be inferred)

Ask all unresolved questions in a single block — do not ask one at a time. Cover:

1. **Repo structure** (if ambiguous): monorepo with these services, or separate repos?
2. **Tech stack** (per service, if not clear from files): language + framework?
3. **Task management**: GitHub Issues / GitHub Projects v2 / Linear / Jira / GitLab / Notion / none? Provide board URL(s). Do **not** ask for label taxonomy here — the board interview in Step 2b will query it from the API.
4. **Branching model**: GitHub Flow (feature branches → main) / GitFlow (develop + release branches) / trunk-based (direct to main with flags)?
5. **Deployment**: cloud provider + target (Cloud Run, Vercel, Railway, AWS ECS, bare VPS, etc.)? One command or per-service?
6. **Docs home**: in-repo `docs/` / dedicated docs repo (provide path) / Confluence (provide space URL) / Notion (provide workspace)?
7. **Multi-repo project?**: Does this service repo belong to a larger multi-repo project with a separate repo for system-level docs (cross-cutting ADRs, epics spanning services, system-wide domain knowledge)? If yes, what is the path or git URL to that system docs repo?
8. **Architecture (optional — can be done later with `/arch init`):** What services exist and how do they communicate? Any hard constraints — things that must never happen across the codebase? (e.g., "services must not share DBs", "frontend talks only to api-gateway")
9. **Team**: names, roles, and handles (GitHub username / Linear ID / Jira user ID as relevant). Who is the default assignee for code issues? Who owns domain/expert decisions?
10. **MCP servers (optional)**: do you have any MCP servers configured for this project? Answer for each category — enter the server name or "none":
    - **Git**: GitHub MCP / GitLab MCP / none
    - **Board**: GitHub Projects MCP / Linear MCP / Jira MCP / none
    - **Docs**: Confluence MCP / Notion MCP / none

    If MCP servers are configured, they will be preferred over CLI shell commands at runtime (with shell as fallback). If none are configured, all operations use shell commands — no MCP setup is required.
11. **Assistant target(s)**: which AI assistant(s) does this team use? Pick one or more:
    - `claude` — Claude Code (default; emits `.claude/` config + hooks)
    - `cursor` — Cursor (emits `.cursor/` rules + plugin)
    - `copilot` — GitHub Copilot Chat (emits `.copilot/` + `.github/copilot-instructions.md` + `.github/prompts/` + `.github/instructions/`)
    - `multiple` — write config for two or more of the above (the Copilot, Cursor, and Claude folders are independent and may coexist in the same repo)

    **This is a required answer — there is no default. Ask the user explicitly which tool(s) they use before proceeding to Step 2b.** A wrong answer here writes the wrong scaffold into their project (`.claude/` when they meant `.cursor/`, etc.), so do not guess or infer from the environment. If `copilot` is one of the selections, additionally ask:
    - **"Install the optional `.husky/pre-commit` hook (commit-time lint + weak secret tripwire; does NOT block `git push --force` or `git add -A`)?"** Default: `yes` if the project has `.git/`, `no` otherwise.
    - **"Choose pre-commit installer: husky / pre-commit framework / both / neither"** (per D29). Detection-driven defaults: `husky` if `.husky/` exists or `package.json` has a husky dep; `pre-commit` if `.pre-commit-config.yaml` already exists; `husky` otherwise.

## Step 2b — Board Column Discovery (after Step 2 answers arrive)

Once the user confirms the task-management platform, query the live board for its actual label/state taxonomy. Do **not** assume any column names or label patterns.

### GitLab

First, query the project's boards:

```bash
# Replace <namespace/project> with the project path from the board URL
glab api /projects/<encoded-namespace%2Fproject>/boards \
  | jq -r '.[] | "\(.id): \(.name)"'
```

**If boards exist**, present the list and ask:

> "Which board(s) define your team's workflow? You can select one or more (e.g. `1` or `1,3`). If you select multiple, their lists will be merged in the order you list them."

For each selected board, fetch its lists (each list maps directly to a column label):

```bash
glab api /projects/<encoded-namespace%2Fproject>/boards/<board_id>/lists \
  | jq -r '.[] | "\(.position): \(.label.name) (color: \(.label.color))"'
```

The lists are already ordered by `position`. Present the merged, ordered column→label table to the user and ask them to confirm or reorder before writing config. Do not ask the user to type label names — derive them directly from the board lists.

**If no boards exist** (empty array), fall back to querying all labels:

```bash
glab api /projects/<encoded-namespace%2Fproject>/labels --paginate \
  | jq -r '.[] | "\(.name) (color: \(.color))"'
```

Present the full label list — **include every label, not just scoped `workflow::*` ones**. Standalone labels like `To Do`, `Design`, and `Blocked` are valid column markers and must be captured.

Then ask:

> "No boards found. Which of these labels represent board columns? List them in the order they appear on the board (left → right), separated by commas. Include both scoped (e.g. `workflow::In Progress`) and standalone (e.g. `To Do`) labels."

After the user confirms the ordered list, verify each label exists:

```bash
for label in "<label-1>" "<label-2>" ...; do
  glab api /projects/<encoded-namespace%2Fproject>/labels \
    | jq -e --arg n "$label" '.[] | select(.name == $n)' > /dev/null \
    || echo "MISSING: $label"
done
```

If any label is missing, warn: "Label '<name>' does not exist on this project. Create it in GitLab first, or correct the name, then confirm again." Do not write the config until all labels are confirmed present.

When writing the `## Agile Board → columns` table in the generated config, include **all** confirmed column labels (both scoped and standalone) and append this comment directly above the table:

```
# Re-run /setup or update this table if labels change on the board.
```

### GitHub Projects v2

```bash
# Replace <owner> and <number> with values from the board URL
gh project field-list <number> --owner <owner> --format json \
  | jq -r '.fields[] | select(.name == "Status") | .options[] | .name'
```

Present the Status field options and ask the user to confirm their column order (they are already ordered but may want to exclude terminal states like "Done" from active workflow).

If `gh project field-list` fails (classic Projects), fall back to asking the user to list column names manually.

### Linear

```bash
linear team list
# or via the Linear MCP if available
```

Present the team's workflow states and ask the user to confirm the ordered column list. If the CLI is unavailable, ask the user to copy the state names from their Linear workspace settings.

### Jira / GitHub Issues / Notion / none

No API query needed. Ask the user to provide their workflow stages (column names) in order as a comma-separated list.

---

## Step 3 — Generate

Create the following files based on the assistant target(s) chosen in Step 2 question 11. The Claude Code path (default) is documented first; the Cursor and Copilot paths follow as additive blocks. When multiple targets are selected, run each block in turn — the resulting folders coexist in the same repo without conflict.

> **Regression discipline.** The pre-existing Claude Code and Cursor outputs are frozen. Running `/setup` with target `claude` (or `cursor`) on a scratch repo must produce a byte-identical tree to the pre-Copilot-upgrade behaviour. Do not opportunistically refactor either path during this run.

---

### Target: Claude Code (`.claude/` path)

Run this block when `claude` is one of the selected assistant targets.

### `.claude/pai-orbit-config.md`

Use the template at `templates/pai-orbit-config.md.template`. Fill all sections from the answers above and the board discovery in Step 2b.

For the `## Agile Board → columns` table, use **only** the column names and labels confirmed in Step 2b — never write placeholder or example values. Delete the tool-specific comment blocks that don't apply to the chosen board type.

For the `## System Docs` section:
- If the user answered **no** to the multi-repo question: omit the `## System Docs` section entirely from the generated file (do not write it with blank values).
- If the user answered **yes** and provided a **relative path**: check whether that directory exists before writing. If it does not exist, warn the user ("System docs path not found — writing the pointer anyway; ensure the repo is cloned before running commands") and write it as given.
- If the user answered **yes** and provided a **git URL**: write it as-is. Do not attempt to clone or validate — note that the user must clone the repo locally before commands can read from it.

### `.claude/team.md`

Use the template at `templates/team.md.template`. Populate from team answers.

### `CLAUDE.md`

Use the template at `templates/CLAUDE.md.template`. Fill in:
- Project name and one-line description
- Sub-projects / services table (name, path, stack, purpose)
- Commands section (dev server, build, test for each service)
- Leave architecture section with clear `<!-- TODO: fill in by hand -->` markers

### Stack agents

For each service, pick the closest agent template from `templates/agents/`:
- FastAPI → `fastapi-builder.md`
- Next.js → `nextjs-builder.md`
- Django → `django-builder.md`
- Express/Node → `express-builder.md`
- React/Vite (frontend only) → `react-vite-builder.md`
- Anything else → `generic-service-builder.md`

Write the generated agent to `.claude/agents/<service>-builder.md`. Replace all `{{PLACEHOLDER}}` markers with actual values.

### Project rules

Copy `templates/rules/decisions.md` to `.claude/rules/decisions.md`.

This file defines when an ADR is required and how to create one. It is read by every session via the rules directory so the obligation applies regardless of which skill or agent is active.

### Hooks

**Step A — Create the hooks directory:**

```bash
mkdir -p .claude/hooks
```

**Step B — Write the safety hooks.** Use the Write tool to create each file with the exact content from the plugin's `hooks/` directory:

- Write `.claude/hooks/bash-guard.sh` — content from `hooks/bash-guard.sh`
- Write `.claude/hooks/arch-drift-guard.sh` — content from `hooks/arch-drift-guard.sh`

For each language detected, write the linting hooks:
- Python detected → write `.claude/hooks/lint-python.sh` from `hooks/lint-python.sh`; update any repo-specific paths
- TypeScript/JavaScript detected → write `.claude/hooks/lint-ts.sh` from `hooks/lint-ts.sh`; update any repo-specific paths

**Step C — Set exec bit on all hooks:**

```bash
chmod +x .claude/hooks/*.sh
```

**Step D — Generate `.claude/settings.json`.**

First, resolve the absolute path to the project root so that hook paths in `settings.json` are not relative (relative paths break when Claude runs from a subdirectory):

```bash
git rev-parse --show-toplevel 2>/dev/null || pwd
```

Use the output as `<PROJECT_ROOT>` in the hook commands below.

If `.claude/settings.json` already exists, read it first and merge the `hooks` key in — do not overwrite unrelated keys. If it does not exist, create it. The hooks block to write (replace `<PROJECT_ROOT>` with the resolved absolute path):

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "<PROJECT_ROOT>/.claude/hooks/bash-guard.sh", "timeout": 10 }] }
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write", "hooks": [
        { "type": "command", "command": "<PROJECT_ROOT>/.claude/hooks/lint-python.sh", "timeout": 30, "async": true },
        { "type": "command", "command": "<PROJECT_ROOT>/.claude/hooks/lint-ts.sh", "timeout": 60, "async": true },
        { "type": "command", "command": "<PROJECT_ROOT>/.claude/hooks/arch-drift-guard.sh", "timeout": 5, "async": true }
      ]}
    ]
  }
}
```

Omit `lint-python.sh` from the PostToolUse array if Python was not detected. Omit `lint-ts.sh` if TypeScript/JavaScript was not detected.

**Step E — Validate hook paths.** Run the following and warn if any hook is missing or not executable (use the absolute path resolved in Step D):

```bash
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
for hook in bash-guard.sh arch-drift-guard.sh; do
  [ -x "$PROJECT_ROOT/.claude/hooks/$hook" ] \
    && echo "✅ $PROJECT_ROOT/.claude/hooks/$hook" \
    || echo "⚠️  $PROJECT_ROOT/.claude/hooks/$hook — not found or not executable"
done
```

If any hook is missing, re-run Steps B–C before proceeding. Do not continue to Step 4 with a broken hook configuration — a missing `bash-guard.sh` will cause a non-blocking error on every Bash tool call.

### MCP configuration

If the user provided MCP server answers in Step 2, write an `## MCP` section to `.claude/pai-orbit-config.md`:

```markdown
## MCP

git: {{GIT_MCP_SERVER}}
<!-- Choose one: github | gitlab | none -->

board: {{BOARD_MCP_SERVER}}
<!-- Choose one: github | linear | jira | none -->

docs: {{DOCS_MCP_SERVER}}
<!-- Choose one: confluence | notion | none -->
```

Omit the `## MCP` section entirely if all three answers are "none" — do not write a section with all-none values.

### Docs scaffold

If `docs/` does not exist, copy the scaffold from `templates/docs/` to the configured docs path.
If a dedicated docs repo path was given, create the scaffold there.
If Confluence or Notion: skip the scaffold, note the MCP setup required (see Getting Started).

### Architecture scaffold

Copy `templates/docs/architecture/system.md`, `constraints.md`, and `stack.md` to `docs/architecture/` (replacing `{{PROJECT_NAME}}` and `{{DATE}}`).

Populate `stack.md` from the language and framework info discovered in Step 1.

If the user answered the architecture question (Step 2, item 8), pre-populate the service table in `system.md` and the rules in `constraints.md` from those answers. Otherwise leave as stubs.

Tell the user: "Run `/arch init` to complete your architecture declaration. Once declared, `/build` and `/review` will read `constraints.md` to enforce architectural rules automatically."

---

### Target: Cursor (`.cursor/` path)

Run this block when `cursor` is one of the selected targets. No changes to the Cursor path were made for the Copilot upgrade — the pre-existing Cursor scaffolding behaviour applies unchanged. Sources are emitted from `plugins/pai-orbit/dist/cursor-plugin/pai-orbit/` (or `dist/cursor/` for the legacy `.cursor/rules/` consumers).

The exact files written here are owned by `dist/cursor-plugin/` and `dist/cursor/`; running `/setup` with `cursor` as the only target on a fresh repo must produce the same output as before this upgrade.

---

### Target: Copilot (`.copilot/` + `.github/` path)

Run this block when `copilot` is one of the selected targets. The Copilot adapter output lives in `plugins/pai-orbit/dist/copilot/` and is copied verbatim into the project, then `.copilot/` config files are rendered from the Step 2 interview answers.

#### Files to write

Copy from the built `dist/copilot/` tree:

| Source | Destination | Behaviour |
|--------|-------------|-----------|
| `dist/copilot/.github/copilot-instructions.md` | `<project>/.github/copilot-instructions.md` | **Overwrite** — pai-orbit owns this. |
| `dist/copilot/.github/prompts/` | `<project>/.github/prompts/` | **Overwrite** the pai-orbit-emitted `*.prompt.md` files. Leave any user-authored prompts alone. |
| `dist/copilot/.github/instructions/` | `<project>/.github/instructions/` | **Overwrite** the pai-orbit-emitted `*.instructions.md` files. Leave any user-authored instructions alone. |
| `dist/copilot/.husky/pre-commit.template` | `<project>/.husky/pre-commit.template` | **Always copy** as the inert `.template` (D12). If the user opted in to `husky` during Step 2, additionally rename to `.husky/pre-commit`, `chmod +x`, and run `git update-index --add --chmod=+x .husky/pre-commit` (D21) so the exec bit is tracked. |
| `dist/copilot/.pre-commit-config.yaml.template` | `<project>/.pre-commit-config.yaml.template` | **Always copy** as the inert `.template` (D29). If the user opted in to `pre-commit framework` during Step 2, rename to `.pre-commit-config.yaml` and instruct the user to run `pre-commit install` (this step does NOT install Python tooling itself). |

Render from templates using the Step 2 answers:

##### `.copilot/pai-orbit-config.md`

Use the template at `templates/pai-orbit-config.md.template` — same template as the Claude path. The content is tool-agnostic; only the destination folder differs.

For the `## Agile Board → columns` table, use **only** the column names and labels confirmed in Step 2b — never write placeholder or example values. Delete the tool-specific comment blocks that don't apply to the chosen board type.

For the `## System Docs` section: same rules as the Claude path (omit for single-repo, write the pointer if multi-repo).

##### `.copilot/team.md`

Use the template at `templates/team.md.template`. Populate from the team answers.

##### `.copilot/settings.json`

Generate per D19. Write the following JSON, replacing placeholders:

```json
{
  "pai_orbit_version": "<version from plugins/pai-orbit/core/plugin.json>",
  "target": "copilot",
  "installed_at": "<ISO-8601 UTC timestamp at scaffold time>",
  "husky_opted_in": <true if user picked husky or both in Step 2, else false>,
  "detected_languages": [<languages inferred from Step 1 file scan>],
  "precommit_installer": "<husky | pre-commit | both | neither — Step 2 answer>"
}
```

This file is read on subsequent re-runs (`/setup` or `npx … init copilot`) to know what was previously installed and to drive the diff report.

##### `CLAUDE.md`

Use the template at `templates/CLAUDE.md.template`. Fill in:
- Project name and one-line description
- Sub-projects / services table (name, path, stack, purpose)
- Commands section (dev server, build, test for each service)
- Leave architecture section with clear `<!-- TODO: fill in by hand -->` markers

If a `CLAUDE.md` already exists at repo root, do not overwrite it. Preserve the user's content and leave any per-tool rename to the adapter's install path.

##### Docs scaffold

If `docs/` does not exist, copy the scaffold from `templates/docs/`. Same behaviour as the Claude path.

#### What is NOT written for the Copilot target

- **No `.claude/` folder.** That is the Claude Code path.
- **No `.cursor/` folder.** That is the Cursor path.
- **No native hooks (`.claude/hooks/`).** Copilot has no hook event surface. `bash-guard` intent lives in `.github/copilot-instructions.md` as always-loaded advisory text plus the optional `.husky/pre-commit` (or `.pre-commit-config.yaml`). `arch-drift` intent lives in `.github/copilot-instructions.md` and `.github/instructions/arch-drift.instructions.md`. Lint hooks rely on the project's own linter config invoked at commit time by the pre-commit hook — the linter config (`pyproject.toml`, `.eslintrc.json`) is owned by the project, never authored by pai-orbit (D31).
- **No editor-specific files (`.vscode/`, `.idea/`, etc.)** per D33. Editor settings are owned by the team. VS Code users who want lint-on-save follow the 4-line copy-paste recipe in `docs/copilot-install-and-usage.md`.
- **Service-builder prompts already ship as `.github/prompts/<stack>-builder.prompt.md`** under the Copilot adapter (D30). On Pro/Business Copilot they run as multi-step agents (read `CLAUDE.md`, detect the service, propose file edits); on Free they degrade to regular prompts that still give correct manual scaffolding guidance.

#### Standalone install alternative

If the team does not use Claude Code or Cursor, the `/setup` mode is unreachable. Tell the user about the equivalent CLI entry point:

```bash
npx github:the-psi/pai-orbit init copilot
```

It runs the same interview, renders the same files, and is the supported path for Copilot-only teams.

---

## Step 4 — Report

Group the report by assistant target so the developer can see which adapter ran. For each file:
- ✅ Complete — no action needed
- ⚠️ Stub — what the human needs to fill in

Architecture files (shared — written once regardless of how many targets were selected):
- ⚠️ Stub — `docs/architecture/system.md` — run `/arch init` to complete
- ⚠️ Stub — `docs/architecture/constraints.md` — run `/arch init` to define rules
- ✅ Generated — `docs/architecture/stack.md` (populated from detected stack)

### Claude Code target (only if `claude` was selected)

Rules:
- ✅ Generated — `.claude/rules/decisions.md` — ADR obligation rules (when to write one, how)

Hooks:
- ✅ Generated — `.claude/hooks/bash-guard.sh` — blocks force-push, bulk staging, hook bypass, destructive rm
- ✅ Generated — `.claude/hooks/arch-drift-guard.sh` — advisory nudge on structural file edits
- ✅ Generated (if Python) — `.claude/hooks/lint-python.sh` — runs ruff after Python edits
- ✅ Generated (if TS/JS) — `.claude/hooks/lint-ts.sh` — runs eslint after TypeScript/JavaScript edits
- ✅ Generated — `.claude/settings.json` — wires all hooks to Claude Code tool-use events

If any hook shows ⚠️ in the Step 3 validation output, surface it here with instructions: "`.claude/hooks/<name>.sh` is missing. Re-run `/setup` or manually copy the file from the pai-orbit plugin's `hooks/` directory and run `chmod +x` on it."

### Cursor target (only if `cursor` was selected)

- ✅ Generated — `.cursor/` rules, plugin metadata, and command/skill outputs (no change to the pre-existing Cursor scaffold).

### Copilot target (only if `copilot` was selected)

Methodology surfaces (always written):
- ✅ Generated — `.github/copilot-instructions.md` — slim rule book + Context discovery + prompt-library pointer
- ✅ Generated — `.github/prompts/` — 29 invokable slash commands (14 modes, 6 skills, 7 service-builder agent prompts, 2 named agents: `docs-writer`, `cross-repo-impact`)
- ✅ Generated — `.github/instructions/` — 5 auto-attaching guidance files (`git`, `data-model`, `arch-drift`, `context-discovery`, `decisions`)
- ✅ Generated — `.copilot/pai-orbit-config.md` — board, branch model, deploy targets, docs home, team conventions
- ✅ Generated — `.copilot/team.md` — team members, owners, default assignees
- ✅ Generated — `.copilot/settings.json` — version, target, install timestamp, husky opt-in, detected languages, pre-commit installer choice (per D19)

Pre-commit hooks (D29 — commit-time lint + weak secret tripwire, depends on the user's Step 2 answer):
- ✅ Generated — `.husky/pre-commit.template` — inert template; rename to `.husky/pre-commit` + `chmod +x` to activate (D21 also sets the git-tracked exec bit)
- ✅ Generated — `.pre-commit-config.yaml.template` — inert template; rename to `.pre-commit-config.yaml` + run `pre-commit install` to activate
- If user opted into `husky`: ✅ Active — `.husky/pre-commit` is in place, executable, and the exec bit is tracked in git. **Scope:** runs `ruff` / `eslint` on staged files (blocks on lint failure) plus a weak regex secret tripwire. **Does NOT** block `git push --force`, `git add -A`, `--no-verify`, or `rm -rf` — those are pre-push / staging-phase / shell operations that no pre-commit hook can see.
- If user opted into `pre-commit framework`: ✅ Active — `.pre-commit-config.yaml` is in place; remind the user to run `pre-commit install`. Same scope caveats as husky.
- If user picked `both`: both active paths above
- If user picked `neither`: both inert templates only; user can opt in later

**Explicit non-emissions (per D33):**
- ❌ No `.vscode/`, no `.idea/`, no editor-specific folders. Editor settings are owned by the team. VS Code users follow the 4-line lint-on-save recipe in `docs/copilot-install-and-usage.md`.

**Honest gap statement (read aloud to the user):** Copilot has no runtime hook system. The `bash-guard` intent is delivered **as advisory text only** in `.github/copilot-instructions.md` — Copilot is instructed to refuse `git push --force`, `git add -A`, `--no-verify`, and destructive `rm`, and usually obeys, but this is not enforced. The optional `.husky/pre-commit` (or `.pre-commit-config.yaml`) adds real enforcement **at commit time only**, and its scope is narrow: lint failures block the commit and a weak regex catches obvious credential patterns — it does NOT and cannot block `git push --force` (wrong git phase), `git add -A` (staging happens before the hook), or shell commands like `rm -rf`. For hard enforcement of those patterns, use Claude Code, a separate pre-push hook, or server-side branch protection. The `arch-drift` intent is split between `.github/copilot-instructions.md` and `.github/instructions/arch-drift.instructions.md` (advisory). Lint at commit time runs the project's own linter config. Service-builder prompts emit with `mode: agent` (D30): on Copilot Pro/Business they run as multi-step agents; on Free they degrade to regular prompts. Full agent-runtime parity with Claude Code is out of scope.

End with: "Run `/suggest-skills` after a few sessions to discover operational skills worth adding." (`/suggest-skills` is emitted for all three targets — Claude Code, Cursor, and Copilot — so this recommendation applies regardless of the selected adapter.)
