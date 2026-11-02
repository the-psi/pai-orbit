---
name: process-map
description: To-be business process modelling — true swimlane diagrams (roles and systems as lanes, phases as columns, permanent step IDs) from a JSON spec in docs/processes/, as a high-level solution blueprint. TRIGGER when a solution is shaped by a business process spanning several actors or systems rather than a single user journey, or when asked to map, draw or redraw a process. SKIP single-actor rules or definitions (use /domain), screen-level user flows (use /ux), and API or data design (use /design).
---

# Process Map

Model how a business process **will** work once the solution exists — who does what, in which system, in what order, and what happens when it goes wrong. A to-be process map is a solution-shaping exercise: drawing lanes and hand-offs forces the high-level solution into view before any feature is groomed.

Use this where processes, not user journeys, drive the solution — back-office operations, multi-party workflows, integrations, approvals, settlements, fulfilment. Where one user's journey through screens drives the solution, use `/ux` instead.

Reads from:
- `<docs root>/domain/` — `domain-knowledge.md`, `rule-engine.md`, and any other domain files: actors, business rules, constraints
- `<docs root>/architecture/system.md` — systems that already exist (if declared)
- `<docs root>/processes/` — existing specs and `INDEX.md`, for step-ID continuity, L1/L2 placement, and overlap
- `<docs root>/epics/` — the parent epic, if the process belongs to one
- An as-is description the user provides (notes, a document, an existing diagram) — optional baseline

Writes to `<docs root>/processes/`:

```
processes/
├── specs/<slug>.json   source of truth — one per process; the only diagram file edited by hand
├── svg/<slug>.svg      true swimlane diagram (generated)
├── <slug>.md           narrative + solution implications (hand-written) + generated diagram, Mermaid preview, step table
├── INDEX.md            register of every process map (generated)
└── _render/swimlane.py renderer — vendored by /setup, project-owned
```

Resolve the docs root per `reference/docs-path-resolution.md` (config: `.codex/pai-orbit-config.md → ## System Docs`) before reading or writing. A to-be process usually crosses services, so in a multi-repo setup it belongs in the system docs root.

---

## Discuss, then specify, then render

A rendered diagram looks authoritative the moment it exists, and people anchor on its shape even when it was a guess. Getting the structure right is the work; the SVG is typesetting. So:

1. **Agree the shape in words first** — trigger, outcome, lanes, phases.
2. **Surface every modelling choice instead of silently picking one** — which lane owns a step, whether something is a precondition or a step, how a requirement spanning two actors splits. State the options, get a decision, move on.
3. **Write the spec and walk it back narratively** before rendering. Fix what is wrong in the spec, not in the picture.
4. **Render, then look at it** — see Rendering.
5. **Update the narrative and index** as part of finishing, not afterwards.

## Operations

### `create`
Usage: `/process-map create <process-name> [source]`

`source` is optional: a domain doc path or section (e.g. `docs/domain/domain-knowledge.md#settlement`) or an epic name. With no source, read all of `<docs root>/domain/`.

1. **Check for overlap.** Read `<docs root>/processes/INDEX.md` and existing specs. If another map covers adjacent ground, say so and agree with the user whether the new one extends, sits alongside, or supersedes it.
2. **Extract before asking.** Propose, in one block, citing the domain source behind each item and marking anything inferred as `proposed`:
   - **Hierarchy** — L1 (value chain area) › L2 (process group) › L3 (this process); reuse L1/L2 names already in the index
   - **Prefix** — 2–8 uppercase characters for step IDs (e.g. `OTC`)
   - **Trigger** and **outcome**
   - **Scope** — in and out
   - **Lanes** — every role, team, and system. Systems are tagged `existing` (declared in `system.md`) or `new`; third parties are `external`.
   - **Phases** — 3–6 columns, the first usually `0 · PRE-REQUISITES`

   Wait for confirmation before going further.
3. **Walk the happy path** one lane-hand-off cluster at a time: actor lane, phase, action, and the rule behind it (`cite`). Confirm each cluster before moving on.
4. **Walk the exceptions.** At each decision and each system-to-system hand-off, ask what happens on failure, timeout, or rejection. An exception nobody can answer becomes an `open` step with an open question — never a guessed path.
5. **Write the spec** to `<docs root>/processes/specs/<slug>.json` (schema below). Read it back to the user as a numbered narrative; correct it until it is agreed.
6. **Render** (see Rendering) and look at the result.
7. **Write the narrative** in `<docs root>/processes/<slug>.md` from `templates/docs/processes/PROCESS.md` — summary, solution implications, baseline, open questions. The diagram, Mermaid preview, and step table live between the generated markers and are written by the renderer; never edit them by hand.
8. **Derive solution implications** — the reason to model to-be; do not skip it:
   - **Integration points** — every hand-off between two system lanes → candidate interface for `/design`
   - **Architecture gaps** — every `new` system lane, and any `existing` system asked to do something `system.md` does not declare → `/arch update`
   - **Automation and control points** — manual steps, approvals, re-keying between systems, SLAs
   - **Feature slices** — groups of step IDs that make a sensible feature → `/groom`
