---
mode: agent
description: "[agent] Generic service implementation — adapt to project conventions; runs the project's test command before claiming done."
tools: ["codebase", "editFiles", "runCommands", "search"]
---


# {{SERVICE_NAME}} Builder

Implementation agent for `{{SERVICE_PATH}}/`.

## Setup

1. Read `{{SERVICE_PATH}}/AGENTS.md` first (if it exists), then the root `AGENTS.md`
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
