# Test plan: Agentic Factory

**Date:** 2026-11-26
**Issue:** none (standalone, local only)
**Requirements:** [requirements.md](./requirements.md) — 48 REQs, 43 ACs, 15 scenarios
**Design:** [design.md](./design.md)
**Result:** 519 of 519 automated tests pass. Two real tickets were taken from "ready" to "released"
by the actual Claude CLI on a local fixture. 34 of 43 acceptance criteria are proven, 6 are proven
in part, and 3 are not yet proven (see "Coverage"). Nothing was run against GitHub.

---

## Summary

Three kinds of evidence were gathered, because no single one can prove this feature:

1. **Automated tests** with a simulated agent, a file-based board and code host, and a real git
   remote on disk. They prove the orchestrator: gates, limits, timers, hand-back, release, control.
2. **A real run** with the Claude CLI and the unchanged pai-orbit plugin on a small fixture
   project. It proves the part the tests cannot: that the modes follow the unattended contract.
3. **A container run** of the built Docker image with the simulated agent. It proves the packaging.

## How it was tested

### 1. Automated tests

Run: `node --test factory/test/*.test.js` (Node 24.13, Windows 11, about 5 minutes; no model, no
network).

| Files | Tests | What they cover |
|---|---|---|
| `unit-*.test.js` (10 files) | 325 | Config validation, working calendar, state store, process helper, Claude CLI arguments and result parsing, stage prompts, notifiers, preflight, operator CLI, contract and schema |
| `pipeline-*.test.js` (11 files) | 151 | Intake, questions, gates, merge, waiting timers, failures, parallel tickets, release, control and take-over, merge conflict, already groomed tickets |
| `github-*.test.js` (2 files) | 42 | GitHub board and code host against simulated `gh` output |
| `smoke.test.js` | 1 | One ticket from ready to released and closed |
| **Total** | **519** | **519 pass, 0 fail** |

The unit and scenario tests were written by sub-agents that were given the requirements and told to
assert the required behaviour, not what the code did, and not to edit the source.

### 2. Real run with the Claude CLI

Setup: a small Node library ("greeter") with a bare git repo on disk as its remote; the local
file-based board; `runner.type: claude-cli` (Claude Code 2.1.308) loading
`plugins/pai-orbit/dist/claude-code/`; requirements gate on; concurrency 2. The run used the Claude
Code login already on the machine, on the host, not in the container.

| Ticket | What happened | Cost |
|---|---|---|
| #1 "Add a farewell function" (clear, with acceptance criteria) | Groomed with no questions; every auto-confirmed point cited the ticket text. Stopped at the requirements gate. After approval: design, build, test, review, pull request. The test stage reported a genuinely failing test command, the factory sent it back to build, and the second pass was green. Merged after a named reviewer approved; released to tag `v1.0.1` after the release approver approved; closed. | USD 1.44 |
| #2 "Make greetings better" (deliberately vague) | The agent wrote nothing and returned five questions, which the factory posted on the ticket. After the reporter answered, the same session was resumed, `decisions-log.md` was written, and requirements were produced. Then as #1. Released to tag `v1.0.2`; closed. | USD 1.60 |

Checks made against the result, not taken from the agent's reports:

- The remote's `main` contains both features; a fresh clone runs `npm test`: 6 of 6 pass.
- Each ticket branch holds `requirements.md`, `design.md` and `test-plan.md` in its feature folder.
- An `/approve` from a person not named for the role did not advance the requirements gate.
- An approving review from the factory's own identity did not merge.
- An `/approve` on the release gate from the merge approver (not a release approver) was ignored.

### 3. Container run

`docker build -f factory/Dockerfile -t orbit-factory:dev .` on Docker Desktop 29.6 (Linux engine),
then inside the container: one ticket from ready to done with the simulated agent, `preflight`, and
orbit's `bash-guard` hook blocking `git add -A` and allowing `git status`. The container runs as a
non-root user and contains Node 22, git, `gh` and the Claude CLI.

---

## Defects found and fixed during testing

