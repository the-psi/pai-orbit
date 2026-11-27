# Design: Codex `update` preserves project settings (#76)

Status: Approved (2026-11-25, Upneet Singh)
Date: 2026-11-24
Requirements: [requirements.md](requirements.md)
Impact report: [analysis-codex-update-preserve-settings-2026-11-03.md](../../wip/analysis-codex-update-preserve-settings-2026-11-03.md) (loaded; shared-interface gate satisfied)

## Problem
`update codex` runs `runInstall(overwrite:true)` → `copyRecursive` overwrites every dist entry. Project config files are reset to templates, and the lint hooks lose their inline `repo=` block, so lint silently stops running.

## Design summary
Fix lives entirely in `plugins/pai-orbit/adapters/codex/` (installer, setup text, docs). No change to `core/hooks/lint-*.sh`, so claude-code and cursor-plugin are unaffected by construction (REQ-10, constraint 6).

Two preservation strategies, each used where it fits:

| Strategy | Applies to | Behaviour |
|---|---|---|
| **Way 1 — extract, replace, re-insert** | `.codex/hooks/lint-python.sh`, `lint-ts.sh` | Plugin-owned script gets the new release; the user's `--- CONFIGURE ---` block is lifted from the old script and spliced into the new one. |
| **Way 2 — leave configured fields alone** | `.codex/pai-orbit-config.md`, `team.md`, `config.toml` | Existing file is never rewritten; only missing sections/tables are appended. |

Everything else in dist is plugin-owned and overwritten as today.

## Decisions

### D1 — Where settings live → installer-only splice (Option A)
Migration and preservation are the same operation: on every `update`, extract the `CONFIGURE` block from the existing script and inject it into the new one. Inline-`repo=` installs need no separate migration code.
- Rejected B (core hooks read a separate config file): cascades to claude-code, cursor-plugin, `/setup`; fails "blast radius first".
- Reversible: yes (can adopt B later with inline fallback).

### D2 — Ownership list → hardcoded in `install.js` (Option A)
- Project-owned, skip if exists: `.codex/pai-orbit-config.md`, `.codex/team.md`, `.codex/config.toml`.
- Conflict-rule: `AGENTS.md`, `README.md`.
- Splice: `.codex/hooks/lint-python.sh`, `.codex/hooks/lint-ts.sh`.
- Everything else: plugin-owned, overwrite.
- Rejected B (manifest file) and C (hash state): more machinery for a 7-file list. Revisit if the list grows.

### D3 — `AGENTS.md` / `README.md` conflicts → side-file (Option A)
- Identical to new release → "unchanged".
- Different → keep the developer's file, write the new release to `<name>.pai-orbit-new`, report as conflict. Re-running rewrites the same `.pai-orbit-new` (idempotent, REQ-7).
- Known cost: an unedited file from an older release also reports as conflict (no baseline to tell the difference), and plugin text never lands automatically.
- Rejected B (marker block; needs dist structure change + version-gated migration) and C (3-way merge; needs state file). B is a possible follow-up.

### D4 — Lint block handling → splice + backup on outside changes (Option A)
- Extract text between `# --- CONFIGURE` and `# --- END CONFIGURE ---` from the old script; replace the same region in the new script.
- If the old script differs from the new one **outside** the block: save the old script as `<name>.pai-orbit-old` and list it in the summary (covers REQ-5 hand-edits; cannot distinguish hand-edits from release changes, so it may over-report).
- If markers are missing from the old script: keep the new script, back up the old one, warn.
- Rejected B (hash stamp in shipped hooks): dist structure change, no stamp in old installs.

### D5 — New config fields → section-level append (Option A)
- `pai-orbit-config.md`: a `## Section` heading present in the new template but absent in the user's file is appended with placeholder + "fill this in" note.
- `config.toml`: a `[table]` missing from the user's file is appended.
- A new key inside an existing table is not auto-added; it is listed in the summary as "new key available: X".
- Existing values are never modified. Uses Node stdlib line matching, no TOML parser.
- Rejected B (side-file only; fails AC-6) and C (full key-level merge; needs a parser dependency).

