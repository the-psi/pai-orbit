---
applyTo: "**/docker-compose.yml, **/docker-compose.yaml, **/package.json, **/go.mod, **/pom.xml, **/Cargo.toml, **/pyproject.toml, **/requirements.txt, **/fly.toml, **/vercel.json, **/app.yaml, **/main.py, **/app.py, **/index.ts, **/index.js, **/server.ts, **/server.js"
---

# Architectural drift guard

This file just changed or is about to change. It is a **structural signal** — its edits often reflect architectural changes (dependencies added, services moved, framework swapped, runtime configured).

Before proposing or accepting an edit here:

1. Confirm the change is actually needed — not a side-effect of an unrelated task.
2. Note that this change may shift architecture. Suggest the user run `/arch validate` after the session to check alignment with `docs/architecture/system.md` and `docs/architecture/constraints.md`.
3. Cross-check `docs/architecture/constraints.md` if it exists — the constraint may forbid the change.
4. If the edit adds a new service, language, or major dependency, suggest writing an ADR in `docs/decisions/` before merging.

This is advisory — proceed if the user confirms, but make the architectural cost visible.
