---
status: proposed
date: 2026-09-30
deciders: [Tanu Vashistha]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: /playwright mode — self-enforced write boundary and no document updates

## Context

`/playwright` is the first mode whose job is to write code that tests *someone else's*
code. That creates two risks no existing mode has:

1. **Scope creep into the product.** A tester who hits a missing `data-testid`, a wrong
   error message or a broken handler is one edit away from "fixing" it. A test commit that
   quietly carries an app change hides a product change from the reviewer, who is looking at
   specs, and the defect ships without any dev story recording it.
2. **Coverage that overstates itself.** If the mode updated `test-plan.md` as it went
   (marking cases blocked, dropping cases, editing expected results to match what the app
   does), the plan would drift toward whatever passes and stop being an independent
   statement of what should be true.

Every other mode writes to a fixed set of docs and code paths declared in its "Writes to"
list. `/build` is the only mode that touches app code, and it does so by design. There is no
existing pattern for a mode that must be *prevented* from touching most of the repo, nor for
a mode that deliberately writes no document at all. `CLAUDE.md` also states the principle
"Written outputs — nothing important lives only in chat", so a mode that writes no doc needs
its exception recorded.

## Decision

In the context of **a mode that generates test code against a product it does not own**,
facing **the risk of silent product edits and of a test plan that bends to fit the app**,
we decided that **`/playwright` (a) may write only inside the project's e2e directory and
verifies this itself at session close, and (b) never edits any document, including
`test-plan.md`**,
to achieve **an independent test suite whose diff a reviewer can trust to contain only test
changes, and a plan that stays the source of truth**,
accepting **that blocked cases and product bugs live in the run output rather than in a file,
and that the boundary check relies on the mode following its own instructions rather than on
a hook**.

Concretely:
- **Write boundary.** The mode resolves the e2e directory (from `CLAUDE.md`, then the
  existing `playwright.config.*`, then by asking) and writes nowhere else. At session close
  it runs `git status --short` and treats any path outside that directory as a breach: revert
  it and report what it was trying to fix.
- **Boundary blocks are output, not permission.** When a case can't be automated without an
  app change, the mode reports the case as blocked (case ID, what is missing, file that would
  need to change, owner) and continues.
- **No document updates.** Coverage honesty is carried by the Playwright report and a
  printed failed/blocked/manual case summary. This is a deliberate, narrow exception to
  "Written outputs": the summary is a transient run report, and the durable record of a
  defect belongs to the developer's ticket, not to a doc this mode edits.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) Mode-instruction boundary plus `git status` check at close; no doc writes | No new infrastructure; works identically in all five adapters; keeps plan independent | Enforced by the model following its prompt, not mechanically; blocked cases aren't persisted |
| PreToolUse hook that rejects writes outside the e2e directory | Mechanical enforcement | Hooks are Claude Code / Codex / Cursor only, Copilot degrades to advisory text (breaks adapter parity); needs the e2e path as config before the mode can run |
| Let the mode edit `test-plan.md` to record blocked/superseded cases | Blocked state persists in the repo | Plan drifts toward what passes; two modes now write one file; risks the "expected result edited to match the app" failure |
| Fold automation into `/build` | No new mode | `/build` may edit app code, so the boundary disappears; conflates "build the product" with "test the product" |

## Consequences

**Positive:**
- A `test(...)` commit can be reviewed as tests only; product bugs are routed to developers.
- `test-plan.md` stays owned by `/test`, so plan changes are always deliberate.

**Negative / trade-offs:**
- Blocked cases and product bugs are only in the session output. If the user doesn't copy
  them into a ticket, they are lost.
- A model that ignores its instructions can still write outside the directory; the close-out
  `git status` check catches it after the fact, not before.

**Neutral:**
- Sets a precedent that a mode may declare a hard write boundary. A later mode that wants
  the same should reference this ADR instead of inventing a variant.

## Related Decisions

- `.claude/rules/decisions.md` — the rule that requires this ADR.
- `docs/architecture/constraints.md` — full adapter parity, which rules out a hook-only design.

## Review Date

Revisit if the adapters gain a uniform way to enforce path-scoped writes, or if teams report
that unpersisted blocked cases are being lost.
