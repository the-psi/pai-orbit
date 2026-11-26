# Test plan: Agentic Factory

**Date:** 2026-11-26
**Issue:** none (standalone, local only)
**Requirements:** [requirements.md](./requirements.md) — 48 REQs, 43 ACs, 15 scenarios
**Design:** [design.md](./design.md)
**Result:** 546 of 546 automated tests pass. Six real tickets were taken from "ready" to "released"
by the actual Claude CLI: two on the host, two inside the Docker container on a local board, and
two inside the Docker container against GitHub. 34 of 43 acceptance criteria are proven, 6 are proven
in part, and 3 are not yet proven (see "Coverage"). GitHub was exercised in a one-person,
single-account trial; pull request reviews by a second person were not.

---

## Summary

Three kinds of evidence were gathered, because no single one can prove this feature:

1. **Automated tests** with a simulated agent, a file-based board and code host, and a real git
   remote on disk. They prove the orchestrator: gates, limits, timers, hand-back, release, control.
2. **A real run** with the Claude CLI and the unchanged pai-orbit plugin on a small fixture
   project. It proves the part the tests cannot: that the modes follow the unattended contract.
3. **A container run** of the built Docker image, first with the simulated agent and then with the
   real one. It proves the packaging and the "server" setup.

## How it was tested

### 1. Automated tests

Run: `node --test factory/test/*.test.js` (Node 24.13, Windows 11, about 5 minutes; no model, no
network).

| Files | Tests | What they cover |
|---|---|---|
| `unit-*.test.js` (12 files) | 335 | Config validation, working calendar, state store, process helper, Claude CLI arguments and result parsing, stage prompts, notifiers, preflight, operator CLI, contract and schema |
| `pipeline-*.test.js` (14 files) | 167 | Intake, questions, gates, merge, waiting timers, failures, parallel tickets, release, control and take-over, merge conflict, already groomed tickets, release racing a merge |
| `github-*.test.js` (2 files) | 42 | GitHub board and code host against simulated `gh` output |
| `smoke.test.js`, `workspace-tags.test.js` | 2 | One ticket from ready to released and closed; tags synced before a release |
| **Total** | **546** | **546 pass, 0 fail** |

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

