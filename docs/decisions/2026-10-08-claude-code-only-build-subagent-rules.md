---
status: proposed
date: 2026-10-08
deciders: [Upneet Singh]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: Claude-Code-only `/build` sub-agent rules via a core marker

## Context

Ticket #32 asks `/build` to (1) run parallel builder sub-agents in their own git worktree and (2) pick the model per task (haiku vs sonnet). `core/modes/build.md` is shared by all adapters, and `constraints.md` rule 6 requires full adapter parity.

Research against each tool's official docs (2026-10-08) showed the two rules are not equally portable:

| Capability | Claude Code | Codex | Cursor | Copilot (VS Code) |
|---|---|---|---|---|
| Per-agent model | `model` | `model` in `.codex/agents/*.toml` | `model` frontmatter | `model` frontmatter |
| Per-sub-agent worktree flag | `isolation: "worktree"` | none (session-level UI / manual `git worktree add`) | none (asked for in the prompt) | none (session-level / manual) |

#32 assumed both were Claude-Code-only. That is true for the worktree flag and false for per-agent model.

## Decision

In the context of **parallel `/build` sub-agents corrupting each other's uncommitted changes and wasting cost on trivial tasks**,
facing **rule 6 (full adapter parity) while only Claude Code has an enforced per-sub-agent worktree flag**,
we decided **to keep the generic sub-agent text in `core/modes/build.md` and add a `<!-- CLAUDE_CODE_ONLY: build-subagent-rules -->` marker that only `adapters/claude-code/build.sh` replaces with the worktree + haiku/sonnet rules; the build exits 1 if the marker is missing**,
to achieve **enforced worktree isolation where the tool supports it, without forking `core/` prose or leaking Claude-only primitives into other adapters**,
accepting **that worktree isolation is enforced only on Claude Code (best-effort elsewhere) and that the marker comment remains visible in the other adapters' `dist/` output**.

This is a recorded exception to `constraints.md` rule 6 for the worktree rule only. Model tiering is portable, so it is not an exception: it is deferred to a follow-up ticket (see Consequences).

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) Core marker, claude-code adapter injects rules | `core/` stays tool-agnostic; fails closed if marker removed; other adapters unchanged | Marker and rule text live in two places; marker comment ships in other `dist/` files |
| Snippet file in the adapter folder, appended by `build.sh` | Rule text sits beside the adapter | No anchor in core, so placement drifts; rejected during design discussion |
| Write the rules in core for every adapter | One source of truth | Tells Codex/Cursor/Copilot to use `isolation: "worktree"`, which they do not support |
| Per-adapter equivalent rules now | Meets rule 6 for model tiering at once | Outside #32's scope; needs per-tool syntax for three adapters |

## Consequences

**Positive:**
- Claude Code builders get enforced worktree isolation and a model-tiering heuristic.
- A removed or misspelled marker fails the build instead of silently shipping without the rules.

**Negative / trade-offs:**
- Codex, Cursor and Copilot have no enforced worktree isolation: parallel builders there rely on the generic guidance, or on the user starting separate worktrees.
- Model tiering exists only on Claude Code until the follow-up ticket lands, even though all four tools support a per-agent model.
- `<!-- CLAUDE_CODE_ONLY: ... -->` appears in five non-Claude-Code `dist/` files (harmless HTML comment).

**Neutral:**
- The adapter-side injection pattern matches how codex/copilot/cursor-plugin already rewrite core text at build time.
- Follow-up: per-adapter model-tiering guidance (Codex `model`, Cursor `model`, Copilot `model`). Not part of #32.

## References

- Ticket #32, PR #80, review in PR #80 comments
- `docs/architecture/constraints.md` rule 6, `docs/architecture/system.md` Open Questions
- Cursor: https://cursor.com/docs/subagents
- VS Code Copilot: https://code.visualstudio.com/docs/copilot/customization/custom-agents
- Codex: https://developers.openai.com/codex/subagents
