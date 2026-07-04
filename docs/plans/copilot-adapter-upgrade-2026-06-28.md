# Copilot Adapter Upgrade — Prompt Files + /setup Integration

**Date:** 2026-06-28
**Owner:** Chetan Sharma
**Epic:** [multi-tool-compat](../epics/multi-tool-compat/EPIC.md)
**Status:** Planned — to be executed today
**Supersedes context from:** [copilot-validation-2026-06-28.md](./copilot-validation-2026-06-28.md) (validation plan abandoned in favour of doing the upgrade directly)

---

## Goal

Bring pai-orbit's GitHub Copilot adapter to parity with ECC ([github.com/affaan-m/ecc](https://github.com/affaan-m/ecc)) so that a project using Copilot gets the same mode-and-skill workflow as a project using Claude Code or Cursor.

Concretely: a developer using Copilot Chat in VS Code should be able to type `/groom`, `/design`, `/build`, etc. and have the mode-specific prompt loaded — not just read a static reference file.

---

## Why now

The current Copilot adapter only emits a single `.github/copilot-instructions.md`. This gives Copilot users the *vocabulary* of pai-orbit's modes but not the *mechanics* — there are no invokable commands. ECC demonstrates that prompt files (`.github/prompts/*.prompt.md`) solve this. The mechanism is supported by Copilot today. No external dependency, no new licence, no waiting on GitHub.

Doing this upgrade now removes the "Copilot is a second-class citizen" caveat we'd otherwise have to put in every adoption doc.

---

## Reference implementation

