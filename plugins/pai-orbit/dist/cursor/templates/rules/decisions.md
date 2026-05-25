# Architectural Decision Records

## When an ADR is required

Write an ADR **in the same commit** as the code whenever you:

- Introduce a new pattern or abstraction that affects how future code must be written
  (e.g. a constants class, a base class, a shared utility, a naming convention)
- Choose between two or more viable technical approaches
- Establish a convention that other developers must follow
- Make a decision that would be surprising or non-obvious to a future reader of the code

**The test:** ask "would a future developer need to know *why* this was done this way?"
If yes — write the ADR. Do not defer it; if the code ships without it, it will never be written.

## When an ADR is NOT required

- Bug fixes that follow existing patterns without introducing new ones
- Routine CRUD endpoints, migrations, or UI components that follow established conventions
- Refactors that rename or reorganise without changing the approach

## How to write one

1. Copy `docs/decisions/_TEMPLATE.md` (or `docs/decisions/ADR.md`)
2. Name it `docs/decisions/ADR-{NNN}-{UPPER-SNAKE-TITLE}.md` (next sequential number)
3. Fill Context, Decision, Options Considered, Consequences, References
4. Commit the ADR in the **same commit** as the code it documents
5. If the work is tracked in an issue, post the ADR link as a comment on the issue
