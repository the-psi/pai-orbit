---
status: proposed
date: 2026-11-27
deciders: [Chetan Sharma (team ratification pending)]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: The Agentic Factory image is built by GitHub Actions and published to GitHub Container Registry

## Context

The factory runs as a container (`factory/Dockerfile`). Until now the image existed only on the
machine that built it, so nobody else could run the factory without cloning the repository and
building it themselves. People who want to run it on a server or in a cloud (Azure and others
were named) need to pull a ready image.

The image contains the factory code, the built pai-orbit plugin and the agent CLI. It contains no
credentials and no project config; those are given when a container starts.

## Decision

In the context of **distributing the factory to servers and clouds we do not control**,
facing **the risk of images built by hand from an unclean checkout, possibly with a local `.env`
inside**,
we propose **one workflow, `.github/workflows/factory-image.yml`, that builds the image from the
repository and publishes it to GitHub Container Registry as `ghcr.io/<owner>/orbit-factory` when a
`factory-v<version>` tag is pushed**,
to achieve **one known image per version, built only from committed code, in the registry that
sits next to the code**,
accepting **that the factory now has its own version tags, separate from the plugin's version**.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| GitHub Actions to GitHub Container Registry, on a `factory-v*` tag (chosen) | Registry is next to the code; the workflow's own token publishes, so no personal token; free for public repositories; pulls work from any cloud | A second kind of version tag in the repository |
| Build on every push to `main` | Always current | Publishes images nobody chose to release; `:latest` moves under running factories |
| Docker Hub | Widely known | A second account and a stored secret to manage |
| A cloud registry (Azure, AWS) | Close to where it may run | Ties distribution to one cloud before any is chosen |
| Keep building by hand | Nothing to maintain | Images differ by machine; a local `.env` can end up inside |

## Consequences

**Positive:**
- Anyone can run a given factory version with `docker pull`, without the source.
- The image is built from committed code only. The workflow refuses to build if a credentials or
  deployment config file is in the repository, and checks the built image for them.
- Pull requests that touch the factory build the image without publishing it, so a broken
  Dockerfile is caught before a release.

**Negative / trade-offs:**
- `factory/Dockerfile.dockerignore` is now a safety control: it excludes `.env` and
  `factory.config.json` so a hand build cannot bake them in. It must be kept when the Dockerfile
  changes.
- A new package on GitHub Container Registry starts private. Making it public, or giving servers
  a token to pull it, is a one-time manual step.

**Neutral:**
- A pre-release tag such as `factory-v0.1.0-rc.1` publishes that version and does not move
  `:latest`.
- Other registries can mirror the image later; nothing in the factory depends on where it is
  pulled from.

## Related Decisions

- `docs/decisions/2026-11-26-agentic-factory-in-repo-service.md`
- `docs/decisions/2026-11-26-agentic-factory-gates-by-credential-separation.md`

## Review Date

When the factory moves from proof of concept to a pilot.
