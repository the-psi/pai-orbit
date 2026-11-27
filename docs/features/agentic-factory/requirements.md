# Agentic Factory — Requirements

Status: Groomed — ready for /design (functional gaps closed with provisional defaults; five await customer confirmation)
Groomed: 2026-11-25
Ticket: none — standalone grooming, kept local at the requester's instruction

## Epic
<!-- Standalone. No parent epic exists yet; this feature is large enough to become one. -->

## Purpose
The Agentic Factory runs pai-orbit's workflow (groom, design, build, test, release) unattended on a
server, so tickets move from backlog to release without a developer driving each step from their PC.
It stops only when it needs a human answer or approval. It serves delivery teams, starting with the
requesting customer, who want more throughput, work that continues with no developer present, and
the same documented process on every ticket.

## Scope
What will be built:
- **Server runner** — a packaged headless environment that runs Claude Code with pai-orbit and no
  person at the keyboard, on local Docker Desktop and on a server.
- **Board intake** — picks up eligible tickets from the project's board.
- **Pipeline orchestrator** — runs groom → design → build → test → playwright → pull request →
  release in order, per ticket.
- **Unattended behaviour for orbit's gated modes** — rules for what the agent decides alone and what
  it escalates, for the stages in the pipeline.
- **Stop-and-ask loop** — posts a question to the ticket, alerts people in chat, pauses the ticket,
  and resumes when answered.
- **Human approval gates** — always before merge and before release; optional and configurable after
  requirements and after design.
- **Isolation and safety** — one sandbox and one branch per ticket, scoped secrets, `bash-guard`
  stays on.
- **Cost and run limits** per ticket.
- **Run visibility** — status, cost, and an audit trail per ticket.
- **Failure handling** — stop, keep the work, report, hand back to a person; resume after a restart.
- **Release step** — runs the project's configured release steps after approval.
- **Factory configuration per project** — eligible-ticket marker, optional gates, limits,
  concurrency, sensitive areas, pause and stop controls.
- **Several tickets in parallel**, up to a configured limit.
- **Swappable runner** — Claude first; the runner can be replaced by another tool later.

What this does NOT include:
- Changes to how interactive orbit works on a developer's PC — every existing mode keeps working
  unchanged for people.
- Non-Claude runners (Codex, Cursor, Copilot) in the first delivery.
- Rebuilding `/build`'s in-session parallel streams
  (`docs/decisions/2026-11-03-build-orchestrator-streams.md`) — reused as-is.
- A custom LLM agent loop — the factory uses the Claude CLI / Agent SDK.
- Release with zero human approval.
- Deciding what enters the backlog or its priority — `docs/backlog/` and board prioritisation stay
  human decisions.
- A hosted multi-customer service or a web dashboard.

## Scenarios in scope
1. **Intake** — a ticket is marked eligible; the factory picks it up by itself and starts a run.
2. **Happy path** — a ticket runs through every stage with no questions, pausing only at approval
   gates, and leaves the usual orbit documents in the repo.
3. **Stop and ask** — the agent hits something it cannot decide alone; it posts the question, pauses
   the ticket, and continues from the same point once a person answers.
4. **Approval gate** — an approver approves and the run continues, or rejects with feedback and the
   factory reworks the ticket.
5. **No reply** — a question or approval goes unanswered; the ticket stays parked, the factory
   reminds or escalates, and other tickets keep moving.
6. **Run cannot finish** — tests keep failing, the run crashes, or a cost or time limit is reached;
   the factory stops, keeps the work, reports, and hands the ticket back.
7. **Parallel tickets** — several eligible tickets are worked on at once, isolated from each other,
   up to a limit, including tickets that touch the same code.
8. **Decline** — a ticket is unsuitable for unattended work (too vague, too large, or in a sensitive
   area); the factory declines it, says why, and returns it to people.
9. **Visibility** — an operator can see each ticket's stage, what it is waiting on, its cost so far,
   and a record of what the agent did.
