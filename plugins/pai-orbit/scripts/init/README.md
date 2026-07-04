# pai-orbit install CLI (`pai-orbit init`)

Contributor notes for the standalone install CLI that powers
`npx github:the-psi/pai-orbit init copilot`.

End-user documentation lives in [`docs/copilot-install-and-usage.md`](../../../../docs/copilot-install-and-usage.md).

## Where this fits

This CLI is the install path for **Copilot-only teams** — projects that do not
run Claude Code or Cursor, so `/setup` is unreachable. For teams that do use
either of those tools, `/setup copilot` produces the same files. Both code
paths converge on the same templates and the same built `dist/copilot/` tree.

## Files

| File | Purpose |
|------|---------|
| `cli.js` | Entry point — arg parser + subcommand router. Wired through the root `package.json`'s `bin` field. |
| `lib/copilot.js` | Full Copilot install flow — lifecycle detection (first-run / re-run / migration), file copy from `dist/copilot/`, template rendering, husky / pre-commit activation. |
| `lib/claude.js` | Stub per D9 — points users at `/setup` inside Claude Code. |
| `lib/cursor.js` | Stub per D9 — points users at `/setup` inside Cursor. |
| `lib/prompts.js` | Interview Q&A via the `prompts` npm package; falls back to defaults when `--yes` / `--no-interactive` is set or the package is unavailable. |
| `lib/render.js` | Template placeholder substitution + directory copy + `.gitignore` line ensuring. |

## Requirements

- Node.js ≥ 18 (root `package.json` declares this in `engines`).
- One runtime dependency: `prompts ^2.4.2` — npm fetches it transparently when the CLI is invoked via `npx`.
- `git` on `PATH` — required by npx (clone path) and by D21 (`git update-index --add --chmod=+x .husky/pre-commit`).

## Distribution

No npm publishing. Users invoke via:

```bash
npx github:the-psi/pai-orbit init copilot
npx github:the-psi/pai-orbit#<release-tag> init copilot   # pin a released tag (see repo Releases)
npx github:the-psi/pai-orbit#<commit-sha> init copilot
```

`npx` clones the repo, runs `npm install` (fetches `prompts`), and executes the
`bin` declared in `package.json`. The CLI relies on `dist/copilot/` being
committed in the cloned ref — the `dist-freshness.yml` workflow enforces that
on every PR that touches `plugins/pai-orbit/`.

## Lifecycle detection

`detectLifecycle(cwd, ctx)` in `lib/copilot.js` runs three checks in order:

1. If `--migrate` subcommand → force migration.
2. Else if `.copilot/pai-orbit-config.md` exists → re-run mode (refresh
   pai-orbit-owned files; preserve `.copilot/*` user config and `CLAUDE.md`).
3. Else if `.github/pai-orbit/pai-orbit-config.md` or
   `.github/pai-orbit/team.md` exists → migration mode (back up to
   `.github/pai-orbit.bak/<timestamp>/`, move config to `.copilot/`, append
   `.github/pai-orbit.bak/` to `.gitignore` per D23).
4. Otherwise → first-run mode (full interview + scaffold).

## Local development

Run the CLI directly against this checkout without going through npx:

```bash
node plugins/pai-orbit/scripts/init/cli.js --help
node plugins/pai-orbit/scripts/init/cli.js --version

# Drive against a scratch project:
cd /tmp/scratch-project
node /path/to/pai-orbit/plugins/pai-orbit/scripts/init/cli.js init copilot --yes
```

When iterating on the CLI, also run the smoke tests:

```bash
node plugins/pai-orbit/scripts/init/cli.js --help     # should print usage and exit 0
node plugins/pai-orbit/scripts/init/cli.js --version  # should print plugin version and exit 0
```

## Things that are NOT here

- **npm packaging** — no `npm publish`, no shrinkwrap, no compiled bundle. The
  source IS the runnable artefact.
- **TypeScript** — D8 commits to plain JS. The build-step cost outweighs the
  ergonomic win for ~500 LOC.
- **Cross-tool installer logic** — `init claude` and `init cursor` are stubs
  pending real demand (D9).
- **Editor-specific files** — the CLI never emits `.vscode/`, `.idea/`, etc.
  (D33). Editor config is owned by the team.
