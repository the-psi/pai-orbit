
---

## Codex-specific skill invocation (appended by the Codex adapter)

Codex CLI has a different skill-discovery model than Claude Code. Notes on how "loading" a skill in Claude Code maps onto Codex behaviour:

- In Claude Code, `$suggest-skills` loads skills into the session so they can be called explicitly. On Codex, all skills at `.agents/skills/<name>/` are always discoverable — no explicit "load" step.
- **Operational skills** (`analysis`, `board`, `data-model`, `epic`, `git`, `simplify`) can be invoked two ways:
  - Explicitly, by typing `$skill-name` in the composer.
  - Implicitly, when the description matches your natural-language prompt. Codex chooses which skill to fire based on the `description` field in each skill's frontmatter. When the user says "commit these changes", Codex sees `git`'s description and invokes it automatically.
- **Mode skills** (`arch`, `build`, `data`, `design`, `domain`, `groom`, `incident`, `orbit-plan`, `orbit-review`, `release`, `setup`, `suggest-skills`, `test`, `ux`) are **explicit-only**. They ship with `agents/openai.yaml` `policy.allow_implicit_invocation: false`, which means Codex will not fire them on description match — you have to type `$mode-name` to enter that headspace. This is intentional: modes are deliberate context switches, not something to trigger by accident.
- The `$suggest-skills` skill itself is a mode skill (implicit off). Invoke it explicitly when you want a guided walkthrough of which skill applies to your current problem.

### Rename note (Codex-only)

- Claude Code's **/plan** mode is shipped as `$orbit-plan` on Codex — invoke as `$orbit-plan`.
- Claude Code's **/review** mode is shipped as `$orbit-review` on Codex — invoke as `$orbit-review`.

Both renames avoid ergonomic overlap with Codex's built-in **/plan** and **/review** slash commands.

### Skills-list budget

Codex's initial skills list is capped at roughly 2% of the model's context window (~8,000 characters when the context window is unknown). Codex auto-shortens skill descriptions when the initial roster exceeds this budget. pai-orbit ships 20 skills; the adapter's build step already ensures the total description sum stays under 8000 chars, so you should never see runtime truncation. If a description in `/skills` looks cut off, that's Codex's own shortening — the full text still lives in the skill's `SKILL.md`.