10. **Configuration and control** — an operator configures the factory for a project and can pause
    or stop the factory or a single ticket at any time.
11. **Release** — after merge and release approval, the factory runs the project's release steps; if
    the release fails it stops and reports without retrying blindly.
12. **Shared board and repo** — people and the factory work on the same board and repo; people can
    see which tickets the factory owns, the factory never takes a ticket a person is working on, and
    a person can take a ticket over.
13. **Local and server** — the same package runs on local Docker Desktop and on a server with the
    same behaviour.
14. **Playwright automation** — after the test plan is written, the factory runs `/playwright`
    unattended to write browser test automation, for projects that use it.
15. **Already groomed ticket** — a person has groomed the ticket and its `requirements.md` is in the
    repo; the factory skips its own grooming, uses those requirements, and starts at design. Added
    2026-11-26 at the requester's direction, who expects this to be the main way the factory is
    used. A ticket that is not marked as groomed is still groomed by the factory (Scenario 2).

## Consumer check
- Signal: `interactive confirmation gates` ("wait for confirmation" / "ask the user" steps in modes
  and skills)
- Classification: Existing — the factory changes how these gates are answered when no person is
  present
- Override: none
- Search terms: `wait for`, `confirm`, `ask the user`, `do not assume silence`,
  `explicit approval`, `explicit confirmation`, `AskUserQuestion` (case-insensitive)
- Repos searched: pai-orbit (`plugins/pai-orbit/core`) · Not reachable: none
- Concept map: no concept map found
- Consumers found:
  - `/groom`, `/design`, `/build`, `/test`, `/review`, `/release` modes and the `board`, `git`
    skills (pai-orbit) → In scope, Scenarios 2, 3, 4 (the surface the request already names)
  - `/playwright` mode (pai-orbit) → In scope, Scenario 14
  - `/ux` mode (pai-orbit) → Excluded, see Out of scope
  - `/domain` mode (pai-orbit) → Excluded, see Out of scope
  - `/arch` mode (pai-orbit) → Excluded, see Out of scope
  - `/setup` mode (pai-orbit) → Excluded, see Out of scope
  - `/incident` mode (pai-orbit) → Excluded, see Out of scope
  - `/data` mode (pai-orbit) → Excluded, see Out of scope
  - `process-map` skill (pai-orbit) → Excluded, see Out of scope
  - `epic` skill (pai-orbit) → Excluded, see Out of scope
- Test-only hits: 0 files (search was limited to `core/`; templates matched in 4 files and are
  scaffolds, not consumers)
- Map discrepancies: none — no map exists; suggest creating `docs/domain/concept-consumers.md`

- Signal: `board ticket status` (the columns under `## Agile Board` in `.claude/pai-orbit-config.md`)
- Classification: Unclear — the factory becomes a new automatic reader and mover of cards that
  people and modes also move; the check ran by default
- Override: none
- Search terms: `Agile Board`, `move the card`, `move the issue`, `status option`, `In progress`,
  `In review` (case-insensitive)
- Repos searched: pai-orbit (`plugins/pai-orbit/core`) · Not reachable: none
- Concept map: no concept map found
- Consumers found:
  - Developers and the `/catchup`, `/build`, `/review`, `/board` surfaces working on the same board
    at the same time (pai-orbit) → In scope, Scenario 12
- Test-only hits: 0 files
- Map discrepancies: none — no map exists

- Signal: `factory configuration` (new settings section)
- Classification: New — a new name that nothing reads today and that changes no existing setting
- Override: none

## User stories / use cases
- As a team lead, I want to mark a ticket as ready for the factory, so that work starts without
  assigning a developer. (Scenario 1)
- As a team lead, I want a ticket to go from backlog to release with the full orbit document trail,
  so that unattended work is as traceable as a developer's. (Scenario 2)
- As a product owner, I want the factory to ask me when a requirement is unclear, so that it does
  not guess. (Scenario 3)
