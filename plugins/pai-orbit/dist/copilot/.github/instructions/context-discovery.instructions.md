---
applyTo: "**/*"
---

# Context discovery — fall-back

If `.github/copilot-instructions.md` is loaded, you already have these directives from its `## Context discovery` section. This file duplicates the directives so they reach Copilot via two channels — instructions files (auto-attach) and the always-loaded instructions file.

At session start, read each of the following that exists. If absent, proceed without — do not invent contents.

1. `.copilot/pai-orbit-config.md` — board, branch model, deploy targets, docs home, team conventions
2. `.copilot/team.md` — team members, owners, default assignees
3. `CLAUDE.md` — project description, stack, key files, data model, auth
4. `docs/architecture/constraints.md` — architectural rules
5. `docs/architecture/system.md` — service inventory and inter-service communication
6. `docs/architecture/stack.md` — language and framework choices
7. `docs/decisions/` — ADRs
8. `docs/domain/*.md` — business rules and expert knowledge
9. `docs/features/<feature>/requirements.md` — when working on a known feature

When the user asks a project-specific question (deploy target, team owner, architecture rule, business rule), answer from these files. Do not fall back to generic knowledge unless the user explicitly asks for a generic answer.