[affaan-m/ecc](https://github.com/affaan-m/ecc) — multi-tool harness, similar in spirit to pai-orbit. Its `.github/` layout is:

```
.github/
├── copilot-instructions.md       # 115 lines — rule book + pointer to prompts
└── prompts/
    ├── plan.prompt.md
    ├── tdd.prompt.md
    ├── security-review.prompt.md
    ├── refactor.prompt.md
    └── build-fix.prompt.md
```

Each prompt file uses YAML frontmatter:

```yaml
---
agent: agent
description: <one-line description>
---
```

…followed by the prompt body. Copilot Chat reads the description, surfaces the command in its slash-command picker, and loads the body when invoked.

---

## Scope — what is in, what is out

### In scope (today)

1. **Adapter rewrite** — modify [plugins/pai-orbit/adapters/copilot/build.sh](../../plugins/pai-orbit/adapters/copilot/build.sh) to emit:
   - `.github/copilot-instructions.md` — slimmed to a rule book + prompt-library reference (model on ECC's structure, not the current full mode dump). **Absorbs the intent of bash-guard and arch-drift hooks as always-loaded rule text.**
   - `.github/prompts/<mode>.prompt.md` — one per file in `plugins/pai-orbit/core/modes/`, **excluding `setup` and `suggest-skills` per D13** (12 files: arch, build, data, design, domain, groom, incident, plan, release, review, test, ux). Filesystem audit 2026-06-28: `core/modes/` actually contains 14 files; `setup` and `suggest-skills` are the two dropped from Copilot output.
   - `.github/prompts/<skill>.prompt.md` — one per skill in `plugins/pai-orbit/core/skills/` (6 files: analysis, board, data-model, epic, git, simplify). Same content as the source SKILL.md, wrapped with prompt frontmatter so users can invoke them as `/git`, `/analysis`, `/board`, etc. in Copilot Chat.
   - `.github/instructions/<skill>.instructions.md` — for skills that should ALSO auto-attach to file globs. The same skill body may appear in both `prompts/` (invokable) and `instructions/` (auto-attached) — they are not mutually exclusive.
   - `.github/instructions/arch-drift.instructions.md` — encodes the arch-drift-guard hook's intent, scoped to structural files (`docker-compose.yml`, `package.json`, `go.mod`, `pom.xml`, `Cargo.toml`, etc.). Advisory only.
   - `.husky/pre-commit.template` — optional opt-in git-level enforcement of `bash-guard`'s intent (block force-push, block `git add -A`, etc.). Documented in the adoption page; users copy to `.husky/pre-commit` and `chmod +x` to activate.
   - **NO editor-specific files (`.vscode/`, `.idea/`, etc.) per D33.** Editor settings are owned by the team, not pai-orbit. Lint enforcement comes from the project's own linter config (`pyproject.toml`, `.eslintrc.json`) read by every editor with integration, plus the pre-commit hook above. VS Code users who want lint-on-save configure their own VS Code settings once; the adoption page provides a copy-paste recipe.
2. **`/setup` mode update** — extend [plugins/pai-orbit/core/modes/setup.md](../../plugins/pai-orbit/core/modes/setup.md) to detect or ask which tool(s) the project uses (Claude Code / Cursor / Copilot / multiple), and write the Copilot-equivalent files when Copilot is selected. (For Copilot-only teams who have no Claude Code or Cursor installed, the standalone `pai-orbit init` CLI in #3 is the entry point.)
3. **Standalone install CLI** — add `pai-orbit init <target>` distributed via `npx github:the-psi/pai-orbit`. No npm publishing required. Works on any machine with Node.js + git. Performs the same scaffolding `/setup` would do, runs an interactive Q&A, writes the same files into the project. This is the install path for Copilot-only teams.
4. **`.copilot/` folder convention** — when Copilot is selected (via either `/setup` or `pai-orbit init copilot`), pai-orbit's own metadata is written to `.copilot/pai-orbit-config.md`, `.copilot/team.md`, `.copilot/settings.json` — mirroring the `.claude/` and `.cursor/` layouts the team already knows.
5. **Local validation** — install the new adapter output into a real test project (via `npx github:the-psi/pai-orbit init copilot`) and run two real workflows end-to-end via Copilot Chat.
6. **Adoption page** — `docs/copilot-install-and-usage.md` (mirrors the existing Cursor install page).
7. **Epic update** — mark the relevant features in [multi-tool-compat/EPIC.md](../epics/multi-tool-compat/EPIC.md) as Done / In Progress.

### Out of scope

- Cursor and Claude adapter changes — leave those alone.
- A native hook system for Copilot — Copilot has no tool-use event triggers. Hook intent is delivered two ways (instructions text in `copilot-instructions.md`, and the pre-commit hook layer per D29) as documented in the "Hook coverage in Copilot" section below — not by porting `.sh` hook scripts to Copilot.
- Editor-specific scaffolding (`.vscode/`, `.idea/`, etc.) — pai-orbit does not own or emit editor settings (per D33). VS Code users who want lint-on-save copy the recommended settings from the adoption page once.
- Full agent runtime for Copilot — Copilot has no native agent system separate from Chat. **Service-builder prompts (per D30) are still emitted** with `mode: agent` frontmatter: on Copilot Pro/Business they run as multi-step agents (read `CLAUDE.md`, detect the service, propose file edits); on Copilot Free they degrade gracefully to regular prompts that give correct manual scaffolding guidance. What's out of scope is parity with Claude Code's agent runtime (spawning, parallel execution, hooks-on-agent-events) — those primitives don't exist in Copilot.
- The full multi-tool-compat Phase 1 (canonical YAML frontmatter across all modes/skills). This upgrade reads the existing markdown files; it doesn't require front-matter migration first.
- Copilot Business licence procurement — that work is on Chetan's IT request thread, independent of this upgrade.

---

## Target file layout (what a project gets after install)

```
project-root/
├── .copilot/                              # pai-orbit's own metadata (symmetry with .claude / .cursor)
│   ├── pai-orbit-config.md
│   ├── team.md
│   └── settings.json
│
├── .github/                               # Copilot product paths — fixed by GitHub, NOT a hosting-platform statement
│   ├── copilot-instructions.md            # slim rule book + bash-guard intent + arch-drift intent + prompt library pointer
│   │
│   ├── prompts/                           # INVOKABLE — user types /name in Copilot Chat
│   │   ├── arch.prompt.md                 # ── modes (12) — all modes except /setup and /suggest-skills (D13)
│   │   ├── build.prompt.md
│   │   ├── data.prompt.md
│   │   ├── design.prompt.md
│   │   ├── domain.prompt.md
│   │   ├── groom.prompt.md
│   │   ├── incident.prompt.md
│   │   ├── plan.prompt.md
│   │   ├── release.prompt.md
│   │   ├── review.prompt.md
│   │   ├── test.prompt.md
│   │   ├── ux.prompt.md
│   │   ├── analysis.prompt.md             # ── skills (6) — every skill in core/skills/
│   │   ├── board.prompt.md
│   │   ├── data-model.prompt.md
│   │   ├── epic.prompt.md
│   │   ├── git.prompt.md
│   │   ├── simplify.prompt.md
│   │   ├── django-builder.prompt.md       # ── service-builder agent prompts (7) per D30 — `mode: agent` frontmatter
│   │   ├── express-builder.prompt.md      #    run as agents on Pro/Business; degrade to regular prompts on Free
│   │   ├── fastapi-builder.prompt.md
│   │   ├── generic-service-builder.prompt.md
│   │   ├── infra-builder.prompt.md
│   │   ├── nextjs-builder.prompt.md
│   │   └── react-vite-builder.prompt.md
│   │
│   └── instructions/                      # AUTO-ATTACHED by file path glob — same skill content can also appear here
│       ├── git.instructions.md            # applyTo: **/*  (always-on baseline)
│       ├── data-model.instructions.md     # applyTo: **/*.sql, **/migrations/**
│       ├── arch-drift.instructions.md     # applyTo: **/docker-compose.yml, **/package.json, **/go.mod, **/pom.xml, ...
│       └── context-discovery.instructions.md  # applyTo: **/*  (fall-back duplicate of the context-discovery directives per R8)
│
├── .husky/                                # OPTIONAL — written as .template (per D12); user opts in by renaming and chmod +x
│   └── pre-commit.template                # git-level enforcement of bash-guard intent (force-push, git add -A, etc.)
│
├── .pre-commit-config.yaml.template       # OPTIONAL alternative to husky (per D29) — for teams using the pre-commit framework
│
├── CLAUDE.md                              # tool-agnostic project docs
└── docs/                                  # standard pai-orbit documentation tree

# Notably absent: NO .vscode/, .idea/, or other editor-specific files (per D33).
# Editor configuration is owned by the team. VS Code users who want lint-on-save
# follow a 4-line copy-paste recipe in the adoption page.
```

The split is deliberate:
- **`.copilot/`** = pai-orbit's metadata, named for symmetry. Copilot itself doesn't read it; pai-orbit's instructions reference it.
- **`.github/`** = Copilot's required paths. Cannot be moved. Works regardless of repo hosting (GitHub, GitLab, Bitbucket, Azure DevOps, self-hosted git — all fine).

---

## Skill rendering — prompts AND/OR instructions

A skill is **not** a single file in Copilot — it is a piece of operational guidance that can be rendered into two places depending on its nature:

| Folder | When Copilot uses it | Trigger |
|--------|---------------------|---------|
| `.github/prompts/<skill>.prompt.md` | User explicitly invokes it | User types `/<skill>` in Copilot Chat |
| `.github/instructions/<skill>.instructions.md` | Auto-attaches based on file path | User opens / edits a file matching the `applyTo:` glob |

The two are **not mutually exclusive**. The same skill body may appear in both folders — once with prompt frontmatter (`agent: agent`, `description:`) and once with instructions frontmatter (`applyTo: "<glob>"`).

### Mapping for every existing pai-orbit skill

Filesystem audit 2026-06-28: `core/skills/` actually contains 6 directories (analysis, board, data-model, epic, git, simplify). Several earlier-planned skills (`/review`, `/incident`, `/release`, `/setup`, `/suggest-skills`) are filed under `core/modes/` and are handled by the mode emitter, not the skill emitter. `/security-review` is not yet authored anywhere and is filed as a follow-up (`docs/features/security-review-skill/requirements.md`) — out of scope for this upgrade.

| Skill | Prompt file (invokable) | Instructions file (auto-attached) | Notes |
|-------|------------------------|----------------------------------|-------|
| `/analysis` | ✅ | ❌ | On-demand only |
| `/board` | ✅ | ❌ | On-demand only |
| `/data-model` | ✅ | ✅ `applyTo: "**/*.sql, **/migrations/**"` | Invokable + auto on SQL/migrations |
| `/epic` | ✅ | ❌ | On-demand only |
| `/git` | ✅ | ✅ `applyTo: "**/*"` | Invokable on demand + always-on conventions baseline |
| `/simplify` | ✅ | ❌ | On-demand only |

**Net effect:** all 6 skills in `core/skills/` emit as Copilot prompts; 2 of 6 (`/git` and `/data-model`) also emit auto-attach instructions files. None are dropped. The two intentional drops (`/setup` and `/suggest-skills` per D13) are modes, not skills, and are handled in the mode emitter.

---

## Hook coverage in Copilot

Copilot has **no tool-use event triggers**. Prompt files only fire when the user types `/<name>`. Instruction files only activate when matching files are open. Neither can react to actions like "user just edited X" or "user is about to run a bash command." So `.sh` hooks **cannot be ported as-is**.

Each pai-orbit hook's *intent* lands in a different layer:

| pai-orbit hook | Lands in (Copilot world) | Mechanism | Enforcement level |
|----------------|--------------------------|-----------|-------------------|
| `bash-guard.sh` (block `git push --force`, `git add -A`, `git add .`, unsafe `rm -rf`) | `.github/copilot-instructions.md` — under a "Forbidden patterns" section, always loaded on every Chat turn | Instruction text Copilot reads on every turn | **Advisory.** Copilot is told never to suggest these patterns. Usually obeys, not always. |
| `bash-guard.sh` — real enforcement | `.husky/pre-commit.template` — optional opt-in | Git pre-commit hook | **Enforced** at commit time, regardless of which AI tool produced the change |
| `lint-python.sh` (run `ruff check` after edits) | **Project's `pyproject.toml`** holds the lint rules. The **pre-commit hook (D29)** runs `ruff check` on every `git commit`. VS Code users who want save-time feedback paste 4 lines into their own VS Code settings (recipe in adoption page). | Pre-commit hook (editor-agnostic) + optional VS Code lint-on-save (manual setup) | **Enforced at commit time for every editor.** Save-time is a VS Code convenience the user opts into. |
| `lint-ts.sh` (run `eslint` after edits) | **Project's `.eslintrc.json`** holds the lint rules. The **pre-commit hook (D29)** runs `eslint` on every `git commit`. VS Code users who want save-time feedback paste 4 lines into their own VS Code settings (recipe in adoption page). | Pre-commit hook (editor-agnostic) + optional VS Code lint-on-save (manual setup) | **Enforced at commit time for every editor.** Save-time is a VS Code convenience the user opts into. |
| `arch-drift-guard.sh` (advisory nudge on structural file edits) | Two places: (a) `.github/copilot-instructions.md` (always loaded) and (b) `.github/instructions/arch-drift.instructions.md` with `applyTo: "**/docker-compose.yml, **/package.json, **/go.mod, **/pom.xml, **/Cargo.toml"` | Instruction text Copilot reads when those files are open | **Advisory** — Copilot self-warns before suggesting changes to structural files |

### Summary table for the adoption page

| Hook intent | Where it lives in Copilot | Enforced? |
|-------------|---------------------------|-----------|
| Block dangerous bash patterns | `.github/copilot-instructions.md` (always-on text) | Advisory |
| Block dangerous bash patterns — real | `.husky/pre-commit` (opt-in) | Enforced |
| Lint Python at commit | Pre-commit hook + project `pyproject.toml` | Enforced (every editor) |
| Lint TypeScript/JS at commit | Pre-commit hook + project `.eslintrc.json` | Enforced (every editor) |
| Lint at save (VS Code users only, optional) | Recipe in adoption page; user's own VS Code settings | Convenience, user opts in |
| Warn on architectural drift | `.github/copilot-instructions.md` + `.github/instructions/arch-drift.instructions.md` | Advisory |

The honest message to teams: **enforcement is preserved for linting and for git-level guards. Advisory-only for in-Chat bash safety, because Copilot doesn't offer a real interception point.**

---

## Work phases

### Phase 1 — Design the prompt-file format

**Deliverable:** `docs/features/copilot-adapter-prompt-files/design.md`

Captures:
- The frontmatter schema for prompt files (`agent`, `description`, optionally `tools`).
- The body transformation from `core/modes/<name>.md` → prompt file (strip Switch-out section? keep it? slim it?). Decision: keep — switch-out guidance is part of the headspace.
- The frontmatter schema for instruction files (`applyTo` glob, body content).
- The body transformation from `core/skills/<name>/SKILL.md` → prompt file (skills become invokable as `/<skill>`).
- The mapping table: every skill mapped to one or both of `prompts/` and `instructions/` (per the "Skill rendering" section above).
- The new slim `copilot-instructions.md` outline — what stays inline (forbidden patterns, arch-drift baseline, prompt library pointer) vs what moves out to prompts.
- **No `.vscode/settings.json` is emitted (per D33).** The adoption page carries a 4-line VS Code lint-on-save recipe users paste once if they want save-time feedback. Lint rules continue to live in the project's own config files (`pyproject.toml`, `.eslintrc.json`); pai-orbit never authors or modifies them.
- The `.husky/pre-commit.template` content — git-level enforcement of bash-guard intent.
- Hook-to-file mapping table (the one in the "Hook coverage" section) lifted into the design doc as the authoritative reference.

### Phase 2 — Rewrite the adapter

**Files touched:** [plugins/pai-orbit/adapters/copilot/build.sh](../../plugins/pai-orbit/adapters/copilot/build.sh)

Tasks:
- Refactor the existing single-file emitter into separate emitters:
  - `emit_copilot_instructions` — slim rule book (forbidden patterns, prompt-library pointer, path-rewrite note, baseline arch-drift rules)
  - `emit_mode_prompts` — one prompt file per file in `core/modes/`, **skipping `setup` and `suggest-skills` per D13** (12 of 14 modes emitted). **Each prompt is prefixed with an anti-drift block (per D28)** so Copilot self-polices headspace boundaries. Format: "You are now in <MODE>. Rules until the user explicitly switches: do NOT do <X>, do NOT do <Y>, redirect off-scope requests to the right mode, begin every reply with `[<MODE>]` so drift is visible."
  - `emit_skill_prompts` — one prompt file per skill in `core/skills/` (6 skills total: analysis, board, data-model, epic, git, simplify — no skipping needed; the `core/modes/` skips above don't apply here since setup/suggest-skills are modes, not skills)
  - `emit_service_builder_prompts` — **one prompt file per template in `core/templates/agents/`** — 7 total: Django, Express, FastAPI, generic-service, infra, Next.js, React-Vite (filesystem audit 2026-06-28 — `infra-builder` is included). Each is emitted with `mode: agent` in the frontmatter (per D30) so Pro+/Business Copilot can run it as a multi-step agent that reads `CLAUDE.md`, detects the service, and scaffolds files. On Free, the same prompt loads as regular text — degrades gracefully, no error.
  - `emit_skill_instructions` — instructions files for path-scoped skills (`git`, `data-model`)
  - `emit_arch_drift_instructions` — the arch-drift instructions file scoped to structural files
  - `emit_husky_template` — `.husky/pre-commit.template` with bash-guard's intent at git level
  - `emit_precommit_framework_template` — **`.pre-commit-config.yaml.template` (per D29)** as a non-husky alternative for teams that prefer the cross-tool `pre-commit` framework. Same bash-guard rules, different installer. The CLI asks the user which they want (or both, or neither).
- Slim `copilot-instructions.md`: keep the Copilot path-rewrite note, the forbidden-patterns block (bash-guard intent), the arch-drift baseline note, and the prompt-library reference. Remove the inline mode dumps (they live in the prompt files now).
- **Add a `## Context discovery` section to `copilot-instructions.md`** that instructs Copilot to read team-specific and project-specific files at session start. This is the explicit mechanism that lets pai-orbit guide a Copilot session against the project's actual conventions (not just generic prompts). The section lists:
  - `.copilot/pai-orbit-config.md` — board, branch model, deploy targets, docs home, team conventions
  - `.copilot/team.md` — team members, owners, default assignees
  - `CLAUDE.md` — project description, stack, key files, data model, auth
  - `docs/architecture/constraints.md` — architectural rules (read before any structural change)
  - `docs/architecture/system.md` — service inventory and inter-service communication
  - `docs/architecture/stack.md` — language and framework choices
  - `docs/decisions/` — ADRs relevant to the task
  - `docs/domain/*.md` — business rules and expert knowledge
  - `docs/features/<feature>/requirements.md` — when working on a known feature
  - Closing rule: "If a referenced file does not exist, proceed without it — but do not invent its contents."
- Run `bash plugins/pai-orbit/build.sh` and visually verify `plugins/pai-orbit/dist/copilot/` matches the target layout above.

**Done when:** `dist/copilot/` contains:
- `copilot-instructions.md` (slim, with bash-guard + arch-drift text embedded, plus the `## Context discovery` section per D17)
- `prompts/` — 12 mode prompts + 6 skill prompts + 7 service-builder agent prompts (25 files total). Mode prompts have `[mode]` prefix and the anti-drift block (per D20, D28). Skill prompts have `[skill]` prefix (per D20). Service-builder prompts have `[agent]` prefix and `mode: agent` in frontmatter (per D30). The `/test` slug is owned by the mode — no test skill exists (D22 obsolete; see decisions table).
- `instructions/` — `git.instructions.md`, `data-model.instructions.md`, `arch-drift.instructions.md`, **plus the fall-back `context-discovery.instructions.md` (per R8) with `applyTo: "**/*"`** that duplicates the Context discovery directives so they reach Copilot via two channels.
- `.husky/pre-commit.template` — git-level bash-guard enforcement (husky users)
- `.pre-commit-config.yaml.template` — same rules for teams using the `pre-commit` framework instead of husky (per D29)

**Build-time verification gates (new):**
- `scripts/verify-dist.sh` exists and: walks every `*.prompt.md` and `*.instructions.md` under `dist/copilot/`, parses the YAML frontmatter (using a tiny awk parser or a yaml-lint helper), and exits non-zero if any file has missing required fields or unparseable frontmatter. Catches emitter bugs before they ship.
- `.github/workflows/dist-freshness.yml` exists and: runs `bash plugins/pai-orbit/build.sh` on every PR touching `plugins/pai-orbit/`, then runs `git diff --exit-code dist/` and fails the PR if the diff is non-empty. Prevents the "contributor edits core/ but forgets to rebuild" silent-failure mode.

The build emits no errors and both verification gates pass.

### Phase 3 — Extend `/setup`

**Files touched:** [plugins/pai-orbit/core/modes/setup.md](../../plugins/pai-orbit/core/modes/setup.md), templates under [plugins/pai-orbit/core/templates/](../../plugins/pai-orbit/core/templates/)

Tasks:
- Add an "assistant target" question to Step 2 (default: Claude Code; allow: Cursor, Copilot, multiple).
- For each selected target, generate the corresponding output:
  - Claude Code → existing `.claude/` behaviour (unchanged).
  - Cursor → existing `.cursor/` behaviour (unchanged).
  - Copilot → new `.copilot/` + `.github/` + `.husky/` (optional) behaviour. **No `.vscode/` or other editor-specific files (per D33).**
- For Copilot path: copy the rendered adapter output from `plugins/pai-orbit/dist/copilot/` into the target project at the right locations:
  - `dist/copilot/.github/copilot-instructions.md` → `<project>/.github/copilot-instructions.md`
  - `dist/copilot/.github/prompts/` → `<project>/.github/prompts/`
  - `dist/copilot/.github/instructions/` → `<project>/.github/instructions/`
  - **Pre-commit enforcement layer (per D29) — both templates are copied so the user can choose at any time:**
    - `dist/copilot/.husky/pre-commit.template` → `<project>/.husky/pre-commit.template` (husky path)
    - `dist/copilot/.pre-commit-config.yaml.template` → `<project>/.pre-commit-config.yaml.template` (pre-commit framework path)
    - If the user selected an active installer during setup, also rename the chosen template to its active filename (`.husky/pre-commit` with exec bit, or `.pre-commit-config.yaml`).
  - Render `.copilot/pai-orbit-config.md`, `.copilot/team.md`, `.copilot/settings.json` from templates using interview answers
  - Scaffold `<project>/docs/` if absent
  - Write `<project>/CLAUDE.md` from template
- Update the Step 4 reporting block to list every Copilot-specific file written, and call out the husky template as an explicit opt-in for "real bash-guard enforcement at the git layer."
- Document the omitted pieces honestly: "No native hooks (Copilot has no hook system) — bash-guard intent is in copilot-instructions.md as advisory text plus optional .husky/pre-commit; lint-python/lint-ts run via the pre-commit hook (project linter config remains the source of truth, read by every editor with linter integration); arch-drift split between copilot-instructions.md and instructions/arch-drift.instructions.md. **Agents work partially via D30**: service-builder prompts emit with `mode: agent` frontmatter and run as agents on Pro/Business Copilot; on Free they degrade to regular prompts that still give correct guidance. Full agent-runtime parity with Claude Code is out of scope. No editor-specific files emitted (per D33) — VS Code users follow the lint-on-save recipe in the adoption page."

**Done when:**
- Running `/setup` in a fresh test project and selecting Copilot produces the full target layout (including `.husky/pre-commit.template` opt-in) populated from the user's answers. **No `.vscode/` files appear in the project** (verified by listing).
- **Regression gate (promoted from Risks):** re-running `/setup` for Claude Code in a scratch repo produces byte-identical output to the pre-upgrade adapter. Run before merging.
- **Regression gate:** re-running `/setup` for Cursor in a scratch repo produces byte-identical output to the pre-upgrade adapter. Run before merging.
- The Step 4 reporting block lists files written separately per target (Claude / Cursor / Copilot) so the dev can see which adapter ran.

### Phase 3b — Standalone install CLI (`pai-orbit init`)

For Copilot-only teams that do not have Claude Code or Cursor installed, build a small Node.js CLI distributed directly from the pai-orbit GitHub repo via `npx`. No npm publishing required.

**User-facing command:**

```
# Run latest from main
npx github:the-psi/pai-orbit init copilot

# Pin to a release tag (recommended for teams)
npx github:the-psi/pai-orbit#v1.4.0 init copilot

# Pin to a specific commit (fully reproducible)
npx github:the-psi/pai-orbit#a1b2c3d init copilot

# Non-interactive (CI / scripted)
npx github:the-psi/pai-orbit init copilot --board=gitlab --branch=trunk --yes
```

**Files added to the pai-orbit repo:**

```
pai-orbit/
├── package.json                              # NEW — root, declares the bin
└── plugins/pai-orbit/scripts/init/
    ├── cli.js                                # NEW — entry point (plain JS, no build step)
    ├── lib/
    │   ├── copilot.js                        # Copilot-target install logic
    │   ├── claude.js                         # (future) Claude-target install logic
    │   ├── cursor.js                         # (future) Cursor-target install logic
    │   ├── prompts.js                        # interactive Q&A flow
    │   └── render.js                         # template rendering
    └── README.md                             # contributor notes
```

**Root `package.json` shape:**

```json
{
  "name": "pai-orbit",
  "version": "1.4.0",
  "bin": {
    "pai-orbit": "plugins/pai-orbit/scripts/init/cli.js"
  },
  "dependencies": {
    "prompts": "^2.4.2"
  },
  "engines": {
    "node": ">=18"
  }
}
```

**What `init copilot` does internally:**

1. Validate cwd looks like a project (has `.git/` or is empty).
1a. **Detect first-run vs re-run vs migration (per D18, R9):**
   - Check for `.copilot/pai-orbit-config.md`.
     - **Present** → re-run mode. Log: "Existing pai-orbit install detected. Refreshing pai-orbit-owned files; preserving your config." Skip step 2 interview by default. Honour `--re-interview` to force.
     - **Absent** → check for the OLD layout (`.github/pai-orbit/pai-orbit-config.md` or `.github/pai-orbit/team.md`).
       - **Old layout present** → migration mode. Print the planned migration as a dry-run diff. Ask: "Migrate from `.github/pai-orbit/` to `.copilot/`? (y/N)". On `y`: back up `.github/pai-orbit/` to `.github/pai-orbit.bak/<timestamp>/`, move config + team files into `.copilot/`, **append `.github/pai-orbit.bak/` to the project's `.gitignore` (create the file if absent) so the backup never accidentally lands in a commit**, then continue as re-run mode. On `n`: abort with a message explaining manual migration.
       - **Old layout absent** → first-run mode. Continue to step 2.
2. Run interactive prompts via `prompts` (board type, branch model, deploy target, team list, docs home, monorepo question, MCP servers) — same questions Step 2 of `/setup` asks. Additionally ask:
   - **"Install the optional .husky/pre-commit hook for git-level bash-guard enforcement?"** (default: yes if the project has `.git/`, no otherwise).
   - **"Choose pre-commit installer: husky / pre-commit framework / both / neither"** (per D29) — default `husky` if husky is detected (`.husky/` exists or `package.json` has `husky` dep), `pre-commit` if `.pre-commit-config.yaml` exists, `husky` otherwise. Both write their respective templates; neither writes nothing.
3. Copy the bundled adapter output from `plugins/pai-orbit/dist/copilot/` into the cwd:
   - `dist/copilot/.github/copilot-instructions.md` → `<cwd>/.github/copilot-instructions.md`
   - `dist/copilot/.github/prompts/` → `<cwd>/.github/prompts/`
   - `dist/copilot/.github/instructions/` → `<cwd>/.github/instructions/`
   - **Pre-commit enforcement layer (per D29):**
     - Always copy `dist/copilot/.husky/pre-commit.template` → `<cwd>/.husky/pre-commit.template` (inert; user can opt in later).
     - Always copy `dist/copilot/.pre-commit-config.yaml.template` → `<cwd>/.pre-commit-config.yaml.template` (inert).
     - If user selected **husky** as installer: rename `.husky/pre-commit.template` → `.husky/pre-commit`, `chmod +x`, **then `git update-index --add --chmod=+x .husky/pre-commit`** so the exec bit is tracked in the repo and survives Windows file systems (per D21).
     - If user selected **pre-commit framework** as installer: rename `.pre-commit-config.yaml.template` → `.pre-commit-config.yaml`. Print a note telling the user to run `pre-commit install` to activate the git hook (the CLI does not run pip / pre-commit install itself — that would require Python in the user's environment and dependency installation).
     - If user selected **both**: do both renames above.
     - If user selected **neither**: leave both as `.template` files; user opts in later.
4. Render `.copilot/pai-orbit-config.md`, `.copilot/team.md`, and `.copilot/settings.json` from templates using the user's answers. **`.copilot/settings.json` contents (per D19):**
   ```json
   {
     "pai_orbit_version": "1.4.0",
     "target": "copilot",
     "installed_at": "2026-06-28T15:30:00Z",
     "husky_opted_in": true,
     "detected_languages": ["typescript", "python"],
     "precommit_installer": "husky"
   }
   ```
   Read by the CLI on subsequent re-runs and by `update copilot` to know what was previously installed (informs the diff report and the husky opt-in default).
5. Scaffold `<cwd>/docs/` (domain, features, decisions, plans, epics, wip) if it does not already exist.
6. Write `<cwd>/CLAUDE.md` from template (tool-agnostic, kept under that name).
7. Report what was written, including the husky opt-in state and how to enable it later, and what the user must commit + push.

**CLI surface (committed — no bikeshedding mid-implementation):**

```
pai-orbit init <target>          Set up pai-orbit in the current project
                                 <target>: copilot | claude | cursor (claude/cursor are stubs in v1)

pai-orbit update <target>        Refresh pai-orbit-owned files; preserves user config
                                 (Alias for `init <target>` re-run mode — same code path)

pai-orbit migrate <target>       Force migration from an OLD layout to the current layout
                                 (Per D25: `init` auto-detects and migrates when it sees `.github/pai-orbit/`.
                                  This command is the escape hatch when auto-detection misclassifies —
                                  e.g., partial old install, non-standard folder layout, or the user wants
                                  to dry-run the migration without scaffolding fresh files.)

pai-orbit --help                 Show command list and flags
pai-orbit --version              Show CLI version (matches package.json version)

Flags (apply to init / update where relevant):
  --yes                          Skip all interactive prompts; use defaults + --board/--branch/etc flags
  --board=<value>                gitlab | github | linear | jira | none
  --branch=<value>               github-flow | gitflow | trunk
  --re-interview                 Force a fresh interview on re-run (rewrites .copilot/* files)
  --re-init-claude-md            Force rewrite of CLAUDE.md
  --install-husky                Install the husky hook even if previously opted out
  --reinstall-husky              Overwrite an existing .husky/pre-commit
  --install-precommit-framework  Install .pre-commit-config.yaml even if previously opted out (per D29)
  --reinstall-precommit-framework  Overwrite an existing .pre-commit-config.yaml
  --ignore-existing              Force npx to re-fetch from GitHub (bypasses npx cache)
  --no-interactive               Alias for --yes; matches CI conventions
```

**Language & build decisions (taken — no re-debate):**

- **Plain JavaScript, no TypeScript build step.** The CLI is small enough that the ergonomic win of TS does not justify the build complexity for a github-direct install path. Source ships as the runnable file.
- **One small dependency: `prompts`.** Pure-Node `readline/promises` is too clunky for a setup interview. `prompts` is ~8 KB, well-maintained, and `npx` installs it transparently.
- **Target Node 18+.** That covers every PSI dev machine without question.
- **Default branch tracking.** Tell users to pin a tag (`#v1.4.x`) for team adoption; main branch is acceptable for early adopters.

**Caveats (document in install page):**

- Requires Node.js ≥ 18 on the user's machine.
- Requires `git` on the user's `PATH` (npx clones via git).
- Requires internet access to `github.com`. PSI firewalled environments may need allowlisting.
- npx caches GitHub installs — users iterating on a fix should pass `--ignore-existing` or use a version tag to force a clean fetch.

**Done when:**
- `npx github:the-psi/pai-orbit init copilot` runs end-to-end on a clean Windows machine and produces the full target layout described earlier.
- The CLI also accepts `--yes` plus flags for non-interactive runs (for CI).
- `init claude` and `init cursor` are stubs that print "not yet implemented — use `/setup` from inside Claude Code / Cursor" (proper implementations are out of scope for this iteration but should be sketched so the CLI surface is forward-compatible).
- The CLI implements first-run vs re-run detection per the "Lifecycle" section.
- `update copilot` is an alias for the same code path with re-run-specific status messages.
- The CLI supports the override flags from the lifecycle table: `--re-interview`, `--re-init-claude-md`, `--install-husky`, `--reinstall-husky`, `--ignore-existing`.

### Phase 4 — Local validation

**Files touched:** none (test scratch repo + this plan's notes)

Tasks are tagged by priority so that if Copilot Free's 50-message budget runs out mid-validation, the skipped ones are predictable. **Critical** = must pass to ship. **Important** = strongly preferred but adapter can ship with documented caveats. **Polish** = nice-to-have signal.

Tasks (each ≤ 5 Copilot Free messages):
1. **[Critical] Smoke test:** new test project, run `npx github:the-psi/pai-orbit init copilot`, answer the interactive prompts, reload VS Code, open Copilot Chat, type `/groom` → confirm the slash-command picker shows the pai-orbit prompts (both mode and skill prompts, distinguishable by `[mode]` / `[skill]` prefix per D20), and the Groom prompt loads.
1a. **[Important] Skill invocation test:** in the same Chat, type `/git` and `/analysis` — confirm both load as invokable prompts. Confirm `/setup` and `/suggest-skills` are absent (per D13 — dropped from the mode emitter). Confirm `/test` loads the test mode (no skill collision exists — the test skill was never authored; D22 obsolete).
1b. **[Important] Auto-attach test:** open a `.sql` file in the test project, ask Copilot a schema question — confirm the answer follows `/data-model` conventions (proves `instructions/data-model.instructions.md` activated by `applyTo:` glob).
1c. **[Polish] Hook-coverage test:** confirm Copilot's response to "force-push these changes" warns or refuses (advisory bash-guard); if husky was opted in, confirm `.husky/pre-commit` exists, is executable, and `git ls-files --stage .husky/pre-commit` shows mode `100755` (proves D21's git-tracked exec bit). If pre-commit framework was opted in instead, confirm `.pre-commit-config.yaml` exists and `pre-commit run --all-files` exits cleanly (per D29). **Confirm `.vscode/` is NOT present in the project** (D33 — pai-orbit emits no editor files).
1d. **[Polish — Pro+ only] Service-builder agent test:** invoke a service-builder prompt (e.g., `/fastapi-builder` or `/nextjs-builder`) and ask it to scaffold a hello-world endpoint. On Pro/Business: confirm Copilot reads `CLAUDE.md`, identifies the service, and proposes file edits in agent mode. On Free: confirm the prompt loads as regular text and gives correct manual scaffolding instructions (per D30 graceful-degradation expectation).
1e. **[Important] Mode-discipline anti-drift test:** invoke `/build` mode, then ask Copilot something off-scope ("what's a good architecture for this?"). Confirm Copilot **redirects** to `/design` per the anti-drift block (per D28) instead of just answering. Repeat with `/groom` → off-scope code request. Confirm the `[<MODE>]` prefix appears on Copilot's replies. **If the `[<MODE>]` prefix is missing on more than 1 in 3 replies, log it as a finding** — adapter still ships, but D28 may need iteration.
2. **[Critical] End-to-end mode workflow:** invoke `/groom` for a fictional feature. Confirm Copilot enters GROOM headspace and produces requirements-shaped output. Save to `docs/features/<feature>/requirements.md`.
3. **[Polish] End-to-end design workflow:** invoke `/design` against the requirements from step 2. Confirm Copilot enters DESIGN headspace and produces a design discussion + trade-offs.
4. **[Polish] Path-scoped skill check:** open a `.sql` file in the test project. Ask Copilot a schema-related question. Confirm `data-model.instructions.md` is being respected (Copilot reaches for `/data-model` conventions).
5. **[Polish] Output-contract check:** in `/groom` mode, ask "where do acceptance criteria get saved?" — confirm `docs/features/*/requirements.md`.
6. **[Important] Re-run preservation check:** edit `.copilot/team.md` (add a fake team member) and `.copilot/pai-orbit-config.md` (change the board type). Re-run `npx github:the-psi/pai-orbit init copilot`. Confirm both edits are preserved. Confirm `.github/prompts/groom.prompt.md` is refreshed (test by deleting one line from it first and seeing it restored).
7. **[Critical] No editor-litter check:** after install, confirm the project root does NOT contain `.vscode/`, `.idea/`, or any other editor-specific folder authored by pai-orbit. Per D33, the only pai-orbit-emitted folders are `.copilot/`, `.github/` (copilot-instructions.md, prompts/, instructions/), `.husky/` (only if user opted in), `docs/`, and the top-level `CLAUDE.md` file.
8. **[Critical] Context discovery check:** edit `.copilot/pai-orbit-config.md` to set the deploy target to a distinctive value (e.g., `Azure App Service - East US 2 - tenant: psi-test`). Open a fresh Copilot Chat thread. Ask: "What is our deploy target for this project?" Confirm Copilot returns the exact value from the config file — proves it actually reads `.copilot/pai-orbit-config.md` via the Context discovery directives, rather than guessing. Repeat the test by editing `docs/architecture/constraints.md` to add a fake constraint ("All services must publish heartbeat every 13 seconds") and asking Copilot to list the architectural constraints — confirm the fake constraint appears in the answer. **If this fails on Copilot Free**: per R8, also verify Copilot picks up the fall-back `instructions/context-discovery.instructions.md` — try the same probe again with that file present. If both channels fail, log it as a Free-tier limitation; adapter still ships with a documented caveat.
9. **[Important] Migration test:** in a separate scratch project, manually create `.github/pai-orbit/pai-orbit-config.md` and `.github/pai-orbit/team.md` with distinctive content (simulating an old install). Run `npx github:the-psi/pai-orbit init copilot`. Confirm the CLI detects the old layout, prints a migration plan, asks for confirmation, backs up the original to `.github/pai-orbit.bak/<timestamp>/`, and moves config + team into `.copilot/` with content intact. **Also confirm the project's `.gitignore` now contains a `.github/pai-orbit.bak/` entry** (per D23) — verify with `git check-ignore .github/pai-orbit.bak/`.

**Pass criteria:**
- **All 4 Critical tasks (1, 2, 7, 8) must pass.** Adapter does not ship without these. (Task 7 — no editor-litter — is the runtime confirmation of D33.)
- **At least 3 of 4 Important tasks (1a, 1b, 6, 9) must pass.**
- Polish failures (1c, 1d, 1e, 3, 4, 5) are documented but non-blocking.

Document results in `docs/wip/copilot-upgrade-validation-2026-06-28.md`, tagging each as Critical/Important/Polish so the report makes the trade-offs explicit.

### Phase 5 — Adoption page

**File created:** `docs/copilot-install-and-usage.md` (mirrors [docs/cursor-plugin-install-and-usage.md](../cursor-plugin-install-and-usage.md))

Sections:
- **Prerequisites** — VS Code, Copilot Chat extension, Copilot licence (Free works for evaluation; Business required for client code). Node.js ≥ 18 + git on PATH (for the install CLI).
- **Install (team lead, first time)** — one command, no clone required: `npx github:the-psi/pai-orbit init copilot` inside the project root. Document the version-pinning syntax (`#v1.4.0`) and the non-interactive flags. Note that if the team also uses Claude Code or Cursor, `/setup` inside those tools is an equivalent path.
- **Joining a team that already has pai-orbit installed (every other dev)** — when pai-orbit's files are already committed to the repo, new team members do NOT run the npx command. They just:
  1. `git pull` to get the latest including `.github/copilot-instructions.md`, `.github/prompts/`, `.github/instructions/`, `.copilot/`, `CLAUDE.md`.
  2. Open the project in VS Code.
  3. Reload the window (`Ctrl+Shift+P` → "Developer: Reload Window") so Copilot Chat picks up the instructions and prompts.
  4. Smoke-test: open Copilot Chat, type `/groom` — confirm the slash picker shows pai-orbit's prompts.

  Re-running the npx install is unnecessary and would only matter if the team lead changes the pai-orbit version pin and wants every dev to refresh — in which case all devs run `npx github:the-psi/pai-orbit#<new-tag> init copilot` once to refresh the pai-orbit-owned files (their `.copilot/` config is preserved).

- **Path conventions** — `.copilot/` for pai-orbit metadata, `.github/` for Copilot's required paths, why `.github/` is not about repo hosting. **One-line callout (per D26): `CLAUDE.md` at the repo root is tool-agnostic project documentation, named for historical reasons. It is read by every assistant pai-orbit supports (Claude Code, Cursor, Copilot). Copilot-only teams should keep the filename as-is — renaming it would break references in pai-orbit's instructions and adoption docs.**
- **AGENTS.md disambiguation** — pai-orbit does NOT emit `AGENTS.md` for Copilot. `AGENTS.md` is the file format read by **OpenAI Codex CLI**, not GitHub Copilot. Copilot Chat in VS Code reads `.github/copilot-instructions.md` and the `prompts/`/`instructions/` folders — nothing else. If you see references to `AGENTS.md` in pai-orbit's source repo, those belong to the Codex adapter, not the Copilot adapter. Safe to ignore for Copilot-only teams.
- **Multi-assistant teams (Claude Code + Cursor + Copilot in the same repo)** — pai-orbit supports it. A single project can have `.claude/`, `.cursor/`, AND `.copilot/` simultaneously alongside `.github/copilot-instructions.md`. Each assistant reads its own folder. There is no conflict — they are independent installations sharing the same tool-agnostic documentation tree (`docs/`, `CLAUDE.md`). To set up multiple assistants, run `/setup` from inside Claude Code or Cursor and select multiple targets in Step 2; the Copilot half can also be done via the standalone npx CLI. Re-running one assistant's install does not touch the others.

- **Daily workflow** — type `/groom`, `/design`, `/build` in Copilot Chat. Same documentation outputs as Claude/Cursor.
- **Skill rendering split** — explain that the same skill (e.g., `/git`) can be both invokable from Chat (prompt file) AND auto-attached to files (instructions file). Reference the skill mapping table.
- **Hook coverage** — the matrix from the "Hook coverage in Copilot" section: where bash-guard, lint hooks, and arch-drift intent each land. Honest about advisory vs enforced.
- **Linting across editors (sub-section under Hook coverage)** — pai-orbit does NOT author lint rules and does NOT emit editor-specific config files (per D33). Your project's existing linter config (`pyproject.toml`, `.eslintrc.json`, `.editorconfig`) is the source of truth, read natively by every modern editor with linter integration. Enforcement happens at **commit time** via the pre-commit hook (husky or pre-commit framework, per D29) — editor-agnostic, runs regardless of who or what produced the change. **VS Code users who want save-time feedback** add four lines to their own VS Code settings (User or Workspace — their choice; pai-orbit does not write either):

  ```json
  {
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.fixAll.ruff": "explicit",
      "source.fixAll.eslint": "explicit"
    }
  }
  ```

  Same philosophy as pai-orbit's Claude Code and Cursor adapters — pai-orbit never touches editor configuration. JetBrains and Visual Studio users get equivalent save-time behaviour from their editor's own settings UI (one-time, documented in their tool's docs, not pai-orbit's responsibility).
- **Updating pai-orbit later** — how to re-run with `npx github:the-psi/pai-orbit init copilot` (or `update copilot`), what gets refreshed, what gets preserved, version pinning, the `--ignore-existing` and `--re-interview` flags.
- **Uninstalling pai-orbit from a project** — if a team decides to remove pai-orbit from a project, delete these paths from the repo and commit:
  - `.copilot/` (entire folder)
  - `.github/copilot-instructions.md`
  - `.github/prompts/` (only the pai-orbit-emitted `.prompt.md` files — leave any user-authored prompts alone)
  - `.github/instructions/` (only the pai-orbit-emitted `.instructions.md` files)
  - `.husky/pre-commit` (if it was the pai-orbit-emitted version) and `.husky/pre-commit.template`
  - `CLAUDE.md` is **NOT** auto-removed — it is your project's tool-agnostic documentation. Decide separately whether to keep it.
  - `docs/` is **NOT** auto-removed — your team's documentation lives there. Decide separately.

  Future work: a `pai-orbit uninstall copilot` subcommand may be added later; for now uninstall is a manual `git rm` operation.

- **Known gaps vs Claude Code** — no native hooks (delivered via instructions text + pre-commit per D29); agents work only on Pro/Business via `mode: agent` (per D30) — on Copilot Free service-builder prompts degrade to regular prompts; mode discipline is text-based not runtime-enforced (anti-drift block per D28 tightens but does not enforce). Methodology benefit: ~85% on Free, ~90% on Pro/Business.
- **Troubleshooting** — what to do if prompts don't show up (settings flag, restart VS Code, file location). What to do if `npx` fails (Node version, git on PATH, firewall). What to do if a re-run unexpectedly overwrote something (recovery via git). What to do if Copilot ignores the Context discovery section and gives generic answers (restart Chat, verify `.copilot/pai-orbit-config.md` is present, check that `.github/copilot-instructions.md` actually contains the Context discovery block). **Failed-install recovery (per D27):** if `npx` crashes mid-write (Ctrl-C, network blip, OOM) and the project has a partial install, recover with: `git status` to see what was written, then `git clean -fd .copilot/ .github/copilot-instructions.md .github/prompts/ .github/instructions/ .husky/` for untracked files (and `git checkout -- <file>` for tracked files). Then re-run `npx github:the-psi/pai-orbit init copilot`. No special rollback subcommand is provided in v1 — git is the rollback tool.

### Phase 6 — Epic and tracking updates

**Files touched:** [docs/epics/multi-tool-compat/EPIC.md](../epics/multi-tool-compat/EPIC.md)

Tasks:
- Add a feature row: "Copilot adapter — prompt files + instructions files" → Done.
- Update or add: "setup-multi-tool — Copilot path" → Done (Phase 3 of this plan covers it).
- Update Open Questions if any were resolved by this upgrade.

---

## Lifecycle — re-run and update

After the first install, two operational questions need answers: can users re-run setup, and how do they pull pai-orbit updates? Both share the same delivery channel — the `npx` CLI — but with different semantics.

### Re-running setup on an existing install

The same command works the second time:

```powershell
npx github:the-psi/pai-orbit init copilot
```

Optionally, a clearer subcommand (added in this iteration):

```powershell
npx github:the-psi/pai-orbit update copilot     # explicit re-run / refresh
```

`init` and `update` share the same code path; the difference is just user intent and the verbiage in the CLI's status messages.

#### Detection

On launch, the CLI checks for `.copilot/pai-orbit-config.md`:
- **Not found** → first-run mode. Run the full interview. Scaffold everything.
- **Found** → re-run mode. Print: "Existing pai-orbit install detected. Refreshing pai-orbit-owned files; preserving your config." Skip the interview by default. Honour `--re-interview` to force a fresh Q&A and rewrite `.copilot/*`.

#### File ownership rules (used by both `init` re-run and `update`)

| File category | First run | Re-run behaviour |
|---------------|-----------|------------------|
| `.github/copilot-instructions.md` | Write | **Overwrite** — pai-orbit owns this |
| `.github/prompts/*.prompt.md` | Write | **Overwrite** — pai-orbit owns these |
| `.github/instructions/*.instructions.md` | Write | **Overwrite** — pai-orbit owns these |
| `.copilot/pai-orbit-config.md` | Create from template + interview answers | **Preserve by default**; ask before overwriting. `--re-interview` forces rewrite. |
| `.copilot/team.md` | Create from interview answers | **Preserve by default**; team rosters drift. |
| `.copilot/settings.json` | Write | **Preserve by default** |
| `CLAUDE.md` | Create from template | **Preserve** — once written, this is team documentation. `--re-init-claude-md` for a clean reset. |
| `docs/` scaffold | Create empty folders | **Skip if exists** — never touch user docs |
| `.husky/pre-commit` (active) | Optional install | **Preserve** — leave alone unless `--reinstall-husky` |
| `.husky/pre-commit.template` (inert) | Write | **Overwrite** — latest version wins |
| `.pre-commit-config.yaml` (active) | Optional install (per D29 — if user picks pre-commit framework) | **Preserve** — leave alone unless `--reinstall-precommit-framework` |
| `.pre-commit-config.yaml.template` (inert) | Write | **Overwrite** — latest version wins |

#### Edge cases the CLI must handle

- **Major version bump where files are renamed/removed.** Re-run should report the diff explicitly: "Removed: `data.prompt.md` (replaced by `data-engineering.prompt.md`). Existing references in your docs may need updating." Not silent deletion.
- **`.copilot/` exists but `.github/copilot-instructions.md` does not.** Half-installed state. Treat as re-run mode but log a warning: "Partial install detected — refreshing all pai-orbit-owned files."
- **User opted out of husky on first install and wants it now.** They re-run with `--install-husky` and the CLI prompts husky-only without re-interviewing the full config.

### Updating pai-orbit in a project

There is no push mechanism. Copilot doesn't auto-fetch. Updates only happen when a user explicitly pulls. Three mechanisms ranked by recommended use:

#### A. Re-run the npx command — the default path (in scope for this upgrade)

```powershell
npx github:the-psi/pai-orbit init copilot       # or `update copilot`
```

`npx` fetches the latest of whatever ref the user invokes (default branch if no `#ref` suffix, otherwise the pinned ref). It clones, runs the CLI in re-run mode (per the rules above), refreshes pai-orbit-owned files, leaves user files alone.

**`npx` GitHub-install cache caveat:** if the user is tracking `main` and a fix was just pushed, the local npx cache may return the previous content. Two work-arounds, documented in the adoption page:
- `--ignore-existing` flag forces a fresh fetch.
- Bump or change the ref (`#v1.4.1`, `#some-commit-sha`) — a different ref means npx always fetches fresh.

#### B. Version pinning — the team-discipline path (recommended for client projects)

Teams that don't want surprise updates pin a tag in their internal install instructions:

```powershell
# Team wiki says "use this command":
npx github:the-psi/pai-orbit#v1.4.0 init copilot
```

Updates become **deliberate**: pai-orbit releases `v1.5.0`, the team's tech lead reviews the changelog, the wiki gets a tag bump, devs re-run and get the upgrade. This is the recommended posture for PSI client projects — predictable, auditable, no surprise behavioural changes mid-sprint.

#### C. Scheduled GitHub Action — the hands-off path (future scope, NOT in this upgrade)

For teams that want pai-orbit updates flowing automatically with a human-review gate, a future feature could ship an optional `.github/workflows/pai-orbit-update.yml` template:

```yaml
# Runs weekly on Mondays
# Job: run `npx github:the-psi/pai-orbit update copilot --no-interactive`
#      if any file changed, open a PR titled "chore(pai-orbit): refresh to <latest-version>"
```

The team reviews the PR, merges if happy. Best of both worlds: automation + human review.

**Explicitly out of scope for this iteration.** Note it in the design doc as a follow-up feature so the door stays open.

### What the team's adoption page should say

The `docs/copilot-install-and-usage.md` adoption page gets a dedicated **"Updating pai-orbit later"** section with:

> **To update pai-orbit in this project:**
>
> Re-run the install command from the project root:
> ```
> npx github:the-psi/pai-orbit init copilot
> ```
>
> The CLI detects your existing install, refreshes pai-orbit's files (prompts, instructions, rule book) to the latest version, and **preserves your team's customisations** (`.copilot/pai-orbit-config.md`, `.copilot/team.md`, `CLAUDE.md`).
>
> If you pinned a version (e.g., `#v1.4.0`), bump the tag in your install command before re-running.
>
> If you tracked `main` and the result feels stale, add `--ignore-existing`.

---

## Decisions taken (record now, don't re-debate)

| # | Decision | Reasoning |
|---|----------|-----------|
| D1 | Adopt ECC's prompt-file frontmatter shape (`agent: agent`, `description: <one-liner>`) | Proven to work in Copilot Chat. No need to invent our own schema. |
| D2 | Slim down `copilot-instructions.md` instead of dumping all modes inline | ECC pattern. Keeps the rule book under 200 lines and lets the prompts carry the mode-specific content. |
| D3 | `.copilot/` folder for pai-orbit metadata (not `.github/pai-orbit/`) | Matches the `.claude/` and `.cursor/` user mental model. The trade-off (two folders for Copilot users) is acceptable; the symmetry is more valuable. |
| D4 | Keep this upgrade an adapter-only change — no canonical front-matter migration | Phase 1 of the broader multi-tool-compat epic is deferred. The adapter can read the existing markdown files via the same `head` / `awk` / `grep` patterns the current build.sh uses. |
| D5 | Document the lost hooks and agents honestly, do not try to fake them | Users prefer a clear gap list over hidden surprises. The 80%-of-methodology message holds. |
| D6 | Validate on Copilot Free this session | Sufficient to confirm the prompt picker, slash invocation, and headspace behaviour. Business-tier nuances (org policies, content exclusions) are out of scope for this upgrade. |
| D7 | Standalone install path uses `npx github:the-psi/pai-orbit` — no npm publishing | Direct-from-GitHub install removes the need for an npm org, publish workflow, and version-bumping discipline at this stage. We can add npm publish later as an additional channel without breaking the github path. **See D34 for why other plugin-adjacent Copilot mechanisms (Copilot Extensions, VS Code Extensions) were rejected as alternative delivery channels.** |
| D8 | Install CLI is plain JavaScript with one dependency (`prompts`) | Zero build step. Source is the runnable artefact. Cross-platform via Node 18+. Avoids the maintenance burden of parallel PowerShell + Bash scripts. |
| D9 | `init claude` and `init cursor` are stubs in v1 — only `init copilot` is wired | Today's pain is the Copilot-only team. Claude and Cursor already have working `/setup` paths inside their host tools. Wire the other targets when there is concrete demand. |
| D10 | Skills render into both `prompts/` (invokable) AND `instructions/` (auto-attached) where both make sense | The two folders serve different triggers. Forcing a skill into only one would either lose invokability (`/git` typed in Chat) or lose passive activation (rules applied when opening matching files). Emitting twice has minimal cost; the gain is full coverage. |
| D11 | Hook intent is split across multiple layers, not one | Copilot has no event triggers, so a single "hooks file" is impossible. Each hook's intent goes where enforcement actually exists: bash-guard → instructions text + optional husky; lint hooks → project linter config + pre-commit hook (D29); arch-drift → instructions text + path-scoped instructions file. This is the honest mapping. |
| D12 | `.husky/pre-commit` is opt-in, written as `.template` by default | Many projects don't use husky and don't want a new git-hook tool dropped into their repo. The `.template` suffix makes it inert; users who want enforcement rename and `chmod +x`. The interactive prompt asks once, defaulting to "yes" only when `.git/` exists. |
| D13 | **FULLY SUPERSEDED 2026-07-04.** Originally dropped both `/setup` and `/suggest-skills` from the Copilot output. **Superseded in two steps:** (a) `/setup` un-dropped as agent-mode prompt (`mode: agent` + `tools: [codebase, editFiles, runCommands, search]`) so Copilot Business teams can invoke `/setup` from Chat for re-configuration — Free degrades to advisory text pointing at the terminal CLI; (b) `/suggest-skills` un-dropped as agent-mode prompt with a Copilot-adapted preamble that redirects skill scaffolding from `.claude/skills/<name>/SKILL.md` (Claude target) to `.github/prompts/<name>.prompt.md` (Copilot's user-prompt surface) and skips the Claude-Code-built-in step (no equivalent). Nothing is now skipped for Copilot. The CLI has also been extended to full parity with `/setup` Step 2 (all 11 questions, plus Step 2b live board column discovery via `glab api` / `gh project field-list` / `linear team list`) so terminal-only teams get the same interview depth. **Result:** 14 mode prompts (was 12) → total **27 prompts** in Copilot's picker. | User feedback (2026-07-04) — parity with Claude Code was the stronger design goal than the "chicken-and-egg" and "no equivalent surface" arguments that motivated the original drops. `/setup` in Chat gives Business teams a familiar reconfiguration entry point (CLI still handles first-time install). `/suggest-skills` is portable via a preamble — its actual analysis (git log, docs review, existing-skills scan) works fine on any adapter; only the scaffold target differs. |
| D14 | Re-run preserves user-owned files by default; pai-orbit-owned files are overwritten | The "Lifecycle" section above defines the file ownership table. Defaulting to preserve protects team customisations. Overwriting pai-orbit-owned files is what lets updates actually land. Flags (`--re-interview`, `--re-init-claude-md`, `--install-husky`, `--reinstall-husky`) cover the override cases. |
| D15 | Updates are pull-based only; no auto-update mechanism in v1 | Copilot has no auto-fetch. The npx re-run command is the update mechanism. Version pinning gives teams control over when updates happen. Scheduled GitHub Action is documented as future scope, not built in this iteration. |
| D16 | Ship both `init` and `update` subcommands with shared implementation | Same code path, different verbiage. `init` reads as "set up from scratch" and `update` reads as "refresh existing." Detection logic is identical; the only difference is the CLI's status messages. Cost is one extra line in the CLI's command router. |
| D17 | Make context discovery explicit in `copilot-instructions.md`, not implicit | In Claude Code, the `.claude/` directory is auto-loaded — context discovery is mechanical. Copilot has no such mechanism: if we don't tell it to read `.copilot/pai-orbit-config.md` and the docs tree, it won't. A "Context discovery" section in the always-loaded instructions file is the cheapest way to bridge this gap. Without it, prompts work but project-specific conventions are ignored — defeating the point. |
| D18 | On detecting the OLD `.github/pai-orbit/` layout, the CLI migrates it to `.copilot/` and prints a migration report. **v1 scope: path-only migration (file moves). Schema migrations between major pai-orbit versions are future scope.** | The current Copilot adapter (pre-upgrade) writes its config into `.github/pai-orbit/`. Any project that already ran the old adapter has files there. Leaving both folders is confusing; silently deleting risks user data loss. The CLI moves the old folder's contents into `.copilot/`, backs up the original to `.github/pai-orbit.bak/`, and prints exactly what was moved. The v1 path-only scope is safe because the file contents (config schema, team file shape) are identical between old and new layouts — only the directory changes. If a future pai-orbit release alters the schema of `pai-orbit-config.md`, that requires a separate schema-migration story, not D18. |
| D19 | `.copilot/settings.json` contains: pai-orbit version, target (`copilot`), install timestamp, husky opt-in state, language detection results, and **pre-commit installer choice** (`husky` / `pre-commit` / `both` / `neither` per D29) | Currently the file is emitted "for symmetry with `.claude/` and `.cursor/`" but the plan doesn't say what's in it. Defining the contents makes it useful: the CLI reads it on re-run to know what was previously installed (so diffs and migration reports are accurate), and `update copilot` reads it to know whether the husky hook is active. Without this, re-run becomes guesswork. |
| D20 | Prompt picker disambiguation: mode prompts are prefixed `[mode]`, skill prompts `[skill]`, **and service-builder agent prompts `[agent]`** | 12 modes + 6 skills + 7 service-builder prompts (per D30) = 25 entries in Copilot's slash-command picker, all visually identical without help. Three-way prefixing in the `description:` frontmatter is a 20-character change per file that makes the picker readable at a glance: users immediately see whether `/groom` is a mode, `/git` is a skill, and `/fastapi-builder` is an agent prompt. No folder restructure, no slug changes — only description text. |
| D21 | Husky template install is followed by `git update-index --add --chmod=+x .husky/pre-commit` so the exec bit is tracked in git | Windows file systems do not honour `chmod +x`. Git's index can still store the exec bit per-file, so a Windows-installed hook will run correctly on Mac/Linux contributors' machines after a pull. The CLI runs the `git update-index` call after writing the file. Documented in the adoption page for users who later need to verify or fix the exec bit by hand. |
| D22 | **OBSOLETE** — `/test` mode owns the `/test` slug; no collision exists | No collision exists — only the `/test` mode is implemented, no test skill exists. Resolved on filesystem audit 2026-06-28. No emitter rename, no `test-impl.prompt.md`, no validation task tied to a non-existent skill. |
| D23 | `.github/pai-orbit.bak/<timestamp>/` is **not** auto-cleaned — left for the user to delete. **The CLI also appends `.github/pai-orbit.bak/` to the project's `.gitignore` so the backup cannot accidentally be committed** | The migration report explicitly tells the user where the backup lives and that they can `rm -rf` it once they've confirmed the new install works. Auto-cleanup risks losing the recovery option silently; leaving it is one stale folder until the user notices, which is the safer trade-off. The `.gitignore` append closes the obvious foot-gun where `git add .` would otherwise pull the backup into history — defeating the whole point of a "clean" migration. (Promotes the dangling open question into a committed decision.) |
| D24 | `build.sh` calls `scripts/verify-dist.sh` as its final step — local and CI runs produce the same pass/fail signal | Otherwise contributors who run `bash plugins/pai-orbit/build.sh` locally see green while the CI freshness gate (`dist-freshness.yml`) fails on PR. Same script, same exit code, both layers. The `dist-freshness.yml` workflow runs `bash build.sh` (not just `verify-dist.sh`) so the integration is automatic. |
| D25 | `pai-orbit migrate <target>` is a **separate subcommand** that forces migration even if auto-detection didn't trigger | `init` runs migration automatically when it detects the old `.github/pai-orbit/` layout (per D18). But if auto-detection misclassifies (e.g., user partially-deleted the old folder, or has a non-standard layout), `migrate` lets them force the path. Keeps `init` predictable and gives users an escape hatch. Cost: one extra branch in the CLI router. |
| D26 | `CLAUDE.md` keeps its name even on Copilot-only projects — it is tool-agnostic project documentation, named historically | The file's content describes the project itself (stack, services, key files, data model, auth) — none of which is Claude-specific. Renaming it per-tool would create churn and break references in every adoption page across pai-orbit's adapters. The adoption page's "Path conventions" section calls this out explicitly: "`CLAUDE.md` is tool-agnostic project docs, named for historical reasons. It is read by every assistant pai-orbit supports." |
| D27 | Failed-install recovery is "git clean and retry," not transactional staged-write | If `npx` crashes mid-write (Ctrl-C, network blip, OOM), the project may have a partial install. Documented recovery: `git status` to see what was written; `git clean -fd .copilot/ .github/copilot-instructions.md .github/prompts/ .github/instructions/ .husky/` (or `git checkout -- <file>` for tracked files) to roll back; then re-run `npx ... init copilot`. Staged-write into `.copilot.tmp/` then atomic rename is more robust but adds complexity for a low-frequency failure mode; defer to a future iteration if real users hit it. |
| D28 | Every mode prompt opens with an explicit anti-drift block | "You are now in <MODE>" alone is weaker than "You are now in <MODE>. Do NOT do X, Y, Z until the user switches. Redirect off-scope requests. Begin every reply with `[<MODE>]` so drift is visible." Mode discipline goes from "Copilot tries" to "Copilot self-polices." A 5-line addition per mode prompt; no model-tier dependency; lifts methodology benefit from ~80% to ~85% on Free. |
| D29 | Ship both husky AND pre-commit framework templates; CLI asks the user which to install | Husky is JS-ecosystem-flavoured and assumes a `package.json`. Many PSI repos (.NET, Python, mixed) do not have one. The `pre-commit` framework (Python, language-agnostic) covers those teams. Emitting both templates costs nothing extra; the CLI's installer question picks the right one. Removes a real adoption blocker. |
| D30 | Emit service-builder prompts with `mode: agent` frontmatter, accept graceful degradation on Free | One prompt file per template in `core/templates/agents/` — 7 total: Django, Express, FastAPI, generic-service, infra, Next.js, React-Vite (filesystem audit 2026-06-28 — earlier plan said 6; `infra-builder` is included). On Pro/Business Copilot, these run as multi-step agents that read `CLAUDE.md`, detect the service, and scaffold real files. On Free, they load as regular prompts — still useful, just not agentic. The cost is small (7 files in the build script); the upside is partial agent parity with Claude Code's service-builder agents. Validation of agent behaviour requires Pro+, documented in Phase 4. |
| D31 | pai-orbit does NOT author or modify project linter rules | Consistent with the Claude Code and Cursor adapters (whose lint hooks invoke project linters and never write project linter configs) and with ECC's stated philosophy: *"Language ecosystem tools (ESLint, Prettier, pytest, golangci-lint) remain the source of truth; ECC wraps them with agent guidance."* Authoring lint rules on a project's behalf would be an overstep — lint preferences are team-specific. The project's existing `pyproject.toml` / `.eslintrc.json` / `.editorconfig` remain the source of truth. |
| D32 | _Reserved (was "ask which IDE during setup" — rejected; inconsistent with Claude/Cursor setup which asks no editor questions)_ | Editor choice is per-dev, not per-project, and the pai-orbit config is per-project. Asking the question added complexity for a small payoff. Resolved by D33 instead (don't emit editor files at all). |
| D33 | The CLI emits NO editor-specific files (`.vscode/`, `.idea/`, etc.) | Three reasons: (1) Editor configuration is owned by the team/individual dev, not by pai-orbit. (2) Pai-orbit's Claude Code and Cursor adapters never touch editor settings — Copilot should follow the same rule for consistency. (3) Lint enforcement is delivered by the pre-commit hook (D29) and the project's own linter config — both editor-agnostic. VS Code users who want save-time lint feedback follow a 4-line copy-paste recipe in the adoption page. JetBrains / Visual Studio users get lint at commit via the same pre-commit hook plus their editor's native integration with the project linter config. **One sentence: pai-orbit emits active files only for paths it owns; editor settings are not pai-orbit-owned.** |
| D34 | Copilot Extensions, Copilot Skillsets, and VS Code Extensions were considered as delivery channels — and rejected | Copilot is not "plugin-less" — three plugin-adjacent mechanisms exist. All three are the wrong shape for what pai-orbit does (scaffold methodology files into a project repo). **Copilot Extensions** (GA since 2024) are GitHub Apps with hosted backends invoked via `@mention` in Chat — they intercept chat queries, they cannot write files into a repo. **Copilot Skillsets** are declarative HTTP endpoints with the same backend-service constraint. **A VS Code Extension** could technically scaffold files via its activation hook, but adds marketplace listing, code signing, a separate publish pipeline, version-bump discipline per release, and locks the install path to VS Code users (no JetBrains / Visual Studio / Neovim Copilot coverage). The `npx github:the-psi/pai-orbit` channel wins on every relevant axis except auto-update — and pull-based updates are an explicit choice (D15) so teams control when changes land. Honest restatement: Copilot has no plugin system that ships files into a project the way Claude Code's plugin marketplace or Cursor's plugin system do; the three plugin-adjacent mechanisms it does have are server-backed chat extensions, not file scaffolders. |

---

## Open questions to resolve during the work

- [x] **RESOLVED (D10):** Skills go into both `prompts/` and `instructions/` — not mutually exclusive. The skill mapping table in "Skill rendering" is the authoritative reference.
- [x] **RESOLVED:** Prompt files retain the "Switch out when" block — switch-out guidance is part of the headspace.
- [x] **RESOLVED:** No `.vscode/settings.json` is emitted. Whether Copilot's prompt/instruction files need a USER-LEVEL flag (`chat.promptFiles`, `chat.instructionsFilesLocations`) is documented in the adoption page as a one-time VS Code setup step the user does in their own settings, not the project's.
- [ ] Should `.husky/pre-commit.template` assume husky is installed, or should it ship as a plain `.git/hooks/pre-commit.template` that works without husky? Decide during Phase 2 based on what's simpler for non-husky teams.
- [x] **RESOLVED:** Language detection is still needed (it informs the `.copilot/settings.json` `detected_languages` field per D19, and decides which pre-commit hook entries to enable). The previously-tied-in `.vscode/settings.json` no longer applies — that file is not emitted (D33).
- [ ] What is the broadest `applyTo:` glob Copilot accepts on `.github/instructions/*.instructions.md`? `**/*` is the assumption, but if Copilot rejects it as too broad we need a fall-back — e.g., split into per-extension globs. Test during Phase 1 design.
- [x] **RESOLVED (D23):** `.github/pai-orbit.bak/<timestamp>/` is not auto-cleaned. Left for the user to delete; migration report tells them where it is and how to remove it.

---

## Risks and fall-backs

| Risk | Likelihood | Fall-back |
|------|-----------|-----------|
| Copilot Free's 50-message limit runs out mid-validation | High | Stop at the first 5 Phase 4 steps. The pass/fail signal is binary; we don't need many retries. |
| Copilot does not honour `.github/instructions/*.instructions.md` reliably on Free tier | Medium | Drop instruction files from the adapter for this iteration. Keep prompts only. Document instructions files as Phase 7 follow-up. |
| Prompt-file invocation works but Copilot's model is too weak to hold mode discipline on Free tier | Medium | Note the gap in the adoption page. The structural work (prompts + instructions) is still correct; the discipline tightness is a tier issue, not an adapter issue. |
| `/setup` modification breaks the existing Claude / Cursor paths | Medium | Add a regression check before considering Phase 3 done: re-run `/setup` for Claude in a scratch repo and confirm the `.claude/` output is byte-identical to before the change. |
| `npx github:` cache returns stale CLI after a fix is pushed | Medium | Document `--ignore-existing` and version-tag pinning in the install page. For active development, the contributor runs the CLI from a local clone instead of via npx. |
| PSI firewall blocks `git clone` from github.com via npx | Low–Medium | Document the manual fall-back: `git clone https://github.com/the-psi/pai-orbit` then `node plugins/pai-orbit/scripts/init/cli.js init copilot` inside the target project. Same outcome, two extra commands. |
| User's machine has Node < 18 | Low | CLI's `engines` field warns; install page lists Node 18+ as a prerequisite up front. |
| **Context discovery section ignored by Copilot Free** (D17 is load-bearing — if Copilot Free's model doesn't honour `## Context discovery` instructions reliably, the whole "guide Copilot for everything" promise weakens) | **Medium** | Emit a duplicate `.github/instructions/context-discovery.instructions.md` with `applyTo: "**/*"` that repeats the directives. Two delivery channels for the same content — at least one should land. Validate during Phase 4 task 8; if both fail on Free, document the gap and recommend Business for production use. |
| **Old-layout migration corrupts user's customised `.github/pai-orbit/pai-orbit-config.md`** (D18 moves files automatically — a buggy migration could lose edits) | **Medium** | CLI does dry-run by default on detected old layout, prints diff, and asks "migrate? (y/N)". Backs up the entire old folder to `.github/pai-orbit.bak/<timestamp>/` before any move. User can recover by hand even if migration goes wrong. |
| **dist/copilot/ goes stale** because a contributor edits `core/` without running `bash plugins/pai-orbit/build.sh` — npx ships out-of-date prompts to every user until someone notices | **Medium-High** | CI freshness gate (Phase 2 Done-when): GitHub Action runs `build.sh` on every PR and fails if `git diff --exit-code dist/` is non-empty. Contributors are forced to commit fresh dist alongside core changes. |
| **`/test` rename breaks user muscle memory** — **OBSOLETE** (D22 obsolete; no test skill exists, no rename to perform) | — | — |
| **Service-builder agent prompts don't run as agents on Copilot Free** (D30 emits `mode: agent`, but Free tier may not honour it — they degrade to regular prompts) | Low | Acceptable. Documented in adoption page as "agent behaviour requires Pro/Business; on Free these prompts still load as text and provide the same guidance, just without autonomous file-edit actions." Validation in Phase 4 (task 1d) flags the gap when on Free; doesn't fail the build. |
| **Anti-drift `[<MODE>]` prefix becomes verbose noise** if users find it annoying | Low | D28 is opt-in implicitly — the prefix is in the prompt body, easy to remove in a future iteration. If user testing flags it as more annoying than useful, swap for a less intrusive convention (e.g., a closing-line "still in <MODE>" check). Phase 4 task 2 watches for this signal. |

---

## Definition of done

- [ ] [plugins/pai-orbit/adapters/copilot/build.sh](../../plugins/pai-orbit/adapters/copilot/build.sh) emits the full target layout: slim `copilot-instructions.md`, 12 mode prompts (with `[mode]` description prefix per D20 — all 14 modes in `core/modes/` except `/setup` and `/suggest-skills` per D13), 6 skill prompts (with `[skill]` description prefix per D20), **7 service-builder agent prompts (with `[agent]` description prefix per D20 and `mode: agent` frontmatter per D30 — django, express, fastapi, generic-service, infra, nextjs, react-vite)**, 4 instructions files (git, data-model, arch-drift, **context-discovery fall-back**), `.husky/pre-commit.template`, `.pre-commit-config.yaml.template`. **No `.vscode/` or other editor-specific files emitted (per D33).**
- [ ] `scripts/verify-dist.sh` exists and exits 0 against a freshly built `dist/copilot/` (validates frontmatter parses on every prompt/instructions file).
- [ ] `.github/workflows/dist-freshness.yml` exists and fails any PR where `dist/` is out of sync with `core/`.
- [ ] **CLI surface from Phase 3b is implemented:** `init`, `update`, `migrate` subcommands + `--help` + `--version` + all listed flags.
- [ ] **Migration path works:** running `init copilot` against a project with `.github/pai-orbit/` (old layout) detects, prompts for confirmation, backs up to `.github/pai-orbit.bak/<timestamp>/`, and moves content into `.copilot/` (verified by Phase 4 task 9).
- [ ] **`.copilot/settings.json` contents follow D19 schema** (version, target, install timestamp, husky opt-in state, detected languages, pre-commit installer choice). No VS Code key tracking — that schema field was removed when D33 dropped editor-file emission.
- [ ] **Husky exec bit is git-tracked** (D21): if husky was opted in, `git ls-files --stage .husky/pre-commit` shows mode `100755`.
- [ ] **Every mode prompt opens with the anti-drift block (D28)** — automated check via `verify-dist.sh` that the first 10 lines of each mode `.prompt.md` contain the "Do NOT" and `[<MODE>]` markers.
- [ ] **`.pre-commit-config.yaml.template` exists in `dist/copilot/`** (D29) and contains the same bash-guard rules as the husky template.
- [ ] **Service-builder agent prompts exist** (D30) — one per template in `core/templates/agents/`, all with `mode: agent` frontmatter, validated by `verify-dist.sh`.
- [ ] Phase 4 task 1e (anti-drift behaviour) passes — Copilot redirects off-scope requests instead of answering them, and the `[<MODE>]` prefix appears on at least 2 of 3 replies.
- [ ] Slim `copilot-instructions.md` embeds bash-guard forbidden-patterns and arch-drift baseline text.
- [ ] Slim `copilot-instructions.md` includes a `## Context discovery` section listing all team/project context files (`.copilot/pai-orbit-config.md`, `.copilot/team.md`, `CLAUDE.md`, `docs/architecture/*.md`, `docs/decisions/`, `docs/domain/*.md`, feature `requirements.md`).
- [ ] Copilot demonstrably reads the context files (Phase 4 validation task 8 passes — Copilot returns project-specific values from `.copilot/pai-orbit-config.md` and `docs/architecture/constraints.md` rather than generic answers).
- [ ] **D33 confirmed at runtime:** project root after install contains no `.vscode/`, no `.idea/`, no other editor-specific folders authored by pai-orbit.
- [ ] `.husky/pre-commit.template` enforces bash-guard's intent at git layer; emitted as `.template` (opt-in).
- [ ] [plugins/pai-orbit/core/modes/setup.md](../../plugins/pai-orbit/core/modes/setup.md) handles the Copilot path including the husky opt-in question.
- [ ] Root `package.json` exists with a `pai-orbit` bin entry.
- [ ] `plugins/pai-orbit/scripts/init/cli.js` exists, is runnable, and accepts both interactive and `--yes` non-interactive modes.
- [ ] `npx github:the-psi/pai-orbit init copilot` works end-to-end on a clean Windows machine (Node 18+, git installed) and produces the full target layout.
- [ ] A fresh test project, set up via either `/setup` (Copilot target) or `npx github:the-psi/pai-orbit init copilot`, can invoke `/groom`, `/design`, `/git`, `/review`, `/analysis` as real prompts and receive correct headspace responses.
- [ ] Opening a `.sql` file in the test project triggers `instructions/data-model.instructions.md` (verified by behaviour, not just by file existence).
- [ ] Lint enforcement at commit time works: editing a deliberately-broken Python or TS file and running `git commit` triggers the pre-commit hook, which runs `ruff` / `eslint` from the project's own config and blocks the commit if there are violations. No `.vscode/` is involved.
- [ ] If husky opt-in was selected, `.husky/pre-commit` exists, is executable, and blocks `git push --force` / `git add -A` in a manual smoke test.
- [ ] `docs/copilot-install-and-usage.md` exists and documents:
  - [ ] `npx` install command, version pinning, Node/git prerequisites
  - [ ] Skill rendering split (prompts vs instructions)
  - [ ] Hook-coverage matrix
  - [ ] "Updating pai-orbit later" section
  - [ ] **"Joining a team that already has pai-orbit installed"** section (pull → reload VS Code → smoke-test, no npx re-run needed)
  - [ ] **"AGENTS.md disambiguation"** section (AGENTS.md is Codex, not Copilot — pai-orbit does not emit it for Copilot)
  - [ ] **"Multi-assistant teams"** section (Claude + Cursor + Copilot can coexist; each tool reads its own folder)
  - [ ] **"Uninstalling pai-orbit from a project"** section (the manual `git rm` list)
- [ ] [docs/epics/multi-tool-compat/EPIC.md](../epics/multi-tool-compat/EPIC.md) reflects the new Done state.
- [ ] Existing Claude and Cursor `/setup` paths are unchanged (regression check passed).
- [ ] **Lifecycle gates:**
  - [ ] Re-running `npx github:the-psi/pai-orbit init copilot` on a project with existing pai-orbit install does NOT overwrite `.copilot/pai-orbit-config.md`, `.copilot/team.md`, or `CLAUDE.md`.
  - [ ] Re-run DOES overwrite `.github/copilot-instructions.md`, all `.github/prompts/`, and all `.github/instructions/`.
  - [ ] `update copilot` subcommand exists and behaves identically to `init copilot` re-run mode.
  - [ ] `--re-interview` flag forces a fresh interview and rewrites `.copilot/*` files even on a re-run.
- [ ] One commit (or a small ordered set) on a feature branch, ready to PR.

---

## Deliverables checklist

| Artefact | Location |
|----------|----------|
| Adapter design doc | `docs/features/copilot-adapter-prompt-files/design.md` |
| Updated adapter | `plugins/pai-orbit/adapters/copilot/build.sh` |
| Built output: slim instructions | `plugins/pai-orbit/dist/copilot/.github/copilot-instructions.md` |
| Built output: mode prompts (12) | `plugins/pai-orbit/dist/copilot/.github/prompts/<mode>.prompt.md` |
| Built output: skill prompts (6) | `plugins/pai-orbit/dist/copilot/.github/prompts/<skill>.prompt.md` |
| Built output: service-builder agent prompts (7 — `django`, `express`, `fastapi`, `generic-service`, `infra`, `nextjs`, `react-vite`) | `plugins/pai-orbit/dist/copilot/.github/prompts/<stack>-builder.prompt.md` |
| Built output: instructions files (4 — `git`, `data-model`, `arch-drift`, `context-discovery`) | `plugins/pai-orbit/dist/copilot/.github/instructions/<name>.instructions.md` |
| Built output: husky template | `plugins/pai-orbit/dist/copilot/.husky/pre-commit.template` |
| Built output: pre-commit framework template | `plugins/pai-orbit/dist/copilot/.pre-commit-config.yaml.template` |
| Build verification script | `plugins/pai-orbit/scripts/verify-dist.sh` |
| CI workflow — dist freshness gate | `.github/workflows/dist-freshness.yml` |
| Updated `/setup` | `plugins/pai-orbit/core/modes/setup.md` |
| Root `package.json` | `./package.json` |
| Install CLI entry point | `plugins/pai-orbit/scripts/init/cli.js` |
| Install CLI library code | `plugins/pai-orbit/scripts/init/lib/*.js` |
| Validation notes | `docs/wip/copilot-upgrade-validation-2026-06-28.md` |
| Adoption page | `docs/copilot-install-and-usage.md` |
| Epic update | `docs/epics/multi-tool-compat/EPIC.md` |

---

## What this plan is not

- Not a redesign of pai-orbit's overall architecture — only the Copilot adapter changes.
- Not a Cursor or Claude refactor — those adapters are untouched.
- Not the full multi-tool canonical front-matter migration — that remains a separate phase on the epic.
- Not a Copilot Business licence procurement plan — that runs in parallel via the IT request.

The boundary is clear: take pai-orbit's Copilot output from "single static reference file" to "real invokable commands + path-scoped skill rules + symmetric `.copilot/` metadata folder + one-command install via `npx github:the-psi/pai-orbit init copilot`", using ECC's proven pattern as the reference for the file layout and `npx` from GitHub as the no-publish distribution channel.
