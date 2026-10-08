---
mode: agent
description: "[mode] Configure pai-orbit for this project (interactive interview — Business tier agentic; Free tier advisory only)."
tools: ["codebase", "editFiles", "runCommands", "search"]
---

> **Agent-mode prompt.** On Copilot Pro/Business this runs as a multi-step agent that reads project files, asks questions in Chat, runs shell commands (e.g. `glab api`, `gh project field-list`, `chmod`), and proposes file edits you accept. On Copilot Free it degrades to advisory text — Copilot describes the steps and you run them manually. The equivalent terminal path is `npx github:the-psi/pai-orbit init copilot`.

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
- Look for existing `AGENTS.md`, `.copilot/pai-orbit-config.md`, `.copilot/team.md` — note what is already configured
- Count top-level directories that look like services (api/, frontend/, backend/, app/, etc.)
- Check if this is a monorepo or multi-repo workspace
- Look for `.github/`, `.gitlab/`, `linear.json`, `jira-config` — infer task management platform

Report a brief summary of what was found before asking any questions.

## Step 2 — Ask (only what can't be inferred)

Ask all unresolved questions in a single block — do not ask one at a time. Cover:

1. **Repo structure** (if ambiguous): monorepo with these services, or separate repos?
2. **Tech stack** (per service, if not clear from files): language + framework?
3. **Task management**: GitHub Issues / GitHub Projects v2 / Linear / Jira / GitLab / Azure DevOps / Notion / none? Provide board URL(s). Do **not** ask for label taxonomy here — the board interview in Step 2b will query it from the API.
4. **Branching model**: GitHub Flow (feature branches → main) / GitFlow (develop + release branches) / trunk-based (direct to main with flags)?
5. **Deployment**: cloud provider + target (Cloud Run, Vercel, Railway, AWS ECS, bare VPS, etc.)? One command or per-service?
6. **Docs home**: in-repo `docs/` / dedicated docs repo (provide path) / Confluence (provide space URL) / Notion (provide workspace)?
7. **Multi-repo project?**: Does this service repo belong to a larger multi-repo project with a separate repo for system-level docs (cross-cutting ADRs, epics spanning services, system-wide domain knowledge)? If yes, what is the path or git URL to that system docs repo?
8. **Architecture (optional — can be done later with `/arch init`):** What services exist and how do they communicate? Any hard constraints — things that must never happen across the codebase? (e.g., "services must not share DBs", "frontend talks only to api-gateway")
9. **Team**: names, roles, and handles (GitHub username / Linear ID / Jira user ID / Azure DevOps identity (email) as relevant). Who is the default assignee for code issues? Who owns domain/expert decisions?
10. **MCP servers (optional)**: do you have any MCP servers configured for this project? Answer for each category — enter the server name or "none":
    - **Git**: GitHub MCP / GitLab MCP / none
    - **Board**: GitHub Projects MCP / Linear MCP / Jira MCP / none
    - **Docs**: Confluence MCP / Notion MCP / none

    If MCP servers are configured, they will be preferred over CLI shell commands at runtime (with shell as fallback). If none are configured, all operations use shell commands — no MCP setup is required.

## Step 2b — Board Column Discovery (after Step 2 answers arrive)

Once the user confirms the task-management platform, run only that platform's discovery below. Query the live board for its actual label/state taxonomy. Do **not** assume any column names or label patterns.

For every platform, adapt shell examples to the user's active shell. Bash continuations, loops, `/dev/null`, and `||` are not portable to Windows PowerShell 5.1. Use a single-line command or native shell syntax, inspect each command's exit status, and report failures before using its output. If a JSON helper such as `jq` is unavailable, read the CLI's JSON output directly.

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

After the user confirms the ordered list, fetch all labels with `glab api /projects/<encoded-namespace%2Fproject>/labels --paginate`. Check the command's exit status before reading its JSON output; if it fails, report the error and stop. Compare each confirmed label with the returned names using exact matches.

If any label is missing, warn: "Label '<name>' does not exist on this project. Create it in GitLab first, or correct the name, then confirm again." Do not write the config until all labels are confirmed present.

When writing the `## Agile Board → columns` table in the generated config, include **all** confirmed column labels (both scoped and standalone) and append this comment directly above the table:

```
# Re-run /setup or update this table if labels change on the board.
```

### GitHub Projects v2

```bash
# Replace <owner> and <number> with values from the board URL
gh project field-list <number> --owner <owner> --format json \
  | jq -r '.fields[] | select(.name == "Status") | "field \(.id)", (.options[] | "\(.id): \(.name)")'

# Project node ID (needed for moves)
gh project view <number> --owner <owner> --format json | jq -r '.id'
```

