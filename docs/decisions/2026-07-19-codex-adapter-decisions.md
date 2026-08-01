---
status: accepted
date: 2026-07-19
deciders: [Chetan Sharma]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: pai-orbit Codex CLI adapter — architectural decisions

## Context

pai-orbit's OpenAI Codex CLI adapter (Codex v0.144.6+) brings the tool's methodology — mode discipline, skills, subagents, hooks, always-on rules — to Codex users natively. Skills become `.agents/skills/`, subagents become `.codex/agents/*.toml`, hooks become `.codex/hooks.json`, and install happens via a single `npx github:the-psi/pai-orbit init codex` command.

Building the adapter to full parity with Claude Code required a set of decisions — some to work around Codex's constraints (renamed slash commands, hook payload shape drift, Windows shell portability), some to preserve pai-orbit's design principles across a new tool (mode-vs-skill discipline, zero-core-edit, no parallel hand-maintained files).

This ADR records the load-bearing choices in a problem → decision → solution narrative. Each decision is titled with a stable identifier so it can be referenced from code comments, other docs, and future ADRs. See also the Copilot adapter's ADR (`2026-07-25-copilot-adapter-decisions.md`) for cross-cutting multi-tool decisions (D6, D33, D37) that this ADR inherits.

## Decisions

### DC1 — Rename `plan` to `orbit-plan` and `review` to `orbit-review` in the Codex build

**Problem I hit.** Codex ships two built-in slash commands: `/plan` (planning mode) and `/review` (code review). pai-orbit's own `plan` and `review` modes are invoked as `$plan` and `$review` — a different namespace, technically — but users trained on Claude Code's `/plan` and `/review` type slash by muscle memory. On Codex, that muscle memory hits Codex's built-in every time, not pai-orbit's mode.

**Decision I made.** Rename these two modes to `orbit-plan` and `orbit-review` in the Codex build only. Users invoke them as `$orbit-plan` and `$orbit-review`. Codex's built-in `/plan` and `/review` stay in their own namespace, no collision.

**Solution shipped.** `build.sh` has two rewrite passes (`rewrite_mode_body_plan`, `rewrite_mode_body_review`) that rename only these two modes when emitting `dist/codex/`. A separate `rewrite_slash_cross_refs` pass fixes every cross-reference in other mode bodies (`switch to /plan` → `switch to $orbit-plan`), including sub-mode suffixes like `/review security` → `$orbit-review security`. Core is untouched — this is Codex-adapter-only. Consistent across all emitted skills, the adoption page, the root CLAUDE.md, and the epic doc. Post-build guard blocks the build if any backtick-quoted `/plan` or `/review` leaks into emitted skills.

---

### DC2 — Mode skills are explicit-only; operational skills are implicit-invocation-allowed

**Problem I hit.** Codex supports two ways to invoke a skill: explicit (user types `$skill-name`) and implicit (Codex auto-fires when the user's natural-language request matches the skill's `description` field). Implicit is on by default. But pai-orbit has two very different kinds of skills:

- **Mode skills** (14 of them: `build`, `design`, `arch`, `groom`, etc.) — these are *headspace switches*. You commit to being in `$build` before writing code. If Codex implicitly switched into `$build` mid-conversation because the description happened to match some noise in a natural-language prompt, we'd violate the "mode discipline — never mix headspaces" principle in CLAUDE.md.
- **Operational skills** (6 of them: `git`, `analysis`, `board`, `data-model`, `epic`, `simplify`) — these are *procedures*. You *want* `$git` to auto-fire when the user says "commit these changes" — that's the whole point of the skill.

**Decision I made.** Turn off implicit invocation for all 14 mode skills. Leave it on for the 6 operational skills. The split matches the modes-vs-skills conceptual boundary that already exists in pai-orbit.