| # | Found by | Defect | Fix |
|---|---|---|---|
| 1 | Real run | Two approved tickets merged at the same moment and collided on the base branch; the second was handed back | Merges run one at a time per project; a real git conflict now sends the ticket back for rework. New test: `pipeline-conflict.test.js` |
| 2 | Container run | Hook scripts had Windows line endings in the image, so `bash-guard` could not run | The image strips them at build time |
| 3 | Unit tests | A ticket id of `.` or `..` wrote state outside its own run folder | Such ids are prefixed |
| 4 | Unit tests | An unknown command reported "cannot read config" instead of "unknown command" | Command is checked first |
| 5 | Scenario tests | A released ticket was not moved to the board column mapped to "done" | Release now goes through the same stage-change path as every other stage |
| 6 | Code review during build | A stage that finished after a person took the ticket over overwrote the "taken over" status | The on-disk status is re-read before a stage result is recorded |

---

## Coverage of acceptance criteria

**Proven** (automated test, and where marked ●, also seen in the real run):
AC-1, AC-2, AC-3 ●, AC-5, AC-6 ●, AC-7 ●, AC-8 ●, AC-9 ●, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15,
AC-16, AC-18, AC-20, AC-21, AC-24, AC-25 ●, AC-26, AC-27, AC-29, AC-31, AC-33 ●, AC-34 ●,
AC-35, AC-36, AC-37, AC-38, AC-40, AC-41, AC-42, AC-43.

**Proven in part:**

| AC | What is proven | What is not |
|---|---|---|
| AC-17 | Each ticket has its own directory and branch; no file crosses over | A stage that runs shell commands is not prevented from reading a sibling directory. Isolation is by convention until per-ticket containers exist (design, "Known limits") |
| AC-18 | With the simulated agent: two tickets changing the same line never overwrite each other; the second is reworked and merges after a fresh approval | A real agent resolving a real conflict. In the real run git merged the two tickets cleanly, so the agent never had to |
| AC-19 | Sensitive labels, epic labels and too many acceptance criteria are declined before any agent call | "More than one repo" at intake is not detected; the factory works on one repo per configuration |
| AC-22 | The audit trail survives the run; in the real run each stage's raw output was kept | Retention period and shipping to an external store are not defined |
| AC-28 | A ticket assigned to a person is never picked up | "In progress under a person" with no assignee has no marker the factory can read |
| AC-30 | The image builds and the full flow runs in a container on Docker Desktop | Not run on a server; the real agent has not run inside the container |
| AC-39 | One release at a time; release credentials reach only the release stage | "No production credential present at level `tag`" depends on how the operator fills `.env`, which the factory cannot check |

**Not yet proven:**

| AC | Why |
|---|---|
| AC-4 | Factory-written documents were not compared side by side with person-driven ones. The two real tickets produced documents with the mode's structure, which is an observation, not a test |
| AC-23 | Only one project configuration at a time was run; per-project independence across two projects was not exercised |
| AC-32 | Interactive orbit was not re-tested. The supporting fact is that this change does not touch `plugins/` at all (`git diff --stat main -- plugins/` is empty) |

---

## Not tested at all

- **GitHub.** The board and code-host adapters have never called GitHub. Their assumptions about
  `gh` output are listed in the adapter tests and are unverified. This is the first job of a pilot.
- **Slack.** The notifier was tested with a simulated HTTP call only.
- **Optional `/playwright` stage** with a real agent.
- **An already groomed ticket with a real agent.** Starting at design from a person's
  `requirements.md` is proven with the simulated agent only. The real run did exercise the real
  `/design` reading a `requirements.md`, but one the factory's own groom stage had written.
- **Release levels `staging` and `production`.**
- **A real-sized codebase.** The fixture is a few files. Cost, run time and the quality of
  unattended grooming on a large project are unknown.
- **Long pauses.** Resuming a session after days, or after the session store is lost, was tested
  only with the simulated agent.
- **Resume cost accounting.** When a paused stage is resumed, the CLI may report the session's
  cumulative cost, which the factory would then add again. If so, the factory over-counts, which is
  the safe direction. Not confirmed either way.

## Test cases to add in the pilot

- [ ] Ten or more real tickets on a GitHub sandbox repo with a bot account
- [ ] The real agent inside the container, with an API key
- [ ] A real merge conflict resolved by the real agent
- [ ] A restart of the container in the middle of a real stage
- [ ] Factory-written requirements and design compared with a developer's on the same tickets
- [ ] An adversarial ticket whose text tells the agent to merge or to skip the gates
