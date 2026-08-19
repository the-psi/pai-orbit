## Impact Analysis: ticket-completeness gate on `/build`, `/design`, `/test` (issue #29)
Date: 2026-07-24
Source: https://github.com/the-psi/pai-orbit/issues/29
Requirements: `docs/features/ticket-gate/requirements.md` (Groomed — ready for /design)

## Change

Current: `/build`, `/design`, `/test` have no structural gate on ticket completeness. `/build` has a *softer*, unrelated readiness check ("Build-readiness gate", `build.md:41`) that reads comment history for unresolved open questions — not a field-presence check.

Proposed: a single, shared validation (title, body, `## Acceptance criteria` section, type label, assignee — REQ-3) invoked at entry to all three modes, defined once (REQ-7 / NFR-2), board-agnostic (GitHub/Linear/Jira/GitLab per `.claude/pai-orbit-config.md`), re-fetched live on every invocation (REQ-4), hard-blocking with no bypass (AC-4).

Classification: **Breaking — owned, intentional behavior change**, plus a **silent-degradation risk on 2 of 5 adapters** (see Adapter fan-out below).

## Consumers found

| Location | File:line | Classification | Action needed |
|---|---|---|---|
| build mode | `plugins/pai-orbit/core/modes/build.md` (Before-starting section, ~line 22) | Owned | Add gate invocation before the branch step; reconcile with the existing "Build-readiness gate" (`build.md:41`) — that check is about groom/design *status*, this one is about ticket *structure*. Needs explicit sequencing so a developer doesn't see two unrelated "not ready" messages without context. |
| design mode | `plugins/pai-orbit/core/modes/design.md` (session-start, before the existing impact-analysis gate) | Owned | Add gate invocation. Note: this file already runs one gate (shared-interface → `/analysis`) at session start; ticket-gate must compose with it, not replace it — likely ticket-gate runs first (no point analyzing a change with no valid ticket). |
| test mode | `plugins/pai-orbit/core/modes/test.md` (Behaviour, ~line 20) | Owned | Add gate invocation before "Read the feature's `requirements.md`". |
| **new shared skill** (not yet created) — e.g. `plugins/pai-orbit/core/skills/ticket-gate/SKILL.md` | — | Owned, new | Required by REQ-7/NFR-2 ("defined once… not duplicated"). Three mode files should each add a one-line invocation, not inline the field-check logic three times. |
| board skill | `plugins/pai-orbit/core/skills/board/SKILL.md` | Owned, **gap found** | The skill currently exposes only **create / move / close** per board type (lines 27–108) — there is no "fetch a single ticket's current fields" operation for any board type. Ticket-gate needs exactly that (REQ-4: live fetch, not cached), board-agnostically. Either (a) board skill gains a `fetch(id)` operation reusing its existing MCP-preference/CLI-fallback pattern (lines 14–23), or (b) ticket-gate skill reimplements per-CLI fetch itself — which duplicates the board-type dispatch board skill already owns. Recommend (a); flag as a design decision, not resolved here. |
| config template | `plugins/pai-orbit/core/templates/pai-orbit-config.md.template` | Likely unaffected | No new config fields identified — board type/CLI selection already exists (`## Agile Board`, `## MCP → board`). Confirm during design; only touch if `fetch` needs board-specific config board skill doesn't already read. |
| docs/capabilities.md | lines 61–68 (`/design`), 72–79 (`/build`), 116–123 (`/test`), and a new `### /ticket-gate` entry after `/simplify` (line 219) | Owned | Update each mode blurb to mention the gate; add the new skill's reference entry. |
| plugin.json | `plugins/pai-orbit/core/plugin.json` | Not affected | No skill manifest to update — every adapter discovers skills via `core/skills/*/SKILL.md` glob, not a static list. A new skill directory needs zero plugin.json changes. |

## Adapter fan-out (the part easy to miss)

`core/modes/*.md` and `core/skills/*/SKILL.md` compile to five different outputs (`plugins/pai-orbit/build.sh` → `adapters/*/build.sh`), and they do **not** all preserve full body content:

| Adapter | Mode body fidelity | Skill body fidelity | Effect on this feature |
|---|---|---|---|
| `claude-code` | Full (`cp -R`) | Full (`cp -R`) | Gate works as designed — no adapter change needed. |
| `cursor-plugin` | Full (`cat` whole file into both `rules/*.mdc` and `commands/*.md`) | Full (`cp -R`) | Gate works as designed — no adapter change needed. |
| `cursor` (lossy) | Full (`cat` whole file per mode into one `.mdc` each) | Full, but **all skills concatenated into one `skills.mdc`** with `alwaysApply: false` | Gate text is present, but depends on Cursor's agent loading the right mode rule *and* `skills.mdc` together — a pre-existing limitation of this adapter, not new, but worth a one-line callout since a "hard block" that only sometimes loads is a weaker guarantee than the requirements imply. |
| `codex` | **Condensed** — `emit_mode_summary()` (`adapters/codex/build.sh`) extracts only the first line + `Switch out when:` block + bolded `**Reads:**/**Writes:**` lines. Anything added to the mode body (i.e., the gate) is **dropped**. | **Condensed** — skills table shows only a ≤100-char first-sentence description, no procedure. | **The gate is silently absent for Codex CLI users.** No block, no prompt — `/build`-equivalent guidance simply won't mention it. |
| `copilot` | Same condensation logic as codex (`adapters/copilot/build.sh`) | Same table-only treatment | **Same silent absence for Copilot users.** |

Both `codex` and `copilot` already self-describe as "condensed reference guide, not an executable plugin" — so total loss of an enforcement mechanism is consistent with their existing lossy contract, not a regression Claude introduces. But because this feature's entire value proposition is *enforcement*, silently shipping it as a no-op on two adapters is worth an explicit, written callout in the design (mirroring how the issue #30 analysis flagged Cursor-adapter drift as an open item rather than letting it surface later as a bug report).

## Migration path

No data migration. This is new mode-entry behavior, not a schema or interface signature change. Rollout is: add the shared skill, wire three mode files, rebuild `dist/` via `bash plugins/pai-orbit/build.sh`, update `docs/capabilities.md`. No target-project config changes are anticipated (board type/CLI selection already exists) — confirm in design once the fetch-operation question (board skill vs. ticket-gate skill) is settled.

## Recommendation

Proceed to `/design`. Two decisions should be resolved there before `/build`:
1. Where does the board-agnostic ticket **fetch** live — extend `board/SKILL.md`, or have `ticket-gate` own it? (Recommend extending `board/SKILL.md` to reuse its existing MCP/CLI dispatch rather than duplicate it.)
2. How does the new structural gate sequence with `build.md`'s existing groom/design-status readiness gate (`build.md:41`) and `design.md`'s existing shared-interface analysis gate — same session, different concerns, must not present as two contradictory blockers.

## Open questions
- [ ] Board-agnostic ticket fetch: extend `board` skill or duplicate in `ticket-gate`? — owner: TBD (raise in `/design`)
- [ ] Is Codex/Copilot silent-absence of the gate acceptable as documented adapter lossiness, or does it need an explicit warning surfaced to users of those adapters (e.g. in each adapter's README)? — owner: TBD
- [ ] Sequencing of ticket-gate vs. `build.md`'s existing readiness gate and `design.md`'s existing analysis gate — owner: TBD (raise in `/design`)