- As a reviewer, I want to approve or reject work at fixed points, so that nothing merges or
  releases without a person's decision. (Scenario 4)
- As a team lead, I want to be reminded when the factory is waiting on someone, so that tickets do
  not sit forgotten. (Scenario 5)
- As a developer, I want a failed run handed back with its work and a clear report, so that I can
  finish it without starting over. (Scenario 6)
- As a team lead, I want several tickets progressing at once, so that throughput goes up.
  (Scenario 7)
- As a team lead, I want the factory to refuse tickets it should not attempt, so that risky or vague
  work stays with people. (Scenario 8)
- As an operator, I want to see what every run is doing and what it costs, so that I can trust and
  budget for the factory. (Scenario 9)
- As an operator, I want to configure, pause, and stop the factory, so that I stay in control.
  (Scenario 10)
- As a release approver, I want the factory to run the release steps after my approval, so that
  release does not wait for a developer. (Scenario 11)
- As a developer, I want to see which tickets the factory owns and take one over, so that we do not
  collide. (Scenario 12)
- As a platform engineer, I want to run the factory on my own machine in Docker, so that I can build
  and test it before it goes to a server. (Scenario 13)
- As a QA lead, I want browser test automation written as part of the run, so that tested tickets
  arrive with e2e coverage. (Scenario 14)
- As a product owner, I want to groom a ticket myself and hand the rest to the factory, so that
  people decide what is built and the factory builds it. (Scenario 15)

## Functional requirements
1. REQ-1 (Scenario 1): The factory must detect tickets that carry the project's configured
   eligibility marker (a label, a board column, or both) and start a run without a person
   triggering it.
2. REQ-2 (Scenario 1): The factory must mark a ticket as taken at pick-up — with a factory ownership
   marker and the factory's own identity as assignee — so that no second run and no person starts
   the same ticket unknowingly.
3. REQ-3 (Scenario 2): The factory must run the stages in order — groom, design, build, test,
   playwright (where used), pull request, release — and must not start a stage until the previous
   stage's output exists.
4. REQ-4 (Scenario 2): Each stage must produce the same documents, in the same locations, that the
   corresponding orbit mode produces for a person (`requirements.md`, `design.md`, ADRs,
   `test-plan.md`, code, updated docs).
5. REQ-5 (Scenario 2): Each stage must keep orbit's mode discipline — no design inside build, no
   implementation inside design.
6. REQ-6 (Scenario 2): The factory must move the ticket on the board as it advances, following a
   configurable map from factory stage to board column, so the board reflects the true stage.
7. REQ-7 (Scenario 3): When a stage cannot proceed without a human decision, the factory must post
   the question as a comment on the ticket, send a chat alert linking to it, and pause that ticket.
8. REQ-8 (Scenario 3): When the question is answered on the ticket, the factory must re-enter the
   paused stage with the answer; stages already completed must not be redone.
9. REQ-9 (Scenario 3): The factory must record every question and answer in the feature's documents,
   so the decision is not left only in the ticket thread.
10. REQ-10 (Scenario 3): The factory must not answer its own functional questions by assumption;
    where it proceeds on an assumption allowed by configuration, it must state the assumption in the
    stage's output document.
11. REQ-11 (Scenario 4): The factory must always stop for human approval before merge and before
    release; these two gates cannot be switched off.
12. REQ-12 (Scenario 4): Gates after requirements and after design must be available and switchable
    per project.
13. REQ-13 (Scenario 4): On approval the run must continue; on rejection with feedback the factory
    must rework the stage using that feedback and return to the same gate. After a configured number
    of rework cycles at one gate (default 3) the factory must hand the ticket back (REQ-17).
14. REQ-14 (Scenario 4): A pull request review that requests changes must be treated as rejection
    feedback and addressed by the factory; ordinary comments alone do not count as a rejection.
15. REQ-15 (Scenario 5): When a question or approval is unanswered past a configured period, the
    factory must send a reminder, and past a second configured period it must escalate to a
    configured person or role.
