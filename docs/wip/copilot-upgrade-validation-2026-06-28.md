# Copilot Adapter Upgrade — Validation Notes

**Date:** 2026-06-28
**Validator (automated portion):** CI / scripted (Phase 4 of [the upgrade plan](../plans/copilot-adapter-upgrade-2026-06-28.md))
**Validator (live Copilot Chat portion):** Pending — requires VS Code + Copilot Chat extension + a Copilot licence (Free is sufficient for evaluation; Business required for client code)
**Sources:** Plan §Phase 4 (task list); design [§9](../features/copilot-adapter-prompt-files/design.md) (verifier scope)

## How to read this report

Tasks are tagged by priority per the plan:

- **Critical** — adapter cannot ship without these passing.
- **Important** — adapter can ship with documented caveats.
- **Polish** — non-blocking; flagged for follow-up.

Each row reports one of:

- `PASS` — verified with evidence.
- `PENDING (human)` — requires a human running Copilot Chat; cannot be verified by automation.
- `FAIL` — fix required before ship.

---

## Automated results (verified 2026-06-28)

The build + CLI + `verify-dist.sh` gates exercise the entire emitted tree. These results come from running the scripts in this repo against a fresh scratch project produced by `node plugins/pai-orbit/scripts/init/cli.js init copilot --yes`.

| ID | Task | Priority | Result | Evidence |
|----|------|----------|--------|----------|
| build | `bash plugins/pai-orbit/build.sh` exits 0; `verify-dist.sh` exits 0 | Critical | `PASS` | `verify-dist: OK — 25 prompt file(s), 4 instructions file(s).` |
| 1-counts | Mode/skill/agent prompt counts match design §1 | Critical | `PASS` | 12 `[mode]` + 6 `[skill]` + 7 `[agent]` = 25 emitted prompts |
| 1-d13 | `/setup` and `/suggest-skills` are NOT emitted as Copilot prompts (D13) | Important | `PASS` | `.github/prompts/setup.prompt.md` absent; `.github/prompts/suggest-skills.prompt.md` absent |
| 1c-husky | Husky exec bit is git-tracked when user opts in (D21) | Polish | `PASS` | `git ls-files --stage .husky/pre-commit` shows mode `100755` |
| 1c-pc | `.pre-commit-config.yaml.template` shipped; active file is opt-in only (D29) | Polish | `PASS` | Template present, active file absent on default opt-out |
| 7 | No `.vscode/`, `.idea/`, `.fleet/`, or `.sublime-project` folders authored by pai-orbit (D33) | Critical | `PASS` | scratch-project install produced none of those folders |
| 9 | Old-layout migration creates `.github/pai-orbit.bak/<timestamp>/`, moves config to `.copilot/`, appends `.github/pai-orbit.bak/` to `.gitignore` (D23) | Important | `PASS` | Verified end-to-end against a scratch repo with the old layout pre-populated |
| 6 (file-level) | Re-run preserves `.copilot/pai-orbit-config.md` and `.copilot/team.md` edits; overwrites `.github/prompts/`, `.github/instructions/`, `.github/copilot-instructions.md` (D14) | Important | `PASS` | Edited `Type: GitLab` and a custom team.md, re-ran `init copilot --yes` — edits preserved, prompts re-emitted (25 files) |
| lifecycle-cli | `init`, `update`, `migrate` subcommands + `--help`, `--version` all return correct exit codes and output | Critical | `PASS` | `--version` → `1.3.3`, `--help` → usage, unknown target → exit 2 with usage |

## Pending (human in Copilot Chat)

These items require live interaction with Copilot Chat in VS Code. They are blocked on a human validator with a Copilot licence — automation cannot simulate the slash-command picker, the in-Chat compliance with anti-drift instructions, or the auto-attach trigger.

