---
status: proposed
date: 2026-11-05
deciders: [Chetan Sharma]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: Track installs per coding agent with GitHub Release assets

## Context

We can't tell how many people install pai-orbit, or in which coding agent:

- Codex and Copilot install with `npx github:the-psi/pai-orbit …`. npm downloads a tarball from
  `codeload.github.com`, which GitHub doesn't count anywhere (verified 2026-11-02).
- Claude Code and Cursor install by cloning the repo. Insights → Traffic shows one combined clone
  count, mixed with team and CI clones, kept for only 14 days, and with no way to tell tools apart.

Constraints: one repo, GitHub only, no tracking code or pings in the plugin (pai-orbit is public,
and pings can be faked and raise privacy questions), free, and existing installs must keep working.

Issue: [#89](https://github.com/the-psi/pai-orbit/issues/89). Plan:
[docs/plans/install-tracking-github-insights-2026-11-01.md](../plans/install-tracking-github-insights-2026-11-01.md).
Tested end to end: [docs/reports/install-tracking-test-results-2026-11-05.md](../reports/install-tracking-test-results-2026-11-05.md).

## Decision

In the context of **a public, multi-tool plugin distributed straight from GitHub**,
facing **no visibility into installs per coding agent**,
we decided **to publish one GitHub Release asset per agent on every version bump and have each
agent install from its asset, counting installs with GitHub's per-asset `download_count`; Cursor,
which can only install from the repo, is counted by repo clones minus CI checkouts**,
to achieve **per-agent install counts with no telemetry, no server and no cost**,
accepting **that counts are installs + updates (not people), Cursor's number is approximate, and
the traffic API needs a fine-grained PAT**.

Concretely:

1. **Release on version bump** (`.github/workflows/release-on-version-bump.yml`): when
   `package.json` or `core/plugin.json` changes on `main`, check they match, then create
   `v<version>` with `pai-orbit-codex.tar.gz`, `pai-orbit-copilot.tar.gz` and
   `pai-orbit-claude-code.zip`. After the upload, point `.claude-plugin/marketplace.json` at the zip
   (`archive` source with `url` + `sha256`) and commit to `main`.
2. **Codex and Copilot installers** (`scripts/init/fetch-release.js`, `release-dist.js`) download
   the asset for their `package.json` version, unpack it with Node built-ins, and fall back to the
   bundled `dist/` if the download fails. Install commands don't change.
3. **Claude Code** installs the plugin from the release zip via the marketplace `archive` source
   (Claude Code ≥ 2.1.224). Adding the marketplace still clones the repo to read the catalog.
4. **Cursor** keeps installing from the repo (its marketplace has no archive source).
5. **Daily stats** (`.github/workflows/install-stats.yml`) write download counts and clones (minus
   CI checkouts) to `docs/reports/install-stats/` on a `stats` branch, without checking out the repo.

**Convention this creates:** bump `package.json` and `plugins/pai-orbit/core/plugin.json` together;
the release is automatic. Never replace a published asset; fix forward with a new version.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| **(chosen) Release assets per agent + clones for Cursor** | Per-agent counts; no telemetry; can't be faked cheaply; free; one repo | Counts installs + updates, not people; Cursor approximate; installers change; needs a PAT for traffic |
| One install repo per agent (`pai-orbit-claude`, `-cursor`, …) | Clean clone counts for every agent incl. Cursor | Five repos to sync; rejected: must stay one repo |
| Publish to npm | Public download counts, like other plugins | Adds npm publishing + ownership; only covers npx agents |
| Usage ping (Google Sheet / PostHog) | Active-use data; separates Claude Code from Cursor | Public key can be faked; privacy notice + opt-out needed; external service |
| Ping verified with GitHub login + own server | Hard to fake; exact per user | Login step, server to run, collects usernames |
| Insights clones only (do nothing) | No change | No per-agent split; Codex/Copilot invisible; 14-day window |

## Consequences

**Positive:**
- Codex, Copilot and Claude Code installs are counted separately and permanently by GitHub.
- No tracking code, no external service, no cost (public repo).
- Releases are now automatic and always match `package.json` + `core/plugin.json`.

**Negative / trade-offs:**
- Counts include updates and re-installs; one person can count several times.
- Counters lag ~15 minutes; one unexplained +1 was seen during testing.
- Cursor's number (repo clones − CI) still includes team clones and Claude Code catalog clones.
- Claude Code users below 2.1.224 can't use the `archive` source once `marketplace.json` switches.
- The release workflow commits `marketplace.json` to `main` on every release.
- **Branch/tag pins change behaviour:** `npx github:the-psi/pai-orbit#<ref> …` installs the release
  asset for that ref's `package.json` version, not that ref's `dist/`. `PAI_ORBIT_OFFLINE=1` installs
  the bundled files. Open for review: download only to count, but always copy the bundled files.
- The stats workflow needs `INSTALL_STATS_TOKEN` (fine-grained PAT, Administration: read) to read
  traffic; without it, only download counts are recorded.
- Offline installs wait up to 15 s before falling back to bundled files, and aren't counted.

**Neutral:**
- `marketplace.json` is not edited by hand; the first release switches it to the zip.

## Related Decisions

- [2026-07-19-codex-adapter-decisions.md](2026-07-19-codex-adapter-decisions.md): Codex `npx` installer.
- [2026-07-25-copilot-adapter-decisions.md](2026-07-25-copilot-adapter-decisions.md): Copilot `npx` installer.

## Review Date

2027-02-01: check whether counts are useful, whether Cursor has added an archive source, and
whether usage (not just installs) is needed.
