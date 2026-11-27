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
| independent review | a second agent, `/review` | A second opinion from an agent that did not write the change, on a different model, with no ability to edit. Blocking findings go back to build. Off unless enabled |
| pr | factory | Branch pushed, pull request opened |
| **merge gate** | **a person** | **An approving review on the latest commit. Cannot be switched off.** |
| merge | factory | Pull request merged |
| **release gate** | **a person** | **`/approve` on the ticket from a release approver. Cannot be switched off.** |
| release | agent, `/release` | Configured release steps, up to the release level |
| done | factory | Ticket closed |

Two more gates, after requirements and after design, are optional per project. Turn both on for a
pilot.

### Already groomed tickets

A ticket gets exactly one start label. If a person has run `/groom` and the ticket's
`requirements.md` is merged to the base branch, use `factory-groomed` instead of `factory-ready`.
The factory skips its own grooming and the
requirements gate, uses that file, and starts at design. It finds the file from a path in the ticket
description such as `docs/features/payments-export/requirements.md`; without a path it looks in the
folder named after the ticket title. If it finds nothing it declines the ticket and says why.

On the local board: `orbit-factory local add --id 7 --title "..." --body "Requirements: docs/features/x/requirements.md" --groomed`

## Labels

The factory is driven by labels (called tags on some platforms), because every ticket platform has
them. A person adds one label; the factory manages the rest.

| Label | Who sets it | Meaning |
|---|---|---|
| `factory-ready` | a person | Raw ticket. Groom it, then build it |
| `factory-groomed` | a person | Already groomed. Start at design |
| `factory-owned` | the factory | The factory is working on it |
| `factory-waiting` | the factory | The factory is waiting for a person |
| `factory-declined` | the factory | The factory refused it; the reason is in a comment |

All five names can be changed in the config.

## What people do

| To | Do this |
|---|---|
| Give a raw ticket to the factory | Add the `factory-ready` label. The factory grooms it first |
| Give an already groomed ticket to the factory | Add the `factory-groomed` label instead, and put the path to its `requirements.md` in the ticket description. The factory starts at design |
| Answer a question | Reply in a comment on the ticket |
| Approve requirements, design or release | Comment `/approve` on the ticket |
| Send requirements or design back | Comment `/reject <what to change>` |
| Approve the code | Submit an approving review on the pull request |
| Send the code back | Submit a review that requests changes |
| Take a ticket over | Assign it to yourself, or remove the `factory-owned` label |

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

### Use the published image instead of building

A version tag builds the image in GitHub Actions and publishes it to GitHub Container Registry
(`.github/workflows/factory-image.yml`):

```bash
git tag factory-v0.1.0 && git push origin factory-v0.1.0
# -> ghcr.io/<owner>/orbit-factory:0.1.0   (and :latest for a plain x.y.z version)
```

To run a published version, replace the `build:` block of the compose file with
`image: ghcr.io/<owner>/orbit-factory:<version>`. The config file and `.env` stay as they are.

The image holds no credentials and no project config. `Dockerfile.dockerignore` keeps `.env` and
`factory.config.json` out of the build even when they exist next to the code, and the workflow
checks the built image for them. A new package on the registry starts private: make it public, or
give each server a token that may read packages.

## Using GitLab

Set both types to `gitlab`. The site and the project are read from `repo.url`, so the same setup
works for gitlab.com and a self-hosted GitLab:

```json
"repo":     { "url": "https://git.example.com/group/app.git", "baseBranch": "main" },
"board":    { "type": "gitlab", "botUser": "orbit-factory" },
"codeHost": { "type": "gitlab", "mergeMethod": "squash" }
```