Present the Status field options and ask the user to confirm their column order (they are already ordered but may want to exclude terminal states like "Done" from active workflow). Keep the project ID, Status field ID and each option ID for the mode transition map below.

If `gh project field-list` fails (classic Projects), fall back to asking the user to list column names manually.

### Linear

```bash
linear team list
# or via the Linear MCP if available
```

Present the team's workflow states and ask the user to confirm the ordered column list. If the CLI is unavailable, ask the user to copy the state names from their Linear workspace settings. Keep the team ID and each workflow state ID for the mode transition map below — via the Linear MCP, or ask the user to copy them from Linear's settings if neither MCP nor CLI exposes them.

### Azure DevOps

Run this section only when the selected board type is **Azure DevOps**. Infer organisation, project, and team from the board URL and existing config where possible; ask the user to confirm unresolved values together. Also confirm the work-item type used on that board (for example, User Story or Product Backlog Item); never assume a type or use its states for another type.

Before querying Azure, run the **Azure preflight** in `/board` (CLI, extension, and project access checks). If it fails, report the remedy and stop; a manual list must not bypass a failed access check.

Use the confirmed team to discover its areas:

```text
az boards area team list --org "https://dev.azure.com/<org>" --project "<project>" --team "<team>" -o json
```

Present the team's default and available area paths and ask the user to confirm the path for new work items. If the query fails or returns no usable areas, ask for the exact area path from that team's Azure Board settings; do not silently substitute the project root. Save the confirmed `Team` and `Area path` only in the Azure config block. Team selects the area settings during setup; Area path is passed when creating work items. An area is not a sprint/iteration, so do not derive `--iteration` from either value.

Next, discover the service resource for work-item states. `az devops invoke`'s `--area`/`--resource` values are internal location-service names, not literal REST path segments. Fetch the listing without a case-sensitive name filter:

```text
az devops invoke --org "https://dev.azure.com/<org>" -o json
```

Inspect the returned resources for area `wit` and resource name `workitemtypestates`, comparing names case-insensitively. Use the exact returned area/resource spelling for the call below. If the command fails, the listing is empty, no matching resource exists, or the pair is ambiguous, stop discovery and use the manual state-mapping fallback below. Never invoke a resource with empty or guessed values.

```text
az devops invoke --org "https://dev.azure.com/<org>" --area "<area-from-discovery>" --resource "<resourceName-from-discovery>" --route-parameters "project=<project>" "type=<work-item-type>" --api-version 7.1 --query "value[].name" -o tsv
```

Check both exit status and output. A non-zero exit, empty state list (`[]`, null, or blank output), or malformed result means discovery failed, even if the command exited successfully.

Present the discovered states and ask the user to confirm the board's column order and each column's corresponding state. Process states are not necessarily the board's displayed columns; do not assume the API's order is the board order. If discovery failed, ask the user to copy the exact column-to-state mapping for the selected work-item type from Azure Board settings. Never guess or save empty/example values.

Save `Work-item type`, the confirmed `columns` mapping, and a separate `Closing state` in the Azure config block. Confirm the closing state even if the user excludes it from the active columns; never hardcode `Closed` or infer that the last active column is terminal. If multiple columns map to one state, explain that state-only updates cannot distinguish those columns and board placement may need to be done manually.

Keep the work-item type and each column's confirmed work-item state for the mode transition map below.

### Jira

Ask the user to provide their workflow stages (column names) in order as a comma-separated list. Then resolve each status ID — via the Jira MCP if configured, otherwise:

```bash
jira issue list --project <key> --plain --columns status --no-headers | sort -u   # sanity check names
# status IDs: the Jira MCP, or ask the user to copy them from Project settings → Workflows
```

Keep the project key and each status ID for the mode transition map below.

### GitHub Issues / Notion / none


No API query needed. Ask the user to provide their workflow stages (column names) in order as a comma-separated list.

### Mode transition map (every board type)

After the columns are confirmed, build the map that tells `groom`, `design`, `build` and `review` where to move their ticket at close-out. The board skill's `transition(mode)` reads it.

**Boards with no column to move** (GitHub Issues, Notion, none): write every row as `no move` and tell the user why ("this board type has no columns to move between"). Skip the rest of this step.

**1. Suggest a target per mode**, in order groom → design → build → review. Match each mode's synonyms **case-insensitively as substrings** against the confirmed column names, in priority order; first match wins. Only suggest columns that exist on the board.

