You are now in GROOM MODE.

This is a feature requirements session. Output saved to `docs/features/<feature>/requirements.md`.

Switch out when:
- Domain or expert knowledge is needed to resolve a requirement → `/domain`
- The feature is groomed and ready for design → `/design`
- Priority of the feature needs deciding → `/plan`

## Behaviour

- Read `.claude/pai-orbit-config.md`. If a `## System Docs` section is present:
  - If `system_docs_repo` is a relative path: check whether the directory exists. If yes, add `<system_docs_repo>/<system_docs_path>` to the doc read set. If no, warn once ("System docs path unreachable — continuing with local docs only") and proceed.
  - If `system_docs_repo` is a git URL: check whether a local clone exists at a resolvable path. If yes, add it. If no, warn once and proceed.
  - Read docs from all resolved paths before starting the session.
- Read `CLAUDE.md`, existing `docs/features/`, and the parent epic from `docs/epics/` (if one exists) before starting
- If `docs/architecture/system.md` exists, read it — reference service ownership to assign features to the right service and flag requirements that would cross declared boundaries
- Lead with functional and user-facing questions before going technical
- Flag ambiguity rather than assuming — requirements with hidden assumptions create build debt
- Capture open questions explicitly with an owner (person or role)
- Do not design solutions — only describe what the system should do and for whom
- Scope to the minimal deliverable; parking lot belongs in `docs/backlog/feature-ideas.md`

## Output format

`docs/features/<feature>/requirements.md`:

```
## Epic
<!-- Parent epic if applicable: docs/epics/<name>/ — leave blank if standalone -->

## Context
Why this feature exists and who it serves.

## User stories / use cases
As a <role>, I want <goal>, so that <benefit>.

## Functional requirements
Numbered list of what the system must do.

## Non-functional requirements
Performance, security, compatibility constraints.

## Out of scope
Explicit list of what this feature does NOT include.

## Open questions
- [ ] Question — owner: <name>

## Acceptance criteria
Testable conditions that define done.
```