Put the token in `.env` as `GITLAB_TOKEN`. Use a project access token (or a bot user's token) with
the `api` and `write_repository` scopes and the Developer role or higher; Maintainer if only
maintainers may merge into the base branch. `board.botUser` must be the user name the token
belongs to. `preflight` checks the token, the access level and that the two names match.

What people do on GitLab:

| Step | On GitLab |
|---|---|
| Hand a ticket over | Add the label `factory-ready` or `factory-groomed` to the issue |
| Answer a question, approve requirements, design or release | Comment on the issue |
| Approve the code | The **Approve** button on the merge request |
| Send the code back | Comment `reject <what to change>` on the merge request |

Things that differ from GitHub:

- An approval counts only for the commit the merge request had when it was given. If the factory
  pushes a rework afterwards, approve again.
- GitLab's free tier cannot require approvals, so `preflight` warns that it could not confirm a
  review is required. Protect the base branch so that nobody can push to it directly.
- `mergeMethod` is `squash` or `merge`. Rebase and fast-forward are a project setting in GitLab.
- If GitLab is served under a path (`https://host/gitlab`), set `gitlab.apiUrl` and
  `gitlab.project` in the config. For a server with a private certificate authority, set
  `NODE_EXTRA_CA_CERTS`.

The adapter is tested against a simulated GitLab, including a full run from a label to a release.
It has not yet been run against a real GitLab server.

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
| `board.type`, `codeHost.type` | `github`, `gitlab` or `local` | `local` |
| `runner.models` | The AI model, for all stages (`default`) or per stage. See "Which model runs which stage" | the agent CLI's default |
| `roles.*` | Who may answer and who may approve at each gate | reporter answers; approvers must be named |
| `gates.requirements`, `gates.design` | The two optional gates | off |
| `limits.costPerTicketUsd` | Hard stop for one ticket | 50 |
| `limits.costPerDayUsd` | Hard stop for the project per day | 200 |
| `concurrency` | Tickets worked on at once | 2 |
| `release.level` | `tag`, `staging` or `production` | `tag` |
| `suitability.sensitiveLabels` | Ticket labels that make the factory decline at once | see example |
| `suitability.sensitivePaths` | Path patterns the factory will not change. Checked against the design's file list and again against the files actually changed | see example |
| `suitability.max*` | Size limits that make the factory decline | see example |

The merge and release gates are not settings. A config that tries to set `gates.merge` or
`gates.release` is rejected.

The cost defaults are estimates, not measurements. Reset them after the first 10–20 real tickets.

## Which model runs which stage

One setting, `runner.models`:

```json
"runner": {
  "models": { "default": "sonnet", "groom": "haiku", "build": "opus", "verify": "opus" }
}
```

| Key | Meaning |
|---|---|
| `default` | The model for every stage that has no entry of its own |
| `groom`, `design`, `build`, `test`, `playwright`, `review`, `release` | The model for that stage |
| `verify` | The model for the independent review |

With nothing set, every stage uses the agent CLI's own default model. A model name is whatever
the agent CLI accepts for `--model`; the factory passes it through and does not check it, so a
wrong name fails that stage. An unknown key in `runner.models` is rejected when the config is
loaded. The model each stage started on is recorded in the ticket's audit trail and shown in its
history on the status page.

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

## Independent review

An optional stage between the factory's own review and the pull request. It gives the person who
approves the merge a second opinion. It never approves a merge itself.

```json
"stages": { "independentReview": true },
"runner": { "models": { "verify": "opus" } },
"limits": { "independentReviewRounds": 2 }
```

- It starts fresh, with none of the build's context, and should use a different model
  (`runner.models.verify`) from the one that wrote the code.
- It cannot edit: the edit tools are removed for this stage, and the branch is put back exactly as
  it was afterwards, whatever the reviewer did.
- It returns a verdict (approve or request changes) and findings, each marked blocking or note.
- Blocking findings send the work back to build automatically, up to `independentReviewRounds`
  times. After that the pull request goes to the person anyway, flagged as unresolved.
- Its verdict and findings appear in the merge request comment on the ticket and in the status
  page's review screen.

It costs one more agent run per ticket (about USD 0.30 with a larger model on a small change).

## The status page

`orbit-factory ui` serves one page that shows the factory at work and lets a named person decide.

- **Board:** every ticket in the column of its stage, with what it waits for and what it has cost.
- **Live activity:** while a stage runs, the step the agent is on ("Reading src/tax.js", "Running:
  npm test"), on the card and in full in the ticket's panel.
- **History:** each ticket's timeline, with the agent's report for every stage.
- **Review screen:** a ticket that needs a person opens one focused screen: the question at the top,
  the one document to decide on in the middle (the whole requirements or design file), and Approve
  or Send back at the bottom. The agent's own decisions, the other documents, the changed files and
  the ticket text are one tab away. Sending back needs a reason, which the agent then works from.

Who can do what:

| Sign-in | Set with | Can |
|---|---|---|
| Shared password | `FACTORY_UI_PASSWORD` | Look |
| A person's own name and password | `FACTORY_UI_USERS="asha:secret,ravi:secret"` | Look, and decide what the config's `roles` name them for |

Use the same names in `FACTORY_UI_USERS` as in `roles`. The page only records a decision. The
factory checks the person again, acts on its next pass, and writes the decision on the ticket, so
the ticket remains the complete record. Code approval in a normal setup stays on the pull request;
the page lists the changed files and links to it.

The page listens on the local machine only unless a sign-in is configured. To reach it by one URL
after deployment, publish its port (8080) behind an HTTPS proxy or the hosting service's own
address. Per-person passwords are adequate for a trial; for real use put company sign-in in front.

Nothing else can be changed from the page: it cannot pause, stop, edit or configure the factory.

## Single-account trial mode

For a one-person trial where no second account exists for the factory. Off by default.

```json
"board": { "botUser": "<your own login>" },
"trial": { "singleAccount": true }
```

What changes when it is on:

- Comments from the factory's account count as yours. The factory marks every comment it posts
  and skips those, so it never answers or approves its own requests.
- Code is approved with an `/approve` comment on the ticket (or `/reject <what to change>`), not a
  pull request review, because a code host does not let an account approve its own pull request.
  The approval is tied to the commit it was given for.
- The base branch can require a pull request but must require zero approvals.

What you lose: the guarantee that the approver is someone other than the factory. `preflight`
prints a warning for as long as it is on. Do not use it for shared or customer work; give the
factory its own identity instead (a bot account, or a GitHub App).

Give the factory a token that can reach only the repo it works on. With your own account, that
means a fine-grained token limited to that one repository. Never give it a token or a login that
can reach your other repositories, and run it in the container, not directly on a machine where
you are logged in to your code host.

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
- **GitHub and GitLab are the real boards and code hosts.** GitHub has been run for real, in a
  single-account trial. GitLab is tested against a simulated GitLab only and has not yet been
  run against a real server. Jira and Azure DevOps adapters are not built.
- **Release steps that commit to a protected base branch will be refused by the code host.** At
  release level `tag`, keep the release steps to tagging, or let the project's own pipeline do the
  rest.
- **The factory and its agent share one container.** The agent is not given the code-host token,
  but a determined process in the same container could find it. Scope the token to the one repo.
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
│   ├── decision.js         reading approve and reject from a comment
│   ├── gitlab-api.js       GitLab REST client
│   ├── boards/             local, github, gitlab
│   ├── codehosts/          local, github, gitlab
│   ├── runners/            claude-cli, fake
│   └── notifiers/          console, slack
└── test/
```

To add a board, code host, runner or notifier, implement the interface in `src/interfaces.js` and
register it in `src/index.js`.
