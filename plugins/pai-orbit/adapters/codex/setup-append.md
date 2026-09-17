
---

## Codex-specific setup (appended by the Codex adapter — not part of core setup.md)

The steps above are the tool-agnostic setup. Codex CLI has a few extra one-time knobs to turn on. Run through these after the core setup completes.

### 1. Trust the hooks

Codex requires explicit trust for every hook script before it fires. Run:

```
/hooks
```

Review the four registrations that pai-orbit ships:

- `PreToolUse ^Bash$` → `.codex/hooks/bash-guard.sh` (blocks force-push, bulk staging, hook bypass, destructive rm)
- `PostToolUse ^(apply_patch|Edit|Write)$` → `.codex/hooks/arch-drift-wrapper.sh` (advisory on structural file edits)
- `PostToolUse ^(apply_patch|Edit|Write)$` → `.codex/hooks/lint-python-wrapper.sh` (runs `ruff check` on touched `.py` files)
- `PostToolUse ^(apply_patch|Edit|Write)$` → `.codex/hooks/lint-ts-wrapper.sh` (runs `eslint` on touched `.ts`/`.tsx`/`.js`/`.jsx` files)

Trust each. Codex records trust against the current hook-script hash, so **any edit to a hook or wrapper invalidates trust** — re-run `/hooks` after every upgrade or manual script change.

### 2. Project trust

`.codex/hooks.json` only loads when the project is trusted. If Codex tells you the project isn't trusted yet, trust it via the CLI prompt on first invocation. Project-scope and user-scope (`~/.codex/hooks.json`) layers are **additive** — if you also keep user-scope hooks, both fire together, not one-or-the-other.

### 3. Fill in the lint hooks' repo paths

The core lint hooks (`.codex/hooks/lint-python.sh`, `.codex/hooks/lint-ts.sh`) each contain a placeholder block:

```
# --- CONFIGURE: add your repo paths here ---
repo=""
# case "$file" in
#   /path/to/your/api/*) repo=/path/to/your/api ;;
# esac
# --- END CONFIGURE ---
```

Replace with your project's actual repo paths (one `case` arm per repo/service that has a `venv/` or `node_modules/` with the linter installed). Until this is filled in, the lint hooks exit early on line 28 and never actually run `ruff` / `eslint`.

### 4. Verify TOML subagents load

Run `/agent` to list the two subagents pai-orbit ships:

- `docs-writer` — writes documentation in the project's docs directory
- `cross-repo-impact` — read-only cross-repository analysis

If either is missing, check `.codex/agents/docs-writer.toml` and `.codex/agents/cross-repo-impact.toml` are present and syntactically valid TOML.

### 5. Initialise `.codex/config.toml`

The adapter ships a `.codex/config.toml` template with pai-orbit's default approval policy (`on-request`), sandbox mode (`workspace-write`), and multi-agent bounds (`max_threads=4`, `max_depth=2`). Review these before your first session and adjust if your team runs in a stricter or more permissive posture.

Any MCP servers you use (GitHub, Slack, Linear, etc.) can be added to the `[mcp_servers.<name>]` blocks in the same file. pai-orbit ships no MCP integrations by default.

### 6. Ensure hook scripts are executable

On macOS / Linux: `chmod +x .codex/hooks/*.sh`.
On Windows: the `.ps1` variants are called via `commandWindows` and don't need an execute bit, but ensure `python` and `bash` are on PATH (the wrappers shell out to both). Codex on native Windows without Git Bash / WSL will still get `bash-guard.ps1` (native PowerShell), but the advisory hooks are silent no-ops without `bash` available.

### 7. Rename note

Two mode skills are renamed in the Codex build to avoid collision with Codex's built-in slash commands:

- `plan` (pai-orbit prioritization mode) is shipped as `orbit-plan` — invoke as `$orbit-plan`. Codex's built-in **/plan** puts the agent into planning mode; the two are in different namespaces (**/name** vs **$name**) but the ergonomic overlap is why we rename.
- `review` (pai-orbit's code-review mode) is shipped as `orbit-review` — invoke as `$orbit-review`. Same collision reasoning with Codex's built-in **/review**.

If you're used to /plan and /review from the Claude Code build, retrain your fingers: `$orbit-plan` and `$orbit-review` on Codex.

### 8. Optional: `AGENTS.override.md`

Codex reads `AGENTS.override.md` in preference to `AGENTS.md` in the same directory when both exist. Useful if you want local-dev overrides (e.g., different commit convention, extra Rules) without editing the tracked `AGENTS.md`. Add `AGENTS.override.md` to `.gitignore` if you use it.
