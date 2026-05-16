# PAI-Orbit

A structured developer methodology harness for Claude Code that enforces disciplined working modes, prevents context loss, and produces local-first documentation at every stage of development.

**Author:** Pratham Software (PSI) | **License:** MIT | **Version:** 0.1.0

---

## What This Is

PAI-Orbit is a Claude Code plugin — a collection of slash commands, skills, agents, hooks, and templates. It is not a library or a build tool. It imposes a **mode-driven workflow** where each command puts Claude into a specific headspace with defined inputs, outputs, and destination files.

The core problem it solves: knowledge lives only in chat conversations and disappears. PAI-Orbit forces every meaningful output into versioned markdown files in the repo.

---

## Directory Structure

```
pai-orbit/
├── .claude-plugin/          Plugin metadata (plugin.json, marketplace.json)
├── commands/                Slash command definitions (one .md per mode)
│   ├── arch.md              /arch — system architecture declaration and validation
│   ├── build.md             /build — implementation
│   ├── design.md            /design — technical decisions
│   ├── domain.md            /domain — expert knowledge capture
│   ├── groom.md             /groom — feature requirements
│   ├── plan.md              /plan — roadmap and prioritization
│   ├── ux.md                /ux — user experience design
│   └── data.md              /data — data exploration (read-only)
├── skills/                  Multi-step operational procedures
│   ├── analysis/            Change impact (blast radius) assessment
│   ├── board/               Task management (GitHub/Linear/Jira)
│   ├── data-model/          Schema reference and migration planning
│   ├── deploy/              Guided deployment with preflight checks
│   ├── epic/                Epic lifecycle management
│   ├── git/                 Git operations with branching conventions
│   ├── incident/            Production incident fast-path
│   ├── review/              Structured code review
│   ├── security-review/     OWASP Top 10 security pass
│   ├── setup/               First-time project configuration
│   ├── simplify/            Code quality and dead-code removal
│   ├── suggest-skills/      Pattern discovery for custom skills
│   └── test/                Test planning and QA
├── agents/                  Named sub-agents
│   ├── docs-writer.md       Documentation agent (local + Confluence/Notion)
│   └── cross-repo-impact.md Read-only cross-repo dependency analysis
├── templates/               Scaffolding output of /setup
│   ├── agents/              Stack-specific builder agents (7 templates)
│   ├── docs/                Documentation folder scaffold
│   │   ├── architecture/    Architecture declaration stubs (system.md, constraints.md, stack.md)
│   │   └── decisions/       ADR template (ADR.md)
│   ├── skills/              Domain-operational skill template
│   ├── CLAUDE.md.template   Project spec stub
│   ├── pai-orbit-config.md.template
│   └── team.md.template
├── hooks/                   Shell hooks wired to Claude Code tool events
│   ├── bash-guard.sh        PreToolUse — blocks force-push, bulk staging
│   ├── lint-python.sh       PostToolUse — ruff
│   ├── lint-ts.sh           PostToolUse — eslint
│   └── arch-drift-guard.sh  PostToolUse — advisory nudge on structural file edits
└── docs/                    Framework documentation
    ├── capabilities.md      Reference: all modes, skills, agents, hooks
    ├── process-and-practices.md  Methodology philosophy and session flow
    └── getting-started.md   Install walkthrough and first-run guide
```

---

## Core Concepts

### Modes (Commands)

Each `/command` locks Claude into a distinct headspace. Modes do not bleed into each other — no design debates inside `/build`, no implementation inside `/design`.

| Mode | Purpose | Primary Output |
|------|---------|----------------|
| `/arch` | Declare and maintain system architecture | `docs/architecture/`, `docs/decisions/YYYY-MM-DD-*.md` |
| `/domain` | Capture expert domain knowledge | `docs/domain/*.md` |
| `/ux` | Define user flows and interface behavior | `docs/features/*/ux.md` |
| `/groom` | Formalize acceptance criteria | `docs/features/*/requirements.md` |
| `/design` | Architect technical solutions, record trade-offs | `docs/features/*/design.md`, `docs/decisions/YYYY-MM-DD-*.md` |
| `/build` | Implement features and fixes | Code + updated docs |
| `/test` | Write test plans, run QA | `docs/features/*/test-plan.md` |
| `/plan` | Prioritize and sequence work | `docs/plans/*.md` |

### Skills

Skills are multi-step procedures callable from any mode. Each skill lives in `skills/<name>/` and is registered in `.claude-plugin/plugin.json`.

Key skills: `/git`, `/board`, `/deploy`, `/analysis`, `/security-review`, `/review`, `/simplify`, `/incident`, `/data-model`, `/epic`, `/suggest-skills`, `/setup`, `/test`.

### Agents

