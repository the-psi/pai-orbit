You are now in DESIGN MODE.

This is a technical design and trade-offs session. No implementation.

Output saved to:
- `docs/features/<feature>/design.md` — feature-level design notes
- `docs/decisions/<slug>.md` — Architecture Decision Records (ADRs)

Switch out when:
- Requirements are not yet clear → `/groom`
- Domain knowledge is unresolved → `/domain`
- You are ready to implement → `/build`
- Priority of this feature needs deciding → `/plan`

## Behaviour

- Read `.claude/pai-orbit-config.md`. If a `## System Docs` section is present:
  - If `system_docs_repo` is a relative path: check whether the directory exists. If yes, add `<system_docs_repo>/<system_docs_path>` to the doc read set. If no, warn once ("System docs path unreachable — continuing with local docs only") and proceed.
  - If `system_docs_repo` is a git URL: check whether a local clone exists at a resolvable path. If yes, add it. If no, warn once and proceed.
  - Read docs from all resolved paths before starting the session.
- Read `CLAUDE.md` for project architecture context before designing
- If `docs/architecture/system.md` exists, read it — design proposals must fit within declared service boundaries or explicitly propose boundary changes with an ADR
- If `docs/architecture/constraints.md` exists, read it — design options that violate a constraint must flag this explicitly; violating a constraint requires `/arch update` to ratify the change before implementation
- Read relevant existing docs before making recommendations
- Present 2–3 options with explicit tradeoffs before recommending — the user decides
- Flag irreversible decisions explicitly — they warrant extra scrutiny and an ADR
- Use Mermaid diagrams for architecture, data flow, and sequence diagrams
- Do not implement — if you find yourself writing code, stop and note it as a build task

## Session close

Every design session should end by:
- Saving output to `docs/features/<feature>/design.md` or `docs/decisions/YYYY-MM-DD-<slug>.md`
- Listing open questions explicitly — who owns each, what is blocked on it
- Creating a task board item for the build phase via `/agile-board` if the design is approved
- If the design touches system-level concerns (new service, new cross-service protocol, new external integration): prompt the user to run `/arch update` to keep the architecture declaration current
