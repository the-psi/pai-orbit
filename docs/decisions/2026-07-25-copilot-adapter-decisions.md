---
status: accepted
date: 2026-07-25
deciders: [Chetan Sharma]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: pai-orbit Copilot adapter — architectural decisions

## Context

pai-orbit's Copilot adapter brings the tool's methodology (mode discipline,
skills, service-builder agents, hook advisory intent) to GitHub Copilot Chat
in VS Code, plus a standalone `npx` install path for teams that do not run
Claude Code or Cursor.

Making Copilot a first-class adapter alongside Claude Code, Cursor, and Codex
required a set of architectural choices — some inherited from pai-orbit's
existing multi-tool design, some Copilot-specific. This ADR records the
load-bearing ones. Each decision is titled with a stable identifier so it can
be referenced from code comments, other docs, and future ADRs.

## Decisions

### D6 — Single source of truth in `core/`, per-tool adapters transform

**Context.** Adding a fourth or fifth AI-assistant tool to pai-orbit without
duplicating the tool's methodology content across per-tool hand-maintained
files.

**Decision.** All modes, skills, agent templates, and prompts live once under
`plugins/pai-orbit/core/`. Per-tool adapters in
`plugins/pai-orbit/adapters/<tool>/build.sh` read from `core/` and produce
the tool-specific artefacts in `dist/<tool>/`. No parallel hand-maintained
files. Contributors edit `core/`; adapters transform.

**Consequences.** A change to a mode or skill instantly propagates to every
adapter's output on rebuild. New adapters can be added without touching
existing ones. Trade-off: adapter-specific behaviour requires either
tool-specific transforms in `build.sh` or per-tool sections in shared
source — the design intentionally biases towards keeping adapter-specific
content inside the adapter (see D39).

### D9 — Standalone install CLI is Copilot-only; Claude/Cursor targets are stubs

**Context.** The `npx github:the-psi/pai-orbit init copilot` install path
exists because Copilot-only teams have no `/setup` slash-command inside
Copilot Chat until pai-orbit files are installed — the CLI bootstraps
them. Claude Code and Cursor users already have functional in-tool
`/setup` workflows that scaffold `.claude/` / `.cursor/` from the
plugin's built-in commands.

**Decision.** The install CLI implements the `init copilot` path in full.
Corresponding stubs `lib/claude.js` and `lib/cursor.js` print a message
directing users to native `/setup` inside those tools and exit with code
2. No attempt is made to duplicate Claude Code or Cursor scaffolding in
the CLI.

**Consequences.** The CLI stays lean and scoped. Users on Claude Code or
Cursor who accidentally run `npx ... init claude` or `init cursor` get a
clear pointer to the right workflow instead of a broken install or a
half-scaffolded project. If future demand emerges for a truly
tool-agnostic CLI install path, the stubs mark the entry points to
implement.

### D23 — Migration backup folder is added to project `.gitignore`

**Context.** Users installing pai-orbit into a project that already used an
older layout (`.github/pai-orbit/`) need a safety net: the migration
subcommand backs up the old files to `.github/pai-orbit.bak/<timestamp>/`
before moving them. Backup files should not accidentally get committed to
the user's repo, but the migration runs from the CLI and cannot rely on the
user updating `.gitignore` themselves.

**Decision.** `performMigration()` in the install CLI appends
`.github/pai-orbit.bak/` to the project's `.gitignore` as part of the
migration step. Users can delete the backup folder any time after
confirming the new install works.

**Consequences.** Users are not forced to commit backup files to reach a
clean `git status`. Trade-off: the CLI mutates a project-level file
(`.gitignore`) — the change is one line, additive, and the alternative
(silent backups that the user then commits by accident) is worse.

### D28 — Anti-drift block in every persistent-headspace mode prompt

**Context.** pai-orbit's core discipline is that each mode (`/arch`,
`/build`, `/design`, `/groom`, etc.) is a persistent headspace — the
assistant should refuse off-scope requests and redirect to the right mode.
Different assistant models handle prompt ambiguity differently; some
interpret prompts literally and stay in mode as instructed, others
spontaneously drift across modes without explicit guardrails.

**Decision.** Every mode prompt emitted for Copilot carries an anti-drift
block near the top of the prompt body:

- Reject work belonging to another mode with an explicit reason.
- Redirect off-scope requests by naming the target mode explicitly (`"That's
  a /design question — switch modes?"`).
- Prefix every reply with `[<MODE>]` so mode drift is visible to the user.

Exceptions: one-shot workflow modes (`/setup`, `/suggest-skills`) use a
workflow preamble instead of anti-drift — they are not persistent
headspaces and re-invoking them from a different mode is expected.

**Consequences.** Mode drift is caught either by the assistant (redirect)
or by the user (missing `[<MODE>]` prefix visible in every reply). The
build-time verifier enforces the anti-drift markers on every
persistent-headspace mode prompt.

### D29 — Ship both husky and pre-commit-framework templates