### D6 — `$setup` re-run safety → guard in Codex `setup-append.md` (Option A)
- Add a step 0: read existing `.codex/pai-orbit-config.md`, `team.md`, and lint `repo=` blocks first; ask only about empty/placeholder fields; never overwrite configured values.
- Prompt text, not code, so AC-9 cannot be fully tested deterministically: automated check that the guard text ships, plus one manual verification (open question).
- Also update setup-append §3: the lint block is now preserved across updates.
- Rejected B (change core `setup.md`: alters claude-code `/setup`, out of scope) and C (installer marker).

### D7 — Regression tests → `node:test` in `adapters/codex/test/` (Option A)
Run with `node --test`; no new dependency. Each case builds a temp project, runs `install.js`, and for lint cases puts a fake `ruff` (and `eslint`) on PATH that writes a marker file, then feeds the Codex wrapper a payload and asserts the marker, proving lint executed, not just file contents.

Cases: configured upgrade (AC-1..3), repeat update no diff (AC-7), inline-`repo=` migration (AC-5), new template field (AC-6), AGENTS/README conflict (AC-4), summary content (AC-12), re-trust message (AC-8).

### D8 — Hook re-trust notice → only when hook content changed (Option A)
Compare existing vs new bytes (`Buffer.equals`) for hook scripts, wrappers, and `hooks.json` before writing. If any changed: print "N hooks changed — run `/hooks` to re-trust" with the list. A second `update` changes nothing, so prints nothing.

## Update flow

```mermaid
sequenceDiagram
    participant U as Developer
    participant I as install.js (update)
    participant P as Project files
    U->>I: npx ... update codex
    I->>P: config.md / team.md / config.toml exist?
    alt exists
        I->>P: keep; append missing sections/tables (D5)
    else missing
        I->>P: write template
    end
    I->>P: AGENTS.md / README.md differ?
    alt differ
        I->>P: keep yours, write .pai-orbit-new (D3)
    end
    I->>P: read old lint-*.sh CONFIGURE block (D4)
    I->>P: write new script, splice block back
    I->>P: outside-block diff? save .pai-orbit-old
    I->>P: overwrite remaining plugin-owned files
    I->>U: summary: preserved / added / migrated / conflicts + re-trust (D8)
```

## Summary output (REQ-12)
Four lists printed at the end: **preserved**, **added**, **migrated**, **conflicts** (plus backups), then the re-trust warning when hooks changed.

## Release and compatibility
- No `dist/codex/` layout change; installer behaviour change only. Patch bump to **1.11.2** in `plugin.json` and the README/CLAUDE.md version references, with a migration note: existing installs upgrade in place; first update may report AGENTS.md/README conflicts and `.pai-orbit-old` backups (constraint 7).
- Update `docs/codex-install-and-usage.md` (preserve vs refresh table, re-trust, remove "safe to overwrite" claim), the Codex `build.sh` README text, `install.js` usage text and header comment, and `setup-append.md`.
- Never hand-edit `dist/`; rebuild with `bash plugins/pai-orbit/build.sh`.

## Risks
- Splice depends on `CONFIGURE` markers; users who deleted them get a warning and a backup instead of a splice.
- Outside-block diff over-reports on release changes (accepted noise, no silent loss).
- `init codex` still refuses on existing files (unchanged, out of scope).

## Build tasks (not implemented here)
1. `install.js`: ownership list, skip/append logic, splice, side-files, summary, re-trust detection.
2. `node:test` suite with fake `ruff`/`eslint`.
3. `setup-append.md` guard + §3 text.
4. Docs, README text in `build.sh`, usage text, version bump 1.11.2 + migration note, rebuild `dist/`.
5. ADR (see session close).

## Open questions
- [x] How to verify AC-9 (`$setup` re-run): text check in tests + manual `$setup` re-run on a configured project (SPARDHA copy, 2026-11-28): retained team/lint/hook settings, asked only for the unfilled board and branch fields.
- [ ] Does cursor-plugin have a separate place where users edit `repo=` in `scripts/` copies? Not affected by this design but unverified: owner: `/build` (quick check); blocks: nothing.
- [ ] #58 (self-update) overlap: confirm it stays separate; checkpoint awaiting confirmation: owner: Upneet Singh.
