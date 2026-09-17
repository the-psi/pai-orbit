---
name: {{SKILL_NAME}}
description: {{SKILL_DESCRIPTION}} TRIGGER when {{TRIGGER_CONDITIONS}}. SKIP {{SKIP_CONDITIONS}}.
---

# {{SKILL_TITLE}}

<!-- Domain-operational skill template.
     Use for recurring, multi-step procedures that are too specific for a generic mode
     but come up often enough to deserve a skill. Examples: data backfill, seed data,
     schema migration, domain review, incident response. -->

{{CONTEXT_PARAGRAPH}}
<!-- One paragraph: what this procedure is, when it's needed, and what it produces. -->

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

<!-- Any gotchas, edge cases, or constraints the engineer must know. -->
- {{NOTE_1}}
