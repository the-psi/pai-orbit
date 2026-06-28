# Copilot Adapter Upgrade — Checkpoint

**Date:** 2026-06-28
**Branch:** `feat/copilot-plugin-adapter` (pushed to `origin`)
**Last commit:** `4e52c3c` (cursor adapter setup.mdc pull-through)
**Owner:** Chetan Sharma
**Status:** Implementation **complete and pushed**. Live-Chat validation + PR open + merge remain.

## TL;DR for a future session

Everything the upgrade plan called for is **built, tested where automation reaches, committed (7 commits), and pushed**. Three operational items remain: (1) a human walks through a 10-minute Copilot Chat smoke test, (2) the PR is opened, (3) the merge happens after review. There is nothing left for an agent to *implement*. If you're picking up to drive the operational tail, jump to "How to resume" below.

## Where the work lives

| Concept | File |
|---------|------|
| **The plan** (decisions D1..D34, scope, phases) | [docs/plans/copilot-adapter-upgrade-2026-06-28.md](../plans/copilot-adapter-upgrade-2026-06-28.md) |
| **Phase 1 design** (file formats, body transformations, frontmatter schemas) | [docs/features/copilot-adapter-prompt-files/design.md](../features/copilot-adapter-prompt-files/design.md) |
| Superseded predecessor plan (kept for cross-reference resolution) | [docs/plans/copilot-validation-2026-06-28.SUPERSEDED.md](../plans/copilot-validation-2026-06-28.SUPERSEDED.md) |
| **Adoption page** (user-facing install + daily use) | [docs/copilot-install-and-usage.md](../copilot-install-and-usage.md) |
| **Validation report** (Phase 4) | [docs/wip/copilot-upgrade-validation-2026-06-28.md](./copilot-upgrade-validation-2026-06-28.md) |
| **10-minute live-Chat smoke test** | [docs/wip/copilot-live-chat-cheatsheet-2026-06-28.md](./copilot-live-chat-cheatsheet-2026-06-28.md) |
| **Follow-up ticket bodies** (8 items, copy-paste-ready) | [docs/wip/copilot-upgrade-followups-2026-06-28.md](./copilot-upgrade-followups-2026-06-28.md) |
| **Epic** (multi-tool-compat — refreshed with feature statuses) | [docs/epics/multi-tool-compat/EPIC.md](../epics/multi-tool-compat/EPIC.md) |

## What ships in the seven commits

```
4e52c3c chore(dist): pull /setup multi-tool changes through legacy cursor adapter
5d9e2f3 docs(epic): mark multi-tool-compat features Done / In Progress
eb0d9bf docs(copilot): adoption page + Phase 4 validation + housekeeping follow-ups
9b85fb5 feat(install-cli): standalone npx init/update/migrate for Copilot
fff0c08 feat(setup): assistant-target question + Copilot branch
53f0d93 feat(copilot-adapter): rewrite emitter, add verify-dist + dist-freshness CI
73a10fb docs(plan,design): Copilot adapter upgrade — plan + Phase 1 design
```

### Phase 2 — Adapter rewrite (commit `53f0d93`)

- [plugins/pai-orbit/adapters/copilot/build.sh](../../plugins/pai-orbit/adapters/copilot/build.sh) rewritten with separate emitters (`emit_copilot_instructions`, `emit_mode_prompts`, `emit_skill_prompts`, `emit_service_builder_prompts`, `emit_skill_instructions`, `emit_arch_drift_instructions`, `emit_context_discovery_instructions`, `emit_husky_template`, `emit_precommit_framework_template`).
- Final step hand-off to [`plugins/pai-orbit/scripts/verify-dist.sh`](../../plugins/pai-orbit/scripts/verify-dist.sh) per D24.
- [.github/workflows/dist-freshness.yml](../../.github/workflows/dist-freshness.yml) added — fails PRs where committed `dist/` drifts from a fresh `build.sh`.
- Emitted into [plugins/pai-orbit/dist/copilot/](../../plugins/pai-orbit/dist/copilot/):
  - 12 mode prompts + 6 skill prompts + 7 service-builder agent prompts = **25 prompts**
  - 4 instructions files (`git`, `data-model`, `arch-drift`, `context-discovery`)
  - `.husky/pre-commit.template`, `.pre-commit-config.yaml.template`
  - Slim ~75-line `copilot-instructions.md` with `## Context discovery` section
