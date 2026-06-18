## Epic
<!-- None — standalone enhancement -->

## Purpose
When a user enters `/build` mode, Claude should invoke `/git` at session start to check the current branch, create the appropriate feature branch per the configured branching model, and confirm to the user where work will land — before any code is written. This prevents commits from silently accumulating on the wrong branch (e.g. `main`), which is hard to undo cleanly once a session is underway.

## Scenarios in scope
1. Developer enters `/build` on a GitHub Flow or GitFlow project while on `main` or `develop`. Claude creates the appropriate feature branch before any code is written.
2. Developer enters `/build` already on the correct feature branch. Claude confirms the branch and proceeds without creating a new one.
3. Developer enters `/build` on a trunk-based project. Claude confirms direct-to-`main` for small changes or creates a short-lived branch for larger ones.
4. Developer enters `/build` with no branching model configured. Claude defaults to GitHub Flow, states the assumption, and creates a feature branch.

## User stories / use cases
- As a developer on a GitHub Flow project, I want `/build` to create a feature branch before I write any code, so that my commits never accidentally land on `main`.
- As a developer already on a feature branch, I want `/build` to confirm my branch at session start, so that I know where my work is going before I begin.
- As a developer on a trunk-based project, I want `/build` to confirm whether I'm committing directly to `main` or creating a short-lived branch, so that I'm not surprised at session close.
- As a developer on a project without a configured branching model, I want `/build` to default to GitHub Flow and tell me, so that I'm not left guessing.

## Functional requirements
1. REQ-1 (Scenario 1): At session start, `/build` must read `.claude/pai-orbit-config.md → ## Git` to determine the branching model. If the model is GitHub Flow or GitFlow and the current branch is `main`/`develop`, Claude must create the appropriate feature branch before any file edits or commits occur.
2. REQ-2 (Scenario 1): The feature branch name must be derived from the board issue or feature slug. Claude must state the branch name to the user and wait for confirmation before creating it.
3. REQ-3 (Scenario 2): If the current branch is already a valid feature branch for the work (e.g. `feature/<slug>`), Claude must confirm this to the user and proceed without creating a new branch.
4. REQ-4 (Scenario 3): For trunk-based projects, Claude must assess change size at session start. Small changes: confirm direct-to-`main` and proceed. Larger changes: create a short-lived branch, state its name, and confirm with the user.
5. REQ-5 (Scenario 3): The distinction between "small" and "larger" changes for trunk-based projects must be derived from the scope of requirements or task description — not left implicit. If Claude cannot determine size, it must ask the user before deciding.
6. REQ-6 (Scenario 4): If no branching model is configured, Claude must default to GitHub Flow, state the assumption ("No branching model configured — defaulting to GitHub Flow"), and proceed with feature branch creation per REQ-1/REQ-2.
7. REQ-7 (All scenarios): Claude must communicate the active branch and intended PR target to the user as the first output of every `/build` session, before any implementation work begins.

## Non-functional requirements
- Branch establishment must happen before the first file edit — not deferred to session close.
- The branch confirmation must be a single, clear statement — not buried in a long preamble.

## Context
The `/git` skill already handles branching logic and reads from `.claude/pai-orbit-config.md → ## Git`. This enhancement adds an explicit session-start hook in `/build` mode that invokes `/git` for branch establishment — before any implementation begins. No changes to the `/git` skill itself are required.

## Out of scope
- Changes to the `/git` skill branching logic itself.
- Handling merge conflicts or rebasing mid-session.
- Enforcing branch naming on commits the user made outside of `/build`.

## Open questions
- [ ] How should "small vs. larger" change size be determined for trunk-based projects — by number of files, story points, or explicit user declaration? — owner: Pratham
- [ ] Should the branch name slug come from the board issue title, the feature folder name, or user input? — owner: Pratham

## Acceptance criteria
- AC-1 (Scenario 1): Given GitHub Flow config and current branch `main`, when `/build` starts, then Claude creates `feature/<slug>`, states it, and waits for confirmation before writing any code.
- AC-2 (Scenario 1): Given Claude creates the feature branch, when the user confirms, then all subsequent commits in the session land on that branch.
- AC-3 (Scenario 2): Given the current branch is already `feature/<slug>`, when `/build` starts, then Claude states "Already on feature branch `feature/<slug>` — proceeding" without creating a new branch.
- AC-4 (Scenario 3): Given trunk-based config and a small change, when `/build` starts, then Claude confirms "Committing directly to `main` (trunk-based, small change)" and proceeds.
- AC-5 (Scenario 3): Given trunk-based config and a larger change, when `/build` starts, then Claude creates a short-lived branch and confirms with the user before starting.
- AC-6 (Scenario 4): Given no branching model in config, when `/build` starts, then Claude states the GitHub Flow default assumption and creates a feature branch.

---
Status: Groomed — ready for /design
