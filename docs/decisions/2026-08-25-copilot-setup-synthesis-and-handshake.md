---
status: proposed
date: 2026-08-25
deciders: [Chetan Sharma]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: Copilot `/setup` uses agent-side synthesis and a CLI handshake, not template lookup

## Context

PR #34 introduced the standalone install CLI (`npx github:the-psi/pai-orbit init copilot`)
that writes five files into a target project before the user runs `/setup`: the always-loaded
rule book (`.github/copilot-instructions.md`), 29 prompt files
(`.github/prompts/*.prompt.md`), 5 auto-attaching instruction files
(`.github/instructions/*.instructions.md`), and two inert hook templates
(`.husky/pre-commit.template`, `.pre-commit-config.yaml.template`).

The Copilot adapter's `/setup` mode was authored before the CLI existed. Its Step 3 body told
the agent to:

1. copy those five files from `plugins/pai-orbit/dist/copilot/` into the project, and
2. render `.copilot/pai-orbit-config.md`, `.copilot/team.md`, `AGENTS.md`, and
   `docs/architecture/*.md` by reading templates from
   `plugins/pai-orbit/core/templates/…`.

Both paths point at the pai-orbit repo's own working tree. Neither exists in a target project.
When the reviewer session verified `/setup` in an external test project (psi-portal), the
files still got created — but only because Copilot's model interpreted "copy from an
unreachable path" as "skip; files already present" and interpreted "use the template at
`templates/…`" as "synthesize the file from the interview and project scan." That is
implementation-defined behaviour: it happened to work on the Business tier and could break
on Free, on a future model version, or under a different prompt-file loader.

Two follow-on gaps compounded the mismatch:

- The CLI already asks the user's husky / pre-commit-installer preferences at install time and
  persists them to `.copilot/settings.json`, yet Step 2c of `/setup` asked the same questions
  again.
- The post-install "next steps" printed by the CLI still referred to `CLAUDE.md`, which the
  CLI no longer writes since D37 renamed the emitted repo-root context file to `AGENTS.md`.

## Decision

In the context of **`/setup` telling the Copilot agent to reach for paths that only exist
inside the pai-orbit repo, and re-asking questions the install CLI has already answered**,
facing **behaviour that is correct by luck rather than construction and a docs surface that
misdescribes what the CLI writes**,
we decided **to make `/setup` describe the deterministic post-CLI state honestly — the CLI
owns the five installed files, and the four synthesized files
(`.copilot/pai-orbit-config.md`, `.copilot/team.md`, `AGENTS.md`, `docs/architecture/*.md`)
are written by the agent from an explicit schema plus the Step 2 interview and Step 1
project scan, with the CLI's `settings.json` treated as the source of truth for questions the
CLI has already asked**,
to achieve **`/setup` behaviour that reads correctly on every Copilot tier and that does not
depend on the target project having a copy of the pai-orbit build tree**,
accepting **that the emitted `/setup` prompt grows, and that the file schemas the prompt
describes are now maintained inside the adapter build script rather than in shared
`core/templates/` files (a second contract to keep in step with template changes)**.

### File-ownership contract

The Copilot `/setup` prompt now separates its work into three categories:

- **CLI-owned files** — the five files listed above. The prompt names each one and instructs
  the agent to leave them alone. If any is missing, the recovery is to re-run the CLI with
  `--ignore-existing`, never to reconstruct the file by hand.
- **Interview-synthesized files** — `.copilot/pai-orbit-config.md`, `.copilot/team.md`,
  `.copilot/settings.json`, `AGENTS.md`. The prompt lists each file's sections, tables, and
  required fields, then instructs the agent to fill them from Step 2 answers, the Step 2b
  board discovery, and Step 1 file-scan results.
- **Scaffold-synthesized files** — `docs/architecture/system.md`,
  `docs/architecture/constraints.md`, `docs/architecture/stack.md`, plus the empty
  `docs/{features,decisions,epics,plans,ops,backlog,reports,wip,domain}/` subtree. Each is
  described by structure (sections and their intent), and the prompt states where
  interview-derived content plugs in and where `<!-- TODO: run /arch init -->` markers
  belong.

### Install → setup handshake

Step 2c of `/setup` now reads `.copilot/settings.json` before asking any question. When the
file exists and reports `install_mode: "install-only"`, the following fields are treated as
authoritative and their matching questions are skipped:

| Field | Effect on Step 2c |
|---|---|
| `husky_opted_in` | skip the husky-opt-in question |
| `precommit_installer` | skip the installer-choice question |
| `detected_languages` | treat as the language list, cross-checked against Step 1 for services added since install |
| `pai_orbit_version` | note whether this run is a re-install of the same version or an upgrade |

