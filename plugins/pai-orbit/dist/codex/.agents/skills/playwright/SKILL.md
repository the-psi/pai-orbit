---
name: "playwright"
description: "Implement Playwright automation from a test plan. Use after /test, once the code under test has landed. Writes only inside the project's e2e directory; reports product bugs, never fixes them. Explicit invocation only."
---

You are now in PLAYWRIGHT MODE.

This is a test automation session. Implement and maintain the **Playwright automation** for a feature from its test plan. Stay in this mode until the automation is green (or honestly reported as blocked), or until the user switches.

This is the automation counterpart of `/build`: the lifecycle is `/groom` → `/test` (plain-English cases) → **`/playwright`** (automation code) → `$orbit-review`. It does not go through `/design`.

Usage: `/playwright <feature-slug | ticket>` — the target must already have `docs/features/<feature>/test-plan.md` (from `/test`). If it doesn't, stop and tell the user to run `/test <target>` first.

Switch out when:
- A product bug is found → report it in the run output; the developer fixes it via `/build`. **Never fix app code from this mode.**
- The test plan is wrong or incomplete → `/test` (update the plan first, then return)
- Requirements are ambiguous → `/groom`

## Write boundary — the e2e project only

**Every file this mode creates, edits, or deletes lives inside the project's e2e directory.** Nothing outside it — not app source, not services, not shared libs, not infra, not root tooling, and not a doc (including `test-plan.md`).

Resolve the e2e directory in this order: `AGENTS.md` (stack / test section) → the directory holding the existing `playwright.config.*` → ask the user. State the resolved path at the start of the session.

| | |
|---|---|
| **In scope — write freely** | specs, Page Objects, fixtures, support utils, the e2e config, and the e2e project's own `package.json` / tsconfig / `.env.example` |
| **Out of scope — report, never edit** | app and service source (a missing `data-testid`, an accessible name, an error message, a route, an endpoint, a schema, a seed script) · shared libs · infra · root tooling and CI · **every doc** |

When the boundary blocks a case, **that is the output — not a reason to cross it.** Report the case as blocked: the case ID, what is missing, the file that would have to change, and the owner. Then carry on with the rest of the suite. Never add a `data-testid` to a component, never patch a handler to produce a state a case needs.

If the user asks for an app change mid-session, stop and say it is outside this mode — it needs its own dev story, branch, and PR (`/build`). A test commit that carries an app edit hides a product change from the reviewer.

## Precondition — the code must have landed

Write automation **against real code**. Run this mode only once the source under test has landed (in-scope stories merged, deployed to the target environment, real credentials available). If it hasn't, stay in `/test` — authoring the plan is code-independent — and return when it lands. On invocation, check the in-scope stories' status; if they're not Done, warn and offer to proceed only for the parts that exist.

## Behaviour

Reads from:
- `docs/features/<feature>/test-plan.md` — the cases to automate and the AC × case matrix
- `docs/features/<feature>/requirements.md` — acceptance criteria and **out of scope**
- `AGENTS.md` — stack, conventions, e2e directory, run command
- `docs/decisions/` — constraints that affect the harness (auth, test data)

Writes to:
- The e2e directory only (see write boundary)

### What to build

1. **Generate specs by driving the app.** If a Playwright MCP is available, use it against the deployed app to observe the real DOM, confirm selectors, roles, and redirects, then emit the spec. Hand-writing is the fallback. Committed specs must run headless from the CLI — **CI must never depend on the MCP**.
2. **One spec file per coverage group**, one `test.describe` per group, one `test()` per automated case. Name the file after the ticket/feature (`<ticket>-<feature-slug>.spec.ts`) so a spec traces back to its source from the filename alone.
3. **Automate only cases the plan marks as automated.** Leave manual cases in the plan. Never automate anything the requirements list as out of scope.
4. **Tag every test to its source.** Every title starts with `[<ticket>·AC-k][TC-ID]`, both tags leading, in that order, so a red test is scannable in a CI list. Also apply suite tags (`@smoke`, `@regression`, `@ui` / `@api`) as Playwright test tags.
5. **Ask for the data mode — the plan does not carry it.** `/test` does not record whether cases run against real or mocked data, so ask the user at the start of the session (real / mock / both) and state the answer back, the same way you confirm the e2e directory. If the test plan's scenarios or `docs/decisions/` already make it unambiguous, propose that answer and ask for confirmation rather than guessing.
   - *Real-data plan:* drive the real backend, no `page.route()` interception of the endpoint under test. Use a non-prod hook only for states real usage can't practically produce (session expiry, TTL, infra down).
   - *Mock / synthetic plan:* use the project's harness fixtures and `page.route()` for error and edge responses.
   - Secrets from env vars only — never a literal credential, token, or session id.
   - Record the agreed data mode in the spec header comment and the Page Object JSDoc, once.
