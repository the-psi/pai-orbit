## Epic
docs/epics/multi-repo-docs/

## Context
PAI-Orbit currently assumes a single-repo project with docs at `./docs`. In microservices projects, cross-cutting documentation (system-wide ADRs, epics spanning services, shared domain knowledge) has no natural home. This feature adds an optional `system_docs_repo` pointer to `pai-orbit-config.md` so PAI-Orbit knows where system-level docs live — enabling commands to read from both locations.

This feature covers schema and setup only. Command-level consumption of `system_docs_repo` is a follow-on feature.

## User stories / use cases
- As a developer setting up PAI-Orbit in a microservices project, I want `/setup` to ask whether the project is multi-repo and write the pointer automatically, so I don't have to hand-edit the config.
- As a team member, I want `pai-orbit-config.md` to have a documented `## Docs` section, so the system repo location is discoverable and version-controlled.

## Functional requirements
1. `templates/pai-orbit-config.md.template` gains a `## Docs` section with two fields:
   - `local_docs_root` — path to this repo's docs directory (default: `./docs`)
   - `system_docs_repo` — optional path or git URL to the system-level docs repo (omitted if single-repo)
   - `system_docs_path` — path within `system_docs_repo` where docs live (default: `./docs`)
2. `/setup` skill asks: "Is this a multi-repo project?" If yes, asks for the `system_docs_repo` value (accepts relative path or git URL) and writes it into the generated config.
3. If the user answers no, `system_docs_repo` is omitted from the generated config entirely (not written as blank).
4. The following commands must resolve `system_docs_repo` at session start and read from it when set: `/plan`, `/domain`, `/groom`, `/design`, `/build`.
5. If `system_docs_repo` is set but the path is unreachable (directory missing, git URL not cloned), the command warns once and continues with local docs only — it does not abort.
6. `process-and-practices.md` gains a section titled "Multi-Repo Documentation Convention" defining what belongs in a service repo vs the system repo.

## Non-functional requirements
- The config schema change must be backward-compatible — existing single-repo configs with no `## Docs` section must continue to work without modification.
- Relative paths in `system_docs_repo` are resolved relative to the current repo root.
- Git URLs are not cloned automatically — the user is responsible for having the system repo available locally.

## Out of scope
- Auto-cloning `system_docs_repo` from a git URL
- Writing docs back to the system repo from `/build` (that is a follow-on feature)
- Any UI or web interface for managing the pointer
- Syncing or diffing between local and system docs

## Open questions
- [ ] Should `/setup` validate that the provided `system_docs_repo` path exists before writing it? — owner: Punit Singhal
- [ ] Should git URLs be resolved at setup time (clone check) or only at command-run time? — owner: Punit Singhal

## Acceptance criteria
- [ ] A freshly generated `pai-orbit-config.md` (single-repo) has no `system_docs_repo` field and all commands work as before
- [ ] A freshly generated `pai-orbit-config.md` (multi-repo) has a `## Docs` section with all three fields populated
- [ ] `/plan` session with `system_docs_repo` set reads from both `./docs` and the system repo path
- [ ] `/plan` session with an unreachable `system_docs_repo` prints a warning and continues — does not error
- [ ] Same read behavior confirmed for `/domain`, `/groom`, `/design`, `/build`
- [ ] `process-and-practices.md` contains the multi-repo convention section