**Context.** The install CLI needs to offer commit-time enforcement (lint
checks, secret detection) as an optional pre-commit hook. Teams choose
between two widely-used frameworks: husky (JavaScript ecosystem, config in
`.husky/pre-commit`) or the pre-commit framework (Python ecosystem, config
in `.pre-commit-config.yaml`). Neither is universal; forcing one on all
users would exclude the other camp.

**Decision.** Ship both `.husky/pre-commit.template` and
`.pre-commit-config.yaml.template` as inert templates. The install
interview offers four choices: `husky`, `pre-commit framework`, `both`,
`neither`. Detection-driven defaults: `husky` if `.husky/` exists or
`package.json` has a husky dep; `pre-commit` if `.pre-commit-config.yaml`
already exists; `husky` otherwise.

**Consequences.** Teams pick whichever tool matches their ecosystem
without pai-orbit needing to know or care. Users who choose `neither` get
the inert templates ready to activate later. Trade-off: the install output
carries both template files even for users who use only one — negligible
disk cost, larger conceptual surface.

### D30 — Service-builder prompts use agent runtime (`mode: agent` + tools)

**Context.** Service-builder prompts (django, express, fastapi, nextjs,
react-vite, infra, generic) need to inspect the target service's structure,
run tests, and propose file edits. Advisory-only prompts cannot do any of
this — they can only describe what the human should do.

**Decision.** Every service-builder prompt declares `mode: agent` frontmatter
with an explicit `tools: ["codebase", "editFiles", "runCommands", "search"]`
array. On Copilot Pro/Business, they run as multi-step agents that read
`AGENTS.md`, detect the target service, and propose file edits. On Copilot
Free, they degrade to regular prompts that still give correct
manual-scaffolding guidance.

**Consequences.** Pro/Business users get real one-shot service scaffolding.
Free users get honest advisory text with no false promise of automation.

### D33 — No editor-specific files emitted

**Context.** Modern editors (VS Code, JetBrains IDEs, Vim, etc.) support
project-level configuration files (`.vscode/`, `.idea/`, `.editorconfig`).
Emitting these from a methodology tool would either force the tool's editor
opinions onto every team, or produce configs so generic they help nobody.

**Decision.** pai-orbit never emits editor-specific files. No `.vscode/`,
no `.idea/`, no `.editorconfig`. Editor configuration is owned by the team,
not by pai-orbit.

**Consequences.** Teams keep whatever editor conventions they have. Users
who want editor integrations (e.g., VS Code lint-on-save) follow a
copy-paste recipe in the adoption docs — the recipe is short and the
alternative (pai-orbit-owned editor config that changes per pai-orbit
release) is worse.

### D37 — Copilot's project-context file is `AGENTS.md`, not `CLAUDE.md`

**Context.** Claude Code's convention is a `CLAUDE.md` file at repo root
holding project context (stack, services, key files, data model, auth).
When a Copilot user in a shared multi-tool project sees `CLAUDE.md`, the
filename implies Claude-specific content — but the content is entirely
tool-agnostic project documentation.

**Decision.** For the Copilot target, pai-orbit emits `AGENTS.md` at repo
root instead of `CLAUDE.md`. Content shape is identical — only the
filename differs. Copilot's rule book
(`.github/copilot-instructions.md`) references `AGENTS.md` under Context
discovery, with a fall-back to `CLAUDE.md` for legacy installs that
predate this decision. The install CLI detects existing `CLAUDE.md` at
repo root and refuses to overwrite it, creating `AGENTS.md` alongside so
both files can coexist while the user hand-migrates content.

**Consequences.** In multi-tool projects, `CLAUDE.md` and `AGENTS.md` may
both exist side-by-side. The team can either maintain both or have one
import the other. Claude Code and Cursor adapters continue emitting
`CLAUDE.md`.

### D38 — All Copilot prompts use documented `mode: agent` + `tools:` frontmatter

**Context.** Copilot Chat's prompt-file format documents three modes:
`ask`, `edit`, and `agent`, each declared via a `mode:` frontmatter key.
Any other frontmatter key VS Code treats as unknown metadata and silently
falls back to a default mode. Undocumented shapes are silent downgrades,
not errors.

**Decision.** Every Copilot prompt — modes, skills, service-builders,
named agents, one-shot workflow prompts — uses `mode: agent` frontmatter
with an explicit `tools:` array. Named agents and mode prompts that write
files get the full tool set (`editFiles` + `runCommands`); read-only
agents get restricted tools (`codebase` + `search`) matching their source
contract. The build-time verifier rejects undocumented frontmatter shapes.

**Consequences.** All prompts run agentically on Pro/Business (edit files,
run commands). Anti-drift text still runs as prompt content — the
frontmatter unlocks the tool runtime; the anti-drift instructions still
enforce mode discipline.

### D39 — Copilot's `/setup` content lives in the Copilot adapter, not shared source

**Context.** pai-orbit's shared `core/modes/setup.md` needs to describe
what `/setup` does in a tool-agnostic way. Copilot's install path is
substantially different from Claude Code's and Cursor's — it writes to
`.github/prompts/`, uses `.copilot/` metadata, emits `AGENTS.md` instead
of `CLAUDE.md`, and asks a husky/pre-commit opt-in question no other tool
needs. Adding Copilot-specific scaffolding text to shared source would
put content in a file every adapter reads.

