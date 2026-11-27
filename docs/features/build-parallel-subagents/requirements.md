Status: Groomed — ready for /design

## Epic
<!-- Standalone — no parent epic. Split out from #32 (worktree isolation + model tiering). Board issue: #79 -->

## Purpose
`/build` gets an orchestrator that runs coding, tests and docs as parallel streams. Inside each stream, dependent tasks run in sequence and independent tasks run in parallel. When a change appears in one stream, the orchestrator tells the other streams, so build time drops and the output stays consistent. It serves developers running `/build`, and replaces today's "per repo, parallel where possible" line, which leaves the split to Claude's judgment and varies run to run.

## Scope
- `core/modes/build.md` — replace the "During build" sub-agent bullet (line 42) with the orchestrator rule: three parallel streams (coding, tests, docs); dependent tasks sequential and independent tasks parallel within a stream; change notification between streams; the ask/auto rule for changes; the ≤ 3 files exemption; the missing-spec fallback
- Regenerate `plugins/pai-orbit/dist/` via `bash plugins/pai-orbit/build.sh` (never hand-edit)
- `docs/capabilities.md` — update the `/build` description (line 98) and the agents note (line 267)
- Version bump + migration note, only if the change alters `dist/` structure (constraints rule 7) — decided in `/design`

What this does NOT include:
- Worktree isolation and model tiering — shipped in #32, not touched
- Per-adapter model-tiering guidance — #84
- Build-readiness gate (`build.md:39`) — unchanged; it is what guarantees specs exist for tests/docs streams
- `cross-repo-impact` and `docs-writer` agent definitions — unchanged
- How the orchestrator is built, how changes propagate, and per-adapter applicability — `/design`
<!-- `## Scope` lists implementation items (what gets built). `## Out of scope` below lists
     scenarios deliberately excluded from this feature. They are different lists — do not merge them. -->

## Scenarios in scope
1. Developer runs `/build` on a groomed, design-resolved issue; the orchestrator starts coding, tests (from test-plan.md / AC) and docs (from requirements / design) as parallel streams.
2. Inside a stream, dependent tasks (e.g. DB model → service → endpoint) run in sequence; independent tasks (e.g. two separate endpoints) run in parallel.
3. A change surfaces in one stream during build (e.g. code diverges from design, or tests reveal a wrong AC); the orchestrator is told and informs the other streams, which adjust.
4. Multi-repo feature: the per-repo split is kept and each repo runs its own code / tests / docs streams.
5. Same-repo streams run concurrently without overwriting each other's uncommitted files (worktree isolation on Claude Code; merge-back before shipping).
6. Small change (≤ 3 files): no orchestrator; `/build` works directly as today.
7. A stream's spec is missing (e.g. no test-plan.md): the user is told which stream and why; the stream runs after code, using the code as the spec.
8. Service-builder agents already run tests before finishing; the code stream runs only existing tests (regression) and the tests stream writes new ones, so they do not overlap.
9. Non-Claude adapters (Codex, Cursor, Copilot) have different parallel limits and syntax; the rule must account for them (applicability decided in `/design`).

## Consumer check
- Signal: `sub-agent parallelism rule` (build.md:42 — "Spawn sub-agents per repo where tasks are independent; run in parallel where possible")
- Classification: Existing — changes how an existing rule is read (per-repo split → work-type streams + orchestrator)
- Override: none
- Search terms: `Spawn sub-agents`, `sub-agents per repo`, `run in parallel where possible`, `build-subagent-rules`, `CLAUDE_CODE_ONLY`, `parallel`, `fan-out`, `fan out`, `concurrent`, `builder(s)`, `max_threads`, `max_depth`, `orchestrat`
- Repos searched: pai-orbit (core, adapters, docs; `dist/` excluded as generated) · Not reachable: none
- Concept map: no concept map found
- Consumers found:
  - `adapters/claude-code/build-subagent-rules.md` (worktree rule) → In scope, Scenario 5
  - `docs/capabilities.md:267` ("parallel sub-repo work") → In scope, Scope item 3 (with line 98)
  - `adapters/cursor-plugin/build.sh:235` (capability table) → In scope, Scenario 9
  - `adapters/codex/config.toml.template:21-22` (`max_threads = 4`, `max_depth = 2`) → In scope, Scenario 9
  - `core/templates/agents/*-builder.md`, `core/modes/setup.md:185-192` (service builders run tests) → In scope, Scenario 8
  - `adapters/codex/build.sh:459`, `adapters/copilot/build.sh:342` (per-tool agent-spawning text) → In scope, Scenario 9
- Test-only hits: 0 files
- Map discrepancies: none — no map exists; suggest creating `docs/domain/concept-consumers.md`

## User stories / use cases
- As a developer running `/build`, I want coding, tests and docs to run as parallel streams, so that the build finishes sooner. (S1)
- As a developer, I want dependent tasks to run in order and independent tasks side by side, so that parallelism never breaks correctness. (S2)
- As a developer, I want other streams told when one stream changes something, so that tests and docs do not go stale. (S3)
- As a developer on a multi-repo feature, I want the per-repo split kept with streams inside each repo, so that existing multi-repo builds still work. (S4)
- As a developer, I want concurrent streams in one repo not to overwrite each other, so that I do not lose uncommitted work. (S5)
- As a developer making a tiny change, I want no orchestrator overhead, so that small fixes stay fast. (S6)
- As a developer, I want to be told when a stream cannot start in parallel and why, so that I am not surprised by the ordering. (S7)
- As a developer, I want tests not to be run or written twice by different streams, so that effort is not wasted. (S8)
- As a developer on Codex, Cursor or Copilot, I want the rule to respect my tool's limits, so that parallel builds do not fail there. (S9)

