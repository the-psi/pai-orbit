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
- Branch: before writing any code, invoke `/git` to create and checkout a feature branch following the branching model in `.claude/pai-orbit-config.md` → `## Git`. Derive the branch name from the feature or epic being built (e.g. `feature/<slug>` for GitHub Flow). If the current branch is already a non-protected feature branch, confirm it is the right one and proceed. If the current branch is `main`, `master`, or `develop` — and the configured model is not trunk-based — do not proceed until a feature branch is created and checked out.
- Tests: suggest running the project's test suite before writing any new code, so regressions introduced by the implementation are caught against a clean baseline. Skip if the user explicitly says to proceed without running tests.
- Read `.claude/pai-orbit-config.md`. If a `## System Docs` section is present:
  - If `system_docs_repo` is a relative path: check whether the directory exists. If yes, add `<system_docs_repo>/<system_docs_path>` to the doc read set. If no, warn once ("System docs path unreachable — continuing with local docs only") and proceed.
  - If `system_docs_repo` is a git URL: check whether a local clone exists at a resolvable path. If yes, add it. If no, warn once and proceed.
  - Read docs from all resolved paths before starting the session.
- Read `CLAUDE.md` — it contains the project's architecture, stack, conventions, and key file locations
- If `docs/architecture/constraints.md` exists, read it before generating any code — treat violations of declared constraints as blocking; do not produce code that crosses a constraint boundary without flagging it explicitly and switching to `/arch` to ratify the change
- Read relevant `docs/features/<feature>/` and `docs/decisions/` before starting significant work
- Check the task board (see `/board` for board details): find the relevant issue and confirm it is in the right in-progress state

During build:
- Spawn sub-agents per repo where tasks are independent; run in parallel where possible
- Each sub-agent must read the repo's own `CLAUDE.md` before starting
- Surface design blockers immediately — do not make silent architectural decisions; switch to `/design` if a non-trivial design choice surfaces
- Do not add error handling, fallbacks, or validation for scenarios that can't happen
- Do not add features, refactors, or abstractions beyond what the task requires

## After shipping

- If the change added a service, modified inter-service communication, crossed a service boundary, or introduced a new external integration: run `/arch validate` or prompt the user to do so before closing out
- Close the task board item; use `/board` to handle the closure and any follow-up items
- If new tasks were discovered during build, create board items rather than noting them inline
- Update `docs/domain/product-capabilities.md` with what was added or changed
- **ADR obligation:** if you introduced a new pattern, abstraction, naming convention, or chose between two viable approaches — write an ADR in `docs/decisions/` and include it in the same commit as the code. The signal: "would a future developer need to know why this was done this way?" If yes, it needs an ADR. Do not defer this to a follow-up — if the code ships without the ADR it will never be written.
- Use `/git` to commit and push