| Mode | Synonyms (priority order) | Previous target |
|------|---------------------------|-----------------|
| groom | Ready for Design, Design, Groomed, Refined, Ready | the board's first column |
| design | Ready for Build, Build, Ready for Dev, To do, Ready | groom's target |
| build | In review, Review, Code review, QA, Testing | design's target, else groom's |
| review | Approved, Ready to merge, Ready for release | build's target |

- **No synonym matches** → name the gap ("no review-like column found"), then suggest the next column after the previous target in board order. Offer another real column or `no move` as alternatives.
- **Review never falls back.** No synonym match → suggest `no move`. Never suggest Done for review — Done comes from the merge. The user may still pick Done by hand.
- **Collapse rule:** a suggestion at or before the previous mode's target becomes `no move` (e.g. design matching the same "Ready" column groom already moves to).

Example — columns Backlog, Ready, In progress, In review, Done: groom → Ready; design → Ready → collapses to `no move`; build → In review; review → `no move`.

**2. Confirm.** Show the full map (mode, target column, column ID) and get confirmation of **every row** before saving. The user may change any row to another real column or `no move`.

**3. Re-run on a project that already has `## Mode transitions`.** Compare each saved row with the live board **by ID**:

| Saved row vs live board | Action |
|-------------------------|--------|
| ID present, same name | keep — no question |
| ID present, name changed | flag as renamed; suggest updating the name, keep the ID |
| ID gone | flag as broken; re-run the suggestion for that mode |
| A new column matches a mode's synonyms better | flag as an optional change; default keeps the saved row |

Show only the flagged rows; keep every row the user does not change. A table with non-standard headers (hand-written) is read by position — mode, target, ID — and rewritten with the canonical headers, rows kept. If the section is absent (a project set up before 1.10.0), run the full flow above.

---

## Step 2c — Copilot install questions

**First: read `.copilot/settings.json` if it exists.** The `npx github:the-psi/pai-orbit init copilot` CLI writes this file at install time with the user's earlier answers. If the file exists and contains `install_mode: "install-only"`, use its values instead of re-asking:

- `husky_opted_in` (boolean) → skip the husky question below
- `precommit_installer` (`"husky"` / `"pre-commit"` / `"both"` / `"neither"`) → skip the installer question below
- `detected_languages` → treat as authoritative for language detection; still cross-check against Step 1's file scan for services added since install
- `pai_orbit_version` → note whether this is a re-run of the same version or an upgrade

Only ask the questions below if `.copilot/settings.json` is absent, or the fields above are missing from it, or the user has explicitly re-invoked `/setup` to change these answers:

- **"Install the optional `.husky/pre-commit` hook (commit-time lint + weak secret tripwire; does NOT block `git push --force` or `git add -A`)?"** Default: `yes` if the project has `.git/`, `no` otherwise.
- **"Choose pre-commit installer: husky / pre-commit framework / both / neither"**. Detection-driven defaults: `husky` if `.husky/` exists or `package.json` has a husky dep; `pre-commit` if `.pre-commit-config.yaml` already exists; `husky` otherwise.

## Step 3 — Generate

Create the `.copilot/*`, `AGENTS.md`, and `docs/` files. Tell the user what was created and what they need to fill in by hand.

### Files already installed by the CLI — do not touch

The `npx github:the-psi/pai-orbit init copilot` step writes these files before `/setup` runs:

- `.github/copilot-instructions.md` — always-loaded rule book
- `.github/prompts/*.prompt.md` — 30 slash-command prompt files
- `.github/instructions/*.instructions.md` — 5 auto-attaching guidance files
- `.husky/pre-commit.template` and `.pre-commit-config.yaml.template` — inert hook templates

**Do NOT re-copy, re-generate, or overwrite these files.** They are already the correct pai-orbit-emitted content. If any is missing, the correct action is to re-run the CLI (`npx github:the-psi/pai-orbit init copilot --ignore-existing`) — do not attempt to reconstruct the content by hand.

### Hook activation (only if the user opted in during Step 2c)

- **husky:** rename `.husky/pre-commit.template` → `.husky/pre-commit`, run `chmod +x .husky/pre-commit`, then run `git update-index --add --chmod=+x .husky/pre-commit` so the exec bit is tracked in git.
- **pre-commit framework:** rename `.pre-commit-config.yaml.template` → `.pre-commit-config.yaml`, then tell the user to run `pre-commit install` (this step does NOT install Python tooling itself).
- **both:** perform both above.
- **neither:** leave the inert `.template` files in place; the user can activate later.

