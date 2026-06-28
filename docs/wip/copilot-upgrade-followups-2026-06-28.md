# Copilot Adapter Upgrade — Follow-up Tickets

**Date:** 2026-06-28
**Parent plan:** [`copilot-adapter-upgrade-2026-06-28.md`](../plans/copilot-adapter-upgrade-2026-06-28.md)

Every item below is deliberately deferred from the upgrade — either out of scope, gated on live data we don't have yet, or a "future enhancement" the plan calls out. Filing them as separate tickets keeps them visible so they don't disappear.

**Bodies are copy-paste-ready.** File via:

```bash
gh issue create --repo the-psi/pai-orbit --title "<title>" --body-file <(awk '/^### TICKET:/{p=0} p; /^### TICKET: <slug>/{p=1}' docs/wip/copilot-upgrade-followups-2026-06-28.md)
```

…or just copy-paste into the GitLab/GitHub web UI.

---

## Priority overview

| # | Title (slug) | Priority | Blocked on |
|---|--------------|----------|------------|
| 1 | resolve-husky-template-style | Low — open question | Phase 4 live-Chat validation results |
| 2 | resolve-applyto-glob-breadth | Low — open question | Phase 4 live-Chat validation results |
| 3 | implement-init-claude-init-cursor | Low — future | Concrete demand from a team |
| 4 | implement-pai-orbit-uninstall-copilot | Low — future | At least one team having uninstalled |
| 5 | scheduled-github-action-pai-orbit-update | Low — future | Adoption signal that pull-based updates are too friction-heavy |
| 6 | canonical-frontmatter-migration | Medium — broader epic | None — work can start any time but requires coordinated PR |
| 7 | security-review-skill | Medium — gap | None |
| 8 | doc-canonical-versions-of-decisions | Low — hygiene | None |

---

### TICKET: resolve-husky-template-style

**Title:** Resolve Phase-2 open question: husky template style — husky v9+ shim vs vanilla `.git/hooks/`

**Labels:** `pai-orbit`, `copilot-adapter`, `open-question`

**Body:**

The Copilot adapter ships `.husky/pre-commit.template` assuming husky v9+ is the installer (per design §10.1 default). Two paths were explicitly considered and one needs confirming once we have live adoption signal:

- **Current ship:** husky v9+ shape (`#!/usr/bin/env bash` is sufficient on v9; older husky needed `. "$(dirname -- "$0")/_/husky.sh"`).
- **Alternative:** parallel `.git/hooks/pre-commit.template` that doesn't depend on husky's shim machinery — works in any git repo without installing husky.

The pre-commit framework template (`.pre-commit-config.yaml.template`) already covers non-husky teams, so the alternative path is duplicative unless we find husky v8 or earlier is widespread in PSI projects.

**Trigger to revisit:** Phase 4 live-Chat validation surfaces husky-version pain in one or more real installs, or the first team adopting the Copilot adapter reports the template failed on a non-v9 husky setup.

**Acceptance:**
- Survey first 3 teams that adopt the Copilot adapter for their husky version.
- If ≥2 of 3 are on v8 or earlier, swap the template to the explicit shim format.
- If all 3 are on v9+, close this ticket — current ship is correct.

**Reference:** Phase 1 design §10.1.

---

### TICKET: resolve-applyto-glob-breadth

**Title:** Resolve Phase-2 open question: broadest `applyTo:` glob Copilot honours on instructions files

**Labels:** `pai-orbit`, `copilot-adapter`, `open-question`

**Body:**

The Copilot adapter ships `git.instructions.md` and `context-discovery.instructions.md` with `applyTo: "**/*"`. The assumption is Copilot accepts this; the fall-back if it doesn't is per-extension splits:

```yaml
applyTo: "**/*.{ts,tsx,js,jsx,py,sql,md,yml,yaml,json,toml}"
```

…plus a separate `git-code.instructions.md` for code-only globs.

**Trigger to revisit:** Phase 4 task 1b (`.sql` file open → data-model conventions appear) fails OR Phase 4 task 8 (context-discovery probe) fails on Free with the instructions-file fall-back also missing.

**Acceptance:**
- Run the Phase 4 cheat sheet (`docs/wip/copilot-live-chat-cheatsheet-2026-06-28.md`).
- If Probe 3 (context discovery) passes via `copilot-instructions.md` alone, close as confirmed.
- If Probe 3 only passes when the `applyTo: "**/*"` instructions file is the channel, file a sub-ticket to verify on multiple Copilot tiers.
- If Probe 3 fails both channels on Free, ship the per-extension splits in a follow-up PR.

**Reference:** Phase 1 design §10.2.

---

### TICKET: implement-init-claude-init-cursor

**Title:** Wire `pai-orbit init claude` and `pai-orbit init cursor` end-to-end (currently stubs)

**Labels:** `pai-orbit`, `install-cli`, `future`

**Body:**