6. **A re-run whose data mode changed is a rebuild, not a patch.** Compare the mode recorded in the existing spec header with the one the user just gave. If they differ, delete Arrange helpers that belong to the old mode, retire (never reuse) TC-IDs the plan marks superseded, and add the new mode's cases and helpers.

### Structure — AAA

One `test()` per plan case, **Arrange → Act → Assert**:

- **Arrange** — the case's pre-requisites: fixtures, session, intercepts, data.
- **Act** — the case's steps.
- **Assert** — the case's expected results. **Always hard assertions — `expect(...)`, never `expect.soft(...)`.** A soft assertion lets a test run past a state the plan says is wrong.

### Page Object Model

Specs use Page Objects, not raw selectors in the test body — one class per page or screen, plus small shared classes for cross-page fragments (nav, toast).

- Locator priority: `getByTestId` → `getByRole` → `getByLabel` → `getByText`. Raw CSS/XPath only when none apply.
- When one locator isn't enough, **chain and filter** rather than falling back to CSS: `.filter({ hasText })`, `.filter({ has })`, an anchored regex for exact text, `.or()` for state-dependent controls, `.filter({ visible: true })` for desktop/mobile duplicates. `.nth()` is the last resort.
- **Actions live on the Page Object; assertions live in the spec.**
- Page Objects are stateless beyond the `Page` handle.
- JSDoc only on the class and non-obvious helpers.

### Fixtures and test hygiene

- **Never sign in through the UI per test.** Sign in once per run (global setup), persist `storageState`, and feed it to every context. Never commit a storage state — it is a leaked credential.
- **Every test makes its own data.** Tests run in parallel, so anything a case creates must be unique to it (derive names from the test id plus a per-run token) and cleaned up afterwards.
- **Scope by mutability, not cost.** Read-only shared setup → worker-scoped fixture. Anything two tests could write → test-scoped. Declare genuine inter-test dependence with `test.describe.configure({ mode: 'serial' })`.
- **Wait on a condition, never on the clock.** `waitForURL`, `waitForResponse`, `locator.waitFor`, or a web-first `expect`. Never `waitForTimeout` / `sleep`.
- `beforeEach` / `afterEach` for shared setup and teardown; extract a helper only when a **second** spec needs it. A spec is a script, not a framework.
- Global config (base URL, projects, timeouts, reporters) lives in the Playwright config — specs never hardcode environment values.
- Use `expect` matchers, never bare Node `assert`. Use `@axe-core/playwright` for accessibility cases.

## Run + fail loop

1. Run the target spec. Never mark a case green until it actually runs green.
2. Classify each failure:
   - **Test bug** (selector, timing, wrong assertion) → fix it in the spec. On a re-run, heal only flaky tests.
   - **Product bug** → report it (case ID, expected vs actual, source ticket · AC). Do not fix it.
   - **Harness gap** (a helper or endpoint the case needs that doesn't exist) → do not fake it. Report the case as blocked and flag the dependency. Build the helper only if it lives inside the e2e directory.
3. **No document updates.** Coverage honesty lives in the Playwright report plus the failed-case justification output — a green run must never overstate coverage.

## Output format

At session close, print (do not write to a file):

```
## Playwright run — <feature>

Resolved e2e dir: <path>
Data mode: real | mock | both

| TC-ID | AC | Result | Notes |
|-------|----|--------|-------|

### Failed / blocked cases
- <TC-ID> — <expected vs actual | what is missing, which file, which owner>

### Manual cases (not automated)
- <TC-ID> — <reason>
```

## Session close

1. The target spec runs green, or the output above states honestly what is blocked or manual and why.
2. **Check the diff** — `git status --short` must show changes only under the e2e directory. Anything else is a boundary breach: revert it and report what it was trying to fix.
3. Offer `$orbit-review` on the changed specs before raising a PR.
4. **Ask before committing, then before pushing** — both gates. Commit via `/git` with a `test(<e2e-scope>): <ticket> <feature> — playwright specs` subject. Local commit only; push offered, not forced.
