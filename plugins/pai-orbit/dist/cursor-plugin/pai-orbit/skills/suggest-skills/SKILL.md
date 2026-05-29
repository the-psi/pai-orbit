---
name: suggest-skills
description: Observe this project's working patterns and suggest operational skills worth adding as pai-orbit plugin skills/. TRIGGER when the user asks what skills to add, wants to improve their harness, or after several sessions of work. SKIP if the project is brand new with no history.
---

# Suggest Skills

Analyse working patterns and suggest new operational skills tailored to this project.

## What to look for

Read the following to identify recurring patterns:

1. **AGENTS.md and docs/** — what workflows are described but not yet skills?
2. **Git log** — what commit types recur? (`data:`, `ops:`, `chore:` commits often indicate recurring procedures)
3. **Existing `pai-orbit plugin skills/`** — what is already covered? Don't suggest duplicates
4. **`docs/wip/` session captures** — what multi-step procedures came up repeatedly?
5. **`docs/ops/`** — what field or operational procedures are documented but manual?

## Patterns that warrant a skill

A workflow deserves its own skill when it is:
- **Recurring** — comes up more than once or twice per sprint
- **Multi-step** — more than 3 steps, each dependent on the last
- **Error-prone** — easy to miss a step or run in the wrong order
- **Project-specific** — not covered by a generic pai-orbit skill

Common examples in software projects:
- **Data backfill** — re-running a pipeline for historical records with verification steps
- **Seed data** — inserting reference data with validation and dry-run
- **DB migration** — run, verify, rollback path
- **Feature flag management** — toggle flag states across environments
- **Domain review** — structured analysis of domain-specific data (e.g., a product's plots, a clinic's records)
- **Incident response** — check logs, identify scope, communicate status

## Output format

For each suggested skill, produce:

```
### /suggested-skill-name

**Why:** One sentence on the pattern observed (cite the evidence: git log, doc, session).
**Trigger:** When should Claude invoke it?
**Steps:** Rough multi-step outline of what the skill would do.
**Effort to build:** Low / Medium (how much project-specific knowledge needs to be encoded).
```

Rank by value: highest-impact suggestions first.

## After presenting suggestions

Ask: "Want me to scaffold any of these?" If yes, create the skill file at `pai-orbit plugin skills/<name>/SKILL.md` using `templates/skills/domain-operational.template.md` as the base pattern. Fill in what can be inferred; leave clear `<!-- TODO -->` markers for what the team needs to add.
