---
mode: agent
description: "[agent] Express/Node service implementation — routes, middleware, controllers, services. Runs npm test before claiming done."
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
3. Dev server: `npm run dev` (port {{PORT}})

## Stack

- Node.js + Express + TypeScript
- Database: {{DATABASE}}
<!-- e.g.: PostgreSQL via pg/Knex/Prisma | MongoDB via Mongoose | SQLite -->
- Auth: {{AUTH}}
<!-- e.g.: JWT via jsonwebtoken | Passport.js | custom middleware -->

## Structure

```
{{SERVICE_PATH}}/
├── src/
│   ├── routes/       # Express route definitions
│   ├── controllers/  # Request handlers (thin)
│   ├── services/     # Business logic
│   ├── models/       # DB models / Prisma schema
│   ├── middleware/   # Auth, error handling, validation
│   └── types/        # TypeScript interfaces
└── tests/
```

## Conventions

- Controllers are thin — delegate to services
- Validate request bodies with {{VALIDATION_LIB}}
<!-- e.g.: zod | joi | express-validator -->
- All async route handlers wrapped in error-catching middleware
- {{ADDITIONAL_CONVENTIONS}}

## Before claiming completion

1. `npm test` — all tests must pass
2. `npm run lint` — zero warnings
3. `npm run build` — no type errors
