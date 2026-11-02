# Plan: Track pai-orbit installs per coding agent using GitHub Insights

**Date:** 2026-11-01
**Status:** Draft — not started
**Owner:** pai-orbit team

---

## Goal

Know **how many people have installed pai-orbit** and **in which coding agent**:
Claude Code, Cursor, Codex, and GitHub Copilot.

Out of scope for now:
- Which commands people use (`/build`, `/design`, …).
- Who installed it (names or emails).

## Constraints

- GitHub only. No external server, no Google Sheet, no npm.
- No telemetry or tracking code inside the plugin, so there are no privacy concerns.
- Existing installs must keep working (dist backward-compatibility rule in
  [docs/architecture/constraints.md](../architecture/constraints.md)).

---

## Why the current setup can't answer this

Today all four agents install from the same repo, `the-psi/pai-orbit`.
**Insights → Traffic** on that repo shows one combined clone count
(117 clones / 50 unique cloners for 2026-10-18 → 2026-10-31). The problems:

| Problem | Effect |
|---|---|
| All agents share one repo | You can't tell which agent a clone came from |
| The team's own development clones | Count inflated |
| CI (`dist-freshness.yml` runs `actions/checkout` on every PR and push) | Count inflated |
| `npx github:the-psi/pai-orbit …` (Codex, Copilot) may download a tarball instead of cloning | These installs may not be counted at all |
| GitHub keeps only 14 days of traffic data | No long-term history |

---

## Solution: one install repo per coding agent

```
the-psi/pai-orbit            ← source of truth; team works here (not used for counting)
the-psi/pai-orbit-claude     ← Claude Code installs from here
the-psi/pai-orbit-cursor     ← Cursor installs from here
the-psi/pai-orbit-codex      ← Codex installs from here
the-psi/pai-orbit-copilot    ← Copilot installs from here
```

Each install repo contains only that agent's `dist/` output and runs no CI.
Nobody develops in these repos, so a clone there is almost always an install or an update.

**Result:** each install repo's **Insights → Traffic → Unique cloners** is the
install count for that agent.

---

## Steps

### Step 1 — Create the 4 install repos
- Create `pai-orbit-claude`, `pai-orbit-cursor`, `pai-orbit-codex` and
  `pai-orbit-copilot` under `the-psi`. Make them public, since Insights works on public repos.
- Each repo gets a short README: "Install-only mirror. Source lives in
  `the-psi/pai-orbit`. Do not open PRs here."
- Disable Issues and PRs in these repos so everything goes to the main repo.
- No GitHub Actions in these repos, so CI doesn't add clones.

### Step 2 — Auto-sync dist → install repos (GitHub Action in main repo)
- Add a new workflow to `the-psi/pai-orbit`, e.g. `.github/workflows/sync-install-repos.yml`.
- Trigger: push to `main` that changes `plugins/pai-orbit/dist/**`, or a release tag.
- For each agent, copy `plugins/pai-orbit/dist/<agent>/` (plus the marketplace manifest
  the agent needs) into the matching install repo and push.
- Auth: a fine-grained PAT or GitHub App token with write access to the 4 install
  repos only, stored as a repo secret (e.g. `INSTALL_REPOS_TOKEN`).
- Commit message carries the source version and SHA, e.g. `sync v1.13.0 (abc1234)`.

### Step 3 — Point each agent's install at its own repo

| Agent | Today | After |
|---|---|---|
| Claude Code | `/plugin marketplace add the-psi/pai-orbit` → `.claude-plugin/marketplace.json` → `./plugins/pai-orbit/dist/claude-code/` | `/plugin marketplace add the-psi/pai-orbit-claude` |
| Cursor | `.cursor-plugin/marketplace.json` → `./plugins/pai-orbit/dist/cursor-plugin/pai-orbit` | Install from `the-psi/pai-orbit-cursor` |
| Codex | `npx github:the-psi/pai-orbit init codex` | Installer runs `git clone --depth 1 https://github.com/the-psi/pai-orbit-codex` |
| Copilot | `npx github:the-psi/pai-orbit init copilot` | Installer runs `git clone --depth 1 https://github.com/the-psi/pai-orbit-copilot` |