16. REQ-16 (Scenario 5): A parked ticket must not block other tickets from running.
17. REQ-17 (Scenario 6): When a run cannot finish — tests still failing after a configured number of
    fix attempts (default 3), crash, rework limit reached, or a cost or time limit reached — the factory must stop that ticket, keep all work done so far on its branch,
    post a report on the ticket stating the stage and the cause, and hand the ticket back to people.
18. REQ-18 (Scenario 6): The factory must enforce a cost limit and a time limit per ticket and stop
    the run when either is reached. The time limit counts active run time only; time spent parked
    waiting for a person is excluded.
19. REQ-19 (Scenario 6): After a restart of the factory itself, in-flight tickets must continue from
    their last completed stage rather than start over.
20. REQ-20 (Scenario 7): The factory must run several tickets at the same time, up to a configured
    limit, each in its own isolated workspace and branch.
21. REQ-21 (Scenario 7): One ticket's run must not be able to read or change another ticket's
    workspace.
22. REQ-22 (Scenario 7): When two tickets change the same code, the factory must detect the conflict
    before merge and either resolve it or raise it to a person; it must never merge over a conflict
    silently.
23. REQ-23 (Scenario 8): Before starting work, the factory must assess whether a ticket is suitable
    for unattended work and decline it when it is too vague to groom, exceeds the project's
    configured size thresholds, or falls in a project-configured sensitive area. Size must be checked
    twice: at intake, and again after design when the real extent of the change is known.
24. REQ-24 (Scenario 8): A declined ticket must be returned to people with the reason posted on the
    ticket and its eligibility marker cleared, so it is not picked up again unchanged.
25. REQ-25 (Scenario 8): A ticket that turns out to need UX, domain, or architecture work that does
    not exist must be escalated as a question (Scenario 3) or declined — the factory must not
    produce that work itself.
26. REQ-26 (Scenario 9): For every ticket the factory must expose its current stage, what it is
    waiting on and for how long, and its cost so far.
27. REQ-27 (Scenario 9): The factory must keep an audit record per run of what the agent did,
    retained after the run ends.
28. REQ-28 (Scenario 10): An operator must be able to configure, per project: the eligibility
    marker, the optional gates, cost and time limits, the concurrency limit, sensitive areas,
    reminder and escalation periods, and who is notified.
29. REQ-29 (Scenario 10): An operator must be able to pause and resume the whole factory, and pause
    or stop a single ticket, at any time; a stopped ticket follows the hand-back in REQ-17.
30. REQ-30 (Scenario 11): After merge and release approval, the factory must run the release steps
    declared in the project's orbit configuration, up to the project's configured release level
    (`tag`, `staging`, or `production`). Releases must run one at a time per project, and one release
    may cover several merged tickets.
31. REQ-31 (Scenario 11): If a release step fails, the factory must stop, report on the ticket, and
    not retry without a person's instruction.
32. REQ-32 (Scenario 11): On successful release the factory must close the ticket and update the
    documents that orbit's release flow updates.
33. REQ-33 (Scenario 12): Tickets owned by the factory must be visibly marked on the board.
34. REQ-34 (Scenario 12): The factory must not pick up a ticket that is assigned to a person or
    already in progress under a person. A ticket carrying the factory's own ownership marker is the
    factory's to continue, including after a restart.
35. REQ-35 (Scenario 12): A person must be able to take a ticket over from the factory; the factory
    must then stop working on it and leave its branch and documents in place.
36. REQ-36 (Scenario 12): The factory must not push to a branch it does not own and must not change
    a person's in-flight work.
37. REQ-37 (Scenario 13): The same factory package must run on local Docker Desktop and on a server,
    with configuration as the only difference.
38. REQ-38 (Scenario 14): For projects configured to use Playwright, the factory must run the
    `/playwright` stage after the test plan and include the resulting e2e files in the pull request;
    for other projects the stage is skipped.
