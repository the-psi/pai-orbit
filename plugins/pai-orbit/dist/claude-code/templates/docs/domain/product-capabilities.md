# Product Capabilities

**What this file is:** the single reference for *what the product does today*, organised by
product surface. Read it to answer "does this product already do X, and where does X live?"

**What it is not:** a changelog (that's git and the task board), a design record (that's
`docs/decisions/` and `docs/features/`), or a task list (that's the task board).

Maintained by `/build` after every ship. Read by `/plan`, `/groom`, and `/domain`.

## How to maintain it

- **Order is by surface, never by date.** Put a new capability in the section for the surface
  it appears on, appended next to the capabilities it relates to. **Never prepend to the top of
  the file** — a file maintained newest-first stops being a capability reference and becomes a
  build log, which no longer answers "what does the product do today?".
- **One capability, one entry.** If a change extends something already documented, edit that
  entry in place. Only add a new `###` when the capability genuinely did not exist before. Do
  not add a second entry for "phase 2" of something already described.
- **Present tense, capability voice.** Describe what the system does now, not what a PR did.
  Provenance belongs in the heading: `### Capability name (built YYYY-MM-DD, #N — ADR NNN)`.
- **Flag anything built but dark** with a bolded `**Not live:**` line naming the exact gate —
  feature flag, third-party approval, ops prerequisite, unresolved domain question.
  `grep -n "Not live:"` is how anyone answers "what is shipped in code but off in production?";
  a gate recorded any other way is invisible to that question.
- **The backlog table holds unshipped work only.** When something ships, move its detail up into
  a capability section and **delete the row** — never strike it through. Struck-through rows
  accumulate into a second, competing registry of the same facts.
- **Do not restructure the sections** as a side effect of a build. Changing the spine of this
  file is a deliberate, agreed change.

> Last updated: <!-- YYYY-MM-DD + one-line summary of the change -->

---

## Contents

<!-- Replace these with this product's actual surfaces — the axis that stays stable as the
     product grows. Group by who meets the capability (each user-facing surface, then the
     internal ones), not by which repo or service implements it. Keep this table in sync with
     the ## sections below. -->

| # | Surface | Covers |
|---|---------|--------|
| [1](#1-surface-name) | Surface name | Short list of the areas this section covers |
| [2](#2-surface-name) | Surface name | … |

---

## 1. Surface name

> One line: what this surface is and who meets it.

### Capability name (built YYYY-MM-DD, #N — ADR NNN)

What the product does now, in the present tense. Endpoints, tables, flags, and files that a
reader needs in order to find it. Keep the detail that is load-bearing; link out to
`docs/features/<feature>/` and `docs/decisions/` for the full design rather than restating it.

**Not live:** the exact gate, if this is built but dark. Delete this line when it goes live.

---

## 2. Surface name

> One line: what this surface is and who meets it.

---

## Not Yet Shipped

Open work only — anything shipped lives in a capability section above. Authoritative status is
the task board; this table is a reading aid for capability gaps, not a task list.

| Feature | Epic | Priority | Blocker |
|---------|------|----------|---------|
|         |      |          |         |