Per D9, `init claude` and `init cursor` are intentional stubs in v1 — they print "use `/setup` inside the host tool" and exit 2. The Copilot path is the only fully-wired target because the use case (Copilot-only team with no Claude Code or Cursor install) only exists for Copilot.

If a real ask appears — e.g., a team wants to install pai-orbit into a Claude Code or Cursor project without launching the host tool — wire the missing logic:

- `lib/claude.js` — render `.claude/` config + hooks (existing `dist/claude-code/` provides the source files).
- `lib/cursor.js` — render `.cursor/` rules (existing `dist/cursor/` or `dist/cursor-plugin/` provides the source files).

Both should follow the same lifecycle detection (first-run / re-run / migration) and the same flag set as `init copilot`.

**Acceptance:**
- A user can run `npx github:the-psi/pai-orbit init claude` in a scratch repo and end up with a working `.claude/` layout.
- Same for `init cursor`.
- All three targets share the same `cli.js` arg-parser and library structure.

**Trigger to schedule:** first concrete request from a team for non-host-tool install. Until then, deliberate non-work.

**Reference:** D9 in the Decisions table of the parent plan.

---

### TICKET: implement-pai-orbit-uninstall-copilot

**Title:** Add `pai-orbit uninstall copilot` subcommand for clean removal

**Labels:** `pai-orbit`, `install-cli`, `future`

**Body:**

The adoption page (`docs/copilot-install-and-usage.md` → "Uninstalling pai-orbit from a project") documents the manual `git rm` list. Future work — once at least one team has uninstalled — is to automate this as a subcommand:

```bash
npx github:the-psi/pai-orbit uninstall copilot
```

Logic:
- Remove `.copilot/`, `.github/copilot-instructions.md`, pai-orbit-emitted `.github/prompts/*.prompt.md`, pai-orbit-emitted `.github/instructions/*.instructions.md`.
- Leave any user-authored prompts or instructions alone (need a fingerprinting strategy — likely a `# pai-orbit-emitted` comment in the file body that the install adds and uninstall checks).
- Preserve `.husky/pre-commit` if it was customised post-install (compare against the inert `.husky/pre-commit.template` content hash).
- Never touch `CLAUDE.md` or `docs/` — those are user property.

**Acceptance:**
- Round-trip works: install → uninstall → repo is in the same state as before install (excluding `CLAUDE.md` and `docs/` which are intentionally preserved).
- Custom user prompts/instructions in `.github/prompts/` and `.github/instructions/` survive uninstall.

**Trigger to schedule:** first team reports they want to remove pai-orbit. Until then, the manual `git rm` is documented and sufficient.

---

### TICKET: scheduled-github-action-pai-orbit-update

**Title:** Ship optional `.github/workflows/pai-orbit-update.yml` template for hands-off update polling

**Labels:** `pai-orbit`, `install-cli`, `future`

**Body:**

Per the parent plan's "Updating pai-orbit later" section, three update mechanisms were considered:

- **A.** Re-run `npx ... init copilot` — shipped.
- **B.** Version pinning — shipped.
- **C.** Scheduled GitHub Action — explicitly **out of scope for this upgrade.**

Path C is the "hands-off" path for teams that want pai-orbit updates flowing automatically with a human-review gate:

```yaml
# Runs weekly on Mondays
on:
  schedule: [{ cron: '0 9 * * 1' }]
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx github:the-psi/pai-orbit update copilot --no-interactive
      - if: <files changed>
        run: gh pr create --title "chore(pai-orbit): refresh to <latest-version>" ...
```

Best of both worlds: automation drives the refresh, human reviews the PR before merge.

**Trigger to schedule:** ≥2 teams ask for it, OR pull-based update friction becomes a measurable adoption blocker. Until then, the explicit `npx ... update copilot` motion is the supported path.

**Acceptance:**
- Workflow template lives in `plugins/pai-orbit/core/templates/workflows/` (new directory) and is copied into the project on opt-in.
- The CLI gains an `--install-update-workflow` flag.
- The workflow opens a PR when `dist/` content has drifted; closes itself silently otherwise.

---

### TICKET: canonical-frontmatter-migration

**Title:** Phase 1 of broader multi-tool-compat — canonical YAML frontmatter across all modes/skills

**Labels:** `pai-orbit`, `multi-tool-compat`, `tech-debt`

**Body:**

The parent plan explicitly defers this:

> "Not the full multi-tool canonical front-matter migration — that remains a separate phase on the epic."

Currently, mode files in `core/modes/` have no frontmatter (they start with `You are now in <MODE>.`). Skill files have curated YAML frontmatter (`name:`, `description:`). The Copilot adapter copes by hardcoding mode descriptions in a `case` statement in `build.sh`.

