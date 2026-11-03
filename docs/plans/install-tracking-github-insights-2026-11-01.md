# Plan: Track pai-orbit installs per coding agent (one repo, GitHub only)

**Date:** 2026-11-01 (revised 2026-11-03)
**Status:** Draft — not started
**Owner:** pai-orbit team

---

## Goal

Know **how many installs pai-orbit has** and **in which coding agent**:
Claude Code, Cursor, Codex, and GitHub Copilot.

Out of scope for now:
- Which commands people use (`/build`, `/design`, …).
- Who installed it (names or emails).
- Whether people are still actively using it. See Phase 2 below.

## Constraints

- **One repo.** Keep everything in `the-psi/pai-orbit`, as today.
- **GitHub only.** No external server, no Google Sheet, no npm publish.
- **No tracking code in the plugin.** No pings, so no privacy concerns.
- **Free.** The repo is public, so GitHub Actions minutes, release storage and API calls cost nothing.
- **Existing installs keep working** (dist backward-compatibility rule in
  [docs/architecture/constraints.md](../architecture/constraints.md)).

---

## How installs work today (verified)

| Agent | Install command | How files are fetched | Visible in GitHub? |
|---|---|---|---|
| Claude Code | `/plugin marketplace add the-psi/pai-orbit` | git clone of the repo | Yes, in Insights → Traffic → Clones (mixed with everything else) |
| Cursor | Cursor marketplace → `.cursor-plugin/marketplace.json` | Repo fetch (assumed clone; to verify) | Probably, mixed in Clones |
| Codex | `npx github:the-psi/pai-orbit init codex` | **tar.gz download from `codeload.github.com`**, then copies `dist/codex/` | **No** |
| Copilot | `npx github:the-psi/pai-orbit init copilot` | **tar.gz download from `codeload.github.com`**, then copies `dist/copilot/` | **No** |

Verified on 2026-11-02 by running `npm install github:the-psi/pai-orbit` with verbose logs:
npm fetched `https://codeload.github.com/the-psi/pai-orbit/tar.gz/<sha>`. It did not run a git clone.
GitHub doesn't count codeload archive downloads anywhere.

Other facts:
- Installers: [scripts/init/cli.js](../../plugins/pai-orbit/scripts/init/cli.js) →
  [lib/copilot.js](../../plugins/pai-orbit/scripts/init/lib/copilot.js) copies from `dist/copilot/`;
  [lib/codex.js](../../plugins/pai-orbit/scripts/init/lib/codex.js) →
  [adapters/codex/install.js](../../plugins/pai-orbit/adapters/codex/install.js) copies from `dist/codex/`.
- Insights → Traffic (2026-10-18 → 2026-10-31): 117 clones / 50 unique cloners. This **includes
  team clones and CI** (`dist-freshness.yml` runs `actions/checkout` on every PR and push to main).