**With the real agent (2026-11-26).** The factory and the Claude CLI (2.1.332, model
`claude-sonnet-5-5`, the CLI's default for the credential used) ran inside the container against a
purpose-built trial project, `invoice-calc`: a small invoice library with tests, a business-rules
document, and one feature a person had already groomed. Its remote was a bare repo on disk mounted
into the container; the board was the local file board. A person's part (answers, approvals) was
played by the tester, who read each output before approving.

| Ticket | Expected | What happened | Cost |
|---|---|---|---|
| #1 Bulk discount, already groomed (`factory-groomed`) | Skip grooming, start at design | Used the person's `requirements.md`, wrote a design, stopped at the design gate; after approval built, tested, reviewed, opened a pull request; merged after review approval; released | USD 0.59 |
| #2 Add Germany as a tax region, raw and clear | Groom without questions | Groomed with every confirmed point tied to the ticket text; stopped at the requirements gate, then the design gate, then code review; merged; released as tag `v1.0.1`; closed | USD 0.62 |
| #3 "Invoices should be more flexible", raw and vague | Ask or refuse, never guess | Wrote nothing and declined with the reason that the ticket could mean several unrelated features | USD 0.09 |
| #4 Charge a saved card, labelled `payments` | Refuse before any agent runs | Declined at intake; no agent call | USD 0.00 |

Checks made on the result, independently of the agent's own reports:

- Ticket 1: each of the six acceptance criteria in the person's requirements was run as a direct
  calculation against the branch and gave the exact numbers; 13 of 13 tests passed; the existing
  test file was unchanged.
- Ticket 2: Germany at 10000 cents gave tax 1900 and total 11900; an unlisted region was still
  refused; 9 of 9 tests passed.
- After both merged: a fresh clone of the base branch passed 16 of 16 tests, and a German invoice
  large enough for the bulk discount gave the correct combined result.

Ticket 1 did not go through cleanly the first time. Its path found defects 7, 8 and 9 below; after
each fix the image was rebuilt and the stage was run again with the real agent.

Ticket 3 was declined here, whereas a similar vague ticket in the host run produced questions.
Both are allowed by the contract. Which is preferred for vague tickets is a product choice that has
not been made.

**With the simulated agent (earlier).**

`docker build -f factory/Dockerfile -t orbit-factory:dev .` on Docker Desktop 29.6 (Linux engine),
then inside the container: one ticket from ready to done with the simulated agent, `preflight`, and
orbit's `bash-guard` hook blocking `git add -A` and allowing `git status`. The container runs as a
non-root user and contains Node 22, git, `gh` and the Claude CLI.

---

### 4. Run against GitHub (2026-11-26)

The same trial project was published as a public repo with four issues as tickets, and the factory
ran in Docker against it with the real agent. It was a **single-account trial**
(`trial.singleAccount`): the factory ran under the tester's own account with a fine-grained token
limited to that one repo, so approvals were comments on the issue. The approvals were given by the
requester in the browser, not by the tester.

| Issue | What happened on GitHub | Cost |
|---|---|---|
| #1 Bulk discount, already groomed | Recognised as groomed; design written; after approval built, tested and reviewed; pull request #5 opened; merged after approval; released; closed | USD 0.36 |
| #2 Add Germany, raw | Groomed; requirements, then design, approved; pull request #6 opened; merged after approval; released; closed | USD 0.55 |
| #3 Vague ticket | Declined with advice on how to resubmit; `factory-declined` set | USD 0.09 |
| #4 `payments` label | Declined at intake; no agent run | USD 0.00 |

Both tickets went out as one release, tag `v1.0.1`, on the commit that holds both merges. A fresh
clone of the base branch passed 18 of 18 tests, and a German invoice large enough for the bulk
discount gave the correct combined result. Each pull request was checked independently before the
requester approved: the acceptance numbers in the requirements were recomputed and matched, and no
existing test had been changed.

What this run exercised in the GitHub adapters for the first time, successfully: listing eligible
issues by either start label, reading an issue, claiming (labels and assignee), commenting, reading
comments since a time, the waiting label, pushing branches, opening pull requests, reading pull
request state and mergeability, merging, pushing a tag, releasing labels, and closing issues.

What it did **not** exercise: reading pull request reviews from a second person (the normal merge
gate), `changes_requested` reviews, a merge conflict, and the branch-protection check, which needs a
permission the trial token did not have and so reported "could not confirm".

## Defects found and fixed during testing

| # | Found by | Defect | Fix |
|---|---|---|---|
| 1 | Real run | Two approved tickets merged at the same moment and collided on the base branch; the second was handed back | Merges run one at a time per project; a real git conflict now sends the ticket back for rework. New test: `pipeline-conflict.test.js` |
| 2 | Container run | Hook scripts had Windows line endings in the image, so `bash-guard` could not run | The image strips them at build time |
| 3 | Unit tests | A ticket id of `.` or `..` wrote state outside its own run folder | Such ids are prefixed |
| 4 | Unit tests | An unknown command reported "cannot read config" instead of "unknown command" | Command is checked first |
| 5 | Scenario tests | A released ticket was not moved to the board column mapped to "done" | Release now goes through the same stage-change path as every other stage |
| 6 | Code review during build | A stage that finished after a person took the ticket over overwrote the "taken over" status | The on-disk status is re-read before a stage result is recorded |
| 7 | Docker run, real agent | A groomed ticket in a billing library was designed correctly and then refused, because the agent was asked whether the work touched a "sensitive area" and answered "billing" | The agent is no longer asked to judge. The design lists the files it will change and the factory matches them against the project's protected path patterns; the files actually changed are checked again after build |
| 8 | Docker run, real agent | One ticket's release ran while another ticket was being merged; the release's push of the base branch was refused and a correctly released ticket was handed back | A release and a merge can no longer overlap; the base branch is pushed only when the release added commits, and never by force |
| 9 | Docker run, real agent | A tag left in the workspace by the failed release attempt blocked the next attempt's push | Before a release the workspace's tags are made identical to the remote's |
| 10 | GitHub run | GitHub refused one push with a bare "(failed)" while another ticket was pushing; the factory treated it as fatal and handed a healthy ticket back | A failed push is tried twice more before it is an error |
| 11 | GitHub run | The requester approved with "Quote reply" and the word `approve`; the factory required a comment starting with `/approve` and ignored it | Quoted lines are skipped and the first typed line decides; the slash is optional. A comment of `reply` was, correctly, not taken as approval |

Not a defect, but it cost a pass: the first token had read access only, so GitHub refused every
write. Nothing was changed on the repo. `preflight` reported "gh is authenticated" and could not
tell that the token lacked write access; a write-permission check in `preflight` is worth adding.

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
| AC-30 | The image builds and the full flow runs in a container on Docker Desktop, with the simulated agent and with the real one | Not run on a server |
| AC-39 | One release at a time; release credentials reach only the release stage | "No production credential present at level `tag`" depends on how the operator fills `.env`, which the factory cannot check |

**Not yet proven:**

| AC | Why |
|---|---|
| AC-4 | Factory-written documents were not compared side by side with person-driven ones. The two real tickets produced documents with the mode's structure, which is an observation, not a test |
| AC-23 | Only one project configuration at a time was run; per-project independence across two projects was not exercised |
| AC-32 | Interactive orbit was not re-tested. The supporting fact is that this change does not touch `plugins/` at all (`git diff --stat main -- plugins/` is empty) |

---

## Not tested at all

- **GitHub with a separate factory identity.** The adapters now work against GitHub in a
  single-account trial. Pull request reviews by a second person, `changes_requested`, a merge
  conflict and the branch-protection check have not been exercised.
- **Slack.** The notifier was tested with a simulated HTTP call only.
- **Optional `/playwright` stage** with a real agent.
- **Release levels `staging` and `production`.**
- **A real-sized codebase.** The fixture is a few files. Cost, run time and the quality of
  unattended grooming on a large project are unknown.
- **Long pauses.** Resuming a session after days, or after the session store is lost, was tested
  only with the simulated agent.
- **Resume cost accounting.** When a paused stage is resumed, the CLI may report the session's
  cumulative cost, which the factory would then add again. If so, the factory over-counts, which is
  the safe direction. Not confirmed either way.

## Test cases to add in the pilot

- [ ] Ten or more real tickets on GitHub with a separate factory identity (two done in a single-account trial)
- [ ] The real agent inside the container with an API key (done with a personal subscription token)
- [ ] A real merge conflict resolved by the real agent
- [ ] A restart of the container in the middle of a real stage
- [ ] Factory-written requirements and design compared with a developer's on the same tickets
- [ ] An adversarial ticket whose text tells the agent to merge or to skip the gates