Migrating to canonical frontmatter would:
- Add YAML frontmatter to every `core/modes/*.md` with `name:`, `description:`, `mode_token:`, and the per-mode "Do NOT" line.
- Let every adapter (claude, cursor, copilot, codex) read descriptions/tokens from the source instead of hardcoding.
- Eliminate the description table in the Copilot adapter's `build.sh`.

**Scope estimate:** 14 mode files + cross-adapter changes. Probably one PR with byte-identical-output validation per adapter (the same regression gate the Copilot upgrade used).

**Acceptance:**
- All `core/modes/*.md` files start with a `---` block carrying `name`, `description`, `mode_token`.
- Every adapter reads the description from frontmatter instead of from a hardcoded table.
- `dist/claude-code/`, `dist/cursor/`, `dist/cursor-plugin/`, `dist/codex/`, `dist/copilot/` produce semantically-identical content to today (the YAML frontmatter is the only diff in source; the rendered text in dist is unchanged or improved).

**Reference:** Listed as Not Started in `docs/epics/multi-tool-compat/EPIC.md` (`canonical-spec` feature).

---

### TICKET: security-review-skill

**Title:** Author the `/security-review` skill (currently missing from `core/skills/`)

**Labels:** `pai-orbit`, `skill`, `gap`

**Body:**

Filesystem audit on 2026-06-28: `core/skills/` contains 6 skills (analysis, board, data-model, epic, git, simplify). The plan and the design doc reference a `/security-review` skill that does **not** exist yet — it's filed as a follow-up in `docs/features/security-review-skill/requirements.md` (if that requirements doc itself exists; if not, this ticket includes writing it).

Author the skill following the existing skills' shape:

- `core/skills/security-review/SKILL.md` with YAML frontmatter (`name`, `description`).
- Body: trigger conditions (before merging auth-touching code, before merging input-handling code, on PR review), checks performed (OWASP top 10, secret detection, dependency vulnerability), output shape.
- Update `core/modes/build.md` and `core/modes/review.md` to reference `/security-review` where relevant.
- Rebuild adapters so the skill emits to every dist tree.

**Acceptance:**
- `core/skills/security-review/SKILL.md` exists with curated trigger/skip rules and a body comparable to other skills in length and depth.
- `bash plugins/pai-orbit/build.sh` emits `security-review.prompt.md` (and optionally `security-review.instructions.md` if path-scoped) under `dist/copilot/.github/`.
- `verify-dist.sh` continues to pass.
- Capabilities reference (`docs/capabilities.md`) lists `/security-review`.

**Reference:** Phase 1 design "Out of scope" §11.

---

### TICKET: doc-canonical-versions-of-decisions

**Title:** Promote the Copilot upgrade decisions (D1–D34) into ADRs

**Labels:** `pai-orbit`, `docs`, `hygiene`

**Body:**

The upgrade plan's Decisions table (D1..D34) is currently a markdown table inside the plan doc. As the plan ages, those decisions still apply but are buried inside a single 800-line plan file. The pai-orbit convention is to file ADRs in `docs/decisions/YYYY-MM-DD-<slug>.md`.

Promote the high-leverage decisions into ADRs:
- D3 (`.copilot/` folder convention) — likely already covered by an architecture choice
- D10 (skills emit twice if dual-use)
- D13 (drop `/setup` and `/suggest-skills` from Copilot)
- D14 (re-run preserves user-owned, overwrites pai-orbit-owned)
- D17 (Context discovery is explicit, not implicit)
- D18 / D23 (migration path + `.gitignore` append)
- D20 (`[mode]`/`[skill]`/`[agent]` prefix convention)
- D28 (anti-drift block in every mode prompt)
- D29 (ship both husky and pre-commit framework templates)
- D30 (service-builder prompts use `mode: agent`)
- D33 (no editor-specific files)

Each ADR follows the existing `docs/decisions/` template — context, decision, consequences, related decisions.

**Acceptance:**
- 11 ADRs filed in `docs/decisions/`, named `2026-06-28-<slug>.md`.
- The Copilot upgrade plan's Decisions table gains a column linking each entry to its ADR.
- No content duplication — the ADR is the canonical version; the plan's table becomes a one-line summary + link.

**Trigger to schedule:** before the next plan that references the same decisions (avoid re-stating).

---

## When you're ready to file

Suggested order:

1. **6 (canonical-frontmatter-migration)** and **7 (security-review-skill)** — file these first; they're real gaps with no blocker.
2. **1, 2 (open-question resolutions)** — file these immediately so they're tracked, but leave them in `New` until Phase 4 live-Chat validation has run.
3. **3, 4, 5 (future work)** — file with `future` label and let demand drive scheduling.
4. **8 (decisions → ADRs)** — file as a `hygiene` ticket to do whenever there's a quiet pocket.

If your board uses GitLab (`git.thepsi.com`), substitute `glab` for `gh` in the command above. If the board doesn't track follow-ups at all, this file IS the tracker — keep it under `docs/wip/` and prune entries as they ship.
