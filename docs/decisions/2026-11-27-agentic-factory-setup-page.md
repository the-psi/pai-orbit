---
status: proposed
date: 2026-11-27
deciders: [Chetan Sharma (team ratification pending)]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: A setup page, served by the factory image, makes the deployment files

## Context

A deployment needs three files: the config (about 60 settings, of which about 10 must be decided
per project), a credentials file, and a compose file. Writing them by hand from the example means
knowing the setting names, which values go together, and which credentials each platform needs.
People setting the factory up asked for a form to fill in instead.

The status page cannot do this job: it needs a config to start, and making the config is the task.

## Decision

In the context of **setting up a factory for a new project**,
facing **many settings, values that must fit together, and credentials that must not leak**,
we propose **a third mode of the same image, `orbit-factory setup`, that serves a step-by-step
form and produces the config, the credentials file and the compose file as downloads or as files
in one folder it was started with; plus a read-only Settings view on the status page**,
to achieve **a setup that needs no knowledge of setting names, cannot produce a config the factory
would refuse, and works on day one with nothing installed but the image**,
accepting **that the setup page only makes files: it does not write to a cloud, and it does not
change a running factory**.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| A `setup` mode of the image, serving a form (chosen) | Works before any config exists; uses the factory's own validation, so the file is always loadable; nothing extra to install | One more mode to maintain |
| A setup tab on the status page | One page for everything | The status page cannot start without a config |
| A standalone HTML file | No server at all | Cannot use the real validation or test a token; drifts from the factory's rules |
| Questions in the terminal (`orbit-factory init`) | Smallest to build | Poor fit for people who are not at ease in a terminal; no overview, no going back |
| Editing settings on the running factory | Most convenient | Needs a restart of work in flight and strict access control; changing who may approve from a web page weakens the gates |
| Saving credentials straight into a cloud secret store | Fewer manual steps on Azure | The page would need the person's cloud login and permission to change their cloud |

## Consequences

**Positive:**
- Ten questions in eight short steps, one on screen at a time; the rest keeps its defaults.
- The form's answers go through `config.fromObject`, the same check the factory runs at start.
- A token can be tested against the platform before any file is made.
- The status page shows what a running factory was set up with, so nobody has to open the file to
  answer "which model does grooming use?" or "who may approve releases?".

**Negative / trade-offs:**
- People type credentials into this page. It therefore requires a one-time code printed in the
  terminal on every call, refuses calls from another site's page, never logs a request, writes
  only into the folder it was started with, and never overwrites a file unasked. It is meant to be
  run for a few minutes and stopped.
- For Azure Container Apps the page asks for no credentials and produces the list of secrets to
  create. The person creates them in Key Vault.
- Changing a setting later means making the file again (or editing it) and restarting the factory.

**Neutral:**
- The two fixed gates are shown as "Always on" and no answer can write them into the config.
- `factory/src/setup/build.js` is pure: the same answers always give the same files.

## Related Decisions

- `docs/decisions/2026-11-27-agentic-factory-image-on-ghcr.md`
- `docs/decisions/2026-11-26-agentic-factory-gates-by-credential-separation.md`

## Review Date

After the first deployment set up by someone other than the author.
