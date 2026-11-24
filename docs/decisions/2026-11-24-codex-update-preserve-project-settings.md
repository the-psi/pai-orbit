---
status: proposed
date: 2026-11-24
deciders: [Upneet Singh]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: Codex `update` preserves project settings via installer-side ownership rules

## Context

`update codex` overwrote every dist entry. Project config (`.codex/pai-orbit-config.md`, `team.md`, `config.toml`) was reset to templates, and the lint hooks lost their inline `repo=` block, so lint silently stopped running (#76). The `repo=` block lives inside `core/hooks/lint-*.sh`, which claude-code and cursor-plugin also ship, so changing the hooks cascades across adapters (constraint 6). See the [impact report](../wip/analysis-codex-update-preserve-settings-2026-11-03.md) and [design](../features/codex-update-preserve-settings/design.md).

## Decision

In the context of **Codex `update` destroying configured settings**,
facing **a shared core hook that holds config inline and no state about what the user edited**,
we decided **to keep the fix inside `adapters/codex/install.js`: a hardcoded ownership list, skip-and-append for project-owned config files, a `repo=` block splice for the lint hooks, and `.pai-orbit-new` side-files for AGENTS.md/README.md conflicts**,
to achieve **preserved settings with zero change to core hooks or other adapters**,
accepting **noisy conflict/backup reports and manual handling of new keys inside existing config tables**.

Convention future contributors must follow: any new project-owned file shipped in `dist/codex/` must be added to the ownership list in `install.js`; otherwise `update` overwrites it.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) Installer-only: ownership list + splice + side-files | No core/other-adapter change; claude-code identical; no new state or dependency | Hardcoded list; over-reports conflicts and backups |
| Core hooks read a separate project config file | Clean separation long term | Touches core, claude-code `/setup`, cursor-plugin; migration across adapters |
| Manifest file for ownership | Extensible | Extra file and format to maintain for a 7-file list |
| Hash/baseline state for user-edit detection | Precise, no false conflicts | State file; old installs have no baseline |
| Marker block in AGENTS.md/README | No conflict noise | `dist/` structure change, version-gated migration |
| Full key-level config merge | Fully automatic | Needs TOML/markdown parser dependency |

## Consequences

**Positive:**
- Routine `update codex` keeps config and lint paths; inline-`repo=` installs migrate with the same code path.
- Repeat updates are idempotent; summary lists preserved/added/migrated/conflicts; re-trust only warned when hooks changed.

**Negative / trade-offs:**
- Unedited AGENTS.md/README from older releases show as conflicts; plugin text never auto-lands.
- Outside-block diff in lint hooks cannot tell hand-edits from release changes, so backups may be created unnecessarily.
- New keys inside existing `config.toml` tables are only reported.
- `$setup` re-run safety is prompt text and cannot be fully tested deterministically.

**Neutral:**
- No `dist/codex/` layout change; patch bump 1.11.2 with a migration note (constraint 7).

## Related Decisions

- [2026-07-19-codex-adapter-decisions.md](2026-07-19-codex-adapter-decisions.md) (Codex adapter and npx installer)

## Review Date

Revisit when a second adapter needs the same preservation (consider the manifest or core-config option), or when the ownership list exceeds ~10 files.
