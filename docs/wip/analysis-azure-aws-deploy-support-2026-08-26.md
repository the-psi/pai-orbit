## Impact Analysis: Azure/AWS CLI + MCP support in `/setup` (docs/features/azure-aws-deploy-support)
Date: 2026-08-26

## Change
Current:
- `## Deploy → Auth check command` in `.claude/pai-orbit-config.md` is manually entered by the user during `/setup`; `/release` mode (`plugins/pai-orbit/core/modes/release.md`) reads it during Preflight and runs it as-is.
- `## MCP` section has exactly three keys (`git`, `board`, `docs`); `/setup` (`plugins/pai-orbit/core/modes/setup.md:258`) omits the entire section if all three are "none".

Proposed:
- `/setup` auto-populates `## Deploy → Auth check command` for Azure (`az account show`) and AWS (`aws sts get-caller-identity`) instead of leaving it manual.
- `## MCP` gains a fourth key, `deploy` (Azure MCP / AWS MCP / none), written the same way as `git`/`board`/`docs`.
- `/setup` runs a new, warn-only verification step after config generation (CLI installed? authenticated? MCP reachable?) — output only, no new persisted state beyond what's already in `## Deploy`/`## MCP`.

Classification: **Breaking (owned) on one point, otherwise non-breaking** — see below.

## Consumers found

| Location | File:line | Classification | Action needed |
|---|---|---|---|
| `/setup` MCP omission logic | `plugins/pai-orbit/core/modes/setup.md:258` | **Breaking (owned)** | Must change "omit if all **three** are none" → "omit if all **four** are none". If left as-is, a project that configures only a deploy MCP server (git/board/docs all "none") gets its `## MCP` section silently dropped, so the deploy MCP config is written nowhere — a silent data-loss regression, not just a stale-doc issue. |
| `/release` mode Preflight | `plugins/pai-orbit/core/modes/release.md:12,20` | Non-breaking (owned) | Already reads `## Deploy → Auth check command` as a plain shell command and runs it directly. Auto-populating that field with `az account show` / `aws sts get-caller-identity` is compatible as long as the design keeps it a single runnable command (not the pipe-separated illustrative form `gcloud auth list \| vercel whoami \| fly auth whoami` shown in the template's comment, which is a list of examples, not a literal value). Flag as a design constraint, not a code change. |
| `/git` skill MCP read | `plugins/pai-orbit/core/skills/git/SKILL.md:14` | Non-breaking | Reads only `## MCP → git`; unaffected by a new `deploy` key. |
| `/board` skill MCP read | `plugins/pai-orbit/core/skills/board/SKILL.md:16` | Non-breaking | Reads only `## MCP → board`; unaffected. |
| `docs/capabilities.md:148` | doc reference to `/release` reading `## Deploy` | Non-breaking | Doc stays accurate; no change required for this feature, optionally note the new Azure/AWS auth-check defaults when `/build` ships this. |
| Adapter build scripts (`claude-code`, `cursor-plugin`, `cursor`, `kiro-power`) | `plugins/pai-orbit/adapters/*/build.sh` | Non-breaking | All four copy `core/modes/*.md` and `core/templates/*` **verbatim** (`cp -R`, or wrap with frontmatter + `cat`) — no adapter hand-duplicates the Step 2/MCP Q&A content. Editing `core/modes/setup.md` and `core/templates/pai-orbit-config.md.template` and running `bash plugins/pai-orbit/build.sh` propagates to all four automatically. No adapter-specific work needed. |
| `copilot`, `codex` adapters | `plugins/pai-orbit/dist/copilot/`, `plugins/pai-orbit/dist/codex/` | Not applicable | Neither adapter includes a `/setup` mode or any `## MCP`/`## Deploy` content today (pre-existing gap, confirmed via grep — zero matches). This feature doesn't touch them and doesn't need to; out of scope. |
| Existing already-`/setup`'d projects | n/a (external, per-consumer state) | Compatible if designed for it | Projects that ran `/setup` before this ships will have `## MCP` sections with no `deploy` key (or no section at all). Any future reader of `## MCP → deploy` must treat a missing key the same as `deploy: none` — this is a design requirement to state explicitly, not a migration to run. |

## Migration path
Not applicable as a data migration — this is new `/setup`-time behavior, not a change to a running system. The one thing that must ship atomically in the same change: the `## MCP` omission-check fix (three → four keys). Everything else is additive and safe to ship independently.

## Recommendation
**Proceed to `/design`.** Scope the design to:
1. Fold the omission-check fix into the same implementation unit as the new `deploy` MCP key (they're the same edit in `setup.md`) so it can't ship half-done.
2. State explicitly that `## Deploy → Auth check command` must remain a single runnable command for Azure/AWS, compatible with how `/release` already executes it.
3. State explicitly that a missing `## MCP → deploy` key is equivalent to `none` for any future reader (forward compatibility with already-`/setup`'d projects).

## Open questions
- [ ] None blocking — the three design questions already logged in `docs/features/azure-aws-deploy-support/requirements.md` (MCP server product names, verification timeout, exact failure-message wording) remain deferred to `/design` as previously classified.