### `.copilot/pai-orbit-config.md`

Synthesize this file directly from the Step 2 interview answers and the Step 2b board discovery. Do not attempt to read an external template — write the content from scratch.

The file has these top-level sections:

- `# pai-orbit configuration` (title)
- `## Agile Board` — `type:`, `url:`, and a `## Agile Board → columns` markdown table populated **only** from the column names/labels confirmed in Step 2b. Never write placeholder or example values.
- `## Mode transitions` — the mode→column map the board skill's `transition(mode)` reads at groom/design/build/review close-out. Board-IDs header (GitHub Projects: project node ID + Status field ID; Linear: team ID; Jira: project key; GitLab: none) then a `| Mode | Target column | Column ID |` table with one row each for groom, design, build, review. Column ID is the real option / state / status ID (GitLab: the label name) captured in Step 2b — never a placeholder. Suggest targets by case-insensitive substring synonyms (groom: Ready for Design, Design, Groomed, Refined, Ready; design: Ready for Build, Build, Ready for Dev, To do, Ready; build: In review, Review, Code review, QA, Testing; review: Approved, Ready to merge, Ready for release), falling back to the next real column after the previous mode's target (review never falls back and never suggests Done: no match → `no move`). A suggestion at or before the previous mode's target becomes `no move`. Show the whole map and confirm every row before saving. Boards with no columns (GitHub Issues, Notion, none): write every row as `no move`. On re-run, compare saved rows with the live board by ID, flag only renamed/broken rows, keep the rest.
- `## Branching` — `model:` (github-flow / gitflow / trunk), `main:` (branch name), `pr_merge_strategy:`, `protected:` (list)
- `## Deployment` — `provider:` and per-service target/image/deploy_cmd rows
- `## Docs` — `home:` (`local` / `dedicated-repo` / `confluence` / `notion`) plus the appropriate path/URL field
- `## Team defaults` — default assignees for eng and ops handles
- `## System Docs` — see rules below
- `## MCP` — see the MCP subsection later in this step

When `type` is **Azure DevOps**, also record `Organisation:`, `Project:`, `Team:`, `Area path:`, `Work-item type:`, and `Closing state:` under `## Agile Board`, using only the values confirmed in Step 2b. The `columns` table maps `Column` to `Work-item state`. Organisation is the organisation name used in `https://dev.azure.com/<org>`. Omit these Azure-specific fields for other board types; their existing configuration stays unchanged.

For the `## System Docs` section:
- If the user answered **no** to the multi-repo question: omit the `## System Docs` section entirely (do not write it with blank values).
- If the user answered **yes** and provided a **relative path**: check whether that directory exists before writing. If it does not exist, warn the user ("System docs path not found — writing the pointer anyway; ensure the repo is cloned before running commands") and write it as given.
- If the user answered **yes** and provided a **git URL**: write it as-is. Do not attempt to clone or validate — note that the user must clone the repo locally before commands can read from it.

### `.copilot/team.md`

Synthesize this file from the team roster the user gave in Step 2. The file is a markdown table with columns `Name | Role | GitHub | Linear | Jira | Azure DevOps | Notes` — one row per team member the user named. Populate Azure DevOps with the confirmed Azure identity (email) when that platform is selected; leave unused platform columns blank. Also include `Default engineering lead:`, `Default domain expert:`, and `Default ops lead:` lines below the table populated from the roles the user assigned.

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

Synthesize this file at the project's repo root by combining the Step 2 answers with facts read from the actual project (service directories, package manifests, README, etc.). Do not attempt to read an external template.

Sections to write:

- **`# <project name>`** — from Step 2 or inferred from the repo directory name
- **One-line project description** — from Step 2 or a concise summary of what the repo does
- **`## Sub-projects / services`** — markdown table with columns `Name | Path | Stack | Purpose`. One row per service the user named in Step 2 or that was discovered in Step 1. Real service names, paths, stacks — no placeholders.
- **`## Commands`** — per-service subsections listing the actual dev / build / test / lint commands read from `package.json` scripts, `pyproject.toml`, `Makefile`, `.csproj`, or equivalent. If a command cannot be discovered, write `# TODO: fill in` next to that field rather than fabricating one.
- **`## Architecture`** — leave a `<!-- TODO: run /arch init to complete this section -->` marker. `/arch init` populates it from `docs/architecture/*.md` once those exist.