9. Show the narrative file, write it after confirmation, and regenerate the index.

### `update`
Usage: `/process-map update <process-name>`

1. Read the spec and the narrative.
2. Ask what changed, or review the conversation for new decisions.
3. Present a numbered diff against the spec — steps added, changed, or retired; lanes; edges; implications affected. Wait for confirmation, then edit the spec and re-render.
4. When a whole map is replaced, set `status: "superseded"` and `superseded_by` on the old spec and keep it — never delete a superseded map.

### `trace`
Usage: `/process-map trace <process-name>`

No writes. Read the spec, then scan `<docs root>/features/*/requirements.md` and `design.md` for its step IDs. Print: Step ID | Step | Features citing it. List steps no feature covers, and cited IDs that are retired or do not exist.

If no operation is given, ask which: create, update, or trace. If `create` targets a process that already has a spec, switch to `update`.

---

## Spec schema

```json
{
  "process": "Order to cash",
  "prefix": "OTC",
  "hierarchy": ["Revenue", "Order management", "Order to cash"],
  "status": "draft",
  "phases": ["0 · PRE-REQUISITES", "1 · ORDER CAPTURE", "2 · CREDIT & FULFILMENT", "3 · BILLING"],
  "lanes": [
    {"id": "cust",   "name": "Customer",         "type": "role"},
    {"id": "sales",  "name": "Sales ops",        "type": "team"},
    {"id": "crm",    "name": "CRM",              "type": "system", "status": "existing"},
    {"id": "credit", "name": "Credit service",   "type": "system", "status": "new"},
    {"id": "psp",    "name": "Payment provider", "type": "external"}
  ],
  "steps": [
    {"id": "OTC-P1", "lane": "crm", "phase": 0, "kind": "precondition", "text": "PRE-REQ: account onboarded with credit limit", "confidence": "agreed", "cite": "domain-knowledge.md#onboarding"},
    {"id": "OTC-1", "lane": "cust", "phase": 1, "kind": "start", "text": "Customer places order", "confidence": "agreed"},
    {"id": "OTC-2", "lane": "crm", "phase": 1, "text": "Capture order, validate pricing", "confidence": "agreed", "cite": "rule-engine.md#pricing"},
    {"id": "OTC-3", "lane": "credit", "phase": 2, "kind": "decision", "text": "Within credit limit?", "confidence": "proposed", "cite": "domain-knowledge.md#credit"},
    {"id": "OTC-3.1", "lane": "sales", "phase": 2, "text": "Manual credit review", "confidence": "open", "cite": "OQ-2: who owns overrides?"}
  ],
  "edges": [
    {"from": "OTC-P1", "to": "OTC-2", "type": "dep", "label": "pre-req"},
    {"from": "OTC-1", "to": "OTC-2", "type": "flow"},
    {"from": "OTC-2", "to": "OTC-3", "type": "flow"},
    {"from": "OTC-3", "to": "OTC-3.1", "type": "exception", "label": "over limit"}
  ],
  "footer": "Draft · to-be"
}
```

| Field | Rules |
|-------|-------|
| `lanes[].type` | `role` (person or customer), `team` (internal, human-in-the-loop), `system` (needs `status`: `existing` / `new`), `external` (third party). Colour is derived from type and status — specs do not pick colours. A project may add `"palette": {"<cls>": ["<fill>", "<stroke>"]}` and set `cls` on a lane or step to keep a house style. |
| `steps[].id` | `<PREFIX>-<n>`, `<PREFIX>-<n>.<m>` for a sub-step or exception branch, `<PREFIX>-P<n>` for preconditions (and only preconditions). Permanent — see Rules. |
| `steps[].lane` / `phase` | Lane `id`; zero-based phase index. Several steps in one cell stack vertically. |
| `steps[].kind` | `task` (default), `start`, `end`, `decision`, `precondition`. A precondition is something that must already be true; it is not a flow step and its ID is not shown on the box. |
| `steps[].text` | At most 3 lines of 42 characters. Put detail in `note`, not on the box. |
| `steps[].confidence` | `agreed` (solid border), `proposed` (dashed, the default), `open` (dotted, red `OPEN` tag). |
| `steps[].cite` | The source behind the step — a domain doc anchor, ADR, requirement number, or open-question ID. Expected on every task and decision. |
| `steps[].status` | `retired` removes the step from the diagram but keeps it in the step table. |
| `edges[].type` | `flow` (main sequence), `dep` (dependency, pre-req, parallel trigger), `exception` (failure / rejection path). Labels are a few words; they do not wrap. |
| `status` / `superseded_by` | `draft`, `agreed`, or `superseded` (with the slug of the replacement). |

**Modelling conventions:**
- **One requirement spanning two actors becomes two linked steps**, not one step credited to both. Give both the same `cite`.
- **Preconditions** sit in phase 0, connected to the first step they gate by a `dep` edge labelled `pre-req`.
- **Lane order follows the work** — the lane that starts the process at the top, external parties usually at the bottom.
- **Keep one map to about 25 steps.** Past that, split a sub-process into its own spec and reference it from one step's `note`.

## Rendering

