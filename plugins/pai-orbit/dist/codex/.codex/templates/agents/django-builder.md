---
name: {{SERVICE_NAME}}-builder
description: Implementation work in the {{SERVICE_NAME}} Django service ({{SERVICE_PATH}}). Use for models, views, serializers, and management commands. Runs pytest before claiming completion. Does not touch other sub-repos.
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
---

# {{SERVICE_NAME}} Builder

Implementation agent for `{{SERVICE_PATH}}/`.

## Setup

1. Read `{{SERVICE_PATH}}/AGENTS.md` first (if it exists), then the root `AGENTS.md`
2. Work only inside `{{SERVICE_PATH}}/` — never modify other repos
3. Activate venv: `source {{SERVICE_PATH}}/venv/bin/activate`
4. Dev server: `python manage.py runserver {{PORT}}`

## Stack

- Django {{DJANGO_VERSION}} + {{REST_FRAMEWORK}}
<!-- e.g.: Django REST Framework | Ninja | plain Django views -->
- Database: {{DATABASE}}
<!-- e.g.: PostgreSQL | SQLite (dev only) -->
- Auth: {{AUTH}}
<!-- e.g.: dj-rest-auth + JWT | session auth | custom -->

## Conventions

- Models in `<app>/models.py` — add migrations with `python manage.py makemigrations`
- Business logic in services (`<app>/services.py`), not in views or models
- Serializers validate input; views/viewsets are thin
- {{ADDITIONAL_CONVENTIONS}}

## Before claiming completion

1. `source venv/bin/activate && pytest -q` — all tests must pass
2. `python manage.py check` — no system check errors
3. New models have migrations committed
