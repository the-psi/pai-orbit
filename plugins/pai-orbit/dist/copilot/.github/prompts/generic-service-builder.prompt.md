---
mode: agent
description: "[agent] Generic service implementation — adapt to project conventions; runs the project's test command before claiming done."
tools: ["codebase", "editFiles", "runCommands", "search"]
---

> **Generic template — resolved at runtime.** The `{{SERVICE_NAME}}`, `{{SERVICE_PATH}}`, `{{LANGUAGE}}`, `{{FRAMEWORK}}`, and other `{{PLACEHOLDER}}` markers below are NOT substituted at install time. Copilot's agent runtime resolves them per invocation by reading `AGENTS.md` and detecting the target service context (in a monorepo: the service whose folder contains the files currently being edited).
>
> Do not hand-fill the markers — they are substitution points, not blanks to complete. If Copilot cannot resolve a marker (ambiguous service context in a monorepo, missing `AGENTS.md` service table, unclear stack), it will ask you to disambiguate before proceeding.


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
