---
name: "suggest-skills"
description: "Recommend which pai-orbit skill or mode fits the user's current problem. Use when unsure what to invoke or wanting a guided walkthrough of the framework. Explicit invocation only."
---

You are now in SUGGEST SKILLS MODE.

Analyse this project's working patterns and suggest operational skills worth adding as `.agents/skills/`. This mode **extends** Claude Code's built-in suggest-skills capability — apply all standard Claude Code suggest-skills analysis first, then layer the project-specific analysis below on top. Do not replace or skip the built-in behaviour.

Switch out when:
- Suggestions are presented and user wants to scaffold one → remain in this mode to scaffold it
- Session is complete

---

## What to look for

Read the following to identify recurring patterns:

1. **AGENTS.md and docs/** — what workflows are described but not yet skills?
2. **Git log** — what commit types recur? (`data:`, `ops:`, `chore:` commits often indicate recurring procedures)
3. **Existing `.agents/skills/`** — what is already covered? Don't suggest duplicates
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

Ask: "Want me to scaffold any of these?" If yes, create the skill file at `.agents/skills/<name>/SKILL.md` using `templates/skills/domain-operational.template.md` as the base pattern. Fill in what can be inferred; leave clear `<!-- TODO -->` markers for what the team needs to add.

---

## Codex-specific skill invocation (appended by the Codex adapter)

Codex CLI has a different skill-discovery model than Claude Code. Notes on how "loading" a skill in Claude Code maps onto Codex behaviour:

- In Claude Code, `$suggest-skills` loads skills into the session so they can be called explicitly. On Codex, all skills at `.agents/skills/<name>/` are always discoverable — no explicit "load" step.
- **Operational skills** (`analysis`, `board`, `data-model`, `epic`, `git`, `simplify`) can be invoked two ways:
  - Explicitly, by typing `$skill-name` in the composer.
  - Implicitly, when the description matches your natural-language prompt. Codex chooses which skill to fire based on the `description` field in each skill's frontmatter. When the user says "commit these changes", Codex sees `git`'s description and invokes it automatically.
- **Mode skills** (`arch`, `build`, `data`, `design`, `domain`, `groom`, `incident`, `orbit-plan`, `orbit-review`, `release`, `setup`, `suggest-skills`, `test`, `ux`) are **explicit-only**. They ship with `agents/openai.yaml` `policy.allow_implicit_invocation: false`, which means Codex will not fire them on description match — you have to type `$mode-name` to enter that headspace. This is intentional: modes are deliberate context switches, not something to trigger by accident.
- The `$suggest-skills` skill itself is a mode skill (implicit off). Invoke it explicitly when you want a guided walkthrough of which skill applies to your current problem.

### Rename note (Codex-only)

- Claude Code's **/plan** mode is shipped as `$orbit-plan` on Codex — invoke as `$orbit-plan`.
- Claude Code's **/review** mode is shipped as `$orbit-review` on Codex — invoke as `$orbit-review`.

Both renames avoid ergonomic overlap with Codex's built-in **/plan** and **/review** slash commands.

### Skills-list budget

Codex's initial skills list is capped at roughly 2% of the model's context window (~8,000 characters when the context window is unknown). Codex auto-shortens skill descriptions when the initial roster exceeds this budget. pai-orbit ships 20 skills; the adapter's build step already ensures the total description sum stays under 8000 chars, so you should never see runtime truncation. If a description in `/skills` looks cut off, that's Codex's own shortening — the full text still lives in the skill's `SKILL.md`.
