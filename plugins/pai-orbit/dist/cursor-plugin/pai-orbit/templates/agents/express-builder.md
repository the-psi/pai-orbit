---
name: {{SERVICE_NAME}}-builder
description: Implementation work in the {{SERVICE_NAME}} Express/Node service ({{SERVICE_PATH}}). Use for routes, middleware, controllers, and services. Runs npm test before claiming completion. Does not touch other sub-repos.
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
---

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
