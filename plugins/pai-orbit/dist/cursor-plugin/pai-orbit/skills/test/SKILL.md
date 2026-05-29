---
name: test
description: Test session — review requirements for testability, produce a test plan with acceptance criteria and edge cases, track manual vs automated coverage, run a release readiness check. TRIGGER when a feature is ready for QA review, when writing acceptance criteria, when planning a test pass before release, or when a test run fails and the issue needs scoping before returning to /build. SKIP unit test implementation (use /build) and exploratory data validation (use /data).
---

# QA

Review features for testability and produce structured test plans.

Reads from:
- `docs/features/<feature>/requirements.md` — requirements and acceptance criteria
- `AGENTS.md` — stack, test frameworks, and conventions
- `docs/decisions/` — architectural constraints that affect testability

Writes to:
- `docs/features/<feature>/test-plan.md`

---

## Behaviour

- Read the feature's `requirements.md` before asking anything
- Lead with questions about user-facing behaviour, not implementation details
- Flag requirements that are not testable as written — name the ambiguity and ask for a concrete, measurable criterion
- Distinguish what can be covered by automated tests vs what requires manual verification
- Capture edge cases and failure paths explicitly — not just the happy path
- Do not implement tests — only plan them; use `/build` for implementation
- For release readiness: check all acceptance criteria are covered before signing off

---

## Output format

`docs/features/<feature>/test-plan.md`:

```
## Summary
One paragraph: what is being tested and why.

## Scope
What is in scope for this test plan. What is explicitly out of scope.

## Test cases

### Happy path
| ID | Scenario | Steps | Expected result | Automated? |
|----|----------|-------|-----------------|------------|
| TC-01 | ... | ... | ... | Yes / No |

### Edge cases
| ID | Scenario | Steps | Expected result | Automated? |
|----|----------|-------|-----------------|------------|
| TC-10 | ... | ... | ... | Yes / No |

### Failure / error paths
| ID | Scenario | Steps | Expected result | Automated? |
|----|----------|-------|-----------------|------------|
| TC-20 | ... | ... | ... | Yes / No |

## Acceptance criteria coverage
Map each acceptance criterion from requirements.md to a test case ID.
Flag any criterion not yet covered.

| Criterion | TC ID | Status |
|-----------|-------|--------|
| AC-1: ... | TC-01 | Covered |
| AC-2: ... | — | Not covered — needs TC |

## Manual test checklist
Steps that require human execution (UI flows, device-specific, production smoke tests):
- [ ] Step

## Known risks
Edge cases or failure modes that are hard to test automatically and may need monitoring in production.

## Sign-off
- [ ] All acceptance criteria covered
- [ ] Edge cases documented
- [ ] Manual checklist reviewed
- QA: <name> — <date>
```

---

## Fail → BUILD loop

When a test run fails:

1. Document the failure in `docs/wip/test-failure-<feature>-<date>.md`:
   - Which TC failed (ID + scenario)
   - Actual vs expected result
   - Stack trace or error message (abbreviated)
   - Whether this is a code bug, a requirements gap, or a test setup issue

2. Classify:
   - **Code bug** → switch to `/build` with the failure doc as context; return to `/test` after fix
   - **Requirements gap** → switch to `/groom` to clarify; the test plan needs updating too
   - **Test setup issue** → fix the test environment; do not mark the TC as failing

3. After fix is shipped: re-run only the failing TCs before re-running the full suite.

Do not mark a TC as "pass" because the fix looks right in code — rerun it.

---

## Testability red flags

Flag these patterns in requirements and ask for clarification:

- "Works correctly" — not measurable; ask for the specific observable behaviour
- "Responds quickly" — ask for a concrete latency threshold
- "Handles errors gracefully" — ask which errors and what the user should see
- Acceptance criteria written from the implementer's perspective ("the service calls X") rather than the user's ("the user sees Y")
- Missing negative cases — requirements that only describe the happy path

---

## Release readiness check

When the user asks if a feature is ready to release:

1. Read `docs/features/<feature>/test-plan.md`
2. Check every acceptance criterion is covered by a TC
3. Check every manual checklist item has been run
4. Flag any TC marked "Not covered"
5. Report: ✅ Ready / ⚠️ Gaps — list what's missing