- D13 drops: `/setup` and `/suggest-skills` are **not** emitted as Copilot prompts.
- D28: every mode prompt opens with a per-mode anti-drift block.
- D30: service-builder prompts use `mode: agent` + `tools: ["codebase", "editFiles", "runCommands", "search"]`.

### Phase 3 — `/setup` multi-tool (commits `fff0c08`, `4e52c3c`)

- [plugins/pai-orbit/core/modes/setup.md](../../plugins/pai-orbit/core/modes/setup.md): Step 2 question 11 (assistant target), Step 3 restructured into per-target blocks (Claude / Cursor / Copilot), Step 4 reporting grouped per target with honest gap statement.
- Pull-through changes in `dist/claude-code/commands/setup.md`, `dist/cursor-plugin/.../{setup.md,setup.mdc}`, `dist/cursor/.cursor/rules/setup.mdc`.
- **Regression contract:** Claude and Cursor targets emit byte-identical *project scaffold* output to pre-upgrade; only the source `setup.md` and its mechanical dist copies changed (the text the host LLM reads under the `## Target: Claude Code` block is identical to before).

### Phase 3b — Standalone `npx` CLI (commit `9b85fb5`)

- [package.json](../../package.json) at repo root: `pai-orbit` bin, Node ≥18, single dep `prompts`.
- [plugins/pai-orbit/scripts/init/cli.js](../../plugins/pai-orbit/scripts/init/cli.js): arg parser + router (`init` / `update` / `migrate` / `--help` / `--version` + every flag from the plan).
- [`lib/copilot.js`](../../plugins/pai-orbit/scripts/init/lib/copilot.js): full lifecycle (first-run / re-run / migration), file copy from `dist/copilot/`, template render, husky activation with `git update-index --add --chmod=+x` per D21, pre-commit-framework activation per D29.
- [`lib/claude.js`](../../plugins/pai-orbit/scripts/init/lib/claude.js), [`lib/cursor.js`](../../plugins/pai-orbit/scripts/init/lib/cursor.js): D9 stubs — point users at `/setup` inside the host tool.
- [`lib/prompts.js`](../../plugins/pai-orbit/scripts/init/lib/prompts.js): interview Q&A via `prompts` npm package; defaults when unavailable.
- [`lib/render.js`](../../plugins/pai-orbit/scripts/init/lib/render.js): placeholder substitution, dir copy, `.gitignore` line ensuring.
- Smoke-tested end-to-end against scratch repos (first-run, re-run preservation, migration with backup + `.gitignore` append).

### Phase 4 — Validation (commit `eb0d9bf`)

- All automated probes **PASS** (build green, verify-dist green, file counts, husky exec bit tracked, migration .gitignore append, re-run preservation).
- 7 live-Chat probes **PENDING** — only a human with VS Code + Copilot can verify. Tightly scoped to 5 ship-gate probes (~10 minutes / ~6 Chat messages) in the cheat sheet.

### Phase 5 — Adoption page (commit `eb0d9bf`)

- [docs/copilot-install-and-usage.md](../copilot-install-and-usage.md) — full guide: prereqs, install, join-existing, path conventions, AGENTS.md disambiguation, multi-assistant teams, daily workflow, skill rendering split, hook coverage matrix, lint-on-save recipe, updating + file-ownership table, uninstall list, known gaps, troubleshooting (incl. D27 recovery, D18/D23 migration, R8 fall-back).

### Phase 6 — Epic update (commit `5d9e2f3`)

