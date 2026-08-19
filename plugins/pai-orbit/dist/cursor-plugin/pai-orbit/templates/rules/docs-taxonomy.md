# Docs Taxonomy

Every document this project produces has **one** destination. This file is the routing table.

Adapt it to whatever taxonomy this project actually wants. What matters is not the specific rows
below — it is that a row exists for every artifact a mode can produce, so that no mode has to
guess and no directory becomes the place things land by default.

## Routing table

| Artifact | Destination | Filename |
|---|---|---|
| Requirements (`/groom`) | `docs/features/<feature>/` | `requirements.md` |
| Design (`/design`) | `docs/features/<feature>/` | `design.md` |
| UX notes (`/ux`) | `docs/features/<feature>/` | `ux.md` |
| Test plan (`/test`) | `docs/features/<feature>/` | `test-plan.md` |
| Impact analysis (`/analysis`) | `docs/features/<feature>/` | `analysis-<issue>-<date>.md` |
| Spike result | `docs/features/<feature>/` | `spike-N-findings.md` |
| Postmortem (`/incident`) | `docs/incidents/` | `postmortem-<slug>-<date>.md` |
| Runbook | `docs/ops/` | human-owned — the assistant never writes here |
| Data investigation (`/data`) | `docs/reports/` | `<topic>-<date>.md` |
| Codebase-wide audit | `docs/architecture/` | `<audit>-<date>.md` |
| ADR (`/arch`, `/design`) | `docs/decisions/` | per `.claude/rules/decisions.md` |
| Planning notes (`/plan`) | `docs/plans/` | `<topic>-<date>.md` |
| Epic (`/epic`) | `docs/epics/<name>/` | `EPIC.md` |
| Domain knowledge (`/domain`) | `docs/domain/` | `<topic>.md` — undated, edited in place |
| Session capture (`/build`), branch or PR review (`/review`), security review of a diff, architecture drift report (`/arch validate`), test-failure note (`/test`) | `docs/wip/` | existing prefixes |

**This file wins over a mode's own default.** Modes carry a hardcoded destination for the common
case; when the two disagree, this table is the answer. Record any deliberate override here — for
example a project that numbers ADRs sequentially rather than by date.

## The `wip/` test

`wip/` is not "everything not yet finished", and it is not the place a mode writes when it has
nowhere better. Ask:

> **Is this dead once the branch merges or the session resumes?**

- **Yes** → `wip/`. A review of a diff, a session handoff, a point-in-time drift report.
- **No** → it has a subject. File it with the subject.

Avoid the word *ephemeral*. It describes an intent, and nobody can route a file on an intent. The
question above is answerable; the adjective is not.

**Unresolved beats subject.** A document whose content is open questions stays in `wip/` even when
it plainly has a subject — a review companion full of unanswered questions, a design still being
argued. Filing it beside a finished artifact implies a completeness it does not have. Route it
when the questions are answered, not before.

**No feature folder?** An impact analysis normally belongs beside the requirements it informed. If
the change has no feature folder and does not warrant one — a dependency bump, a CI sweep — then
it genuinely is short-lived: `wip/`, and retention takes it.

## Retention

Without a trigger, nothing is ever swept. Bind the sweep to an event that already happens — the
natural one is **`/release`**, because that is when issues close.

At `/release`, for each file in `wip/`:

- Has a `Related issue: #N` field → resolve by that issue's state.
- No issue field → resolve by the branch or feature it names instead: still in progress → open;
  merged, shipped, or abandoned → closed.

Then:

- Still open → leave it.
- Closed, content is dead → move to `wip/archive/`.
- Closed, content is still true and has a subject → promote it to the subject
  folder instead of archiving.

Nothing is deleted. `wip/archive/` is the floor.

## Why this file exists

Without a routing table, `wip/` becomes the sink for every mode that has no better destination —
`/incident`, `/review`, `/analysis`, `/arch`, `/test` and `/build` all default there. A directory
that is every mode's default cannot also be a directory with a meaning.

Two failure modes are worth naming because they are structural rather than anyone's discipline:

- **An artifact with no legal home.** If postmortems are written to `wip/` while `ops/` is
  human-owned, they can be neither routed nor promoted, and they accumulate. Give every artifact a
  directory the assistant is allowed to write to.
- **No lifecycle.** "Do not delete docs" is a prohibition on cleanup, not a lifecycle. Without a
  sweep bound to a real event, archiving happens by hand, rarely, and only to whatever the person
  doing it happens to notice.
