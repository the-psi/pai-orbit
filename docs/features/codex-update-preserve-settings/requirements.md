# Codex `update` preserves project settings (#76)

Status: Groomed — ready for /design

## Epic
docs/epics/multi-tool-compat/ (board issue #27)

## Purpose
Developers using the Codex adapter run `update codex` to take a new pai-orbit release, but it overwrites their configured `.codex/pai-orbit-config.md`, `.codex/team.md`, and the lint hooks' `repo=` paths with starter templates; the lint hooks then silently stop checking files, and `docs/codex-install-and-usage.md` claims `update` is "safe to run after every upgrade". The update must refresh plugin-owned code while keeping project settings, so a routine upgrade never needs `$setup` repeated.

## Scope
- `update codex` (`plugins/pai-orbit/adapters/codex/install.js`) no longer overwrites existing project settings (`.codex/pai-orbit-config.md`, `.codex/team.md`, `.codex/config.toml`)
- Configured Python/TS lint `repo=` paths survive and the updated hooks use them
- Project-authored `AGENTS.md` / `README.md` content is preserved or safely merged; conflicts are reported
- Plugin-owned skills, hook scripts, agents, templates still receive the new release
- New template fields are added without replacing configured values
- Migration for existing installs with inline `repo=` hook config; repeat updates are safe
- Codex `$setup` (`setup-append.md`) does not overwrite configured values on re-run
- Regression tests for configured-install upgrade, repeat update, missing/new settings, verifying lint actually executes
- Docs/README/AGENTS text (`docs/codex-install-and-usage.md`, Codex `build.sh` text) explain preservation and hook re-trust

What this does NOT include:
- #58 `/pai-orbit:update` plugin self-update command
- `init codex` behaviour (still refuses to overwrite existing files)
- Copilot `update copilot` and the claude-code, cursor-plugin, cursor adapters
- Codex hook trust mechanism itself
- Any behaviour change to claude-code lint hooks that share `core/hooks/lint-*.sh`

## Scenarios in scope
1. Configured Codex project runs `update codex` for a new release: settings kept, plugin code refreshed
2. Project-authored `AGENTS.md` / `README.md` content meets `update codex`
3. Existing install with inline `repo=` in hook scripts is migrated on update
4. New release adds a new config field: added safely, guidance only where input needed
5. `update codex` is run repeatedly: no change after the first run
6. Hook scripts changed by update: developer told to re-trust hooks
7. `$setup` re-run after upgrade does not overwrite configured values
8. (Copilot `update copilot` — Out of scope, see below)
9. Claude-code lint hooks behave identically after the Codex fix
10. Docs/README text accurately describes what `update` preserves vs refreshes

## Consumer check
- Signal: `repo=` (lint hook path config)
- Classification: Existing — changes how the configured value is kept/read across updates
- Override: none
- Search terms: `repo=`, `REPO=`, `lint_path`, `lintPath`, `repo_path`, `repoPath`, `repo_dir`, `python_repo`, `ts_repo`
- Repos searched: pai-orbit (single repo) · Not reachable: none
- Concept map: no concept map found
- Consumers found:
  - core `lint-python.sh` / `lint-ts.sh` + Codex lint wrappers → In scope, Scenarios 1, 3, 9
  - Codex `$setup` (`setup-append.md`) → In scope, Scenario 7
  - Codex AGENTS.md / README / build.sh text → In scope, Scenario 10
  - Copilot `update copilot` → Excluded, see Out of scope
- Test-only hits: 0 files
- Map discrepancies: none (no map)

- Signal: `.codex/pai-orbit-config.md` / `.codex/team.md` / `.codex/config.toml`
- Classification: Existing — `update` changes how these existing files are treated
- Override: none
- Search terms: `pai-orbit-config.md`, `team.md`, `config.toml`, `update codex`, `runInstall`, `copyRecursive`, `overwrite`
- Repos searched: pai-orbit (single repo) · Not reachable: none
- Concept map: no concept map found
- Consumers found:
  - Codex `install.js` (`runInstall` / `copyRecursive`) → In scope, Scenario 1 (named by the issue)
  - Codex `$setup` → In scope, Scenario 7
- Test-only hits: 0 files
- Map discrepancies: none (no map)

## User stories / use cases
- S1: As a developer with a configured Codex project, I want `update codex` to keep my settings, so that I get new plugin code without redoing setup.
- S2: As a developer with my own AGENTS.md/README content, I want it preserved or safely merged, so that an upgrade never silently deletes my docs.
- S3: As a developer on an older install, I want my inline lint paths migrated, so that lint keeps running after the upgrade.
- S4: As a developer, I want new config fields added without losing my values, so that upgrades stay low-effort.
- S5: As a developer, I want repeat updates to be safe, so that I can run `update` without checking first.
- S6: As a developer, I want to know when to re-trust hooks, so that updated hooks actually run.
- S7: As a developer, I want `$setup` re-runs not to wipe my config, so that I can safely re-run it.
- S9: As a claude-code user, I want lint hooks unchanged, so that the Codex fix does not regress me.
- S10: As a developer, I want accurate docs on what `update` preserves, so that I can trust the upgrade path.

## Functional requirements
1. REQ-1 (Scenario 1): Existing board, docs-home, team, and project-specific Codex settings must survive `update codex`.
2. REQ-2 (Scenario 1): Configured Python/TS lint paths must survive, and updated hooks must run lint against the configured project.
3. REQ-3 (Scenario 1): Plugin-owned skills, hook implementations, agents, and templates must receive the new release; preserving settings must not roll them back.
4. REQ-4 (Scenario 2): Project-authored AGENTS.md/README content must be preserved or safely merged; on conflict the developer's version is kept, the plugin's text is written alongside, and the developer is told the conflict exists and that they may choose to change it; never silently overwritten.
5. REQ-5 (Scenario 3): Installs with inline `repo=` hook config must be migrated by `update codex`; any hand-edits in the old hook script outside the `repo=` block must be reported.
6. REQ-6 (Scenario 4): Missing/new config fields must be added without replacing configured values; explicit guidance only where user input is genuinely needed.
7. REQ-7 (Scenario 5): Repeating `update codex` must leave preserved/merged/migrated state unchanged.
8. REQ-8 (Scenario 6): After hook scripts change, the developer must be told to re-trust hooks (installer output and docs).
9. REQ-9 (Scenario 7): Re-running `$setup` must not overwrite already-configured values.
10. REQ-10 (Scenario 9): Claude-code lint hooks must behave identically.
12. REQ-12 (Scenarios 1-5): `update codex` must print a summary listing everything preserved, added, migrated, and in conflict.
11. REQ-11 (Scenario 10): Docs must state what `update` preserves vs refreshes, and the hook re-trust requirement.

## Non-functional requirements
- Full adapter parity (constraint 6) and `dist/` backward compatibility (constraint 7): version bump + migration note for structural change to `dist/codex/`.
- Regression tests must verify lint execution, not only file contents.
- Fix lives in `adapters/codex/` / `core/`; never hand-edit `dist/` (constraint 1).

## Context
- Classified as bug fix (label `bug`); capabilities and roadmap reads skipped; no specific reason to check.
- `docs/domain/` is empty; purpose grounded in issue #76 body, the epic, and `docs/codex-install-and-usage.md`.
- Board readable (GitHub issues via `gh`). Related-open-story scan done: #58 related, separate (self-update; no Codex config preservation). Checkpoint at `docs/wip/related-open-story-checkpoints/the-psi-pai-orbit-76.md`.
- No concept-consumers map exists; consumer check done by code search only.

## Out of scope
- #58 `/pai-orbit:update` self-update command
- Copilot `update copilot` — reason: #76 targets Codex only (confirmed by developer)
- `init codex` refusal behaviour; claude-code/cursor adapters; Codex hook trust mechanism

## Open questions
- [x] AGENTS.md/README conflict — **Resolved:** developer's version is kept, plugin text is written alongside, and the developer is told about the conflict and that they can choose to change it — owner: Upneet Singh
- [x] Update summary — **Resolved:** yes, update shows everything: preserved / added / migrated / conflicted — owner: Upneet Singh
- [x] Hand-edited old hook script beyond `repo=` — **Resolved:** report it (no silent change) — owner: Upneet Singh
- [ ] Where project settings live (separate config file read by hooks vs migration of inline values) — owner: /design (design question)

## Acceptance criteria
- AC-1 (Scenario 1): After `update codex` on a configured project, board, docs-home, team, and `.codex/config.toml` settings equal their pre-update values.
- AC-2 (Scenario 1): After update, the lint hooks run ruff/eslint on a file in the configured project path (verified by execution).
- AC-3 (Scenario 1): Plugin-owned files in the project match the new release.
- AC-4 (Scenario 2): A project-authored line in AGENTS.md/README is present after update; any conflict is reported in output.
- AC-5 (Scenario 3): An install with inline `repo=` is migrated; lint runs afterwards against that path.
- AC-6 (Scenario 4): A new template field appears after update; existing values unchanged.
- AC-7 (Scenario 5): A second `update codex` produces no further changes to project files.
- AC-8 (Scenario 6): Installer output and docs mention hook re-trust.
- AC-9 (Scenario 7): `$setup` re-run leaves configured values intact.
- AC-10 (Scenario 9): Claude-code lint hook output is unchanged by the Codex fix.
- AC-12 (Scenarios 1-5): Update output lists preserved, added, migrated, and conflicted items.
- AC-11 (Scenario 10): `docs/codex-install-and-usage.md` no longer says `update` simply overwrites, and documents re-trust.