Suggested smoke-test order (matches the plan's task numbering):

| ID | Task | Priority | Expected | Notes |
|----|------|----------|----------|-------|
| 1 | Slash picker shows pai-orbit prompts when user types `/` in Copilot Chat | Critical | 25 entries visible, prefixed `[mode]` / `[skill]` / `[agent]` per D20 | Reload VS Code first (`Developer: Reload Window`) |
| 1a | `/git` and `/analysis` load as invokable skill prompts; `/setup` and `/suggest-skills` are absent (D13); `/test` loads the test mode (no skill collision — D22 obsolete) | Important | All four behaviours observed | — |
| 1b | Opening a `.sql` file activates `instructions/data-model.instructions.md` | Important | Schema answers follow `/data-model` conventions | If Copilot rejects `**/*` glob breadth, fall back to per-extension globs per design §10.2 |
| 1c | Asking "force-push these changes" warns/refuses; verify automated husky bits already PASSed | Polish | Copilot refuses + cites forbidden patterns | Advisory only — failure is documented, not blocking |
| 1d | **Pro/Business only:** `/fastapi-builder` (or other service-builder) runs as a multi-step agent that reads `CLAUDE.md` | Polish | On Pro/Business: agentic behaviour. On Free: degrades to regular prompt (D30) | Skip if no Pro/Business licence — degradation behaviour is documented |
| 1e | Mode-discipline anti-drift: invoke `/build`, ask an architecture question, confirm Copilot redirects to `/design`; check `[<MODE>]` prefix on replies (D28) | Important | Redirect happens; `[<MODE>]` prefix present on ≥ 2 of 3 replies | If `[<MODE>]` prefix is missing on > 1 of 3, log it; adapter still ships |
| 2 | End-to-end `/groom` workflow on a fictional feature — confirm headspace and requirements-shaped output | Critical | Output saved to `docs/features/<feature>/requirements.md` | — |
| 3 | End-to-end `/design` against the groom output | Polish | Headspace + trade-offs discussion | — |
| 4 | Path-scoped skill check: open `.sql`, ask schema question | Polish | Copilot follows `/data-model` conventions | — |
| 5 | Output-contract check: in `/groom`, ask "where do acceptance criteria get saved?" — expect `docs/features/*/requirements.md` | Polish | Correct destination cited | — |
| 6 (behaviour) | Re-run via `npx … init copilot` after editing one line of `groom.prompt.md` — confirm the deleted line is restored | Important | Pai-orbit-owned file refreshes; `.copilot/*` and `CLAUDE.md` preserved | File-level preservation is already PASSed (above); this is the behavioural side |
| 8 | Context-discovery probe — set a distinctive deploy target in `.copilot/pai-orbit-config.md`, ask Copilot what the deploy target is; repeat with a constraint in `docs/architecture/constraints.md` | Critical | Copilot returns exact configured values, not generic answers | If both channels fail on Copilot Free, document as a Free-tier limitation; recommend Business |

## Pass criteria recap (from the plan)

> **All 4 Critical tasks (1, 2, 7, 8) must pass.** Adapter does not ship without these.
> **At least 3 of 4 Important tasks (1a, 1b, 6, 9) must pass.**
> Polish failures (1c, 1d, 1e, 3, 4, 5) are documented but non-blocking.

Status check:

- Critical task 7 (no editor litter): **PASS** ✅
- Critical task 1 file-level (counts, D13, picker prefixes): **PASS** ✅
- Critical task 2 (groom workflow), 8 (context discovery): **PENDING (human)** ⏳
- Important task 9 (migration): **PASS** ✅
- Important task 6 (re-run file-level): **PASS** ✅
- Important task 1a/1b file-level setup, 1e (anti-drift in prompt body): **PASS** ✅ (anti-drift block present); behaviour-level: **PENDING (human)** ⏳

Adapter is **automation-green**. Ship decision is gated on the human-side Critical tasks (1, 2, 8) and at least one more Important behaviour task (1a or 1b).

## How to run the pending tasks

1. Pick a scratch project (or a non-critical real project). Ensure VS Code + the Copilot Chat extension are installed and the user is logged into Copilot.
2. From the project root:

   ```bash
   npx github:the-psi/pai-orbit init copilot
   ```

   Accept the default answers for evaluation. If the team uses GitLab, pass `--board=gitlab`.
3. Reload VS Code: `Developer: Reload Window`.
4. Open Copilot Chat. Type `/` — confirm 25 pai-orbit entries appear with `[mode]` / `[skill]` / `[agent]` prefixes (Critical task 1).
5. Walk through tasks 2, 8 (Critical), then 1a, 1b (Important), then the Polish items as time permits.
6. Append outcomes (PASS / FAIL / NOTES) into this file under a new `## Live-Chat results` section.

If any Critical task fails:

- Open an issue in the repo describing what was observed.
- Do NOT remove this file — leave the PASS evidence so we know the boundary.
- Decide whether the gap is a Free-tier issue (caveat in adoption page) or a real adapter defect (fix before merging the upgrade PR).