**Solution shipped.** Each mode skill directory gets an `agents/openai.yaml` file with `policy.allow_implicit_invocation: false`. Operational skill directories don't have this file (Codex defaults to implicit-on). A post-build guard enforces the exact split — build fails if a mode skill is missing the gate, or if an operational skill has one it shouldn't. Verified at runtime during Phase 0 (created a probe skill with a perfect implicit-trigger description and `allow_implicit_invocation: false`; Codex refused to fire it on a matching prompt).

---

### DC3 — Hook wrapper uses a Primary / Fallback / Future-proof path-extraction triad

**Problem I hit.** Codex's `apply_patch` PostToolUse hook fires with a JSON payload that includes which files were touched. But the payload's shape isn't stable across Codex versions:

- **Current shape** (v0.144.6): `tool_response` is a plaintext string containing a `Success. Updated the following files:\n<A|M|D> <path>` block.
- **Older shape**: the patch-body headers in `tool_input.command` (`*** Add File: <path>`, `*** Update File: <path>`).
- **Future shape**: a structured JSON `touched_files` array — matches how similar tools tend to evolve.

Committing to any single parser would either lock the wrapper to one Codex version, or force a rebuild every time the CLI shipped a new payload shape.

**Decision I made.** Parse all three shapes in a single Python extractor, in a documented priority order: **Primary** (parse `tool_response` plaintext) → **Fallback** (parse `apply_patch` body headers) → **Future-proof** (structured JSON if a future version emits it).

**Solution shipped.** `plugins/pai-orbit/adapters/codex/hook-wrappers/_extract-touched-paths.py` implements all three branches in ~100 lines, stdlib-only. Each Bash / PowerShell wrapper (`arch-drift-wrapper`, `lint-python-wrapper`, `lint-ts-wrapper`) delegates extraction to this one script and forwards the results to the underlying Claude-format core hook via a synthesized Claude-shape JSON payload on stdin. Recorded as an open follow-up: add fixture-based unit tests for all three branches to catch regressions when Codex v0.145+ ships.

---

### DC4 — `bash-guard` is a direct port + native PowerShell twin; other hooks go through wrappers

**Problem I hit.** pai-orbit ships four Bash hooks. Two issues surfaced:

1. **`bash-guard` is safety-critical.** It blocks dangerous commands (force-push, `git add -A`, `--no-verify`, `rm -rf /`). If it silently fails to run on native Windows without Git Bash, users lose that safety layer. Codex's PreToolUse Bash payload turned out to have the same stdin shape as Claude Code's, so a direct port was possible.
2. **The advisory hooks (`arch-drift-guard`, `lint-python`, `lint-ts`) can't run as-is.** They receive Codex's payload but expect Claude Code's shape (`tool_input.file_path` field). They need adaptation.

**Decision I made.** Give the hooks two different treatments:

- **`bash-guard.sh`** — direct port from Claude Code. And ship a full PowerShell reimplementation (`bash-guard.ps1`) so Windows-native users get safety even without Git Bash.
- **Advisory hooks** — wrap each one with an adapter-shipped shim that translates Codex's payload into Claude Code's, then delegates to the core script. Ship `.ps1` wrappers that shell out to `bash` for the core script; degrade gracefully with a silent no-op if Bash is missing.

**Solution shipped.** `adapters/codex/hook-wrappers/` contains `bash-guard.ps1` (native, no Bash needed) plus three `.sh` wrappers + three `.ps1` wrappers for the advisory hooks. `hooks.json` registers `.sh` scripts as `command` and `.ps1` scripts as `commandWindows`. A post-build guard enforces that `command` and `commandWindows` NEVER point at a core lint or arch-drift script directly — only at wrappers. Failure = build fails.

---

### DC5 — `commandWindows` on `hooks.json` for cross-platform portability

**Problem I hit.** pai-orbit's hook scripts are Bash. Windows-native PowerShell can't run them without Git Bash or WSL. Three options:

- (a) Force every Windows user through Git Bash.
- (b) Put platform-detecting logic inside every hook script (fragile).
- (c) Maintain two separate `hooks.json` files (POSIX + Windows) and swap them at install time.

