## Epic
<!-- Standalone — no parent epic -->

## Purpose
Prevent team members from starting implementation work in orbit without a ticket that meets a defined completeness standard — covering title, description, acceptance criteria, label, and assignee — so that all work is scoped, owned, and reviewable before any code is written.

## Scenarios in scope
1. Developer invokes `/build` with no ticket reference at all — orbit blocks entry and prompts for a ticket number.
2. Developer invokes `/build` with a ticket reference that is missing one or more required fields — orbit identifies the specific gaps and blocks until they are filled.
3. Developer invokes `/build` with a fully complete ticket — the gate passes silently and work proceeds without interruption.
4. Developer invokes `/design` or `/test` without a proper ticket — the same gate applies to these modes, not just `/build`.

## User stories / use cases
- As a **team lead**, I want orbit to block `/build` when no ticket is referenced, so that no implementation work starts without a traceable scope.
- As a **developer**, I want orbit to tell me exactly which fields are missing from my ticket, so that I can fix it quickly and get back to work.
- As a **developer** with a complete ticket, I want the gate to be invisible, so that it adds zero friction to my normal flow.
- As a **team lead**, I want the gate to apply to `/design` and `/test` as well, so that scoping discipline is consistent across all work-starting modes.

## Functional requirements
1. REQ-1 (Scenario 1): When a developer invokes `/build`, `/design`, or `/test`, orbit must check for a ticket reference before entering the mode. If no ticket reference is present, orbit must block entry and prompt the developer to supply a ticket number.
2. REQ-2 (Scenario 1): A ticket reference is a valid issue identifier supplied explicitly at mode invocation (e.g. `#29`) or already present in the current session context.
3. REQ-3 (Scenario 2): When a ticket is referenced, orbit must validate that it contains all of the following: (a) a non-empty title, (b) a non-empty body describing what and why, (c) a `## Acceptance criteria` section with at least one non-empty line beneath it, (d) at least one type label (`enhancement`, `bug`, or `documentation`), and (e) at least one assignee.
4. REQ-4 (Scenario 2): Orbit must fetch the ticket's current state at validation time — not a cached value — so that a developer who edits the ticket mid-session can re-invoke the mode without restarting.
5. REQ-5 (Scenario 2): When validation fails, orbit must output an explicit list of missing fields (one per line) and must not proceed to the mode's opening prompt. No bypass option is offered.
6. REQ-6 (Scenario 3): When all required fields are present, orbit must proceed to the mode's opening prompt with no gate-related output visible to the developer.
7. REQ-7 (Scenario 4): The ticket gate must apply identically to `/build`, `/design`, and `/test`. The validation logic must be defined once and referenced by each mode — not duplicated.

## Non-functional requirements
- **NFR-1 (Performance):** Ticket validation must complete before the mode's opening prompt is presented. It must not require a separate explicit command from the developer.
- **NFR-2 (Maintainability):** The gate logic must live in one place (a shared skill or mode preamble) so that opting a new mode into the gate requires a single-line change, not a copy-paste.

## Context
- orbit is a Claude Code plugin — enforcement happens at mode-entry in markdown skill/mode files, not in compiled code.
- The board type is determined at runtime from `.claude/pai-orbit-config.md`. Ticket fetching must use the configured board CLI or MCP (GitHub, Linear, Jira, GitLab) — not hardcode GitHub.
- This feature is a gate, not an advisor. Precedent: `bash-guard.sh` blocks destructive git commands with no bypass offered.

## Out of scope
- Automated ticket creation (that is `/board`'s job).
- Enforcing ticket quality on external boards directly (Jira, Linear) — orbit only controls its own mode entry.
- Ticket validation for read-only or advisory modes (`/arch`, `/domain`, `/ux`, `/plan`).
- Linting ticket prose quality (e.g. "is the description detailed enough?") — only structural field presence is checked.

## Open questions
<!-- None — all questions resolved during grooming session 2026-06-20. -->
<!-- Q: What counts as acceptance criteria? → A: A `## Acceptance criteria` section heading with at least one non-empty line beneath it. -->
<!-- Q: Hard block or soft prompt? → A: Hard block. No bypass offered. Orbit lists missing fields precisely so the fix is fast. -->

## Acceptance criteria
- AC-1 (Scenario 1): Given a developer invokes `/build`, `/design`, or `/test` with no ticket reference, orbit outputs a block message and does not present the mode's opening prompt.
- AC-2 (Scenario 1): The block message includes a prompt to provide a ticket number (e.g. `#29`) before continuing.
- AC-3 (Scenario 2): Given a ticket is referenced, orbit fetches its current state and checks: title non-empty, body non-empty, `## Acceptance criteria` section present with at least one non-empty line, at least one type label present, at least one assignee set.
- AC-4 (Scenario 2): If any field check fails, orbit outputs each missing field on its own line and does not proceed to the mode's opening prompt. No "proceed anyway" option is presented.
- AC-5 (Scenario 2): A developer who fixes the ticket and re-invokes the mode (without restarting the session) passes the gate — orbit re-fetches on each invocation.
- AC-6 (Scenario 3): Given all required fields are present, orbit enters the mode with no gate-related output visible.
- AC-7 (Scenario 4): Invoking `/design` or `/test` without a valid ticket triggers the same block behaviour as `/build` — identical output format, identical field checks.

---
Status: Groomed — ready for /design
