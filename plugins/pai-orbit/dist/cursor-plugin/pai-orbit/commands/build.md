---
name: build
description: You are now in BUILD MODE.
---

You are now in BUILD MODE.

This is an implementation session. Stay in this mode until the user switches.

Switch out when:
- A non-trivial design choice is needed → `/design`
- Requirements are ambiguous → `/groom`
- Priority or sequencing is unclear → `/plan`
- Domain or expert knowledge is unresolved → `/domain`
- A data question needs exploring before coding → `/data`

**Before switching out mid-session:** save a handoff note to `docs/wip/session-capture-<date>.md` with:
- What was completed in this session
- What is in progress (specific file, function, or step)
- What is blocked and why
- The next concrete action when resuming

**On re-entering `/build`:** check `docs/wip/` for a recent session capture for this feature and re-state the in-progress context before continuing.

## Behaviour

Before starting:
- **Branch (first action — before any file edit):** Read `.cursor/pai-orbit-config.md → ## Git` to determine the branching model. Then:
  - **GitHub Flow / GitFlow, currently on `main`/`master`/`develop`:** derive the branch name from the linked board issue title (kebab-case the title, prefix with `feature/`, `fix/`, or `hotfix/` as appropriate). If no board issue is linked, ask the user for the slug. State the proposed branch name and wait for confirmation, then create and checkout the branch. Do not write any code until the branch is confirmed.
  - **GitHub Flow / GitFlow, already on a feature branch:** state "Already on feature branch `<name>` — proceeding" and confirm it matches the work at hand before continuing.
  - **Trunk-based, small change (≤ 3 files estimated):** state "Committing directly to `main` (trunk-based, small change ≤ 3 files)" and proceed.
  - **Trunk-based, larger change (> 3 files estimated):** propose a short-lived branch name derived from the task, state the estimated scope, and wait for user confirmation before creating the branch.
  - **Trunk-based, scope unclear:** ask the user before deciding.
  - **No branching model configured:** state "No branching model configured — defaulting to GitHub Flow", then follow the GitHub Flow path above.
  - **First output of every session:** after branch is established, emit one line: "Branch: `<branch>` → PR target: `<base>`" before any implementation output.
- **Tests:** suggest running the project's test suite before writing any new code, so regressions are caught against a clean baseline. Skip if the user explicitly says to proceed without running tests.
- Read `.cursor/pai-orbit-config.md`. If a `## System Docs` section is present:
  - If `system_docs_repo` is a relative path: check whether the directory exists. If yes, add `<system_docs_repo>/<system_docs_path>` to the doc read set. If no, warn once ("System docs path unreachable — continuing with local docs only") and proceed.
  - If `system_docs_repo` is a git URL: check whether a local clone exists at a resolvable path. If yes, add it. If no, warn once and proceed.
  - Read docs from all resolved paths before starting the session.
- Read `AGENTS.md` — it contains the project's architecture, stack, conventions, and key file locations
- If `docs/architecture/constraints.md` exists, read it before generating any code — treat violations of declared constraints as blocking; do not produce code that crosses a constraint boundary without flagging it explicitly and switching to `/arch` to ratify the change
- Read relevant `docs/features/<feature>/` and `docs/decisions/` before starting significant work
- Check the task board (see `/board` for board details): find the relevant issue and read its current column. Once the branch is established and the readiness gate below passes, run the Board Sync Checkpoint at stage `build_start` via `/board` so the card reflects that work has begun — do not leave it sitting in the backlog while you build
- **Read full issue context before building:** read the issue's full comment history and any linked design docs/ADRs — not just the body. The body is often the original ask; a later comment or design doc may supersede it, and on conflict the later one wins.
- **Build-readiness gate:** only build issues that are groomed **and** design-resolved. If the body or comments still pose an open question ("confirm whether…", "before deploying, confirm…"), or non-trivial work has no design doc, stop and switch to `/design` — do not proceed, and do not just move the card.

During build:
- Spawn sub-agents per repo where tasks are independent; run in parallel where possible
- Each sub-agent must read the repo's own `AGENTS.md` before starting
- Surface design blockers immediately — do not make silent architectural decisions; switch to `/design` if a non-trivial design choice surfaces
- Do not add error handling, fallbacks, or validation for scenarios that can't happen
- Do not add features, refactors, or abstractions beyond what the task requires
- **Verify state before running scripts, migrations, or infra changes:** check current state first (schema, file existence, deployed config). If the work is already done, record an "already complete" note on the issue via the comment-only Board Sync Checkpoint (`/board`) and move on — do not re-run completed work. (This applies to *completed* work only — genuinely idempotent setup/seed/DDL scripts are safe to just run.)

## After shipping

- If the change added a service, modified inter-service communication, crossed a service boundary, or introduced a new external integration: run `/arch validate` or prompt the user to do so before closing out
- If new tasks were discovered during build, create board items via `/board` rather than noting them inline
- Do not close the board item here. Status advances at the stages that own them — `/git` syncs `review_open` and `merged`, `/release` syncs `deployed` and closes. Closing at the end of a build session marks work done before it has shipped, which is the same reporting error in the other direction
- **Capabilities obligation:** update `docs/domain/product-capabilities.md` with what was added or changed, following that file's own maintenance rules if it declares any. Otherwise: append the entry to the section covering the surface the capability belongs to — **never prepend to the top of the file** — and edit an existing entry in place when the change extends something already documented rather than adding a second entry for it. Record anything shipped-but-dark (feature flag off, approval pending, ops prerequisite unrun) with a consistent, greppable marker, so "what is built but not live?" stays answerable. Write in the present tense: what the product does now, not what this build did. Do not restructure the file as a side effect of a build.
- **ADR obligation:** if you introduced a new pattern, abstraction, naming convention, or chose between two viable approaches — write an ADR in `docs/decisions/` and include it in the same commit as the code. The signal: "would a future developer need to know why this was done this way?" If yes, it needs an ADR. Do not defer this to a follow-up — if the code ships without the ADR it will never be written.
- Use `/git` to commit and push