Named sub-agents spawned for parallel or specialized work:
- **docs-writer** — writes documentation, optionally syncs to Confluence/Notion
- **cross-repo-impact** — read-only analysis across repos; never modifies files
- **Stack builder agents** — generated by `/setup` from `templates/agents/`, one per service (FastAPI, Django, Express, Next.js, React/Vite, infra, or generic)

### Producer / Consumer Contract

Every mode declares what it reads and what it writes. This is the discipline that prevents context loss:

```
/arch   → produces docs/architecture/ (system.md, constraints.md, stack.md) + ADRs
/domain → produces docs/domain/*.md
/ux     → consumes domain docs → produces docs/features/*/ux.md
/groom  → consumes ux + domain + architecture → produces requirements.md
/design → consumes requirements + domain + architecture → produces design.md + ADRs
/build  → consumes all docs + constraints.md + board → produces code + updated docs
/test   → consumes requirements → produces test-plan.md
```

---

## Configuration Files (Generated by `/setup`)

These live in the **target project**, not in this repo:

| File | Purpose |
|------|---------|
| `.claude/pai-orbit-config.md` | Board type, git model, deploy targets, docs home |
| `.claude/team.md` | Team roster for assignments |
| `CLAUDE.md` | Project architecture, stack, key files, data model, auth |
| `.claude/agents/<service>-builder.md` | Service-specific builder agent |
| `.claude/hooks/*.sh` | Safety and linting hooks |
| `docs/` | Full documentation scaffold |

---

## Hooks

Hooks are shell scripts wired to Claude Code tool use events. They run outside Claude's context.

- **`bash-guard.sh`** (PreToolUse) — blocks `git push --force`, `git add .`, `git add -A`, and `rm -rf` with unsafe patterns
- **`lint-python.sh`** (PostToolUse) — runs `ruff check` after file edits in Python projects
- **`lint-ts.sh`** (PostToolUse) — runs `eslint` after file edits in TypeScript/JavaScript projects
- **`arch-drift-guard.sh`** (PostToolUse, advisory) — prints a one-line nudge when structural files are edited (docker-compose, package.json, go.mod, etc.); never blocks

---

## Documentation Structure (in Target Projects)

```
docs/
├── domain/       Expert knowledge, business rules (produced by /domain)
├── features/     One subfolder per feature, each with ux.md, requirements.md, design.md, test-plan.md
├── decisions/    Architecture Decision Records (ADRs)
├── epics/        Epic tracking files
├── plans/        Planning and prioritization notes
├── ops/          Human-owned operational files — Claude does not modify these
├── backlog/      feature-ideas.md parking lot
├── reports/      Data analysis outputs
└── wip/          Ephemeral: session captures, reviews, post-mortems
```

---

## Installation

```bash
# Clone into a local plugins directory
git clone https://github.com/the-psi/pai-orbit ~/.claude/plugins/pai-orbit

# Symlink the plugin into a target project
ln -s ~/.claude/plugins/pai-orbit/.claude-plugin .claude/plugins/pai-orbit

# Reload plugins in Claude Code
/reload-plugins
```

Then run `/setup` in the target project to generate all config and scaffold files.

---

## Working in This Repo

### Adding a New Command

1. Create `commands/<name>.md` following the pattern in existing command files (headspace declaration, input/output contract, step list, output format).
2. Register it in `.claude-plugin/plugin.json`.
3. Update `docs/capabilities.md` reference table.

### Adding a New Skill

1. Create `skills/<name>/` directory with a skill `.md` file.
2. Follow the trigger/skip pattern from existing skills (when to invoke, when not to).
3. Register in `.claude-plugin/plugin.json`.
4. Update `docs/capabilities.md`.

### Adding an Agent Template

1. Add to `templates/agents/<stack>-builder.md`.
2. Update `skills/setup/` to reference it during scaffolding.
3. Document in `docs/capabilities.md`.

### Modifying Hooks

Hooks in `hooks/` are shell scripts. Test changes locally before committing — a broken hook blocks the entire tool use flow for anyone using the plugin.

---

## Key Design Principles

- **Mode discipline** — Never mix headspaces. If the conversation drifts, switch modes explicitly.
- **Written outputs** — Nothing important lives only in chat. If it matters, it goes to a file.
- **Local-first docs** — Markdown is the source of truth; Confluence/Notion are publishing surfaces.
- **Config over baked-in** — Project specifics (board, branch model, deploy targets, team) live in `.claude/` config, not in this framework.
- **Human-owned ops** — `docs/ops/` and `docs/backlog/` are human decisions. Claude can read them, not overwrite them.
- **Flag ambiguity** — "I don't know" is better than a confident guess. Modes should surface uncertainty explicitly.
- **Blast radius first** — Before any refactor of a shared interface, run `/analysis`. Before any merge touching auth or input handling, run `/security-review`.
