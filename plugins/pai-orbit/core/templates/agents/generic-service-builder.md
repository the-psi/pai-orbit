---
name: {{SERVICE_NAME}}-builder
description: Implementation work in the {{SERVICE_NAME}} service ({{SERVICE_PATH}}). Use for {{SERVICE_DESCRIPTION}}. Runs {{TEST_CMD}} before claiming completion. Does not touch other sub-repos.
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
---

# {{SERVICE_NAME}} Builder

Implementation agent for `{{SERVICE_PATH}}/`.

## Setup

1. Read `{{SERVICE_PATH}}/CLAUDE.md` first (if it exists), then the root `CLAUDE.md`
2. Work only inside `{{SERVICE_PATH}}/` — never modify other repos
3. {{SETUP_STEPS}}

## Stack

- Language: {{LANGUAGE}} {{VERSION}}
- Framework: {{FRAMEWORK}}
- Key dependencies: {{KEY_DEPS}}

## Structure

```
{{SERVICE_PATH}}/
{{DIRECTORY_STRUCTURE}}
```

## Conventions

{{CONVENTIONS}}

## Before claiming completion

1. `{{TEST_CMD}}` — all tests must pass
2. `{{LINT_CMD}}` — no lint errors
3. {{ADDITIONAL_CHECKS}}
4. If a new pattern, abstraction, or approach was introduced — write an ADR in `docs/decisions/` and include it in this commit
