## Epic
<!-- None — standalone enhancement, tracked as issue #35 -->

## Purpose
`/groom` currently treats grooming as a structural exercise — converting a stated purpose directly into scenarios and acceptance criteria — without reasoning about the target project's product context: who its actual audience is, where this fits on its roadmap, and whether it's genuinely relevant right now. Every project using pai-orbit serves an audience of its own, and grooming in a vacuum can produce technically complete requirements for a feature that doesn't matter, duplicates other in-flight work, or misses a chance to serve users or learn about them. This feature adds a product-reasoning step to `/groom` Phase 1, before purpose is finalized: `/groom` should reason about (a) who the target project's audience/users are (from `CLAUDE.md`, domain docs, or `ux.md`), (b) domain/business rules that bear on the feature (`docs/domain/*.md`), (c) roadmap context pulled from `docs/plans/*.md` or the board — consulted only when it's actually relevant, not on every session — and (d) the feature's broader relevance: does it serve a real user goal, does it conflict or overlap with other planned/in-flight work, does it help the product team learn something about its users, and does it move the product toward its stated purpose. Where this reasoning surfaces a mismatch — purpose doesn't map to a documented user need, or conflicts with roadmap priorities — `/groom` surfaces it to the user as a question instead of silently proceeding to scenarios.

Critically, `/groom` must not simply draft a plausible-sounding purpose from available context and ask for confirmation — it must actively pursue the **why** behind the issue: drawing on whatever domain and product knowledge it has, and asking targeted why-directed questions when that knowledge is insufficient, until a well-reasoned purpose emerges. Only once the why is established should `/groom` propose the purpose statement back to the user.

This feature is scoped to **Phase 1 (purpose establishment) only**. Extending product-context reasoning into Phase 3 (requirements/acceptance criteria) is deferred to a future issue.

## Scenarios in scope
1. A target project has relevant context available (domain docs, `ux.md`, `CLAUDE.md` audience description, and/or roadmap docs/board) that bears on the issue being groomed — `/groom` must surface and reason from that context before finalizing purpose.
2. A target project has little or no relevant context available (empty/sparse domain docs, no roadmap docs, no documented audience) — `/groom` must still pursue the "why" via direct questions to the user rather than skipping the product-reasoning step or silently proceeding with a shallow purpose.
3. Product-context reasoning surfaces a mismatch or conflict — the stated purpose doesn't map to a documented user need, or it duplicates/conflicts with other planned or in-flight work (roadmap, other epics/features) — `/groom` must surface this explicitly to the user as a question and get it resolved before finalizing purpose, rather than silently proceeding.
4. The user cannot answer a why-question and the needed context genuinely doesn't exist anywhere (not just unread, but truly undocumented and unknown even to the user) — `/groom` needs a defined fallback rather than blocking Phase 1 indefinitely.
5. The issue is narrow/self-evidently scoped (e.g., a small bug fix) where roadmap or audience context isn't actually relevant to establishing purpose — `/groom` should recognize this and skip pulling roadmap/board data rather than always consulting it by default.

## User stories / use cases
- As a developer running `/groom` on a new feature, I want it to check existing capabilities and roadmap before proposing purpose, so I don't groom something already planned or shipped elsewhere.
- As a developer in a project with no domain docs, I want `/groom` to ask me direct why-questions, so purpose is still well-reasoned despite missing documentation.
- As a developer, I want `/groom` to name the exact epic/feature that conflicts with this issue, so I can resolve it quickly instead of hunting for it myself.
- As a developer, when context truly doesn't exist anywhere, I want to choose between an assumption or an open question, so grooming isn't blocked indefinitely.
- As a developer fixing a small bug, I want `/groom` to skip unnecessary roadmap review, so trivial sessions stay fast.

