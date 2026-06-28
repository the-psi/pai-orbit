# Copilot Compatibility Validation — SUPERSEDED

> **This plan is superseded.** It was a "validate the existing thin adapter" plan from earlier on 2026-06-28. After scoping the work, we chose to do the upgrade directly rather than validate the inadequate version. See [`copilot-adapter-upgrade-2026-06-28.md`](./copilot-adapter-upgrade-2026-06-28.md) for the plan that was actually executed.
>
> Kept on disk for history and so the cross-reference in the upgrade plan resolves. Do not work from this file.

**Date:** 2026-06-28
**Owner:** Chetan Sharma
**Window:** Weekend 2026-06-27 → 2026-06-28
**Epic:** [multi-tool-compat](../epics/multi-tool-compat/EPIC.md)
**Status:** Planned

---

## Goal

Confirm the Copilot adapter (`plugins/pai-orbit/dist/copilot/.github/copilot-instructions.md`) is usable end-to-end and produce a one-page adoption note the team can follow on Monday.

Two things must be true at the end:
1. **Compatibility** — Copilot reliably picks up the instructions file and behaves mode-aware.
2. **Workflow** — there is a documented day-in-the-life that a PSI engineer can follow without asking for help.

Out of scope: changes to the adapter generator, the canonical front-matter migration (Phase 1 of the epic), Cursor/Codex parity work.

---

## Pre-flight (15 min)

- [ ] Confirm Copilot Chat is licensed and enabled in VS Code for the test account.
- [ ] Pick a sacrificial test repo — preferably a small PSI repo with an existing `docs/` tree, or a fresh scratch repo.
- [ ] `bash plugins/pai-orbit/build.sh` and verify `plugins/pai-orbit/dist/copilot/.github/copilot-instructions.md` regenerates clean.
- [ ] Skim the generated file end-to-end once — note any mode summary that reads broken after the `sed` rewrites.

---

## Phase 1 — Install and discovery (45 min)

Verify Copilot actually loads the instructions and the rewritten paths make sense.

- [ ] Copy `dist/copilot/.github/copilot-instructions.md` into the test repo's `.github/` (or merge with any existing file).
- [ ] Open the repo in VS Code, restart the Copilot Chat panel.
- [ ] **Probe load:** ask Copilot "What modes do you support?" — confirm it lists `/arch /build /design /domain /groom /plan /test /ux /data`.
- [ ] **Probe path rewrite:** ask "Where do you store the project config?" — confirm it answers `.github/pai-orbit/pai-orbit-config.md` (not `.claude/`).
- [ ] **Probe skill awareness:** ask "What skill should I use to commit code?" — confirm it points at `/git`.

Pass criteria: all three probes correct without follow-up prompting. If any fail, capture the exact prompt + reply in `docs/wip/copilot-validation-2026-06-28.md`.

---

## Phase 2 — Mode discipline check (60 min)

Verify Copilot actually changes headspace when asked, since it has no real slash command system.

Run each of these in a fresh Copilot Chat thread:

- [ ] **Build mode** — "Enter /build mode. Add a hello-world endpoint." Watch for: does it ask for requirements first, or just code? Either is fine, but it should *not* drift into architectural debate.
- [ ] **Design mode** — "Enter /design mode. We need to add multi-tenant auth." Confirm it produces design discussion + an ADR-shaped output, not code.
- [ ] **Groom mode** — "Enter /groom mode. Help me write acceptance criteria for a CSV import feature." Confirm it produces a `requirements.md`-shaped output.
- [ ] **Switch-out** — mid-build, say "I need to think through trade-offs first." Confirm it suggests `/design` or stops to write a handoff note.

Pass criteria: at least 3 of 4 stay in the right headspace. Note any that drift — that's adapter feedback for the next iteration.

---

## Phase 3 — Skill behaviour check (30 min)

Skills are reference-only in Copilot. Verify the model uses them when contextually relevant.

- [ ] Stage an unstaged change in the test repo, ask "commit and push this." — confirm it follows `/git` skill conventions (branch model, message format from `pai-orbit-config.md` if present, no `git add -A`).
- [ ] Ask "review my recent changes." — confirm it follows `/review` skill structure.
- [ ] Open a `.sql` or schema-touching file and ask "what tables does this touch?" — confirm it engages `/data-model` thinking.

Pass criteria: skills get applied without the user having to name them. If they don't, note what trigger phrasing *does* work — that becomes part of the adoption note.

---

## Phase 4 — Document the workflow (45 min)

Produce a single page at `docs/copilot-install-and-usage.md` (mirrors the existing `docs/cursor-plugin-install-and-usage.md`) with:

- [ ] **Install** — three commands: build adapter, copy file, restart Copilot.
- [ ] **Path conventions** — `.claude/` → `.github/pai-orbit/` table.
- [ ] **Day-in-the-life** — short walkthrough: "I want to add a feature" → groom → design → build → commit, showing the exact phrasing to invoke each mode in Copilot.
- [ ] **Known gaps vs Claude Code** — no slash command execution, no hooks, no `/setup`, agents unavailable. Lift from `dist/copilot/README.md` and condense.
- [ ] **Troubleshooting** — what to do if Copilot ignores the instructions (file location, file size limit, restart Chat).

---

## Phase 5 — Team adoption hand-off (15 min)

- [ ] Drop a Slack/Teams note linking `docs/copilot-install-and-usage.md` + a 2-line summary of what works and what doesn't.
- [ ] Open a follow-up issue for anything the validation surfaced (broken sed rewrite, mode that wouldn't stay in headspace, skill that needs reword).
- [ ] Update `docs/epics/multi-tool-compat/EPIC.md` Features table — add a Copilot row with current status (Validated / Validated-with-gaps / Blocked).

---

## Deliverables

| Artefact | Location |
|----------|----------|
| Validation notes (raw observations) | `docs/wip/copilot-validation-2026-06-28.md` |
| Adoption page | `docs/copilot-install-and-usage.md` |
| Epic update | `docs/epics/multi-tool-compat/EPIC.md` Features table |
| Follow-up issues | Project board, labelled `copilot` |

---

## Risk / fall-back

- **Copilot ignores the file entirely.** Most likely cause: the file lives outside `.github/` or Copilot Chat needs a restart. Fall-back: try `.github/instructions/` and `.copilot-instructions.md` variants, document which works.
- **Instruction file too large.** Copilot has a context budget for custom instructions. If truncation is suspected, the adapter already condenses — but we may need to drop the skills reference table. Note this as adapter feedback, do not edit the dist file by hand.
- **Mode drift across the board.** If Phase 2 fails on most modes, the issue is structural (Copilot doesn't honour headspace cues from custom instructions). Outcome: workflow note becomes "use it as a reference, not a runtime" and the team adopts only the mode vocabulary, not the discipline. That is still a win — record it honestly.

---

## What this plan is not

- Not a redesign of the Copilot adapter — that lives on the multi-tool-compat epic.
- Not the canonical front-matter migration (Phase 1 of that epic).
- Not a comparison study between Claude Code and Copilot — only "does Copilot work for our team."