## Functional requirements
1. REQ-1 (Scenario 1): For builds touching more than 3 files, `/build` runs an orchestrator that starts coding, tests and docs as three parallel streams.
2. REQ-2 (Scenario 1): The tests stream derives from test-plan.md / AC; the docs stream derives from requirements and design.
3. REQ-3 (Scenario 2): Within a stream, dependent tasks run in sequence and independent tasks run in parallel.
4. REQ-4 (Scenario 3): A change surfacing in one stream is reported to the orchestrator, which informs the other streams.
5. REQ-5 (Scenario 3): A change that does not alter the spec (rename, file path, message text) is adjusted automatically, with a summary to the user at the end. A change that alters requirements, design, AC or user-facing behaviour, or needs a stream to redo work, requires asking the user first. When in doubt, ask.
6. REQ-6 (Scenario 4): The per-repo split is kept; each repo runs its own streams.
7. REQ-7 (Scenario 5): Concurrent streams in the same repo are isolated (worktree on Claude Code) and merged back before shipping.
8. REQ-8 (Scenario 6): Builds of ≤ 3 files run without an orchestrator.
9. REQ-9 (Scenario 7): When a stream's spec is missing, tell the user which stream and why; that stream runs after code, using the code as the spec.
10. REQ-10 (Scenario 8): The code stream runs only existing tests (regression); the tests stream writes new tests.
11. REQ-11 (Scenario 9): The rule defines behaviour for Codex, Cursor and Copilot; per-adapter applicability is decided in `/design`.

## Non-functional requirements
- `core/modes/build.md` stays tool-agnostic; any tool-specific text goes through the adapter marker mechanism (constraints rules 2, 6; ADR 2026-10-08).
- `dist/` is regenerated, never hand-edited (rule 1) and stays backward compatible (rule 7).
- No new design decisions made silently inside `/build` (rule 4): design-affecting changes go to the user.
- Build time with parallel streams should be lower than running the same work sequentially.

## Context
- Board issue #79, split from #32. The board was read (`gh issue view`, issue #79 and open-issue list); issue has no labels, so the user classified it as a small enhancement. Product-capabilities and roadmap reads were skipped per that classification.
- `docs/domain/` is empty and no `product-capabilities.md` or concept map exists.
- Build-readiness gate (`build.md:39`) ensures groomed + design-resolved specs exist before `/build`, which is what lets tests and docs start in parallel with code.
- Grooming assumption: the ≤ 3 file threshold is borrowed from the existing trunk-based rule (`build.md:27`).

## Out of scope
- Worktree isolation and model tiering (#32), per-adapter model tiering (#84).
- Changes to the build-readiness gate, `cross-repo-impact` and `docs-writer`.
- Implementation of the orchestrator and propagation mechanism (`/design`).

## Open questions
- [ ] Design: orchestrator mechanism — how it spawns and tracks streams — owner: Upneet Singh
- [ ] Design: change-propagation mechanism between streams — owner: Upneet Singh
- [ ] Design: adapter applicability — full parity vs claude-code-only exception (constraints rule 6) — owner: Upneet Singh
- [ ] Design: Codex `max_depth = 2` vs orchestrator → stream → child (3 levels) — owner: Upneet Singh
- [ ] Design: merge-back conflict handling for concurrent same-repo streams — owner: Upneet Singh
- [ ] Design: version bump + migration note if `dist/` structure changes (rule 7) — owner: Upneet Singh

## Acceptance criteria
- AC-1 (Scenario 1): On a > 3-file build, three streams (coding, tests, docs) start in parallel from the orchestrator.
- AC-2 (Scenario 2): Within a stream, a task that depends on another does not start until it finishes; independent tasks start together.
- AC-3 (Scenario 3): After a change in one stream, the other streams are informed and act on it before the build finishes.
- AC-4 (Scenario 3): A spec-altering or redo-requiring change prompts the user before streams adjust; a spec-neutral change is adjusted without a prompt and appears in the end summary; an unclear case prompts.
- AC-5 (Scenario 4): On a multi-repo feature, each repo gets its own code / tests / docs streams.
- AC-6 (Scenario 5): Two streams editing the same repo concurrently do not overwrite each other's uncommitted files, and their work is merged back before shipping.
- AC-7 (Scenario 6): A ≤ 3-file change runs without an orchestrator.
- AC-8 (Scenario 7): With no test-plan.md (or other missing spec), the user is told which stream is delayed and why, and that stream starts after code.
- AC-9 (Scenario 8): The code stream does not write new tests; the tests stream does not duplicate the regression run.
- AC-10 (Scenario 9): `build.md` and the capability docs state the rule's behaviour for Codex, Cursor and Copilot (or the recorded exception).