The install CLI (`plugins/pai-orbit/scripts/init/lib/copilot.js`) writes exactly these keys at
install time; the two files are now in a single, versioned contract.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) Rewrite `/setup` to describe CLI-owned files, synthesize the rest from an explicit schema, and read `settings.json` first | Deterministic across Copilot tiers; single source of truth for what runs where; matches the reality of what the CLI already does | The four file schemas live inside `adapters/copilot/build.sh` and drift if `core/templates/*.template` change (a second contract to maintain) |
| Ship `templates/…` inside `dist/copilot/` so the paths resolve in target projects | Preserves the prompt as written; no `/setup` rewrite | The five prompt-loader files already cover the runnable surface — shipping raw templates duplicates content, and the `.template` files would be renderable substitutes for the emitted prompts, inviting confusion about which one is authoritative |
| Move template rendering into the CLI and remove template references from `/setup` entirely | Cleanest split of responsibility (CLI writes all files, `/setup` becomes a docs walkthrough) | Loses the interactive interview experience that `/setup` uniquely provides on Business/Pro; the CLI's `prompts` UI cannot ask the multi-step board-discovery and architecture questions that Step 2 handles today |
| Leave `/setup` as-is and rely on the reviewer's empirical evidence that it works | No churn | Depends on the current Copilot model's improvisation; behaviour is not derivable from the prompt as written, so any future model change is an unbounded regression risk |

## Consequences

**Positive:**
- `/setup` behaviour is now derivable from the prompt as written, on every Copilot tier
  (Business, Pro, Free-degrade). No hidden dependency on model improvisation.
- Users answering `/setup` after `npx … init copilot` are no longer asked husky / pre-commit
  questions twice.
- The post-install "next steps" report matches the files the CLI actually writes.
- Removes every unreachable path reference (`plugins/pai-orbit/dist/copilot/`,
  `plugins/pai-orbit/core/templates/…`) from a document that runs in external projects.
- Fixes a text-corruption bug in the legacy-fallback sentence, where a repo-wide
  `CLAUDE.md → AGENTS.md` sed had collapsed "reads AGENTS.md first and falls back to
  CLAUDE.md" into "reads AGENTS.md first and falls back to AGENTS.md."

**Negative / trade-offs:**
- The four synthesized files' schemas now live inline in the adapter build script's Step 3
  heredoc. When `core/templates/pai-orbit-config.md.template`, `team.md.template`, or the
  `docs/architecture/*` templates change, the Copilot adapter's Step 3 description must be
  updated by hand. Nothing enforces this at build time.
- The CLI ↔ `/setup` handshake through `.copilot/settings.json` is a second contract keyed to
  a JSON schema. Changes to that schema must land in both the CLI and the Step 2c prompt in
  the same version.
- Grows the emitted `setup.prompt.md` (~+27 net lines) — a file always loaded when the user
  invokes `/setup`, though not on every request.

**Neutral:**
- No change to Claude Code or Cursor adapter output. Both continue to render `/setup` from
  `core/modes/setup.md` without the Copilot-specific Step 3 substitution.
- No change to the install CLI's file-writing behaviour. The CLI keeps writing the same
  five files (via `copyCopilotDist()`) and the same `.copilot/settings.json` schema; only
  the printed "next steps" text was corrected.
- The `/setup` prompt's Step 3 continues to output the same set of destination files as
  before; only the *provenance* of each file changes from "copy from `dist/`" or "render
  template" to "CLI-owned" or "synthesize."

## Related Decisions

- [2026-07-25 Copilot adapter decisions](./2026-07-25-copilot-adapter-decisions.md) — the
  consolidated log for the initial Copilot-adapter design (D6, D9, D23, D28, D29, D30, D33,
  D37, D38, D39, D40, D41, D42, D43). This ADR refines the surface those decisions
  established, particularly D37 (`AGENTS.md` rename) and D43 (locale pin and CLI structure).
- [2026-07-24 Adapter parity and dist/ backward compatibility](./2026-07-24-adapter-parity-and-dist-compat.md)
  — establishes rule 6. The Copilot-only scope of this ADR is intentional: Claude Code and
  Cursor's `/setup` paths already resolve their template references correctly because those
  targets install the plugin as a filesystem-adjacent directory. The lossy adapters (Copilot,
  Codex) install a `dist/` bundle only, so `/setup` cannot reach shared `templates/`. This
  ADR closes that gap for Copilot; the Codex adapter's `/setup` remains untouched pending a
  separate assessment.

## Review Date

Revisit if either (a) the shared `core/templates/*.template` files change materially and the
Copilot Step 3 schema is not updated in the same version, or (b) the CLI's
`.copilot/settings.json` schema changes without a matching Step 2c update.
