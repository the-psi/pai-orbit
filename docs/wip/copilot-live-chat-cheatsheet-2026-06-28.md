# Copilot live-Chat smoke test — 10-minute cheat sheet

**Goal:** Verify the four ship-gate behaviours that automation cannot reach. This is the **only** thing left blocking the Copilot adapter upgrade from merging.

**Total time budget:** ~10 minutes on Copilot Free (you have 50 Chat messages — these probes burn ~6).

**Prerequisite:** VS Code + Copilot Chat extension installed, signed in. Any project with `.git/` works (a scratch project is fine).

## Setup (60 seconds)

```powershell
# In a scratch project root
git init
node "d:\PSIGitHub\pai-orbit\plugins\pai-orbit\scripts\init\cli.js" init copilot --yes
```

Then in VS Code: `Ctrl+Shift+P` → **Developer: Reload Window**.

Open Copilot Chat (the right-hand panel or `Ctrl+Alt+I`).

---

## Probe 1 — Slash picker shows pai-orbit prompts (Critical, plan task 1)

**Type:** just `/` (single slash, nothing else)

**Look for:**
- [ ] At least 25 pai-orbit entries appear in the picker
- [ ] Entries have visible prefixes: `[mode]`, `[skill]`, or `[agent]`
- [ ] `/setup` and `/suggest-skills` are **absent** (D13 confirmation)
- [ ] `/test` appears as a `[mode]` entry (no skill collision; D22 obsolete)

**If FAIL:** likely VS Code didn't reload, or `chat.promptFiles` is disabled in your VS Code settings. Reload again; if still missing, check `Code → Preferences → Settings → search "promptFiles"` and turn it on.

---

## Probe 2 — End-to-end `/groom` workflow (Critical, plan task 2)

**Type:** `/groom`

**Then paste exactly:**
> Feature: feature flag system for the homepage banner.

**Look for:**
- [ ] Reply opens with `[GROOM]` prefix (D28 anti-drift in action)
- [ ] Copilot asks about purpose, then proposes scenarios — **before** writing any requirements (the three-phase gate from `groom.md`)
- [ ] Copilot does NOT propose solutions or implementation code (that would be `/design` or `/build` drift)
- [ ] Copilot references `docs/features/<feature>/requirements.md` as the output destination

**If FAIL:** the headspace isn't loading. Re-check `.github/prompts/groom.prompt.md` exists and that the file's first non-frontmatter line is the anti-drift block.

---

## Probe 3 — Context-discovery probe (Critical, plan task 8)

This is the load-bearing R8 test — it proves Copilot actually reads project context, not just generic answers.

**Step A.** Edit `.copilot/pai-orbit-config.md` and change the `## Deploy` block's `Provider:` line to something distinctive:

```
Provider: Azure App Service - East US 2 - tenant: psi-test-2026
```

Save the file.

**Step B.** Open a **fresh** Copilot Chat thread (use the "New Chat" button — context-discovery only fires at session start).

**Type:**
> What is our deploy target for this project? Quote exact values from project config.

**Look for:**
- [ ] Copilot returns the exact distinctive value (`Azure App Service - East US 2 - tenant: psi-test-2026`)
- [ ] Copilot cites `.copilot/pai-orbit-config.md` as the source

**If FAIL on Copilot Free:** the `## Context discovery` block may not have loaded. Try once more with the fall-back: open any file in the editor (e.g., `.copilot/pai-orbit-config.md` itself) before asking — that triggers `context-discovery.instructions.md` via `applyTo: "**/*"`. If both channels fail, document it as a known Free-tier limitation; Pro/Business should work.

---

## Probe 4 — Skill invocation works (Important, plan task 1a)

**Type:** `/git`

**Then paste:**
> Suggest a commit message for: added Copilot adapter dist files.

**Look for:**
- [ ] Copilot returns a commit message in the project's git conventions (the format from `git.prompt.md`: `<type>: <short imperative description>`)
- [ ] Likely shape: `feat(copilot): add Copilot adapter dist files` or similar

**If FAIL:** `/git` didn't load as a skill prompt. Check `.github/prompts/git.prompt.md` exists and has `[skill]` in its description.

---

## Probe 5 (optional Polish — only if time/Chat budget allows) — Anti-drift redirect

**Type:** `/build`

**Then paste:**
> What's a good high-level architecture for a feature-flag system?

**Look for:**
- [ ] Copilot's reply opens with `[BUILD]`
- [ ] Copilot **redirects** to `/design` rather than answering the architecture question (per the `/build` mode's anti-drift "Do NOT" line)

**Polish-tier failure is acceptable** — adapter still ships if this misses; flag it as a finding for D28 tuning.

---

## When you're done

1. Tick the boxes above (in this file or copy-paste into your reply).
2. If all four Critical/Important probes are ✅, the adapter is **ship-ready**:
   - Commit the working tree (per the six-message split I suggested earlier — see the final summary message).
   - Open the PR for `feat/copilot-plugin-adapter` → `main`.
3. If any Critical probe is ❌:
   - File a ticket (template in `docs/wip/copilot-upgrade-followups-2026-06-28.md`) with the exact prompt you typed and the reply Copilot gave.
   - Decide whether the gap is a Copilot Free-tier issue (caveat in the adoption page) or a real adapter defect (fix before merging).
4. Append the results to [`copilot-upgrade-validation-2026-06-28.md`](copilot-upgrade-validation-2026-06-28.md) under a new `## Live-Chat results` section so the record is complete.

## Why this list is so short

The plan lists 10+ live-Chat probes (1, 1a, 1b, 1c, 1d, 1e, 2, 3, 4, 5, 6 behaviour, 8). This cheat sheet keeps only the ones that gate the ship decision:

- **Critical (must pass):** picker (1), groom workflow (2), context discovery (8). Task 7 — no editor litter — is already automated PASS.
- **Important (need ≥3 of 4):** skill invocation (1a). Tasks 1b, 6, 9 are already automated PASS, so 1a is the last Important to verify in Chat.
- **Polish (acceptable to fail):** all others. Probe 5 above is the most informative Polish probe; the rest can wait for normal use to surface.

If you want full coverage later, the detailed Phase 4 protocol with every task is in [copilot-upgrade-validation-2026-06-28.md](copilot-upgrade-validation-2026-06-28.md).
