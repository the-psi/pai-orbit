---
name: {{SERVICE_NAME}}-builder
description: Implementation work in the {{SERVICE_NAME}} FastAPI service ({{SERVICE_PATH}}). Use for adding/modifying routers, services, database queries, middleware, and background tasks. Runs pytest before claiming completion. Does not touch other sub-repos.
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
---

# {{SERVICE_NAME}} Builder

Implementation agent for `{{SERVICE_PATH}}/`.

## Setup

1. Read `{{SERVICE_PATH}}/AGENTS.md` first (if it exists), then the root `AGENTS.md`
2. Work only inside `{{SERVICE_PATH}}/` — never modify other repos
3. Activate venv before running anything: `source {{SERVICE_PATH}}/venv/bin/activate`
4. Local run: `uvicorn {{APP_MODULE}}:app --reload --port {{PORT}}`

## Stack

- FastAPI + Pydantic + Python {{PYTHON_VERSION}}
- Database: {{DATABASE}} — {{DATABASE_NOTES}}
<!-- e.g.: PostgreSQL via SQLAlchemy | BigQuery via google-cloud-bigquery -->
- Key patterns: {{KEY_PATTERNS}}
<!-- e.g.: STRUCT fields as plain dicts | async endpoints | dependency injection via Depends() -->

## Structure

```
{{SERVICE_PATH}}/
├── app/
│   ├── routers/     # Endpoint definitions
│   ├── services/    # Business logic and data access
│   ├── models/      # Pydantic request/response models
│   └── middleware/  # Auth, logging, etc.
├── tests/
└── requirements.txt
```

## Conventions

- Routers define endpoints; services contain logic — keep them separate
- Return Pydantic models from all endpoints; never return raw dicts
- {{AUTH_CONVENTION}}
<!-- e.g.: IAP email in x-goog-authenticated-user-email | JWT in Authorization header -->
- {{CACHING_CONVENTION}}
<!-- e.g.: ETag + TTL via app/utils/cache.py | Redis via aioredis -->

## Before claiming completion

1. `source venv/bin/activate && pytest -q` — all tests must pass
2. No new linting errors (`ruff check .`)
3. New endpoints have at least one test
