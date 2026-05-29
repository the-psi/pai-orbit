# pai-orbit

A structured developer methodology harness, distributed as a Claude Code plugin and as rule/instruction bundles for Cursor, GitHub Copilot, and OpenAI Codex.

pai-orbit gives your project a shared vocabulary for how work gets done — distinct modes for building, designing, planning, and exploring data; operational skills for git, task management, and deployment; and a first-time setup that generates everything project-specific from a short conversation.

> **This repository is a Claude Code marketplace.** The pai-orbit plugin lives at [`plugins/pai-orbit/`](plugins/pai-orbit/). The marketplace currently lists this one plugin; additional plugins can be added alongside it.

## What it is

Software teams waste context constantly: half-designed features get built, build sessions derail into planning debates, agronomic (or domain) questions get answered with guesses. pai-orbit imposes a light discipline: **each slash command puts Claude into a distinct headspace with a defined output destination.** Switching is explicit. Outputs are saved. Nothing important lives only in a conversation.

```
Backlog
/arch            → architecture declaration — produces docs/architecture/ (system, constraints, stack)
/domain          → domain knowledge — produces docs/domain/
/ux              → user flow and layout design — produces docs/features/*/ux.md

Sprint — recommended order for a new feature
/groom           → feature requirements — produces docs/features/*/requirements.md; readiness gate blocks /design until functional gaps are closed
/test (write)    → draft test cases from requirements before any code is written — produces docs/features/*/test-plan.md
/design          → technical trade-offs — produces docs/decisions/ and docs/features/*/design.md
/build           → implementation — reads docs and constraints, checks task board, ships
/test (run)      → execute test plan; log failures to docs/wip/
/build           → fix logged bugs; repeat test → build until clean
/test (verify)   → final verification pass; confirm all acceptance criteria are met
/review          → code review — checks diff against constraints, CLAUDE.md, ADRs, requirements

Release
/deploy          → guided deployment with preflight and post-deploy verification

Production fast-path
/incident        → triage → BUILD → REVIEW → DEPLOY → post-mortem

Hand-off / issue response
check issue      → read response or reviewer feedback
/design          → revise approach if needed — updates design.md or creates a new ADR
/build           → implement the change
/test            → run relevant test cases; log any failures
/deploy          → ship once the test pass is clean

Workflow skills
/git             → commit, branch, PR — reads project branching model
/board           → task creation, card movement, team assignment (GitHub Issues, GitHub Projects v2, Linear, Jira, GitLab)
/analysis        → change impact and dependency analysis
/data-model      → schema reference and migration management
/security-review → OWASP-based security pass on changed code
/simplify        → code simplification — remove over-engineering, dead code, abstractions

Planning and maintenance
/plan            → roadmap and prioritisation — consumes docs, moves board cards
/data            → data exploration — produces docs/reports/
/epic            → epic lifecycle — create, load, update, and list epics in docs/epics/
/setup           → first-time configuration — generates config, agents, hooks, docs scaffold
/suggest-skills  → discover recurring patterns worth encoding as project skills
```

## Mode flow

```mermaid
flowchart TD
    subgraph BACKLOG["Backlog"]
        arch["/arch\nArchitecture declaration"]
        domain["/domain\nDomain knowledge"]
        ux["/ux\nUX design"]
        plan["/plan\nPrioritisation"]
    end

    subgraph FEATURE["New Feature"]
        groom["/groom\nRequirements"]
        testwrite["/test (write)\nDraft test cases"]
        design["/design\nTechnical design"]
        build["/build\nImplementation"]
        testrun["/test (run)\nRun & log bugs"]
        testverify["/test (verify)\nFinal verification"]
        review["/review\nCode review"]
    end

    subgraph HANDOFF["Hand-off / Issue Response"]
        issue["Check issue response"]
        design2["/design\nRevise approach"]
        build2["/build\nImplement change"]
        test2["/test\nRun test cases"]
    end

    subgraph RELEASE["Release"]
        deploy["/deploy\nDeployment"]
    end

    incident["/incident\nProduction fast-path"]

    arch & domain & ux --> groom
    plan -.->|sequence| groom
    groom --> testwrite
    testwrite --> design
    design --> build
    build --> testrun
    testrun -- bug found --> build
    testrun -- clean --> testverify
    testverify --> review
    review --> deploy

    issue --> design2
    design2 --> build2
    build2 --> test2
    test2 --> deploy

    incident --> build
    incident --> deploy
```