**Decision.** Copilot's `/setup` prompt is assembled by the Copilot
adapter's `build.sh`. It takes Steps 1, 2, and 2b (target-agnostic
interview) from the shared source with `.claude/` → `.copilot/` and
`CLAUDE.md` → `AGENTS.md` rewrites applied, then appends Copilot-specific
Step 3 (scaffolding) and Step 4 (report) as heredocs from `build.sh`
itself.

**Consequences.** Copilot-specific `/setup` content stays in the Copilot
adapter — no leakage into `dist/claude-code/`, `dist/cursor/`,
`dist/cursor-plugin/`, `dist/codex/`. Trade-off: the Step 3 and Step 4
content lives as bash heredocs rather than as separate markdown files —
slightly harder to read/edit than a markdown file, correctly scoped to
the adapter.

### D40 — Copilot workflow modes auto-resolve board issue numbers to feature identifiers

**Context.** Copilot Chat lives alongside the task-board sidebar in VS
Code (GitHub Issues, GitLab, Linear, Jira boards). Users naturally
invoke workflow modes with a bare issue number (`/groom 16`, `/design
16`, `/build 16`). Without explicit instructions, Copilot asks the user
to type a feature slug manually — losing the issue title context that
would derive the slug naturally.

**Decision.** The Copilot adapter prepends a board-lookup preamble to
workflow-mode prompts. The preamble tells Copilot to read the configured
board type from `.copilot/pai-orbit-config.md`, query the appropriate
tool (`glab api /projects/…/issues/<n>` for GitLab, `gh api
/repos/…/issues/<n>` for GitHub, MCP servers for Linear/Jira/Notion),
extract the issue title, derive a kebab-case slug, and confirm with the
user before creating any feature-related file. Falls back to asking the
user directly if the board query fails.

**Consequences.** Users get automatic slug derivation from board issue
numbers, with the source-of-truth being the live board rather than a
locally-cached mapping. Fallback path preserves the behaviour of asking
directly when the board query is unavailable.

### D41 — Board-lookup preamble covers `/groom`, `/design`, and `/build`

**Context.** The `/groom` mode uses the issue title to derive the feature
folder name. The `/design` mode uses it to locate the feature under
active work. The `/build` mode uses it to derive the gitflow branch name.
All three need the same board-lookup capability; duplicating the preamble
per mode would drift over time.

**Decision.** The Copilot adapter uses a single `emit_board_lookup_preamble`
emitter shared by all three workflow modes. The preamble's per-mode Step 5
describes what each mode does with the resolved slug (`/groom` →
requirements file; `/design` → design file; `/build` → gitflow branch
name).

**Consequences.** Single source of truth for the board-lookup content. A
change to the preamble propagates to all three modes on rebuild.

### D42 — Service-builder prompts note that placeholders are runtime-resolved

**Context.** Service-builder prompt files ship as generic templates with
placeholder markers (`{{SERVICE_NAME}}`, `{{SERVICE_PATH}}`,
`{{LANGUAGE}}`, etc.). The install CLI does not pre-substitute these
markers per-service (unlike some other adapters that pre-fill per-service
copies). Users opening a service-builder file see literal `{{...}}` and
may reasonably wonder whether the markers are intentional or oversights.

**Decision.** Emit a short note at the top of each service-builder prompt
explaining that the markers are NOT substituted at install time — Copilot's
agent runtime resolves them per invocation by reading `AGENTS.md` and
detecting the target service context. If a marker cannot be resolved
(ambiguous service, unclear stack), the agent asks the user to
disambiguate before proceeding.

**Consequences.** Anyone reading the file understands the design. The
agent runtime knows to resolve markers rather than hand-fill them. Full
per-service pre-substitution parity with other adapters is deferred as a
future feature; the note is the interim clarity.

## Consequences

**Positive:**
- Load-bearing architectural decisions have a canonical record. Contributors
  encountering these designs in code or docs can look up the reasoning.
- Every decision here is cited by number from at least one committed file;
  no orphaned identifiers.
- The set is bounded and stable — future feature work adds new ADRs rather
  than expanding this one indefinitely.

**Negative / trade-offs:**
- Consolidated log rather than per-decision ADR files. Full option-analysis
  context for any single decision would need a follow-up ADR that supersedes
  the corresponding entry here.

**Neutral:**
- Existing D-number citations in committed material resolve to entries in
  this file. Removing a citation from code would not orphan a decision here;
  the decisions stand as project record regardless of where they are cited.

## Related Decisions

- `docs/decisions/2026-07-24-adapter-parity-and-dist-compat.md` — establishes
  the "full adapter parity" and "backward-compatible `dist/`" constraints
  that this ADR's decisions operate under.

## Review Date

Revisit if a future change either supersedes an entry here (split it out
into its own ADR marked as superseding this one) or if the consolidated-log
format is retired in favour of per-decision ADR files as the default.
