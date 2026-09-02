---
name: pai-orbit-methodology
description: pai-orbit structured development methodology and mode discipline
inclusion: auto
---

# pai-orbit Methodology (Power Active)

You are working with the pai-orbit Power active in Kiro. This methodology enforces mode discipline where each activity has its own headspace with defined inputs, outputs, and documentation.

## Core Principles

**Mode Discipline**: Each mode has a specific purpose and output destination. Switch modes explicitly when the work type changes.

**Local-First Documentation**: All modes write markdown files locally. Nothing important lives only in conversations.

**Producer/Consumer Contract**: Every mode declares what it reads and writes to prevent context loss.

## Available Modes (Use with #skill-name)

- **#arch-mode**: a system-wide structure session — services, boundaries, data flow, and hard constraints No implementation. No feature design.
- **#build-mode**: an implementation session Stay in this mode until the user switches.
- **#data-mode**: a data exploration and analysis session Output saved to `docs/reports/<topic>-<date>.md`.
- **#design-mode**: a technical design and trade-offs session No implementation.
- **#domain-mode**: a domain knowledge production session Output saved to `docs/domain/`.
- **#groom-mode**: a feature requirements session that runs in three gated phases — purpose (closing with a scope gate), scenarios, then requirements Do not analyze requirements until phases 1 and 2 are confirmed. Output saved to `docs/features/<feature>/requirements.md`.
- **#incident-mode**: structured development mode
- **#plan-mode**: a roadmap, prioritisation, and sprint scoping session
- **#release-mode**: a deployment session with preflight checks and post-deploy verification Stay in this mode until the deployment is confirmed healthy or explicitly rolled back.
- **#review-mode**: a code review session against the project's documented architecture, conventions, and requirements
- **#setup-mode**: structured development mode
- **#suggest-skills-mode**: structured development mode
- **#test-mode**: a test planning and QA session Stay in this mode until the test plan is complete and signed off, or until the user switches.
- **#ux-mode**: a UX and user-flow design session Output saved to `docs/features/<feature>/ux.md`.

## Available Skills (Use with #skill-name)

- **#analysis-skill**: Change impact and dependency analysis — assess the blast radius of a proposed change before building, or evaluate the effect of a shipped change after the fact. TRIGGER before refactoring a shared interface, when removing or renaming a public API, when changing a data model used by multiple services, or when asked "what breaks if we change X". SKIP pure data exploration with no change involved (use /data) and full architectural design (use /design).
- **#board-skill**: Task management — create issues, move cards, assign work, close on ship — using the project's configured board. Reads board config from .claude/pai-orbit-config.md and team roster from .claude/team.md. TRIGGER when creating a task or issue, moving a card, assigning work, closing a completed item, or asking about what's on the board. SKIP read-only board browsing (just use the browser or CLI directly).
- **#data-model-skill**: Data model reference and schema change management — document the current schema, propose and validate schema changes, plan migrations. TRIGGER when designing a new table or field, when modifying an existing schema, when asked about what a table contains or how tables join, or before writing a query against an unfamiliar table. SKIP pure query exploration with no schema change (use /data) and high-level data architecture decisions (use /design).
- **#epic-skill**: Epic lifecycle management — create, load, update, and list epics in docs/epics/. TRIGGER when creating a new epic, loading epic context before planning, updating an epic after a session, or listing all epics. SKIP individual feature requirements (use /groom) and roadmap sequencing (use /plan).
- **#git-skill**: Git operations — commit, branch, PR, push — following the project's configured branching model and conventions. TRIGGER when committing, creating a branch, opening a PR, or managing git state. SKIP read-only git inspection (git log, git diff, git status) — those don't need a skill.
- **#simplify-skill**: Code simplification pass — review recently changed or new code for over-engineering, dead code, unnecessary abstractions, and duplication; then fix what's found. TRIGGER after a build session when the implementation feels overbuilt, when a PR review flags complexity, or on a periodic cleanup pass. SKIP full architectural refactors (use /design first) and test-only changes (use /build directly).

## Proactive Mode Suggestions

When you detect work that fits a specific mode, proactively suggest or activate the appropriate mode:

- Starting a new feature → **#groom-mode**
- Technical decisions needed → **#design-mode**
- Ready to implement → **#build-mode**
- Code ready for review → **#review-mode**
- Deployment needed → **#release-mode**

## Documentation Structure

All modes write to standardized locations:
- `docs/features/*/requirements.md` (from groom-mode)
- `docs/features/*/design.md` (from design-mode)  
- `docs/architecture/` (from arch-mode)
- `docs/decisions/` (ADRs from design/arch modes)
- `docs/domain/` (from domain-mode)

This maintains context and produces versioned documentation alongside code.
