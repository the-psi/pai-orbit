---
mode: agent
description: "[mode] Analyse this project's workflows and propose invokable skills (git log + docs review). Scaffolds to .github/prompts/."
tools: ["codebase", "editFiles", "runCommands", "search"]
---

> **Agent-mode prompt (Copilot-adapted).** On Copilot Pro/Business this runs as a multi-step agent that reads `CLAUDE.md`, `docs/`, `git log`, `.github/prompts/`, `docs/wip/`, and `docs/ops/` to identify workflow patterns worth encoding as skills. On Copilot Free it degrades to advisory text.
>
> **Copilot-adapted target:** when scaffolding a suggested skill, write it as a Copilot prompt file at `.github/prompts/<suggested-name>.prompt.md` (NOT `.claude/skills/<name>/SKILL.md` — that is the Claude Code target).
>
> **When scanning existing skills to avoid duplicates,** look in `.github/prompts/*.prompt.md`. Ignore prompt files whose `description:` starts with `[mode]` or `[agent]` (those are pai-orbit modes/agent prompts, not skills). Also ignore user-authored prompts without pai-orbit prefixes only if their names clearly overlap with a suggestion.
>
> **Skip the "Claude Code built-in suggest-skills" step** — Copilot has no equivalent introspection surface. Do the file-based analysis directly.

## Skill template (base pattern for scaffolding)

When the user picks a suggestion to scaffold, use this template shape. Substitute each `{{PLACEHOLDER}}` with the real value inferred from your analysis; leave `<!-- TODO -->` markers only where the team genuinely needs to fill in project-specific detail.

````markdown
---
agent: agent
description: "[skill] {{SKILL_DESCRIPTION}} TRIGGER when {{TRIGGER_CONDITIONS}}. SKIP {{SKIP_CONDITIONS}}."
---

# {{SKILL_TITLE}}

<!-- Domain-operational skill. Multi-step procedure too specific for a generic mode
     but recurring enough to deserve its own invokable prompt. Examples: data backfill,
     seed data insertion, schema migration, domain review, incident response. -->

{{CONTEXT_PARAGRAPH}}
<!-- One paragraph: what the procedure is, when it is needed, what it produces. -->

## Prerequisites

<!-- What must be true before running this skill? -->
- {{PREREQ_1}}
<!-- e.g.: Authenticated with gcloud | Database connection active | Tests passing -->

## Steps

### 1. {{STEP_1_NAME}}

<!-- What to do, and why. Include commands where applicable. -->
{{STEP_1_DETAIL}}

```bash
# Example command
{{EXAMPLE_CMD_1}}
```

### 2. {{STEP_2_NAME}}

{{STEP_2_DETAIL}}

### 3. Verify

<!-- What does success look like? How do you confirm the procedure completed correctly? -->
{{VERIFICATION_DETAIL}}

```bash
# Verification command
{{VERIFY_CMD}}
```

## Dry run

<!-- If applicable: how to test this procedure without committing changes. -->
{{DRY_RUN_INSTRUCTIONS}}

## Rollback

<!-- What to do if something goes wrong mid-procedure. -->
{{ROLLBACK_INSTRUCTIONS}}

## Notes

<!-- Gotchas, edge cases, or constraints the engineer must know. -->
- {{NOTE_1}}
````

You are now in SUGGEST SKILLS MODE.

Analyse this project's working patterns and suggest operational skills worth adding as `.github/prompts/`. This mode **extends** Claude Code's built-in suggest-skills capability — apply all standard Claude Code suggest-skills analysis first, then layer the project-specific analysis below on top. Do not replace or skip the built-in behaviour.

Switch out when:
- Suggestions are presented and user wants to scaffold one → remain in this mode to scaffold it
- Session is complete

---

## What to look for

Read the following to identify recurring patterns:

1. **CLAUDE.md and docs/** — what workflows are described but not yet skills?
2. **Git log** — what commit types recur? (`data:`, `ops:`, `chore:` commits often indicate recurring procedures)
3. **Existing `.github/prompts/`** — what is already covered? Don't suggest duplicates
4. **`docs/wip/` session captures** — what multi-step procedures came up repeatedly?
5. **`docs/ops/`** — what field or operational procedures are documented but manual?

## Patterns that warrant a skill

A workflow deserves its own skill when it is:
- **Recurring** — comes up more than once or twice per sprint
- **Multi-step** — more than 3 steps, each dependent on the last
- **Error-prone** — easy to miss a step or run in the wrong order
- **Project-specific** — not covered by a generic pai-orbit skill or Claude built-in

Common examples in software projects:
- **Data backfill** — re-running a pipeline for historical records with verification steps
- **Seed data** — inserting reference data with validation and dry-run
- **DB migration** — run, verify, rollback path
- **Feature flag management** — toggle flag states across environments
- **Domain review** — structured analysis of domain-specific data (e.g., a product's plots, a clinic's records)

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

Ask: "Want me to scaffold any of these?" If yes, create the skill file at `.github/prompts/<name>.prompt.md` using the skill template shown in the preamble above. Fill in what can be inferred; leave clear `<!-- TODO -->` markers for what the team needs to add.