The renderer is `<docs root>/processes/_render/swimlane.py` — Python 3.8+, standard library only:

```bash
python3 <docs root>/processes/_render/swimlane.py check specs/<slug>.json   # validate
python3 <docs root>/processes/_render/swimlane.py build specs/<slug>.json   # check + svg + refresh <slug>.md generated block
python3 <docs root>/processes/_render/swimlane.py index <docs root>/processes
```

- **Run `check` after every spec edit** and fix every `PROBLEM`; read the warnings and use judgement. `build` refuses to render a spec with problems.
- **Then look at the SVG.** A clean check does not catch two edge labels landing on each other or a connector crossing an unrelated box. If you can view images, convert the SVG to PNG and view it; otherwise ask the user to open it. Fix layout by reordering lanes, moving steps between phases, or splitting a crowded phase.
- **Renderer missing** (project set up before pai-orbit 1.10.0): copy it from pai-orbit's `templates/docs/processes/_render/swimlane.py` into `<docs root>/processes/_render/`. If the plugin files are not reachable from this tool, ask the user before downloading it from `https://raw.githubusercontent.com/the-psi/pai-orbit/main/plugins/pai-orbit/core/templates/docs/processes/_render/swimlane.py`.
- **No Python available:** run `check`'s rules by hand, write the Mermaid preview block yourself in the same shape the renderer emits (one `subgraph` per lane), and tell the user the SVG was not generated.
- The renderer is project-owned once vendored. Projects may change layout or palette, but must keep the spec schema stable so `trace` and other projects' tooling still read it.

## Session close

1. **Commit** the spec, SVG, narrative, and index with `/git`: `docs: process-map <slug>`. Local commit only.
2. **Hand off.** Suggest the next mode for each implication: `/groom` for feature slices (cite step IDs in each `requirements.md`), `/design` for integration points, `/domain` for rules the map exposed as missing. For architecture: if `<docs root>/architecture/system.md` is not yet populated and the system is greenfield, `/arch define` (it derives system context and decomposition from these maps); otherwise `/arch update` (it detects the changed map and assesses its impact).
3. **Offer to push.** Ask: "Push this branch to remote?" Wait for explicit confirmation.

## Rules

- **The spec is the source of truth.** Never hand-edit the SVG or the generated block in `<slug>.md`; change the spec and rebuild.
- **Step IDs are permanent.** Never renumber. New steps take the next free number; a removed step gets `"status": "retired"`, so features that cite it can still be traced.
- **To-be is the default.** An as-is baseline is optional context in the narrative's Baseline section — never mixed into the to-be spec.
- **Stay at process altitude.** No screen design (`/ux`), no API shapes or data models (`/design`), no technology choices (`/arch`). Record such decisions as implications and move on.
- **Flag contradictions.** A to-be step that conflicts with a domain rule or a constraint in `<docs root>/architecture/constraints.md` is a risk, not a detail — surface it.
- **Recommend, then wait.** When asked to merge, split, retire, or supersede maps, analyse and recommend, but change nothing until the user confirms — map changes ripple into requirements and designs.
- Never write a spec or narrative without showing it and getting confirmation first.

---

## Appendix: docs path resolution

Referenced above as `reference/docs-path-resolution.md` — inlined here since Codex skills are flat files with no sibling-file lookup:

# Docs path resolution

Shared by every mode, skill, and agent that reads or writes project docs. Resolve once per session, reuse for every read and write in that session.

## Config

Read `.codex/pai-orbit-config.md`. If a `## System Docs` section is present, it defines `system_docs_repo` and `system_docs_path` (default `.`).

## Resolve the docs root

- No `## System Docs` section → docs root is local `docs/`.
- `system_docs_repo` is a relative path → check whether `<system_docs_repo>/<system_docs_path>` exists **and** contains at least one of the expected subdirectories (`architecture/`, `decisions/`, `domain/`, `processes/`, `features/`, `plans/`, `wip/`, `backlog/`, `reports/`, `epics/`, `ops/`). A directory that exists but holds none of these is a stale pointer, not a docs root.
  - Passes → docs root is `<system_docs_repo>/<system_docs_path>`.
  - Fails → warn once ("System docs path unreachable — continuing with local docs only") and docs root is local `docs/`.
- `system_docs_repo` is a git URL → same check against a local clone at a resolvable path. Passes → docs root is `<clone-path>/<system_docs_path>`. Fails → warn once and docs root is local `docs/`.

## Reads

Add the resolved docs root to the doc read set before starting the session.

## Writes

Every write targets `<docs root>/<relative path>` — never a hardcoded `docs/…` literal, and never with an extra interpolated `docs/` segment. The docs root already *is* the docs directory, local or remote.

Examples: `<docs root>/backlog/feature-ideas.md`, `<docs root>/features/<feature>/design.md`, `<docs root>/decisions/YYYY-MM-DD-<slug>.md`, `<docs root>/wip/session-capture-<date>.md`.

When `system_docs_path: .` (a docs repo flattened to its root), `<docs root>` is the repo root itself — writes land at `<system_docs_repo>/decisions/…`, not `<system_docs_repo>/docs/decisions/…`.
