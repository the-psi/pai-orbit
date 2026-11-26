# Agentic Factory

Runs pai-orbit unattended on a server: it takes a ticket from the backlog and drives it through
groom, design, build, test, pull request and release, stopping only when it needs a person's answer
or approval.

It contains no mode prompts of its own. Each stage starts the Claude Code CLI headless with the
built pai-orbit plugin from this repo (`plugins/pai-orbit/dist/claude-code/`), so a fix to a mode is
made once, in `core/`, and the factory picks it up.

- Requirements: [docs/features/agentic-factory/requirements.md](../docs/features/agentic-factory/requirements.md)
- Design: [docs/features/agentic-factory/design.md](../docs/features/agentic-factory/design.md)
- Test plan and results: [docs/features/agentic-factory/test-plan.md](../docs/features/agentic-factory/test-plan.md)

## How a ticket moves

| Stage | Who does it | Output |
|---|---|---|
| intake | factory | Ticket claimed; unsuitable tickets declined with a reason |
| groom | agent, `/groom` | `requirements.md` |
| design | agent, `/design` | `design.md`, decision records; size is checked again here |
| build | agent, `/build` | Code and docs |
| test | agent, `/test` | `test-plan.md`, tests run |
| playwright | agent, `/playwright` | e2e tests (off unless enabled) |
| review | agent, `/review` | Self-review; blocking findings fixed (can be switched off) |
| pr | factory | Branch pushed, pull request opened |
| **merge gate** | **a person** | **An approving review on the latest commit. Cannot be switched off.** |
| merge | factory | Pull request merged |
| **release gate** | **a person** | **`/approve` on the ticket from a release approver. Cannot be switched off.** |
| release | agent, `/release` | Configured release steps, up to the release level |
| done | factory | Ticket closed |

Two more gates, after requirements and after design, are optional per project. Turn both on for a
pilot.

### Already groomed tickets

If a person has run `/groom` and the ticket's `requirements.md` is merged to the base branch, add
the `factory:groomed` label as well as `factory:ready`. The factory skips its own grooming and the
requirements gate, uses that file, and starts at design. It finds the file from a path in the ticket
description such as `docs/features/payments-export/requirements.md`; without a path it looks in the
folder named after the ticket title. If it finds nothing it declines the ticket and says why.

On the local board: `orbit-factory local add --id 7 --title "..." --body "Requirements: docs/features/x/requirements.md" --groomed`

## What people do

| To | Do this |
|---|---|
| Give a raw ticket to the factory | Add the `factory:ready` label. The factory grooms it first |
| Give an already groomed ticket to the factory | Add `factory:ready` **and** `factory:groomed`, and put the path to its `requirements.md` in the ticket description. The factory starts at design |
| Answer a question | Reply in a comment on the ticket |
| Approve requirements, design or release | Comment `/approve` on the ticket |
| Send requirements or design back | Comment `/reject <what to change>` |
| Approve the code | Submit an approving review on the pull request |
| Send the code back | Submit a review that requests changes |
| Take a ticket over | Assign it to yourself, or remove the `factory:owned` label |

Only people named for a role in the config are listened to. A comment or review from anyone else,
or from the factory's own account, changes nothing.

Chat alerts only point at the ticket. Nothing is answered or approved in chat.

## Try it locally with no accounts

The `local` board and code host are plain files, and the `fake` runner calls no model. Together they
rehearse the whole flow for free.

```bash
# from the repo root; needs Node 18+ and git
git init --bare --initial-branch=main /tmp/demo.git     # a stand-in for your code host
# ...push any small project to it...

cat > factory.config.json <<'EOF'
{
  "repo": { "url": "/tmp/demo.git", "baseBranch": "main" },
  "runner": { "type": "fake" },
  "roles": { "answer": ["@reporter"], "mergeApprover": ["lead"], "releaseApprover": ["rel"] }
}
EOF

node factory/bin/factory.js local add --id 1 --title "Add a farewell function" --body "..." --reporter alice
node factory/bin/factory.js once          # runs until every ticket is parked or finished
node factory/bin/factory.js status
node factory/bin/factory.js local review 1 --author lead --state approved
node factory/bin/factory.js once          # merges, then waits for release approval
node factory/bin/factory.js local comment 1 --author rel --body "/approve"
node factory/bin/factory.js once          # releases and closes the ticket
```

For a real agent, set `"runner": { "type": "claude-cli" }`. On your own machine it uses the Claude
Code login you already have.

## Run it in Docker (laptop or server)