Workflow skills (`/git`, `/board`, `/analysis`, `/data-model`, `/security-review`, `/simplify`) can be invoked from any phase.

> **`/groom` readiness gate** — before handing off to `/design`, `/groom` audits every open question and classifies it as a *functional gap* (what the system does — must be resolved) or a *design question* (how it does it — deferred to `/design`). The feature is not marked groomed until all functional gaps are closed. This prevents half-specified features from entering design.

## Install

### Claude Code (full fidelity)

```bash
# Add the marketplace straight from GitHub
/plugin marketplace add the-psi/pai-orbit

# Install the plugin
/plugin install pai-orbit@the-psi
```

That's it — Claude Code fetches the repo and resolves the plugin from the marketplace listing. The listing points at `plugins/pai-orbit/dist/claude-code/`, which is the committed, built artifact produced by `plugins/pai-orbit/adapters/claude-code/build.sh`. No clone needed for installation.

If you're developing against a local checkout instead:

```bash
git clone https://github.com/the-psi/pai-orbit
/plugin marketplace add /absolute/path/to/pai-orbit
/plugin install pai-orbit@the-psi
```

### Cursor (plugin — recommended)

Install as a **user-level or team marketplace** plugin (rules, skills, commands, agents, hooks):

| Path | How to install |
|------|----------------|
| Repo root (`.cursor-plugin/marketplace.json`) | Paste `https://github.com/the-psi/pai-orbit` in Cursor — installs `dist/cursor-plugin/pai-orbit/` |
| [`plugins/pai-orbit/dist/cursor-plugin/pai-orbit/`](plugins/pai-orbit/dist/cursor-plugin/pai-orbit/) | Symlink or copy to `~/.cursor/plugins/local/pai-orbit` |

See [`docs/cursor-plugin-install-and-usage.md`](docs/cursor-plugin-install-and-usage.md) and [`plugins/pai-orbit/dist/cursor-plugin/README.md`](plugins/pai-orbit/dist/cursor-plugin/README.md).

**Do not** use the legacy copy-rules install and the plugin together — duplicate mode rules will conflict.

### Other coding assistants (lossy)

The same plugin source is compiled to per-tool bundles under `plugins/pai-orbit/dist/`. Copilot and Codex bundles are **lossy** reference instructions only.

| Tool | Path | How to install |
|------|------|----------------|
| Cursor (legacy) | [`plugins/pai-orbit/dist/cursor/`](plugins/pai-orbit/dist/cursor/) | Copy `.cursor/` into your project root — use only if you cannot install the plugin |
| GitHub Copilot | [`plugins/pai-orbit/dist/copilot/`](plugins/pai-orbit/dist/copilot/) | Copy `.github/copilot-instructions.md` into your project |
| OpenAI Codex CLI (experimental) | [`plugins/pai-orbit/dist/codex/`](plugins/pai-orbit/dist/codex/) | Copy `AGENTS.md` to your project root |

See [`plugins/pai-orbit/README.md`](plugins/pai-orbit/README.md) for adapter internals and how to rebuild the bundles.

## First run

After installing, run `/setup` in your project directory. It will:

1. Discover your repo structure and tech stack
2. Ask a short set of questions (task board, branching model, deployment, docs home, team, architecture)
3. **Query your live board for its actual column/state taxonomy** — no typing label names by hand:
   - **GitLab**: queries project boards first; presents the board list so you pick which one(s) define your workflow; derives column→label order directly from the board's lists. Falls back to querying all labels only if no boards are configured.
   - **GitHub Projects v2**: runs `gh project field-list` to read Status field options
   - **Linear**: runs `linear team list` to read workflow states
   - **Jira / GitHub Issues / Notion**: prompts you to enter column names manually
4. Generate `.claude/pai-orbit-config.md`, `.claude/team.md`, a `CLAUDE.md` stub, stack-specific agents, a `docs/` scaffold, and a `docs/architecture/` stub
5. Tell you exactly what to fill in by hand

Then run `/arch init` to complete your architecture declaration — a guided interview that writes `docs/architecture/system.md` (service map), `constraints.md` (enforcement rules), and `stack.md`. Once declared, `/build` reads the constraints before generating code and `/review` checks every diff against them.

Re-run `/setup` anytime the stack, board configuration, or team changes significantly. The column→label table in `.claude/pai-orbit-config.md` includes a `# Re-run /setup` comment as a reminder when board labels drift.

## Agents

Two built-in agents ship with pai-orbit; `/setup` generates additional stack-specific agents for your project.

| Agent | Role |
|-------|------|
| `docs-writer` | Writes and updates docs locally; syncs outbound to Confluence/Notion via MCP |
| `cross-repo-impact` | Read-only — searches configured repos for usages of a changed interface and classifies each as breaking, compatible, or unknown |
| Stack agents | One agent per service (FastAPI, Next.js, Django, Express, React/Vite, IaC, generic), generated by `/setup`. Each works only inside its service directory and runs tests before claiming completion. |

> **`/board` — GitLab label resolution**: before any column move, `/board` resolves the target label live against the project's label list. If the configured label is missing it blocks and prints the full label listing — it never guesses or silently uses a wrong label. Stale-but-found labels proceed with a warning so work is not interrupted while labels are being renamed.

## Hooks

Four shell hooks are included. Wire them in Claude Code's settings or copy them to `.claude/hooks/` in your project (done automatically by `/setup`).

| Hook | Event | What it does |
|------|-------|--------------|
| `bash-guard.sh` | PreToolUse | Blocks `git push --force`, bulk staging (`git add .`/`-A`), `--no-verify`, and unsafe `rm` on root/home |
| `lint-python.sh` | PostToolUse | Runs `ruff check` after any `.py` edit. Advisory — never blocks. |
| `lint-ts.sh` | PostToolUse | Runs `eslint --max-warnings 0` after any `.ts`/`.tsx` edit. Advisory — never blocks. |
| `arch-drift-guard.sh` | PostToolUse | Prints an advisory nudge when structural files (`docker-compose.yml`, `package.json`, `go.mod`, etc.) are edited. Suggests `/arch validate`. Never blocks. |

## Docs

- [Process & Practices](docs/process-and-practices.md) — the methodology: why modes, working style, how sessions should flow
- [Capabilities](docs/capabilities.md) — reference for every mode, skill, and agent
- [Getting Started](docs/getting-started.md) — installation, first `/setup` walkthrough, first session

## Philosophy

**Producer/consumer.** `/arch` produces the architecture contract. `/domain` produces science. `/groom` produces requirements. `/design` produces feature-level architecture. `/build` produces code. `/plan` consumes all of the above to decide what to work on next. Switch modes when the headspace or output destination changes.

**Local-first docs.** All modes write markdown locally. If your team uses Confluence or Notion, `docs-writer` handles outbound sync. Local is Claude's working copy; the remote platform is the published surface. Edits should flow outward, not inward — bidirectional sync creates conflicts that are hard to resolve cleanly.

**Config over baked-in.** Modes contain methodology, not project specifics. Board URLs, branch naming conventions, deployment targets, and team handles all live in `.claude/pai-orbit-config.md` and `.claude/team.md`. `/setup` generates those; the modes read them.

## License

MIT
