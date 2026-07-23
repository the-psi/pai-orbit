# End-to-End Test Automation Layer

**Status:** Draft
**Owner:** Punit Singhal
**Last Updated:** 2026-06-20

## Summary
Make testing a first-class step in the pai-orbit workflow: extend `/test` mode with runnable sub-commands, add a blocking post-build hook, scaffold test-plan templates, detect test runners in `/setup`, capture results to `docs/wip/`, and gate both `/deploy` and CI on a passing test run.

## Requirements
1. `/test` mode gains runnable sub-commands (`run`, `capture`, `report`) so Claude can execute tests, not just plan them.
2. A post-build hook blocks the session from closing until the test suite passes for the changed code.
3. `/setup` auto-detects the test runner from project files and writes the hook and CI workflow.
4. Test results are captured to `docs/wip/test-result-<feature>-<date>.md` for traceability.
5. `/deploy` checks for a passing test result before proceeding.
6. `/setup` generates a CI workflow file (`.github/workflows/test.yml` or equivalent) for the detected runner.

## User Stories
- As a developer finishing a build session, I want a blocking test hook to catch regressions before I ship, so that broken code never reaches the deploy step.
- As a developer on a new project, I want `/setup` to detect my test runner and wire up everything automatically, so that I don't have to configure hooks and CI manually.
- As a reviewer, I want test results captured in `docs/wip/`, so that I can see what was tested and when without re-running the suite.
- As a developer deploying, I want `/deploy` to refuse if tests haven't passed, so that I can't accidentally skip QA.

## Features
| Feature | Status |
|---------|--------|
| `/test` mode run/capture/report sub-commands | Not started |
| Post-build blocking test hook | Not started |
| `test-plan.md` standalone template | Not started |
| Multi-runner support (jest / pytest / vitest / go test) | Not started |
| Test result capture to `docs/wip/` | Not started |
| `/deploy` test-pass gate | Not started |
| `/setup` runner auto-detection + CI workflow generation | Not started |

## Implementation notes
- **No new skill file.** The `/test` mode (`modes/test.md`) is extended with `run`, `capture`, and `report` sub-commands rather than creating a parallel `skills/test/SKILL.md`.
- **Post-build hook is blocking (sync).** Unlike the existing async lint hooks, the test hook must block — a failing test is a build blocker, not an advisory. Wire as `"async": false` in settings.json.
- **CI integration is dual-scope:** `/setup` generates CI workflow files AND `/deploy` gates on test pass. Both are required.
- **Runner detection signals:** jest → `jest` key in `package.json` or `jest.config.*`; pytest → `pytest` in `pyproject.toml` or `requirements*.txt`; vitest → `vitest` key in `package.json`; go test → `go.mod` present.
- **`test-plan.md` template** should be extracted from the inline format in `modes/test.md` into `templates/docs/features/test-plan.md` so `/setup` can scaffold it alongside other feature docs.

## Success Metrics
- A build session cannot be closed with a red test run unless the user explicitly overrides.
- `/setup` on a Python or Node.js project produces a working CI workflow and hooked test runner without manual config.
- Test results for every shipped feature are traceable in `docs/wip/`.

## Decisions
- **`/test` skill vs mode:** extend the existing mode — no separate skill file. (resolved 2026-06-20)
- **Post-build hook behaviour:** blocking (sync), not async. A failing test is a build blocker. (resolved 2026-06-20)
- **CI integration scope:** both — generate CI workflow files in `/setup` AND gate `/deploy` on test pass. (resolved 2026-06-20)

## Open Questions
- [ ] Which CI providers should `/setup` generate workflow files for? (GitHub Actions only, or also GitLab CI and others?) — owner: Punit Singhal
- [ ] Should the `/deploy` test-pass gate check for a `docs/wip/test-result-*.md` file, or run the suite inline? — owner: Punit Singhal