```bash
cd factory
cp config/factory.example.json factory.config.json    # set repo.url, roles, board and codeHost types
cp .env.example .env                                   # add credentials
docker compose up -d --build
docker compose exec factory node /opt/orbit/factory/bin/factory.js preflight
docker compose exec factory node /opt/orbit/factory/bin/factory.js status
```

The same image and compose file run on Docker Desktop and on a server. Only `.env` and the config
differ.

Everything the factory must not lose lives on the `/data` volume: run state, the audit trail,
ticket workspaces and agent sessions.

## Commands

```
orbit-factory run            start and keep polling
orbit-factory once           do everything possible now, then exit
orbit-factory preflight      check the setup
orbit-factory status         stage, what each ticket waits on, cost so far   (--json)
orbit-factory events <id>    audit trail of one ticket
orbit-factory pause|resume   stop or restart starting new work
orbit-factory stop <id>      stop one ticket and hand it back
```

`--config <file>` and `--data <dir>` select the config and the data directory
(defaults: `./factory.config.json`, `./.orbit-factory`).

## Configuration

`config/factory.example.json` lists every setting with its default. The ones to decide first:

| Setting | Meaning | Default |
|---|---|---|
| `repo.url`, `repo.baseBranch` | The project the factory works on | required, `main` |
| `board.type`, `codeHost.type` | `github` or `local` | `local` |
| `roles.*` | Who may answer and who may approve at each gate | reporter answers; approvers must be named |
| `gates.requirements`, `gates.design` | The two optional gates | off |
| `limits.costPerTicketUsd` | Hard stop for one ticket | 50 |
| `limits.costPerDayUsd` | Hard stop for the project per day | 200 |
| `concurrency` | Tickets worked on at once | 2 |
| `release.level` | `tag`, `staging` or `production` | `tag` |
| `suitability.*` | Sensitive labels and size limits that make the factory decline | see example |

The merge and release gates are not settings. A config that tries to set `gates.merge` or
`gates.release` is rejected.

The cost defaults are estimates, not measurements. Reset them after the first 10–20 real tickets.

## How the gates are enforced

- The agent process receives the model credential and nothing else. Board, code-host, chat and
  release credentials stay with the orchestrator.
- The orchestrator, not the agent, pushes, opens the pull request, comments, merges, and starts the
  release.
- A merge needs an approving review from a named approver on the pull request's latest commit. An
  approval on an older commit does not count.
- Release credentials (named in `release.envPassthrough`) reach only the release stage, after a
  named release approver approves.
- Protect the base branch on the code host as a second line. `preflight` fails if GitHub reports it
  unprotected.

## When something goes wrong

The factory hands a ticket back to people when a stage fails twice, tests still fail after three fix
attempts, a gate sends work back more than three times, a cost or time limit is reached, a ticket
waits more than five working days, or a release step fails. It pushes the work so far, posts a
report on the ticket with the stage and the cause, and removes its own labels and assignment.

After a restart the factory reloads its state from `/data` and continues each ticket from its
current stage.

## Known limits of this version

- **Tickets are separated by directory, not by container.** All tickets run inside one factory
  container. An agent stage that runs shell commands could read a sibling ticket's directory. One
  container per ticket is planned.
- **GitHub is the only real board and code host.** Its adapter is tested against simulated `gh`
  output and has not yet been run against GitHub.
- **Release steps that commit to a protected base branch will be refused by the code host.** At
  release level `tag`, keep the release steps to tagging, or let the project's own pipeline do the
  rest.
- **The working calendar has no public holidays.**
- **GitHub Projects column moves are not done.** Labels carry the state.
- **On Windows outside Docker, orbit's `bash-guard` hook is off by default** because it needs bash
  and python3. It is on in the Docker image.

## Development

```bash
node --test factory/test/*.test.js   # all tests; no model and no network are used
```

Layout:

```
factory/
├── bin/factory.js          operator CLI
├── contract/               the unattended contract and the stage-result schema
├── config/                 example config
├── src/
│   ├── factory.js          scheduler and pipeline
│   ├── stages.js           stage table and stage instructions (no mode text)
│   ├── config.js           defaults and validation
│   ├── state.js            run state, audit trail, spend, operator controls
│   ├── workspace.js        one clone and branch per ticket
│   ├── calendar.js         working-time arithmetic
│   ├── preflight.js        setup checks
│   ├── boards/             local, github
│   ├── codehosts/          local, github
│   ├── runners/            claude-cli, fake
│   └── notifiers/          console, slack
└── test/
```

To add a board, code host, runner or notifier, implement the interface in `src/interfaces.js` and
register it in `src/index.js`.
