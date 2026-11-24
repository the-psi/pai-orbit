## Impact Analysis: Codex `update` preserves project settings (#76)
Date: 2026-11-03

## Change
Current: `update codex` = `runInstall(overwrite:true)` → `copyRecursive` blindly overwrites every dist entry. Lint `repo=` paths live **inline** in `core/hooks/lint-python.sh` / `lint-ts.sh` (the `--- CONFIGURE ---` block), so overwriting the script wipes the config.
Proposed: update keeps project-owned files (`.codex/pai-orbit-config.md`, `team.md`, `config.toml`, AGENTS.md/README.md merge), and lint paths survive (design TBD: separate config file read by hooks vs migrate inline values).
Classification: Breaking — owned (Codex only) if only `install.js` changes; **Cascading** if `core/hooks/lint-*.sh` change (shared with claude-code, cursor-plugin).

## Consumers found
| Location | File:line | Classification | Action needed |
|---|---|---|---|
| Codex installer | adapters/codex/install.js (`runInstall`, `copyRecursive`) | Owned | Rework update path |
| Codex build | adapters/codex/build.sh:189 (copies core lint hooks), :373 README text, :437 setup text | Owned | Update copy + text |
| Codex wrappers | adapters/codex/hook-wrappers/lint-{python,ts}-wrapper.{sh,ps1} | Owned | Call core script; unaffected if core keeps interface |
| Codex setup | adapters/codex/setup-append.md:31-40 | Owned | Re-run safety (REQ-9); new config location text |
| **Core hooks** | core/hooks/lint-python.sh:20, lint-ts.sh:20 (`repo=""`) | Owned, **shared** | Any change here hits claude-code + cursor-plugin |
| Claude-code /setup | core/modes/setup.md:214-215 (copies hook, edits paths inline) | Owned, shared | Changes if repo config moves out of the script |
| Cursor-plugin | adapters/cursor-plugin/build.sh:113,130-133 (ships core hooks as scripts/) | Owned, shared | Must keep working (constraint 6) |
| Copilot / cursor (legacy) | no reference to lint-python/lint-ts in build.sh | None | Excluded |
| Docs | docs/codex-install-and-usage.md:175,279; docs/capabilities.md:307-311; docs/getting-started.md:107 | Owned | Text updates (REQ-11) |
| Existing installs | users' `.codex/hooks/lint-*.sh` with inline `repo=` | **External** (in consumers' repos) | Migration on update (REQ-5); hand-edits reported |
| Tests | none found in repo (no test dir/framework) | — | Regression harness must be created |

## Constraint check
- Rule 6 (parity): core hook change must work on claude-code, cursor-plugin, codex.
- Rule 7 (dist back-compat): any `dist/codex/` structural change → version bump + migration note.
- Rule 1: no hand-edit of dist.

## Migration path
1. **Installer-only:** no core change. Update path migrates inline `repo=` block out of old script into a Codex-side value, rewrites hook from new release. Contained to `adapters/codex/`.
2. **Core config file:** core hooks read repo paths from a project-owned file (fallback to inline `repo=` for back-compat). Touches core + all adapters that ship the hooks; claude-code behaviour must stay identical (REQ-10).

## Recommendation
Proceed to design with Option 1 as the leading candidate (smallest blast radius, REQ-10 safe by construction); Option 2 only if parity/maintenance argument justifies the cascade. Core hooks must keep working unchanged for claude-code/cursor-plugin either way (inline fallback).

## Open questions
- [ ] Does cursor-plugin have its own place users edit `repo=` (scripts/ copies)? — owner: /design (verify)
- [ ] No test infrastructure exists — where do regression tests live and how run? — owner: /design