- [docs/epics/multi-tool-compat/EPIC.md](../epics/multi-tool-compat/EPIC.md): status In Progress, requirements widened to include Copilot, feature table refreshed, D1..D34 summarised, two new open questions added.

## What's pending (operational, not implementation)

| # | Item | Who | How |
|---|------|-----|-----|
| 1 | **Open the PR** | Either you or an agent | `gh pr create` with a description that links to the live-Chat checklist + housekeeping doc, or use the web UI at https://github.com/chetansharmapsi/pai-orbit/pull/new/feat/copilot-plugin-adapter |
| 2 | **Live-Chat validation** (5 probes, ~10 min) | **Human only** — needs VS Code + Copilot Chat | Walk [copilot-live-chat-cheatsheet-2026-06-28.md](./copilot-live-chat-cheatsheet-2026-06-28.md), tick boxes, append results to [copilot-upgrade-validation-2026-06-28.md](./copilot-upgrade-validation-2026-06-28.md) under a new `## Live-Chat results` section. |
| 3 | **File 8 housekeeping tickets** | Either | Bodies in [copilot-upgrade-followups-2026-06-28.md](./copilot-upgrade-followups-2026-06-28.md). Recommended order: file 6 (canonical-frontmatter) + 7 (security-review-skill) first, then 1 + 2 (open questions), then 3 + 4 + 5 (future), then 8 (ADR promotion). |
| 4 | **Merge the PR** (after #2 green) | Either | `gh pr merge` or web UI. The dist-freshness CI will have run by then; should pass. |

**Critical gate:** the live-Chat 5-probe smoke test is the only blocker. Adapter ships once probes 1, 2, 3 (Critical) and probe 4 (Important) all pass.

## How to resume in a future session

If you are an AI assistant or developer picking this up later, do these in order:

1. **Confirm branch state.** Run:

   ```bash
   git fetch
   git checkout feat/copilot-plugin-adapter
   git log --oneline -8
   ```

   You should see commits `73a10fb` through `4e52c3c` from this checkpoint at the top, ahead of `main`.

2. **Confirm build is still green.** Run:

   ```bash
   bash plugins/pai-orbit/build.sh
   ```

   Expect: `verify-dist: OK — 25 prompt file(s), 4 instructions file(s).` and no diff in `dist/copilot/` against the committed state.

3. **Check what's been done since this checkpoint.** Look at the validation doc to see if `## Live-Chat results` has been added — that means probe 2 is done. Look for an open PR via `gh pr list --head feat/copilot-plugin-adapter`. Look for housekeeping tickets via `gh issue list --search 'copilot-adapter' --state all` (or GitLab equivalent).

4. **Pick up the operational items** in the "pending" table above. If everything is done, the PR should be ready to merge — verify CI is green, then `gh pr merge`.

## Decisions worth remembering (not in source)

These shaped the implementation but live only in the plan's D1..D34 table. The most load-bearing are:

- **D3** — `.copilot/` folder, NOT `.github/pai-orbit/`. Symmetry with `.claude/` and `.cursor/`.
- **D7** — distribution via `npx github:the-psi/pai-orbit`. **No npm publish.** Source IS the runnable artefact.
- **D13** — `/setup` and `/suggest-skills` are intentionally dropped from Copilot output. Replaced by the npx CLI and a documented gap, respectively.
- **D14** — re-run preserves user-owned files (`.copilot/*`, `CLAUDE.md`); overwrites pai-orbit-owned (`.github/copilot-instructions.md`, `.github/prompts/`, `.github/instructions/`).
- **D17** — `## Context discovery` section in `copilot-instructions.md` is explicit. Without it, Copilot does not auto-load `.copilot/*` or `docs/` content.
- **D18 + D23** — migration from old `.github/pai-orbit/` is automatic, backs up to `.github/pai-orbit.bak/<timestamp>/`, appends that path to `.gitignore`.
- **D20** — picker entries get `[mode]` / `[skill]` / `[agent]` prefix so kind is visible.
- **D21** — `git update-index --add --chmod=+x .husky/pre-commit` so the exec bit survives Windows file systems.
- **D28** — every mode prompt opens with an anti-drift block including a `[<MODE>]` reply prefix. Verified by `verify-dist.sh`.
- **D29** — ship both husky and pre-commit framework templates. CLI asks which to install.
- **D30** — service-builder prompts use `mode: agent` frontmatter; agentic on Pro/Business, degrade to regular prompts on Free.
- **D33** — pai-orbit emits **no** editor-specific files (`.vscode/`, `.idea/`, …). Editor settings are team-owned.

D22 is **obsolete** (no `/test` skill exists). D32 is **reserved** (rejected; resolved by D33).

## Two open questions still unresolved

Both are flagged Phase-2 discovery items in design §10. They're gated on Phase 4 live-Chat validation results, not on implementation work:

1. **Husky template style** — currently assumes husky v9+ shape. Fall-back: vanilla `.git/hooks/pre-commit.template` if husky v8 is widespread. Trigger: Phase 4 surfaces husky-version pain in real installs.
2. **`applyTo:` glob breadth** — currently ships `**/*` for `git.instructions.md` and `context-discovery.instructions.md`. Fall-back: per-extension splits. Trigger: Phase 4 probe 3 fails AND the instructions-file fall-back also misses.

Both are tracked as items 1 and 2 in [copilot-upgrade-followups-2026-06-28.md](./copilot-upgrade-followups-2026-06-28.md).

## Known traps / gotchas

- **`core.autocrlf=true` on Windows.** Running `bash plugins/pai-orbit/build.sh` writes files with LF. Git status will show them as `M` until `git checkout --` re-applies CRLF normalization on the working tree. This was handled at commit time; future contributors will hit it again whenever they rebuild on Windows. Mitigation: ignore the warning, or run `git checkout -- <files>` after the build.
- **`xargs git checkout --` does NOT re-apply line-ending conversion correctly.** Use a per-file loop instead. (Learned the hard way during this checkpoint's commit pass.)
- **The 1-real-change-hiding-in-CRLF-noise pattern.** Run `git diff -w --stat` before assuming all M entries are LF/CRLF — there could be a real edit pulled through one of the dist adapters. The legacy `dist/cursor/.cursor/rules/setup.mdc` is the one that almost slipped past during this work.
- **`prompts` npm package may be absent** when running the CLI from a local checkout (not via npx). `lib/prompts.js` falls back to `--yes` defaults with a warning in that case. Mitigation: `cd <repo-root> && npm install prompts` once.
- **`npx` GitHub-install cache** can serve stale content. The CLI accepts `--ignore-existing` (passthrough flag with no in-CLI effect) and the adoption page documents both this and the version-pin workaround.

## Files NOT touched by this work (intentionally)

For context — these were considered but explicitly out of scope:

- **`core/skills/`** — no new skills authored. The `/security-review` skill referenced in the design's "Out of scope" §11 is filed as follow-up ticket 7.
- **`dist/codex/`** — Codex adapter unchanged. The CRLF-warning state of those files in the working tree is pre-existing.
- **`docs/getting-started.md`, `docs/capabilities.md`** — could be updated to reference Copilot but the plan didn't call for it. Recommend a small docs PR after this one merges to add Copilot to those reference docs.
- **No Cursor / Claude adapter changes** — the adoption page and CLI only wire up the Copilot path. `init claude` and `init cursor` are deliberate stubs (D9, follow-up ticket 3).

## Provenance

This checkpoint was authored by Claude Opus 4.7 (1M context) at the end of a continuous working session that started from the user's "Execute Phase 2 of the Copilot adapter upgrade" prompt. The session moved through Phases 2 → 6 sequentially after the user authorised the full scope. Every claim in this checkpoint is verifiable by running the referenced commands or reading the linked files.