- Releases: the latest is [v1.11.0](https://github.com/the-psi/pai-orbit/releases/tag/v1.11.0).
  It has **no files attached**; only GitHub's automatic source links, which aren't counted.
- Version mismatch: `package.json` and `core/plugin.json` say **1.12.0**, but **no v1.12.0 release exists**.

**Today there is zero visibility into Codex and Copilot installs.**

---

## Solution

GitHub counts downloads of files attached to a Release (`download_count`), per file, and keeps the
count permanently. We use that for Codex and Copilot, and Insights clones for Claude Code and Cursor.

| Agent | How it's counted |
|---|---|
| Codex | Download count of `pai-orbit-codex.zip` on each GitHub Release |
| Copilot | Download count of `pai-orbit-copilot.zip` on each GitHub Release |
| Claude Code + Cursor | Repo clones in Insights → Traffic, counted together, **minus CI clones** (see Step 3) |

### Why Claude Code and Cursor stay on repo clones (for now)

- **Cursor:** no other option. Cursor's docs only document a relative-path plugin `source`
  ([Plugins Reference](https://cursor.com/docs/reference/plugins)); community examples show a `github`
  source, which is still the repo. No zip/archive source is documented.
- **Claude Code:** an `archive` plugin source exists (zip over https, Claude Code ≥ v2.1.224;
  [marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference.md)), so it
  *could* install from a release zip and get its own clean count. It's deferred because:
  - users on Claude Code < v2.1.224 couldn't install,
  - `marketplace.json` would change every release (new URL + `sha256`),
  - it changes the install path everyone uses today (backward-compatibility rule).
- How the marketplace is added doesn't matter: `/plugin marketplace add the-psi/pai-orbit`, the full
  URL, or the `.git` URL in the VS Code "Manage Plugins" dialog all **git-clone the same repo**.
- Insights doesn't say which tool made a clone, so **Claude Code and Cursor can't be separated**
  while both install from the repo. Moving Claude Code to the release zip is the only way to split them
  in one repo (see Later phases).

### The three pieces

```
1. Version bump merged to main
     └─ Release Action creates vX.Y.Z + attaches pai-orbit-codex.zip, pai-orbit-copilot.zip

2. User runs  npx github:the-psi/pai-orbit init codex   (command unchanged)
     └─ npx downloads repo tar.gz (not counted; this only fetches the installer)
     └─ installer downloads releases/download/vX.Y.Z/pai-orbit-codex.zip   ← COUNTED
     └─ unzips to temp folder, copies files into project (same as today)

3. Daily Stats Action
     └─ reads download_count per zip + Insights clones → saves to docs/reports/install-stats/
```

---

## Steps

### Step 1 — Automatic release on every version bump

New workflow: `.github/workflows/release-on-version-bump.yml`.

- **Trigger:** push to `main` that changes `package.json`.
- **Logic:**
  1. Read `version` from `package.json`.
  2. If release `v<version>` already exists → do nothing.
  3. Otherwise zip `plugins/pai-orbit/dist/codex/` → `pai-orbit-codex.zip` and
     `plugins/pai-orbit/dist/copilot/` → `pai-orbit-copilot.zip`.
  4. `gh release create v<version>` with both zips attached, targeting the merge commit.
- **Guard:** fail if `package.json` version ≠ `plugins/pai-orbit/core/plugin.json` version.
- **Release notes:** `--generate-notes` (from PR titles), or use
  `docs/wip/release-notes-v<version>-draft.md` if it exists. Team to decide.
- **Permissions:** `contents: write` (uses the built-in `GITHUB_TOKEN`; no extra secret).
- **First run:** creates the missing **v1.12.0** release automatically.

Example (illustrative only, not yet in the repo):

```yaml
name: release-on-version-bump
on:
  push:
    branches: [main]
    paths: [package.json]
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: v
        run: echo "version=$(node -p "require('./package.json').version")" >> "$GITHUB_OUTPUT"
      - id: check
        env: { GH_TOKEN: "${{ github.token }}" }
        run: |
          if gh release view "v${{ steps.v.outputs.version }}" >/dev/null 2>&1; then
            echo "exists=true" >> "$GITHUB_OUTPUT"
          fi
      - if: steps.check.outputs.exists != 'true'
        run: |
          cd plugins/pai-orbit/dist
          (cd codex   && zip -r ../../../../pai-orbit-codex.zip   .)
          (cd copilot && zip -r ../../../../pai-orbit-copilot.zip .)
      - if: steps.check.outputs.exists != 'true'
        env: { GH_TOKEN: "${{ github.token }}" }
        run: |
          gh release create "v${{ steps.v.outputs.version }}" \
            pai-orbit-codex.zip pai-orbit-copilot.zip \
            --target "${{ github.sha }}" \
            --title "v${{ steps.v.outputs.version }}" \
            --generate-notes
```

### Step 2 — Installers download from the release zip

Change [lib/copilot.js](../../plugins/pai-orbit/scripts/init/lib/copilot.js) and
[adapters/codex/install.js](../../plugins/pai-orbit/adapters/codex/install.js):

1. Read the installer's own version from `package.json` (already done today).
2. Download `https://github.com/the-psi/pai-orbit/releases/download/v<version>/pai-orbit-<agent>.zip`.
3. Unzip it into a temp folder and copy files from there, using the **same copy logic as today**.
4. **Fallback:** if the download fails (offline, firewall, release missing), copy from the bundled
   `dist/<agent>/` exactly as today and print one line: "using bundled files". The install
   still works but isn't counted.

Why read the version from `package.json` rather than always using "latest release":
- **The installer and the files stay in step.** The installer code comes from `main`. If it expects
  files added in a newer version, an older "latest" zip could break the install.
- **Pinning keeps working.** `npx github:the-psi/pai-orbit#v1.8.0 init codex` must still give
  v1.8.0 files.
- Step 1 makes sure the release for every version exists, so in practice
  `package.json` version = latest release.

Unchanged for users:
- The install command (`npx github:the-psi/pai-orbit init|update codex|copilot`).
- `--setup`, `update`, `migrate` behaviour and the files that end up in the project.

Implementation notes:
- Use Node built-ins only if possible (`https` + a small unzip, or `tar.gz` instead of zip to
  use built-in `zlib`). Avoid adding heavy dependencies to the CLI.
- Follow GitHub's redirect (release downloads return a 302 to the asset host).
- Short timeout (~15s) before falling back, so slow networks don't hang the install.

### Step 3 — Daily stats Action

New workflow: `.github/workflows/install-stats.yml`, runs daily (cron) + manual trigger.

- **Release downloads:** `GET /repos/the-psi/pai-orbit/releases` → for every release,
  `download_count` of `pai-orbit-codex.zip` and `pai-orbit-copilot.zip`.
- **Clones:** `GET /repos/the-psi/pai-orbit/traffic/clones` → daily clones + unique cloners
  (GitHub keeps only 14 days, so it must be saved daily).
- **CI clones (to subtract):** every CI job that runs `actions/checkout` counts as one clone.
  - `GET /repos/the-psi/pai-orbit/actions/runs?created=<date>` → count the jobs per day for
    workflows that check out the repo (today: `dist-freshness.yml`, plus the release Action from
    Step 1 on version bumps).
  - Keep the list of "checkout workflows" in one place in the stats script, so a new workflow
    gets added to it.
  - **Estimated install clones** = total clones − CI checkouts that day (floor at 0).
- **The stats Action must not clone the repo.** No `actions/checkout`. Read and write the CSV and README
  through the GitHub Contents API (`gh api repos/.../contents/...`). Otherwise it adds a clone
  every day.
- **Team clones:** can't be measured or subtracted. They're small and steady (new laptop, new
  worktree, test installs). Reduce them by asking the team to `git pull` an existing copy rather than
  re-cloning, and to re-add the marketplace only when needed.
- **Save to:**
  - `docs/reports/install-stats/releases.csv`: date, version, agent, download_count (cumulative)
  - `docs/reports/install-stats/clones.csv`: date, clones, unique_cloners, ci_clones,
    est_install_clones (append, skip existing dates)
  - `docs/reports/install-stats/README.md`: regenerated summary table:

    | Agent | Last 7 days | Last 30 days | All time |
    |---|---|---|---|
    | Codex | … | … | … |
    | Copilot | … | … | … |
    | Claude Code + Cursor (est. install clones, CI removed) | … | … | since tracking started |

- **Auth:** the traffic API needs push access. `GITHUB_TOKEN` with `contents: write` may not be
  enough for `/traffic/*`. If not, use a fine-grained PAT (read-only "Administration" on this repo)
  stored as `INSTALL_STATS_TOKEN`.
- **Commit:** the Action commits the updated stats directly to `main` (or a `stats` branch, if
  direct commits to main are blocked). It should be one small commit per day.

### Step 4 — Docs + ADR

- ADR: `docs/decisions/YYYY-MM-DD-install-tracking-via-release-assets.md` (new distribution
  path for Codex/Copilot + automatic release convention), per
  [.claude/rules/decisions.md](../../.claude/rules/decisions.md).
- Update `docs/architecture/system.md` (the distribution path changes).
- `docs/codex-install-and-usage.md`, `docs/copilot-install-and-usage.md`: one line saying the
  installer downloads the release zip and falls back to bundled files when offline.
- Contributor docs: "bump the version in `package.json` + `core/plugin.json` → release is automatic".

---

## How to read the numbers

| Number | Meaning |
|---|---|
| Codex zip downloads | Codex installs **plus updates** (each `update codex` downloads again) |
| Copilot zip downloads | Copilot installs **plus updates** |
| Total clones (Insights) | Claude Code + Cursor installs/updates **plus team + CI** |
| Est. install clones (total − CI) | Claude Code + Cursor installs/updates **plus team** (small, steady) |
| Unique cloners (Insights) | Rough "how many machines" over 14 days; includes CI runners and team |

Limits:
- **Downloads, not people.** One person installing in 3 projects counts as 3; updates count again.
- **Offline / firewall installs** that use the fallback aren't counted.
- **Claude Code and Cursor can't be told apart.** CI is subtracted, but team clones remain, so
  read the Claude Code + Cursor number as a **trend**, not an exact count.
- Claude Code also re-clones the marketplace when it checks for updates, so its clones include
  update checks, not just new installs.
- Anyone can inflate a download count by downloading the file repeatedly. That's unlikely and harmless.

---

## Open questions (verify before building)

1. **Traffic API token:** does the built-in `GITHUB_TOKEN` work for `/traffic/clones`, or is a PAT
   needed? Who owns and rotates it?
2. **Cursor:** does the Cursor marketplace git-clone the repo (so it's counted in Clones) or download
   an archive (not counted)?
3. **zip vs tar.gz:** a `.tar.gz` asset lets the installer use Node's built-in `zlib` with no new
   dependency. Pick one before building Step 2.
4. **Release notes:** auto-generated from PRs, or the hand-written `docs/wip/release-notes-*` drafts?
5. **Stats commits:** commit daily to `main`, or to a separate `stats` branch to keep history clean?

---

## Test plan (before building in the-psi/pai-orbit)

Test everything in a separate repo first. Nothing is merged into `the-psi/pai-orbit`.

**Test repo:** `chetansharmapsi/pai-orbit-install-test`. It's **public**, because installers and Claude Code
must download releases without logging in. It's a copy of the current code, not linked to the-psi repo.

**Tools available (checked 2026-11-03):** GitHub `chetansharmapsi`, Claude Code 2.1.308,
Codex CLI 0.158.0, Cursor, Node 24.

**Changes made in the test repo only:**
1. Release Action → creates a release with `pai-orbit-codex.zip`, `pai-orbit-copilot.zip` and
   `pai-orbit-claude-code.zip`, and updates `marketplace.json` (`url` + `sha256`).
2. Codex + Copilot installers → download the release zip, with fallback to bundled files.
3. `.claude-plugin/marketplace.json` → `archive` source pointing at the test repo's zip.
4. Stats Action (daily + manual run) → no `actions/checkout`, subtracts CI clones.

**Test cases:**

| # | Test | How | Pass if |
|---|---|---|---|
| T1 | Codex install | `npx github:chetansharmapsi/pai-orbit-install-test init codex` in a throwaway folder | Files installed; `pai-orbit-codex.zip` count +1 |
| T2 | Codex fallback | Same, with the release URL broken/unreachable | Install still works; prints "using bundled files"; no count |
| T3 | Copilot install | `npx … init copilot` in a throwaway folder | Files installed; `pai-orbit-copilot.zip` count +1 |
| T4 | Copilot update | `npx … update copilot` | Files refreshed; count +1 |
| T5 | Claude Code install | `claude plugin marketplace add chetansharmapsi/pai-orbit-install-test` + install plugin | Plugin loads; `pai-orbit-claude-code.zip` count +1; repo clone +1 |
| T6 | Claude Code update | Bump version → release → `claude plugin update` | New version installed from the new zip |
| T7 | Cursor install | Add the test marketplace in Cursor (manual, Cursor UI) | Plugin installs; repo clone +1 |
| T8 | Release Action | Bump version in `package.json` + `core/plugin.json`, push | Release created with 3 zips; `marketplace.json` URL + `sha256` updated |
| T9 | Release Action guard | Push with mismatched versions | Action fails, no release |
| T10 | Stats Action | Run manually | CSVs + README written; CI clones subtracted; the Action itself adds no clone |

Timing: zip download counts update within minutes. Insights clone numbers can take **up to a day**,
so T5, T7 and T10 are checked the next day.

**Answers the open questions:** traffic API token (T10), Cursor clone vs archive (T7),
zip vs tar.gz (T1/T3), plus the Claude Code `archive` risks #2–#4 (T5/T6/T8).

**Clean-up after the test:** remove the test marketplace from Claude Code and Cursor, delete the
throwaway folders. Keep or archive the test repo.

### Where results are saved

| What | Where |
|---|---|
| Test results report (pass/fail per test, screenshots/notes, answers to the open questions) | `docs/wip/install-tracking-test-results-YYYY-MM-DD.md` in the local pai-orbit checkout (not committed) |
| Raw numbers produced by the stats Action during the test | `docs/reports/install-stats/` **in the test repo** |
| Final decisions from the test | This plan file (Open questions → answered, risks updated) |
| Real stats after rollout | `docs/reports/install-stats/` in `the-psi/pai-orbit` (written by the daily Action) |

## Order of work

1. Step 1 (release Action). It's useful on its own and creates v1.12.0.
2. Step 3 (stats Action). Start saving clone history right away.
3. Step 2 (installer change), once releases with zips exist.
4. Step 4 (docs + ADR), in the same PR as Step 2.

## Effort estimate

| Step | Effort |
|---|---|
| Open questions | ~0.5 day |
| Release Action | ~0.5 day |
| Installer change (Codex + Copilot) + tests | ~1 day |
| Stats Action | ~0.5 day |
| Docs + ADR | ~0.5 day |
| **Total** | **~3 days** |

Cost: **free.** The repo is public, so GitHub-hosted Actions minutes, release asset storage and
API calls cost nothing.

---

## Later phases (not in this plan)

- **Phase 1b: clean Claude Code count.** Switch the plugin entry in `.claude-plugin/marketplace.json`
  to an `archive` source pointing at a `pai-orbit-claude-code.zip` release asset (with `sha256`),
  and have the release Action build that zip and update `marketplace.json`. This gives Claude Code
  its own download count and leaves repo clones ≈ Cursor + marketplace catalog clones + team.
  Needs Claude Code ≥ v2.1.224; test before switching.

  **Where the change goes:** one line in `.claude-plugin/marketplace.json`, the pai-orbit entry's `source`:

  ```json
  // today
  "source": "./plugins/pai-orbit/dist/claude-code/",

  // Phase 1b
  "source": {
    "source": "archive",
    "url": "https://github.com/the-psi/pai-orbit/releases/download/v<version>/pai-orbit-claude-code.zip",
    "sha256": "<checksum of the zip>"
  },
  ```

  Every way of adding the marketplace (`/plugin marketplace add the-psi/pai-orbit`, the full URL, the
  `.git` URL, or the VS Code "Manage Plugins → Marketplaces" dialog) reads this same file, so all of
  them would install from the release zip.

  **Risks of this change:**

  | # | Risk | Impact | Mitigation |
  |---|---|---|---|
  | 1 | **Older Claude Code.** The `archive` source needs Claude Code ≥ v2.1.224 (released 2026-08-07, ~3 months old as of 2026-11-03; latest is 2.1.316). | New users on older versions can't install. Existing users on older versions get the new `marketplace.json` on the next marketplace refresh, and their working pai-orbit may stop updating or fail to load. | Test on a pre-2.1.224 version first. Note the minimum version in the README / install docs. Risk is low because Claude Code auto-updates by default. |
  | 2 | **`marketplace.json` changes every release.** `url` (contains the version) and `sha256` (checksum of the zip) must be updated for each release. | If someone forgets, users keep getting the old version. | The release Action builds the zip, computes `sha256`, and commits the updated `marketplace.json` automatically. |
  | 3 | **The zip doesn't exist yet.** `marketplace.json` points at `v<version>` before the release Action has finished uploading the zip (or the Action failed). | Installs and updates fail with a download error during that window. | The Action uploads the zip first and only then updates `marketplace.json`. Alert on Action failure. |
  | 4 | **Checksum mismatch.** If a zip is rebuilt or re-uploaded for the same version, its `sha256` changes. | Claude Code refuses the download, so installs fail. | Never replace a published zip. Fix forward with a new version. The Action refuses to overwrite an existing asset. |
  | 5 | **No fallback.** Unlike the Codex/Copilot installer, Claude Code has no bundled copy to fall back to. | If GitHub release downloads are blocked (company firewall blocking the asset host) or GitHub is down, installs and updates fail. Today they'd still work through the clone. | Accept, or document the firewall hosts to allow. Repo-clone installs had the same GitHub dependency. |
  | 6 | **"Always latest" URL shortcut** (`releases/latest/download/...`, no `sha256`) to avoid editing per release. | Loses the tamper check and version pinning. It's unclear whether Claude Code detects updates when the URL never changes. | Don't use it unless tested. Prefer the versioned URL + `sha256` set by the Action. |
  | 7 | **Clone noise remains.** Adding or refreshing the marketplace still clones the repo to read the catalog. | Repo clones still include Claude Code catalog clones, so the Cursor number stays mixed. | Accept. The clean Claude Code number comes from zip downloads, not clones. |
  | 8 | **Rollback.** If the switch causes problems, users already refreshed onto the `archive` entry. | Reverting `source` to the local path fixes it at the next marketplace refresh, not instantly. | Keep the old `source` line in the PR description, so a revert is a one-line change. |

  **Not affected:** Cursor (`.cursor-plugin/marketplace.json` is a separate file), Codex, Copilot.
- **Phase 2: active usage + Claude Code vs Cursor split.** Opt-in anonymous ping (e.g. PostHog)
  on install and on session start. These counts can be faked because the plugin is public, so
  treat them as trends.
- **Phase 3: exact, verified counts.** Users log in with GitHub once, and a small server
  checks each ping. Only if exact numbers are ever required.

## Rejected alternatives

| Option | Why rejected |
|---|---|
| One install repo per agent (`pai-orbit-claude`, `-cursor`, `-codex`, `-copilot`) | Requirement is to keep one repo |
| Publish to npm for download counts | Adds npm publishing and package ownership; release assets give the same count inside GitHub |
| Google Sheet / PostHog ping now | Pings can be faked, and need privacy notice + opt-out; not needed for install counts |