39. REQ-39 (Scenarios 3, 4): Only people named in the project's configuration for a role may answer
    questions or approve at a gate. A comment from anyone else must not resume a run or count as an
    approval.
40. REQ-40 (Scenario 4): The factory's own identity must never count as an approver, and the factory
    must not bypass the code host's branch protection.
41. REQ-41 (Scenario 4): If the approved content changes after approval (for example a rebase to
    resolve a conflict), the approval is void and must be given again.
42. REQ-42 (Scenario 5): A ticket parked longer than a configured maximum age must be handed back to
    people (REQ-17) rather than wait indefinitely.
43. REQ-43 (Scenario 11): Credentials for a release level must be available only to the release step
    and only after release approval. At the default level (`tag`) the factory holds no production
    credentials.
44. REQ-44 (Scenarios 6, 9): The factory must enforce a spend limit per project per day, and warn
    the notified people when a ticket passes a configured share of its cost limit.
45. REQ-45 (Scenario 15): A person must be able to hand over an already groomed ticket with a single
    marker, used instead of the marker for a raw ticket. For such a ticket the factory must not run
    its own groom stage and must start at design.
46. REQ-46 (Scenario 15): For a groomed ticket the factory must use the existing `requirements.md`:
    the one whose path is given in the ticket text, or else the one in the feature folder named
    after the ticket. It must not rewrite that file in place of the person's work, and the optional
    requirements gate does not apply.
47. REQ-47 (Scenario 15): If a ticket is marked as groomed and no `requirements.md` can be found on
    the base branch, the factory must decline it with a reason that says how to fix it, and must not
    guess or groom it silently.
48. REQ-48 (Scenario 15): Every intake check (sensitive area, size) applies to a groomed ticket
    exactly as to any other.

## Non-functional requirements
- **Security** — secrets are scoped to the minimum each run needs, are never written to documents,
  logs, or ticket comments, and are not shared between tickets. `bash-guard` stays active in every
  run.
- **Isolation** — a run can affect only its own workspace and branch.
- **Cost control** — spend is bounded per ticket and reportable per project.
- **Auditability** — every autonomous action is attributable to a ticket and a run.
- **Reliability** — a crash or restart loses no completed stage output.
- **Portability** — identical behaviour on local Docker and on a server.
- **Runner independence** — the pipeline does not depend on Claude-specific behaviour in a way that
  prevents adding another runner later.
- **Platform independence** — tickets may live on GitHub, GitLab, Jira or Azure DevOps, and the
  code on a different platform from the tickets. The pipeline may rely only on what all of them
  have: labels or tags, comments, an assignee, and open or closed. Added 2026-11-26 at the
  requester's direction.
- **No regression for people** — interactive orbit on a developer's machine behaves exactly as
  before (constraints.md rule 7).
- **Licensing** — the factory's authentication to the model provider must be of a kind the
  provider's terms allow for shared, unattended use.

## Context
- **No ticket.** Groomed standalone at the requester's instruction; nothing was created or posted
  on the board.
- **Board not consulted.** The requester asked for a local-only session, so roadmap overlap was
  checked against `docs/plans/`, `docs/epics/`, and `docs/features/` only. Tracked work on the board
  that overlaps this feature would not have been seen.
- **No capabilities registry.** `docs/domain/product-capabilities.md` does not exist; overlap was
  checked against `docs/features/*` as the weaker fallback. No overlap found.
- **No domain docs.** `docs/domain/` is empty. The customer's reasons (throughput, unattended
  running, consistent process) come from the requester, Chetan Sharma, and have not been validated
  with the customer — treat them as an assumption.
- **Origin.** A customer asked whether orbit can become an "Agentic Factory": moved from PC to
  server, and autonomous from backlog to release, stopping only for questions.
- **Conflict with declared architecture.** `docs/architecture/system.md` declares pai-orbit a static
  content pipeline with no runtime, data stores, or auth. The factory is a running service. Where it
  lives is unresolved (see Open questions).
