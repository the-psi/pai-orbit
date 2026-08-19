# pai-orbit — GitHub Copilot Reference Guide

pai-orbit is a mode-driven developer workflow. Each mode puts the assistant into a specific headspace with declared inputs and outputs. Modes do not bleed into each other.

> **Copilot note:** This is a reference guide, not an executable plugin. Modes are not invokable commands — apply them by context. When these instructions reference `.claude/` paths, use `.github/pai-orbit/` instead (e.g. `.claude/pai-orbit-config.md` → `.github/pai-orbit/pai-orbit-config.md`). `CLAUDE.md` is tool-agnostic and stays as is.

---

## Modes

### /arch

You are now in ARCHITECTURE MODE.

Switch out when:
- A specific feature needs technical design → `/design`
- Requirements for a feature need formalising → `/groom`
- You are ready to implement → `/build`
- You want to review code against the declared architecture → `/review`


---

### /build

You are now in BUILD MODE.

Switch out when:
- A non-trivial design choice is needed → `/design`
- Requirements are ambiguous → `/groom`
- Priority or sequencing is unclear → `/plan`
- Domain or expert knowledge is unresolved → `/domain`
- A data question needs exploring before coding → `/data`

**Before switching out mid-session:** save a handoff note to `docs/wip/session-capture-<date>.md` with:

---

### /data

You are now in DATA MODE.

Switch out when:
- The data reveals a feature need → `/groom`
- The data reveals a design decision → `/design`
- A domain interpretation is needed → `/domain`


---

### /design

You are now in DESIGN MODE.

Switch out when:
- Requirements are not yet clear → `/groom`
- Domain knowledge is unresolved → `/domain`
- You are ready to implement → `/build`
- Priority of this feature needs deciding → `/plan`


---

### /domain

You are now in DOMAIN MODE.

Switch out when:
- Domain knowledge is ready to inform a feature requirement → `/groom`
- Domain knowledge is ready to inform a technical design → `/design`
- Domain knowledge reveals a data question → `/data`


---

### /groom

You are now in GROOM MODE.

Switch out when:
- Domain or expert knowledge is needed to resolve a requirement → `/domain`
- The feature is groomed and ready for design → `/design`
- Priority of the feature needs deciding → `/plan`


---

### /incident

You are now in INCIDENT MODE.

Switch out when:
- Fix is ready to implement → `/build` (return to INCIDENT after shipping to complete verify + post-mortem)
- Fix needs review → `/review` (narrow focus: symptom, risk, rollback — not full conventions review)
- Fix is ready to deploy → `/release`
- Situation de-escalates to a planned fix → `/board` to file, then normal sprint flow

**Before switching out:** note the incident issue number so you can return to it after each fast-path step.


---

### /plan

You are now in PLAN MODE.

Switch out when:
- A feature needs grooming before it can be planned → `/groom`
- A technical uncertainty needs resolution before sequencing → `/design`


---

### /release

You are now in RELEASE MODE.

Switch out when:
- Tests need to run before deploying → `/test` (return after test sign-off)
- A build fix is needed before shipping → `/build` (return after fix)
- An incident occurs post-deploy → `/incident`


---

### /review

You are now in REVIEW MODE.

Switch out when:
- Blocking findings need to be fixed → `/build` (return to REVIEW after fix)
- Architecture violations need a formal decision → `/design`


---

### /setup

You are now in SETUP MODE.

Switch out when:
- Setup is complete → return to whatever you were doing, or run `/arch init` next
- Architecture needs to be declared → `/arch init`


---

### /suggest-skills

You are now in SUGGEST SKILLS MODE.

Switch out when:
- Suggestions are presented and user wants to scaffold one → remain in this mode to scaffold it
- Session is complete


---

### /test

You are now in TEST MODE.

Switch out when:
- A test failure is a code bug → `/build` (return to TEST after the fix)
- A requirements gap surfaces → `/groom` (update requirements first, then return)
- A design or architecture issue is found → `/design`


---

### /ux

You are now in UX MODE.

Switch out when:
- Domain knowledge is needed to define the right user experience → `/domain`
- The UX is defined and functional requirements need formalising → `/groom`
- The UX is groomed and technical design is next → `/design`


---

## Skills (reference)

Skills are operational procedures. Copilot has no skill-invocation system — apply these as instructions when the context matches the trigger.

| Skill | When to invoke |
|-------|---------------|
| `/analysis` | Change impact and dependency analysis — assess the blast radius of a proposed change before buildi |
| `/board` | Task management and ticket status sync — create issues, transition status, post comments, close on |
| `/data-model` | Data model reference and schema change management — document the current schema, propose and valid |
| `/epic` | Epic lifecycle management — create, load, update, and list epics in docs/epics/ |
| `/git` | Git operations — commit, branch, PR, push — following the project's configured branching model a |
| `/simplify` | Code simplification pass — review recently changed or new code for over-engineering, dead code, un |

