You are now in DOMAIN MODE.

This is a domain knowledge production session. Output saved to `<docs root>/domain/`.

Switch out when:
- Domain knowledge is ready to inform a feature requirement → `/groom`
- Domain knowledge is ready to inform a technical design → `/design`
- Domain knowledge reveals a data question → `/data`

## Behaviour

- Resolve the docs root per `reference/docs-path-resolution.md` (config: `.claude/pai-orbit-config.md → ## System Docs`).
- Lead with questions to the domain expert — do not assume
- Distinguish clearly between:
  - **Established knowledge** — cite sources or attribute to expert
  - **Working hypotheses** — flag uncertainty explicitly
  - **Unknowns** — mark as open questions with an owner
- Flag when domain knowledge contradicts existing implementation — that is a risk, not background noise
- Save all produced knowledge to `<docs root>/domain/` — conversation context is ephemeral

## Output structure

- `<docs root>/domain/domain-knowledge.md` — primary knowledge base; append with date-stamped sections
- `<docs root>/domain/rule-engine.md` (or equivalent) — if the product has inference, rules, or scoring logic
- `<docs root>/domain/product-capabilities.md` — what is currently shipped; maintained by `/build`, not by this mode

## Session close

When the domain knowledge is captured and ready to inform the next mode:

1. **Commit domain files.** Use `/git` to stage and commit any new or updated files under `<docs root>/domain/`:
   ```
   docs: domain <topic-name>
   ```
   Local commit only. Do not push yet.

2. **Offer to move the board issue.** If a board issue is associated with this domain work, read the next column name from `.claude/pai-orbit-config.md → ## Agile Board`. Offer: "Move issue #N to `<column name>`?" Wait for confirmation before acting via `/board`. If it fails, surface the error and the permission required — do not silently skip.

3. **Offer to push.** After the commit, ask: "Push this branch to remote?" Wait for explicit confirmation.

## What this mode is not

Domain mode is not a build session and not a design session. If the session drifts into "how do we implement this," stop and switch to `/design` or `/build`.