- **Conflict with constraints.md rule 6 (full adapter parity).** The factory is Claude first, others
  later. If it lives in this repo, that needs a recorded rule 6 exception.
- **Earlier deferral.** `docs/features/multi-tool-compat/design.md` parked an orchestration runtime
  as a future investment; this feature is that investment.
- **Conflict with human-owned principles.** `docs/capabilities.md` and
  `docs/process-and-practices.md` state that Claude does not close board items or move backlog
  entries autonomously. The factory moves and closes tickets by design; those documents will need
  updating when it ships.
- **Assumption.** The factory runs on the Claude CLI / Agent SDK rather than a custom agent loop; to
  be confirmed in `/design`.
- **Status page (scope change, 2026-11-26).** Grooming excluded "a hosted multi-customer service or
  web dashboard". At the requester's direction the factory now serves its own status page: a board,
  live agent activity, and a review screen where a named person approves, sends back or answers.
  It is one page served by the factory, not a hosted product. Decisions made there are re-checked
  by the factory and written on the ticket, so REQ-9 and REQ-39 still hold. Code approval in a
  normal setup stays on the pull request.
- **Feasibility evidence.** Orbit modes have already been driven headless with `claude -p` for
  testing (`docs/features/groom-shared-signal-consumers/test-plan.md`).
- **Factory identity.** The factory acts on the board and code host under its own bot identity,
  separate from any person's account.

### Provisional defaults
Decided on 2026-11-26 by delegation from the requester, without the customer. Every value is a
per-project setting.

| Setting | Default |
|---|---|
| Board and code host | GitHub Issues + GitHub pull requests; ticket state carried by labels (a person adds one of `factory-ready` or `factory-groomed`; the factory sets `factory-owned`, `factory-waiting`, `factory-declined`), board column moves best-effort |
| Chat alerts | Slack incoming webhook, one channel per project, outbound only; answers and approvals are never accepted in chat |
| Who answers questions | Ticket reporter and product owner |
| Optional gate approvers | Requirements: product owner. Design: tech lead |
| Merge approver | A person with write access, through the code host's own pull request approval |
| Release approver | Named release approvers, through an explicit approval on the ticket |
| Same person for merge and release | Allowed as two separate acts; distinct approvers required at release level `production` |
| Reminder / escalation / hand-back | Reminder after 4 working hours, escalation to the team lead after 8, hand-back after 5 working days parked |
| Working calendar | Monday–Friday 09:00–18:00, project time zone |
| Cost limits | USD 50 per ticket (warning at 70%), USD 15 per stage, USD 200 per project per day — **estimates, uncertainty about 3x either way, not measured** |
| Time limits | 8 hours active run time per ticket, 2 hours per stage |
| Rework and fix attempts | 3 rework cycles per gate, 3 test-fix attempts |
| Sensitive areas (declined by default) | Authentication, authorisation and sessions; secrets and cryptography; payments and billing; personal data; schema migrations and destructive data operations; infrastructure, CI/CD and deploy configuration; breaking public API changes; the factory's own configuration, hooks and `.claude/` |
| Too large at intake | Labelled as an epic, more than 8 acceptance criteria, or more than one repo |
| Too large after design | More than 15 files, more than about 600 changed lines, or more than one deployable service |
| Release level | `tag` (run the configured release steps up to a tagged version; no production credentials) |
| Parallel tickets | 2 per project, configurable 1–5 |

## Out of scope
- `/ux` run unattended — UX is a human design conversation; a missing `ux.md` is escalated as a
  question (Scenario 3).
- `/domain` run unattended — domain knowledge comes from human experts; the factory cannot invent
  it and escalates the gap.
- `/arch` run unattended — architecture changes are high-impact human decisions; such tickets are
  declined or escalated. Ticket-level ADRs written by `/design` stay in the pipeline.