**Decision I made.** Use Codex's built-in `commandWindows` field on each hook entry. One `hooks.json` portably serves both POSIX shells and native PowerShell — no platform detection inside scripts, no dual-file swap.

**Solution shipped.** Every hook entry in `dist/codex/.codex/hooks.json` has both `command` (POSIX shell / Git Bash) and `commandWindows` (PowerShell). Native Windows users get the PowerShell twin: real PowerShell reimplementation for `bash-guard`, shell-out-to-bash wrappers for the advisory hooks. Zero platform-detecting logic in the scripts. When Codex on Windows can't reach Bash, the advisory hooks silently no-op — safety-critical `bash-guard` still fires (fully native PowerShell). This downgraded the plan's "Windows Bash scripts" risk from a blocker to a documented soft edge case.

---

### DC6 — Multi-agent primitives are enabled by `features.multi_agent` (stable) — NOT `multi_agent_v2`

**Problem I hit.** Codex ships five multi-agent collaboration tools that pai-orbit's subagents depend on: `spawn_agent`, `send_input`, `resume_agent`, `wait_agent`, `close_agent`. Initially I confused which feature flag enables them. `codex features list` shows two related flags:

- `multi_agent` — stable, default true (on)
- `multi_agent_v2` — under development, default false (off)

Phase 0 initially assumed the primitives lived under `_v2`. An independent verify caught the mistake — the primitives are actually enabled by the stable `multi_agent` flag; `_v2` is a separate, in-progress rewrite that pai-orbit does not depend on.

**Decision I made.** Attribute the primitives to `features.multi_agent` (stable, default on). Explicitly do NOT gate on `multi_agent_v2`.

**Solution shipped.** No config changes needed — adopters get the primitives out-of-the-box. Adoption page, root CLAUDE.md, and this ADR all attribute the five primitives to `features.multi_agent`. Recorded here so anyone later reading `codex features list` doesn't waste time chasing the same red herring.

---

### DC7 — Standalone npx install CLI, independent of the Copilot branch's CLI

**Problem I hit.** pai-orbit's Codex adapter ships ~80 files into a user's project. Manual copy isn't practical. First shipped `install.sh` + `install.ps1` (curl / PowerShell), but this had drawbacks: two files with divergent maintenance burden, environment-variable overrides for pinning (`PAI_ORBIT_REF`), a separate override for force (`PAI_ORBIT_FORCE`), and different UX from the sibling `feat/copilot-plugin-adapter` branch which ships an npx CLI (`npx github:... init copilot`).

Two questions surfaced: (1) Should Codex adopt the same npx style as Copilot for user-experience consistency? (2) Should Codex's install code depend on the Copilot branch's CLI, or ship its own?

**Decision I made.** Yes to npx (single command, cross-platform, no shell-quoting differences, discoverable via `--help`, git-ref pinning via `#tag`, cleaner subcommand semantics with `init` and `update`). No to coupling with Copilot — build a Codex-specific `install.js` inside `adapters/codex/`, independent of Copilot's `scripts/init/cli.js`. The two branches merge independently. When Copilot lands on `main` later, both branches will have declared a `pai-orbit` binary in the repo-root `package.json` — that conflict is resolved at merge time by unifying to one CLI script that routes by target.

**Solution shipped.** `plugins/pai-orbit/adapters/codex/install.js` — 170-line Node CLI, stdlib-only, zero third-party dependencies. Declared as the `pai-orbit` bin in repo-root `package.json`. Users install via `npx github:the-psi/pai-orbit init codex`. Old `install.sh` / `install.ps1` deleted from `dist/`. `install.js` git mode is `100755` (executable bit, checked in via `git update-index --chmod=+x`). When Copilot's PR merges, whoever merges second resolves a one-line `package.json` `bin` field conflict — recorded here as a follow-up, not a design coupling now.

---

### DC8 — Zero-core-edit constraint enforced through every phase