**Legacy project-context handling:** if a `Claude`-convention project-context markdown file already exists at repo root (from a Claude Code install predating D37 — the filename Claude Code uses is `Claude` + `.md` at the top of the repo), do NOT overwrite it. Create `AGENTS.md` alongside and tell the user to migrate their project context from that legacy file into `AGENTS.md` by hand. The Copilot adapter's `.github/copilot-instructions.md` reads `AGENTS.md` first; when `AGENTS.md` is absent it falls back to that Claude-convention file, so both files can coexist during the migration.

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

If `docs/` does not exist, create the following subdirectories in the configured docs path (the location the user chose in Step 2 — in-repo `docs/` by default, or a dedicated docs repo):

- `docs/architecture/` — see the next subsection
- `docs/features/` — one subfolder per feature, populated by `/groom` / `/design` / `/build`
- `docs/decisions/` — ADRs
- `docs/epics/` — epic tracking files
- `docs/plans/` — planning and prioritisation notes
- `docs/ops/` — human-owned operational files
- `docs/backlog/` with `feature-ideas.md` — parking lot
- `docs/reports/` — data analysis outputs
- `docs/wip/` — ephemeral session captures
- `docs/domain/` with `product-capabilities.md` — the file `/build` appends to after every ship. Write its top-level structure as: a title, a Contents table listing this product's actual surfaces (the axis that stays stable as the product grows — populate from services detected in Step 1 / declared in Step 2), and a `## How to maintain it` section documenting the append rules (`/build` reads those rules to decide where a new entry goes; without them the file drifts into a reverse-chronological build log).

If Confluence or Notion was chosen as the docs home: skip the local scaffold, note the MCP setup required, and point at the Getting Started guide.

### Architecture scaffold

Write `docs/architecture/system.md`, `docs/architecture/constraints.md`, and `docs/architecture/stack.md` directly. Do not attempt to read an external template — synthesize each file from the interview answers and project scan.

- **`system.md`** — title, last-updated date, `## Services` table (populated from Step 1 discovery + Step 2 answers with actual service name, path, stack summary, one-line purpose), `## Communication` table (populated from Step 2 architecture answer if the user gave one; otherwise write `<!-- TODO: run /arch init to populate -->`).
- **`constraints.md`** — title, then hard rules from Step 2's architecture answer. If none were given, write `<!-- TODO: run /arch init to declare constraints -->` and leave the section empty.
- **`stack.md`** — per-service subsections listing the language, framework, major dependencies read from `package.json`, `pyproject.toml`, `.csproj`, `go.mod`, etc.

Tell the user: "Run `/arch init` to complete your architecture declaration. Once declared, `/build` and `/review` will read `constraints.md` to enforce architectural rules automatically."

### What is NOT written for the Copilot target

- **No `.claude` folder.** That is the Claude Code target's path; Copilot uses `.copilot/` instead.
- **No `.cursor` folder.** That is the Cursor target's path; Copilot uses `.copilot/` instead.
- **No native hooks (`.claude/hooks/`).** Copilot has no hook event surface. `bash-guard` intent lives in `.github/copilot-instructions.md` as always-loaded advisory text plus the optional `.husky/pre-commit` (or `.pre-commit-config.yaml`). `arch-drift` intent lives in `.github/copilot-instructions.md` and `.github/instructions/arch-drift.instructions.md`. Lint hooks rely on the project's own linter config invoked at commit time by the pre-commit hook — the linter config (`pyproject.toml`, `.eslintrc.json`) is owned by the project, never authored by pai-orbit.
- **No editor-specific files (`.vscode/`, `.idea/`, etc.).** Editor settings are owned by the team. VS Code users who want lint-on-save follow the 4-line copy-paste recipe in `docs/copilot-install-and-usage.md`.
- **Service-builder prompts already ship as `.github/prompts/<stack>-builder.prompt.md`** under the Copilot adapter. On Pro/Business Copilot they run as multi-step agents (read `AGENTS.md`, detect the service, propose file edits); on Free they degrade to regular prompts that still give correct manual scaffolding guidance.

### Standalone install alternative

If the team does not use Claude Code or Cursor, the `/setup` mode is unreachable. Tell the user about the equivalent CLI entry point:

```bash
npx github:the-psi/pai-orbit init copilot
```

It runs the same interview, renders the same files, and is the supported path for Copilot-only teams.

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
- ✅ Generated — `.github/prompts/` — 30 invokable slash commands (15 modes, 6 skills, 7 service-builder agent prompts, 2 named agents: `docs-writer`, `cross-repo-impact`)
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
