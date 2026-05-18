# Multi-Repo Docs

**Status:** Draft
**Owner:** Punit Singhal
**Last Updated:** 2026-05-12

## Summary
Enable PAI-Orbit to manage documentation across service repos and a central system repo, supporting microservices projects with cross-cutting concerns.

## Requirements
1. `pai-orbit-config.md` template gains a `## Docs` section with `local_docs_root` and optional `system_docs_repo` / `system_docs_path`
2. `/setup` skill asks during init whether the project is multi-repo and writes the pointer
3. `/plan` and `/domain` commands read from the system repo path when the pointer is set
4. `/build` command determines whether doc updates are local or system-level
5. `process-and-practices.md` documents the convention for what belongs in service repos vs the system repo

## User Stories
- As a developer in a microservices project, I want PAI-Orbit to know where system-level docs live, so that `/plan` and `/domain` sessions have the full picture without manual path hunting.
- As a team lead, I want cross-cutting ADRs and epics to have a designated home, so that they don't get lost in an arbitrary service repo.

## Features
| Feature | Status |
|---------|--------|
| multi-repo-docs-config | Shipped |

## Success Metrics
- `/setup` correctly writes a `system_docs_repo` pointer when answering "yes" to multi-repo prompt
- `/plan` and `/domain` sessions read system docs without manual configuration
- Convention documented and clear enough that teams don't debate "where does this doc go?"

## Decisions
<!-- Decisions made during this epic's lifetime -->

## Open Questions
- [ ] Should `system_docs_repo` support git URLs in addition to relative paths? — owner: Punit Singhal
- [ ] Which existing commands need awareness of the system repo beyond `/plan`, `/domain`, and `/build`? — owner: Punit Singhal