## Functional requirements
1. REQ-1 (Scenario 1): Before proposing a purpose statement, `/groom` must read available product-context sources relevant to the issue: `docs/domain/*.md`, `ux.md`, `CLAUDE.md`, `docs/epics/`.
2. REQ-2 (Scenario 1): `/groom` must use that content to reason about the "why" behind the issue before drafting a purpose statement — not draft first and confirm after.
3. REQ-3 (Scenario 2): When available context is sparse/absent, `/groom` must ask direct why-directed questions ("who is this for," "why now," "what problem does it solve") rather than proceed with a shallow/assumed purpose.
4. REQ-4 (Scenario 2): Empty or missing `docs/domain`, `docs/plans`, or `ux.md` triggers direct questioning — never a silent bypass of the reasoning step.
5. REQ-5 (Scenario 3): If reasoning surfaces a conflict/overlap with other planned or in-flight work, `/groom` must name the specific conflicting item (e.g., `docs/epics/X`, `docs/features/Y`) when raising it.
6. REQ-6 (Scenario 3): `/groom` must not finalize the purpose statement while an identified conflict is unresolved.
7. REQ-7 (Scenario 4): If the user can't answer a why-question because context is genuinely undocumented, `/groom` asks the user to choose: (a) proceed with a stated, documented assumption, or (b) record the gap as an open question.
8. REQ-8 (Scenario 4): The outcome of REQ-7 is captured in the output file — assumptions under `## Context`, unresolved gaps under `## Open questions`.
9. REQ-9 (Scenario 5): For issues classified as bug fixes/small enhancements, `/groom` defaults to skipping `docs/plans`/board consultation unless its own reasoning surfaces a specific reason to check.
10. REQ-10 (Scenario 5): For issues classified as new features/capabilities, `/groom` checks `docs/features/*` (existing capabilities) and roadmap sources (`docs/plans/*.md` or board) for overlap before finalizing purpose.
11. REQ-11 (Scenario 5): Classification (new feature vs. bug/enhancement) uses existing issue labels when present; when absent or ambiguous, `/groom` asks the user directly.

## Non-functional requirements
- Must work with zero product-context sources present (this repo's `docs/domain/` is currently empty) without erroring or skipping the reasoning step.
- Depth of investigation should scale with issue complexity — trivial issues (Scenario 5) must not incur the same investigation cost as new-feature issues.

## Context
- This repo's own `docs/domain/` is empty — a live test case for Scenario 2/4 behavior.
- No canonical "product capabilities" doc exists in the current docs structure; `docs/features/*` is the closest proxy used by REQ-10.
- Issue #35 itself has no labels, so REQ-11's ask-the-user fallback would trigger if this issue were groomed literally.
- This feature is scoped to Phase 1 (purpose) only; Phase 3 (requirements/acceptance criteria) product-context reasoning is explicitly deferred (see Out of scope).

## Out of scope
- Extending product-context reasoning into Phase 3 (requirements/acceptance criteria drafting) — deferred to a future issue.
- Populating `docs/domain`, `docs/plans`, or `ux.md` content itself — that is the job of `/domain`, `/plan`, `/ux` modes, not this feature.
- Changes to `/design`, `/build`, or any other mode's behavior.

## Open questions
- [ ] Design deferral: when both `docs/plans/*.md` and the board have relevant roadmap info, which takes precedence, or are they merged? — owner: `/design`.

## Acceptance criteria
- AC-1 (Scenario 1): Given `docs/domain`, `ux.md`, `CLAUDE.md`, or `docs/epics` contain content relevant to the issue, `/groom`'s why-reasoning references specific content from them before presenting a draft purpose statement.
- AC-2 (Scenario 1): The proposed purpose statement reflects reasoning tied to documented user needs/product context, not just a paraphrase of the issue text.
- AC-3 (Scenario 2): Given no relevant domain/ux/epic context is found, `/groom` asks at least one explicit why-directed question before proposing purpose.
- AC-4 (Scenario 3): Given a conflict/overlap is identified with another epic, feature, or plan, `/groom`'s question names the specific file/item.
- AC-5 (Scenario 3): `/groom` does not proceed to Phase 2 while an identified conflict remains unresolved.
- AC-6 (Scenario 4): Given the user indicates needed context doesn't exist and they can't answer a why-question, `/groom` explicitly offers the choice (proceed with stated assumption vs. record open question) and captures the result in `## Context` or `## Open questions` per the choice made.
- AC-7 (Scenario 5): Given an issue classified as bug fix/small enhancement with no evident overlap, `/groom` does not require pulling `docs/plans` or board data unless its own reasoning surfaces a specific reason to check.
- AC-8 (Scenario 5): Given an issue classified as new feature/capability, `/groom` checks `docs/features/*` and roadmap sources for overlap before finalizing purpose.
- AC-9 (Scenario 5): Classification uses existing issue labels when present; `/groom` asks the user directly when labels are absent or ambiguous.

---
Status: Groomed — ready for /design