Notes:
- **Codex / Copilot:** the CLI (`plugins/pai-orbit/scripts/init/cli.js`) currently copies files
  from its own package (`__dirname`), so no clone of an agent repo happens. The change is to have
  the CLI `git clone` the agent's install repo into a temp folder and copy from there.
  That makes every install and update show up as a clone. If `git` isn't available,
  fall back to the bundled files; those installs won't be counted.
- **Existing users (backward compatibility):** keep `the-psi/pai-orbit` working as an
  install source. For Claude Code, the main repo's `marketplace.json` can point its plugin
  `source` at the `pai-orbit-claude` GitHub repo, so existing users move over with no action
  (confirm this is supported; see Open Questions). Update all docs and READMEs to the new
  install commands.

### Step 4 — Save traffic history daily (GitHub Action)
- New workflow in the main repo, e.g. `.github/workflows/traffic-snapshot.yml`, runs daily.
- For each of the 4 install repos, call:
  - `GET /repos/the-psi/<repo>/traffic/clones` (count + uniques per day)
  - `GET /repos/the-psi/<repo>/traffic/views` (optional)
- Append the results to `docs/reports/install-stats/<agent>.csv`
  (date, clones, unique_cloners), skipping dates already saved.
- Regenerate a summary `docs/reports/install-stats/README.md` with one table:
  agent → unique cloners in the last 14 / 30 / 90 days, and total since start.
- Auth: the traffic API needs push access, so use the same `INSTALL_REPOS_TOKEN`.

### Step 5 — Update docs
- `README.md`, `CLAUDE.md` (Installation section), `docs/getting-started.md`,
  `docs/codex-install-and-usage.md`, `docs/copilot-install-and-usage.md`,
  `docs/cursor-plugin-install-and-usage.md` get the new install commands.
- Add an ADR (`docs/decisions/YYYY-MM-DD-per-agent-install-repos.md`) for the
  new distribution model, per [.claude/rules/decisions.md](../../.claude/rules/decisions.md).
- Update `docs/architecture/system.md` (the distribution path changes).

---

## How to read the numbers

| Insights metric | Meaning |
|---|---|
| **Unique cloners** (install repo) | Roughly the number of installs or machines for that agent in the window |
| **Clones** (install repo) | Installs plus updates; higher if people update often |
| Main repo clones | Team, CI and contributors; ignore for install tracking |

Limits to keep in mind:
- The count is **per machine or IP, not per person.** One person on 2 laptops counts as 2.
  People behind the same office network may count as 1.
- **Installs, not active use.** A clone means it was installed or updated,
  not that it's being used today. Regular update clones are a rough sign of active use.
- **Offline or mirrored installs** (e.g. a company copying the repo internally) aren't counted.
- Someone could clone a repo by hand to inflate the number. That's unlikely and harmless.

---

## Open questions (verify before building)

1. **Claude Code:** can the main repo's `marketplace.json` use a GitHub-repo `source`
   (`{"source": "github", "repo": "the-psi/pai-orbit-claude"}`), so existing users are
   moved automatically? Does a plugin update cause a clone or a fetch, and does
   GitHub count fetches as clones?
2. **Cursor:** how does Cursor fetch a plugin from a marketplace? If it's git clone,
   counts work. If it's a zip or API download, they won't show in Traffic.
3. **npx github:** confirm whether `npx github:the-psi/pai-orbit` clones or downloads a
   tarball today. This tells us whether current Codex and Copilot installs are counted.
4. **Token:** who owns the PAT or GitHub App for the sync and snapshot workflows,
   and who rotates it?
5. **Repo naming:** `pai-orbit-claude` vs `pai-orbit-claude-code`. Choose before creating
   the repos, because renaming later breaks install commands.

---

## Order of work

1. Answer the open questions (mostly small tests by hand).
2. Step 1 (create repos) + Step 2 (sync Action).
3. Step 4 (traffic snapshot). Start collecting history right away, even before switching installs.
4. Step 3 (switch install sources), with backward compatibility kept.
5. Step 5 (docs + ADR), in the same PR as Step 3.

## Effort estimate

| Step | Effort |
|---|---|
| Open questions | ~0.5 day |
| Repos + sync Action | ~1 day |
| Traffic snapshot Action | ~0.5 day |
| Installer / marketplace switch | ~1 day |
| Docs + ADR | ~0.5 day |
| **Total** | **~3.5 days** |
