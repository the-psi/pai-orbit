---
mode: agent
description: "[agent] Django service implementation — models, views, serializers, management commands. Runs pytest before claiming done."
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