**Problem I hit.** pai-orbit's multi-tool architecture (Copilot ADR §D6) requires all modes, skills, hooks, agents, and templates to live once in `plugins/pai-orbit/core/`. Per-tool adapters read `core/` and produce tool-specific artefacts. If a Codex-specific requirement leaks into `core/`, it breaks other adapters (Claude Code, Cursor, Copilot) or forces parallel branches of the same content.

**Decision I made.** Every Codex-specific handling lives inside `plugins/pai-orbit/adapters/codex/`. Zero edits to `core/` are allowed as part of the Codex adapter work. Verified at each phase gate.

**Solution shipped.** All Codex adapter files (`AGENTS.md`, `config.toml.template`, `hooks.json.template`, `hook-wrappers/`, `setup-append.md`, `suggest-skills-append.md`, `install.js`, `build.sh`) live inside the adapter directory. Where Codex needs to modify shared content (e.g., append Codex-specific setup steps to the `setup.md` mode body), the adapter emits an append fragment concatenated at build time — not by editing `core/modes/setup.md`. Path rewrites (`.claude/` → `.codex/`, `CLAUDE.md` → `AGENTS.md`) run at emit time, never at source time. Post-build guards enforce no `.claude/` or `CLAUDE.md` string leaks. `git diff main..HEAD -- plugins/pai-orbit/core/` is empty across the entire branch.

<!--
Historical note: an earlier revision of this ADR (in commit ebc585f) added
a "Nuance" paragraph claiming plugin.json 1.3.3 → 1.3.4 was a core edit
inherited from upstream. That claim was based on the automated /review's
evidence, which measured against a then-stale local main that predated
upstream's 7455b8e version bump. Once fork main was synced to
upstream/main (which is where main is today), both sides landed on
plugin.json 1.3.4 and the diff went empty. The absolute claim above is
the correct one; the "Nuance" paragraph has been removed as of the
approve-with-followups verify (2026-07-30).
-->

**Cross-reference.** This ADR partially resolves the Review Date trigger in [`docs/decisions/2026-07-24-adapter-parity-and-dist-compat.md`](2026-07-24-adapter-parity-and-dist-compat.md): the `codex`-experimental gap flagged there is now closed. The `cursor` (legacy) gap remains as a documented deliberate fallback (see `constraints.md` rule 6 comment).

---

### DC9 — Custom prompts (`~/.codex/prompts/*.md`) not emitted; skills-only delivery

**Problem I hit.** Codex CLI 0.117.0 removed the flat `~/.codex/prompts/*.md` → `/<name>` custom-prompt slash-command form. Pre-0.117.0, pai-orbit could have shipped modes as `~/.codex/prompts/build.md`, `design.md`, etc., invokable as `/build`, `/design`. Post-removal, that path silently no-ops. A newer namespaced form (`/prompts:<name>`) exists in current versions but adds an extra namespace with no clear benefit for pai-orbit.

**Decision I made.** Modes ship as `$mode-name` skills only. No `~/.codex/prompts/*.md` emission. No use of the namespaced `/prompts:<name>` form.

**Solution shipped.** All 14 modes are emitted as `.agents/skills/<mode>/SKILL.md` files with `agents/openai.yaml` gates (see DC2). Users invoke them as `$build`, `$design`, `$orbit-plan`, etc. Adoption page and troubleshooting section explicitly explain that `/build` (slash form) does not exist on Codex — dollar-sign is the only invocation for pai-orbit modes.

---

### DC10 — Path rewrite policy: catch-all with specific overrides

**Problem I hit.** Every emitted file needs its Claude Code paths rewritten to Codex paths. Two design options:

- (a) **Per-path rewrites** — one `sed` rule per known path (`.claude/pai-orbit-config.md` → `.codex/pai-orbit-config.md`, `.claude/team.md` → `.codex/team.md`, ...). Safe: only rewrites paths we know about. Downside: adding a new path in `core/` requires updating the rewrite pass, and any missed path leaks into `dist/`.
- (b) **Catch-all rewrite** — one `sed` rule for `.claude/` → `.codex/`. Future-proof: automatically handles new paths. Downside: risks over-rewriting.