- `/setup` run unattended — a one-time interview with the team; a person sets the project up before
  connecting it to the factory.
- `/incident` run unattended — incident response is urgent and human-led, and is not part of the
  backlog-to-release flow the customer asked for.
- `/data` run unattended — on-demand analysis, not a ticket stage.
- `process-map` skill run unattended — planning work people own before tickets reach the backlog.
- `epic` skill run unattended — epics are planning work people own.
- Release with no human approval.
- Creating or prioritising backlog items.
- Non-Claude runners in the first delivery.
- A hosted multi-customer service or web dashboard.

## Open questions
Functional gaps — closed on 2026-11-26 with provisional defaults (see "Provisional defaults" under
Context). The requester delegated these decisions; none has been confirmed by the customer. Each is a
per-project setting, so a different customer answer changes a setting or adds an adapter.
- [x] Board and code host first → GitHub Issues and GitHub pull requests. **Confirm with customer.**
- [x] Chat tool → Slack, outbound alerts only. **Confirm with customer.**
- [x] Roles → named per project; the same person may approve merge and release as two separate
  acts, except at release level `production`. **Confirm with customer.**
- [x] Reminder, escalation, cost and time defaults → set; cost figures are estimates to recalibrate
  after 10–20 pilot tickets.
- [x] Sensitive areas and size thresholds → set.
- [x] Meaning of "release" → default level `tag`, no production access. **Confirm with customer.**
- [x] Parallel tickets → default 2 per project. **Confirm with customer.**

Design questions — deferred to `/design`:
- [ ] Where does the factory live: inside the pai-orbit repo, or a separate repo that installs
  pai-orbit as a dependency? The requester's concern is that prompt fixes must not have to be
  applied in more than one place. Left open for a team discussion. — owner: Chetan Sharma and team
- [ ] How do orbit's gated modes run unattended without forking their prompts? — owner: /design
- [ ] How is run state held across pause, resume, and restart? — owner: /design
- [ ] How is the runner kept swappable for a later non-Claude tool? — owner: /design
- [ ] Which authentication to the model provider is used, given provider terms on unattended and
  shared use? — owner: /design
- [ ] How is the work split into deliverable phases (pilot, chained pipeline, full factory)? —
  owner: /plan, after design

## Acceptance criteria
- AC-1 (Scenario 1): Given a ticket carrying the configured eligibility marker, a run starts for it
  within the configured polling period with no human action.
- AC-2 (Scenario 1): A ticket without the marker is never picked up; a ticket already taken is not
  started a second time.
- AC-3 (Scenario 2): For a ticket needing no questions, the run produces `requirements.md`,
  `design.md`, `test-plan.md`, code, and a pull request, and reaches release with human input only
  at the approval gates.
- AC-4 (Scenario 2): The documents produced match the structure the corresponding orbit modes
  produce for a person.
- AC-5 (Scenario 2): The ticket's board column matches the run's stage at every stage change.
- AC-6 (Scenario 3): When a stage needs a human decision, a question appears as a ticket comment, a
  chat alert links to it, and no further work happens on that ticket until it is answered.
- AC-7 (Scenario 3): After the answer is posted, the run continues from the paused point, completed
  stages are not repeated, and the question and answer appear in the feature's documents.
- AC-8 (Scenario 4): No merge and no release occurs without a recorded human approval, under any
  configuration.
- AC-9 (Scenario 4): With the optional gates switched on, the run stops after requirements and after
  design; with them off, it does not.
- AC-10 (Scenario 4): A rejection with feedback, or a pull request review comment, results in
  reworked output addressing the feedback and a return to the same gate.
- AC-11 (Scenario 5): An unanswered question or approval triggers a reminder after the first
  configured period and an escalation after the second.
- AC-12 (Scenario 5): While one ticket is parked, another eligible ticket starts and progresses.
- AC-13 (Scenario 6): On repeated test failure, crash, or limit reached, the ticket stops, its
  branch retains all work, a report naming the stage and cause is posted on the ticket, and the
  ticket is handed back.
