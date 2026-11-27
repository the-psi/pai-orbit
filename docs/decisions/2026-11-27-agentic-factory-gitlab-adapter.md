---
status: proposed
date: 2026-11-27
deciders: [Chetan Sharma (team ratification pending)]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: The GitLab adapter uses the REST API, and maps the merge gate to approvals and a reject comment

## Context

The factory worked only with GitHub. Projects on a self-hosted GitLab need the same flow: pick up a
labelled issue, ask and read answers in comments, open a merge request, merge only after a named
person approved the current commit, and send work back when a reviewer rejects it.

Three things do not carry over from GitHub one to one:

1. GitHub is driven through the `gh` CLI. GitLab's CLI (`glab`) would be one more tool in the
   image and its output differs between versions.
2. A GitHub review says which commit it was submitted against. GitLab's approvals API lists who
   approved, but not for which commit.
3. A GitHub review can request changes. GitLab's "Request changes" exists only on paid tiers.

## Decision

In the context of **adding GitLab as a board and a code host**,
facing **no commit on an approval, no universal "request changes", and a second CLI to install**,
we propose **an adapter that calls the GitLab REST API with Node's built-in `fetch`; that works
out the commit of each approval from the merge request's versions and GitLab's own "approved this
merge request" notes; and that reads a merge request comment starting with `reject` as "send
back"**,
to achieve **the same merge gate as on GitHub (a named approver, on the current commit) on every
GitLab tier, with nothing new in the image**,
accepting **that sending work back on GitLab is a comment, not a button, and that an approval whose
note cannot be found does not count**.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| REST API with built-in `fetch` (chosen) | No new dependency or CLI; same code for gitlab.com and self-hosted; easy to test against an in-memory GitLab | We own pagination and error handling (one small file) |
| `glab` CLI, like `gh` for GitHub | Symmetry with the GitHub adapter | Another tool to install and keep current; no command for approvals per commit; harder to test |
| Trust GitLab's "remove approvals when commits are added" setting for the commit check | Simplest | It is a project setting that can be off; the gate would then merge code nobody approved |
| Commit of an approval from versions + approval notes (chosen) | Holds whatever the project's settings are; fails closed | Depends on the text of a GitLab system note |
| GitLab "Request changes" for sending back | Native button | Paid tiers only |
| A `reject <what to change>` comment on the merge request (chosen) | Works on every tier; same words people already use on the ticket | Not a button |

## Consequences

**Positive:**
- A project on GitLab uses the factory with a config change and a token; no code change.
- The merge gate does not depend on how the GitLab project is configured.
- The token reaches git through a credential helper scoped to the GitLab site and read from the
  environment, so it is never on a command line or in a clone, as on GitHub.

**Negative / trade-offs:**
- If a GitLab version words the approval note differently, approvals stop counting. The factory
  then waits and reminds; it does not merge. This must be checked on the real server first.
- GitLab's free tier cannot require approvals, so `preflight` can confirm that the base branch is
  protected but not that a review is required. It reports a warning, not a pass.
- `mergeMethod` is `squash` or `merge` on GitLab. Rebase and fast-forward are project settings
  there and are not chosen by the factory.

**Neutral:**
- `decisionOf` moved to `factory/src/decision.js` so the adapter and the pipeline read a reject the
  same way.
- A code host may supply its own wording for the review step (`codeHost.words`), so GitLab users
  read "merge request" and the right instructions.

## Related Decisions

- `docs/decisions/2026-11-26-agentic-factory-gates-by-credential-separation.md`
- `docs/decisions/2026-11-26-agentic-factory-in-repo-service.md`

## Review Date

After the first run against a real GitLab server.