Also, the skills path is different: Codex reads skills from `.agents/skills/` (repo-native convention), not `.codex/skills/`. Needs a specific override.

**Decision I made.** Use the catch-all `.claude/` → `.codex/`, with two specific overrides applied BEFORE the catch-all: `.claude/skills/` → `.agents/skills/` (Codex convention) and `.claude/settings.json` → `.codex/config.toml` (semantic remap, since Codex uses TOML config, not JSON settings). Sed rule order matters — specific first, catch-all last.

**Solution shipped.** `rewrite_paths_in_place()` in `build.sh` applies four rules in the correct order to every emitted text file. Post-build guard grep-fails the build if any `.claude/` or `CLAUDE.md` string leaks into dist. Verified after every build. `CLAUDE.md` → `AGENTS.md` is a separate substitution (word-boundary anchored to avoid false matches in prose).

---

## Follow-ups (recorded here so they don't get lost)

- **`package.json` `bin` merge-time conflict with Copilot branch** (per DC7). When Copilot's `feat/copilot-plugin-adapter` PR merges to main, resolve the `bin` field by unifying to one CLI script that routes by target argument. ~5-line fix at merge time, not a design change.
- **Unit tests for the three-branch path extractor** (per DC3). Add fixture-based tests for Primary/Fallback/Future-proof branches before Codex v0.145 changes the payload shape.
- **Security: `install.js` `copyRecursive` writes through destination symlinks.** `fs.copyFileSync` (install.js line ~78, per DC7) follows symlinks on both source and destination sides. The destination-side behavior is the concern: if a symlink already exists at a target path (planted by a malicious or careless prior tool), the copy resolves it and writes THROUGH the symlink to whatever it points at — escaping the intended target directory. Harden with an `fs.lstat(dest).isSymbolicLink()` guard before each write: if the destination is a symlink, refuse to write (or delete-then-write, depending on policy). Low risk under the current trust model (user installs their own project's tooling into their own project — no adversarial input), but worth closing as a hardening step. Flagged by the PR #51 automated review as a low-severity security nit; deferred, not silently fixed.
- **Security: `_extract-touched-paths.py` doesn't reject `../` or absolute paths.** The extractor (per DC3) hands paths to the lint wrappers without rejecting path-traversal (`../foo`) or absolute paths. Low risk since the advisory hooks fail-open and the payload originates from Codex itself (not adversarial input), but the wrappers should sanitize the paths before invoking `lint-python.sh` / `lint-ts.sh`. Flagged in the same PR #51 review; deferred, not silently fixed. Cosmetically, the extractor also mixes slashes on Windows (uses `os.path.join` — produces `/tmp/proj\src/main.py`); switching to `posixpath.join` addresses both the path-safety and the cosmetic issue in the same change.
- **Post-Codex extensions of the `rewrite_slash_cross_refs` pass** — currently handles `/plan` and `/review` collisions. If future Codex versions add more built-in slash commands that collide with pai-orbit skills (unlikely but possible), extend this pass in the same shape.
- **ADR-in-same-commit rule (`.claude/rules/decisions.md`).** This ADR (`68a883d`) landed as a separate commit rather than in the same commit as the feature code (`297c673`, `4e7e4ce`, …), which technically violates the "commit the ADR in the same commit as the code it documents" rule in `.claude/rules/decisions.md`. **Retroactively unfixable** — resolving would require force-pushing a history rewrite on the feature branch, which this PR deliberately avoids. **Mitigated at merge time**: `.claude/pai-orbit-config.md` specifies squash-merge for PRs, which collapses all branch commits (feature + ADR + fix commits) into a single squash commit on `main`. After merge, the ADR and the feature code are in the same effective commit. For future work: land the ADR alongside the feature commit before pushing, so the rule is met without relying on squash-merge.
