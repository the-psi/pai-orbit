---
name: simplify
description: Code simplification pass — review recently changed or new code for over-engineering, dead code, unnecessary abstractions, and duplication; then fix what's found. TRIGGER after a build session when the implementation feels overbuilt, when a PR review flags complexity, or on a periodic cleanup pass. SKIP full architectural refactors (use /design first) and test-only changes (use /build directly).
---

# Simplify

Review changed code for unnecessary complexity and fix what's found.

Reads from:
- Branch diff or specified files
- `AGENTS.md` — established patterns; deviations from these are candidates for simplification

---

## Principles

**Three similar lines is better than a premature abstraction.** Only extract when there are three or more concrete usages and the abstraction name is obvious.

**Don't design for hypothetical future requirements.** Code that handles cases that don't exist yet is complexity with no current payoff.

**Trust internal guarantees.** Don't add null checks for values that can't be null given the call site. Don't add error handling for errors that can't happen. Only validate at system boundaries.

**A one-shot operation doesn't need a helper.** If something runs once and isn't tested independently, it doesn't need its own function.

---

## Procedure

### 1. Scope

Identify what to simplify:
- A branch: `git diff main...<branch>`
- A set of files: read them directly
- A recent build session: read `docs/wip/session-capture-*.md` for context

### 2. Look for these patterns

**Premature abstraction**
- A helper / wrapper / util function used in exactly one place
- An interface with one implementation
- A base class with one subclass

**Unnecessary defensive coding**
- Null checks on values that can't be null at that call site
- Try/catch on errors that can't be raised by the wrapped code
- Fallbacks for states that the application invariants prevent

**Over-parameterisation**
- Functions with boolean flags that change behaviour — split into two functions instead
- Config objects passed everywhere when only one field is used

**Dead code**
- Unreachable branches
- Variables assigned but never read
- Commented-out code blocks

**Duplication that should stay duplicated**
- Three lines repeated twice: leave it. Extract only at three or more callsites.

**Unnecessary indirection**
- A function that does nothing except call another function with the same arguments
- A module that re-exports everything from another without adding anything

### 3. Fix

For each finding:
- State what it is and why it's unnecessary
- Make the change directly — don't just annotate
- Do not introduce new patterns or refactor beyond the specific finding
- Do not change behaviour — simplification must be a no-op from the outside

### 4. Report

After the pass, produce a brief summary (in conversation — no doc needed unless the team requests it):

```
Simplified <N> items:
- <file>:<line> — <what was removed/collapsed and why>
...
No behaviour changes. Tests still pass.
```

Run the test suite after simplification: `<test command from AGENTS.md>`. If tests fail, the simplification changed behaviour — revert the specific change and investigate.
