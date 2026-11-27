## Impact Analysis: /build parallel sub-agent split → orchestrator + 3 streams (#79)
Date: 2026-11-02

## Change
Current: `core/modes/build.md:42` — "Spawn sub-agents per repo where tasks are independent; run in parallel where possible" (split left to Claude's judgment). Worktree + model-tiering text injected on claude-code only via `<!-- CLAUDE_CODE_ONLY: build-subagent-rules -->` (build.md:44, shipped in #32).
Proposed: orchestrator rule — coding / tests / docs streams, dependent tasks sequential inside a stream, change notification between streams, ≤ 3-file exemption, missing-spec fallback.
Classification: **Breaking — owned (behavioural), no structural dist/ change by itself.** Text in a prompt file changes; no consumer code reads this line programmatically. Real risk is **adapter parity (constraints rule 6)**, not call-site breakage.

## Consumers found
| Location | File:line | Classification | Action needed |
|---|---|---|---|
| Core rule being replaced | core/modes/build.md:42 | Owned | Rewrite bullet; keep tool-agnostic (rule 2) |
| Claude-only marker + injector | core/modes/build.md:44, adapters/claude-code/build.sh:33-38 | Owned | Marker position must stay after the new text; rules file `build-subagent-rules.md` gains stream-aware wording (worktree per *stream*, not per builder) |
| Claude-only rules file | adapters/claude-code/build-subagent-rules.md | Owned | "Two or more builders in same repo" now = streams; update. Fail-closed check in build.sh unchanged |
| Codex limits | adapters/codex/config.toml.template:21-22 (`max_threads=4`, `max_depth=2`) | Owned | Orchestrator → stream → child = 3 levels > `max_depth=2`; 3 streams + orchestrator = 4 threads = at the cap, no room for per-repo fan-out. Needs design decision (flatten, or raise limits → rule 7 migration note, since existing installs keep old `config.toml`) |
| Codex prose | adapters/codex/build.sh:459, adapters/codex/setup-append.md:55 | Owned | Add orchestration wording using `spawn_agent`/`wait_agent`; mention bounds |
| Cursor plugin table | adapters/cursor-plugin/build.sh:235 ("Subagent parallel tasks — test per version") | Owned | Already "test per version"; add stream note / honest limit |
| Copilot | adapters/copilot/build.sh:342 (builders = prompts; Free tier = plain prompts) | Owned | Free tier cannot run parallel agents → must degrade to sequential streams, stated explicitly |
| Legacy cursor | adapters/cursor/ | Owned | Deliberate lossy fallback; inherits text, no extra work |
| Capability docs | docs/capabilities.md:98, :267 | Owned | Update `/build` + agents note |
| Install docs | docs/codex-install-and-usage.md:220 | Owned | Mirror Codex wording |
| Constraints / system | docs/architecture/constraints.md:18, system.md:58 | Owned | Exception list is about worktree isolation only; if streams are claude-code-only too, extend ratified exception via `/arch update` + ADR (rule 6) |
| ADR (precedent) | docs/decisions/2026-10-08-claude-code-only-build-subagent-rules.md | Owned | Reuse marker mechanism rather than inventing a new one |
| Service builders run own tests | core/templates/agents/*-builder.md, core/modes/setup.md:185-192 | Owned | REQ-10: stream boundary rule (code stream = regression only) lives in build.md text; builders unchanged. Generated `.claude/agents/*` in consumer projects are not touched |
| `dist/` | plugins/pai-orbit/dist/* | Generated | Regenerate only |
| External / unknown | consumer projects' installed `.claude/agents`, `.codex/config.toml` | External (already-installed) | See migration |

## Migration path
- Text-only change to modes/rules: consumers pick it up on plugin update; no `/setup` re-run needed → rule 7 likely **no structural change** unless Codex limits are raised (config template is copied at install; existing projects keep `max_depth=2`) or a new file is added.
- Options for Codex depth: (1) flat model: orchestrator spawns stream agents only, no grandchildren (fits depth 2 only if the orchestrator is the primary agent); (2) raise `max_depth`/`max_threads` in template + migration note + version bump.

## Recommendation
Proceed to `/design`. No blocker; no breaking external consumer. Design must decide: (a) full parity vs claude-code-only exception (needs ADR + `/arch update` if exception), (b) Codex depth/thread budget, (c) whether the orchestrator is the primary session agent or a spawned agent (this one choice drives depth on every adapter), (d) change-propagation mechanism available on each tool.

## Open questions
- [ ] Orchestrator = primary session agent or spawned sub-agent? — owner: Upneet Singh
- [ ] Parity vs exception for Codex/Cursor/Copilot-Free — owner: Upneet Singh
- [ ] Raise Codex limits (migration note) or flatten? — owner: Upneet Singh