- AC-14 (Scenario 6): A run that reaches its cost or time limit performs no further model calls.
- AC-15 (Scenario 6): After the factory is restarted mid-run, the ticket continues from its last
  completed stage.
- AC-16 (Scenario 7): With N eligible tickets and a limit of M, at most M run at once and the rest
  wait their turn.
- AC-17 (Scenario 7): A run cannot read or modify another run's workspace.
- AC-18 (Scenario 7): Two tickets changing the same code never produce a silent overwrite; the
  conflict is resolved or raised to a person before merge.
- AC-19 (Scenario 8): A ticket that is too vague, too large, or in a configured sensitive area is
  declined before any code is written, with the reason on the ticket and its marker cleared.
- AC-20 (Scenario 8): A ticket needing missing UX, domain, or architecture work results in a
  question or a decline, and no `ux.md`, domain doc, or architecture doc is written by the factory.
- AC-21 (Scenario 9): For any ticket, an operator can see its stage, what it waits on and for how
  long, and cost so far.
- AC-22 (Scenario 9): After a run ends, its audit record of agent actions is still available.
- AC-23 (Scenario 10): Changing a project's settings (marker, gates, limits, concurrency, sensitive
  areas, periods, notified people) changes the factory's behaviour for that project only.
- AC-24 (Scenario 10): Pausing the factory starts no new stage on any ticket until resumed; stopping
  one ticket hands it back and leaves the others running.
- AC-25 (Scenario 11): After merge and release approval, the project's configured release steps run
  in order and the ticket is closed on success.
- AC-26 (Scenario 11): A failed release step stops the run, posts a report, and is not retried
  without human instruction.
- AC-27 (Scenario 12): Factory-owned tickets are distinguishable on the board from human-owned ones.
- AC-28 (Scenario 12): A ticket assigned to a person or already in progress is never picked up.
- AC-29 (Scenario 12): When a person takes a ticket over, the factory performs no further action on
  it and its branch and documents remain.
- AC-30 (Scenario 13): The same package completes the same ticket on local Docker Desktop and on a
  server with only configuration changed.
- AC-31 (Scenario 14): For a Playwright-enabled project, the pull request contains e2e specs derived
  from the test plan; for other projects the stage is skipped and the run still completes.
- AC-32 (all scenarios): Interactive orbit on a developer's machine behaves the same before and
  after the factory is introduced.
- AC-33 (Scenarios 3, 4): A reply or approval from a person not named for that role leaves the
  ticket parked; the same reply from a named person resumes it.
- AC-34 (Scenario 4): An approval given by the factory's own identity is never accepted, and a merge
  blocked by branch protection is not forced.
- AC-35 (Scenario 4): After a change to an approved pull request, the earlier approval no longer
  permits merge.
- AC-36 (Scenario 4): After the configured number of rework cycles at one gate, the ticket is handed
  back instead of reworked again.
- AC-37 (Scenario 5): A ticket parked past the maximum age is handed back with a report.
- AC-38 (Scenario 8): A ticket whose design exceeds the after-design size thresholds is declined or
  escalated before any code is written.
- AC-39 (Scenario 11): Two releases for one project never run at the same time, and at level `tag`
  no production credential is present in any run.
- AC-40 (Scenarios 6, 9): When a project's daily spend limit is reached, no new stage starts for that
  project until the next day or until an operator raises the limit.
- AC-41 (Scenario 15): A ticket carrying the groomed marker alone, whose `requirements.md` is on the base
  branch, runs no groom stage; its first agent stage is design, in the folder that holds those
  requirements; and the requirements file reaches the pull request unchanged by the intake.
- AC-42 (Scenario 15): A ticket marked groomed with no `requirements.md` to be found is declined
  before any agent runs, with the reason on the ticket.
- AC-43 (Scenario 15): A ticket marked ready but not groomed is groomed by the factory as before.
