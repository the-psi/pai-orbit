# Install tracking — test results (2026-11-05)

**Plan:** [docs/plans/install-tracking-github-insights-2026-11-01.md](../plans/install-tracking-github-insights-2026-11-01.md)
**Test repo:** https://github.com/chetansharmapsi/pai-orbit-install-test (public, test only; copy of the-psi `main` @ `52895b5`)
**Issue:** https://github.com/the-psi/pai-orbit/issues/89
**Status:** Complete (clone numbers confirmed 2026-11-07).

---

## Summary

| # | Test | Result |
|---|---|---|
| T1 | Codex install from release `.tar.gz` | ✅ Pass. "using release files"; 90/90 files identical to `dist/codex` (LF endings, same as today's npx); hook `.sh` files executable |
| T2 | Codex fallback when download blocked | ✅ Pass. "using bundled files (… timed out after 15s)"; install completed. ⚠️ Waits the full 15s timeout |
| T3 | Copilot install from release `.tar.gz` | ✅ Pass. "using release files"; 32/32 prompts identical to `dist/copilot` |
| T4 | Copilot update | ✅ Pass. Update downloaded the release file again |
| T5 | Claude Code install via `archive` source | ✅ Pass. Plugin 1.13.0 installed + enabled; 64/64 files identical to `dist/claude-code` |
| T6 | Claude Code update | ✅ Pass. Marketplace refresh picked up the new URL + `sha256`; plugin updated 1.13.0 → 1.13.1 |
| T7 | Cursor install (manual) | ✅ Pass. Via project `.cursor/settings.json` (`gitUrl` + `gitRef`; Free plan has no marketplace UI). Cursor fetched the repo **with git** (partial clone, `blob:none`) and cached plugin v1.13.1 (83 files + cache marker); `/arch` is recognised in Agent chat. Running it needs a model the Free plan allows; not a plugin issue. Settings key must be `<marketplace name>/<plugin name>` (`pai-orbit-install-test/pai-orbit`); owner/repo fetches the repo but installs nothing |
| T8 | Release Action creates assets | ✅ Pass. v1.13.0 and v1.13.1 created with `pai-orbit-codex.tar.gz`, `pai-orbit-copilot.tar.gz`, `pai-orbit-claude-code.zip`; bot commit updated `marketplace.json` (url + sha256) after upload |
| T9 | Release Action refuses version mismatch | ✅ Pass. "Version mismatch: package.json=1.13.1, core/plugin.json=1.13.0. Bump both." No release |
| T10 | Stats Action | ⚠️ Partial. Created `stats` branch, wrote `releases.csv` + `README.md` with no checkout. **Clones failed: `GITHUB_TOKEN` gets HTTP 403 on `/traffic/clones`** |
| — | **Release download counters increase** | ✅ **Works, with ~15 min delay. 1 download = 1 count** (verified on v1.13.1: Codex install 1→1, Claude Code update 1→1, control `curl` 1→1). On v1.13.0, codex and claude-code each showed one unexplained extra count (2 for 1); copilot was exact (2 for 2). Treat counts as "about right", not exact |
| — | Insights clone numbers | ✅ Recorded, ⚠️ **very noisy.** With `INSTALL_STATS_TOKEN` set (2026-11-07) the stats run succeeded: 2026-11-05 = **102 clones / 29 unique**, CI subtracted correctly (6); 2026-11-06 = **15 clones / 8 unique** on a day with no test activity. Our own tests explain ~15 clones on 11-05; the rest are outside cloners (bots/indexers/scanners that clone new public repos). Release-asset downloads had no such noise |

---

## Open questions answered

1. **Traffic API token:** `GITHUB_TOKEN` is **not** allowed (`403 Resource not accessible by integration`).
   The user's own `gh` login can read it. **Needs a fine-grained PAT** stored as `INSTALL_STATS_TOKEN`
   (the workflow already uses it when set).
2. **Cursor clone vs archive:** **git** (partial clone of the repo). Cursor installs should count as
   repo clones in Insights (confirmed: clones recorded), but the clone count is dominated by outside
   cloners, so Cursor's number is a rough trend only.
3. **Traffic lag:** clone numbers for a day appeared within ~2 days.

## Findings / changes to the plan

1. **Release workflow must also trigger on `core/plugin.json`.** With only `package.json` in `paths`,
   fixing a mismatch by bumping `core/plugin.json` afterwards never triggers a release. Fixed in the
   test repo: `paths: [package.json, plugins/pai-orbit/core/plugin.json]`.
2. **the-psi `main` is already mismatched:** `package.json` = 1.11.1, `core/plugin.json` = 1.13.0
   (at `52895b5`). The version check would block the first real release until this is fixed.
3. **Marketplace name must differ in the test repo.** The test marketplace was renamed
   `pai-orbit-install-test` so it doesn't clash with a user's real `the-psi` marketplace.
4. **Fallback waits 15s** when the download host is unreachable. Acceptable, but could be shortened
   (e.g. 8s) so offline installs feel less stuck.
5. **Claude Code `archive` source works end to end** (install + update, checksum verified), which
   de-risks Phase 1b risks #2–#4.
6. **Stats rerun on the same day didn't refresh download counts.** Fixed: today's rows are replaced
   on rerun.
7. **Branch/tag pins now get release files**, not the pinned ref's `dist/` (see plan, outcome #8).
8. Windows note (test environment only): Claude Code marketplace clone into a very deep temp path
   failed with "Filename too long". Not a pai-orbit issue; used a short config dir (`D:\cc-t5`).

## How the tests were run

- Codex / Copilot: `npx --yes github:chetansharmapsi/pai-orbit-install-test init|update codex|copilot`
  in empty throwaway folders under the session scratchpad.
- T2: `PAI_ORBIT_RELEASE_BASE=https://unreachable.invalid npx … init codex`.
- Claude Code: isolated config `CLAUDE_CONFIG_DIR=D:/cc-t5`, so the real Claude Code setup was not touched:
  `claude plugin marketplace add https://github.com/chetansharmapsi/pai-orbit-install-test.git`,
  `claude plugin install pai-orbit@pai-orbit-install-test`, then version bump +
  `claude plugin marketplace update` + `claude plugin update`.
- T9 / T6: commits to the test repo's `main` bumping versions.
- T10: `gh workflow run install-stats.yml`.

## Still to do

- [x] Confirm release `download_count` increases: yes, after ~15 min.
- [x] Confirm 1 download = 1 count: yes on v1.13.1 (all three exact at 07:47Z).
- [x] T7: Cursor install from the test repo: works, fetched with git.
- [x] Check Insights clones + rerun stats with `INSTALL_STATS_TOKEN`: run succeeded, CI subtracted (6), clones recorded but noisy (see summary).
- [ ] Clean-up: delete the test repo and local test folders when done.
