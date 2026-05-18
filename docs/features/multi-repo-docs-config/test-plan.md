## Summary
Tests for the multi-repo-docs-config feature, which adds an optional `## System Docs`
section to `pai-orbit-config.md` and teaches /setup, /plan, /domain, /groom, /design,
and /build to resolve and read from a system docs repo when configured. Since the feature
is implemented as Claude Code command and skill definitions (markdown), all test cases
are manual — there is no automated test suite for instruction-following behavior.

## Scope
In scope:
- `templates/pai-orbit-config.md.template` schema correctness
- `/setup` question flow and conditional config generation
- Command behavior (doc resolution block) for /plan, /domain, /groom, /design, /build
- Backward compatibility with existing single-repo configs
- `docs/process-and-practices.md` convention section presence

Out of scope:
- Writing docs back to the system repo (/build follow-on)
- Auto-cloning from git URLs
- Confluence/Notion sync paths

## Test cases

### Happy path
| ID | Scenario | Steps | Expected result | Automated? |
|----|----------|-------|-----------------|------------|
| TC-01 | Template contains ## System Docs section | Read `templates/pai-orbit-config.md.template` | File contains `## System Docs` block with `system_docs_repo` and `system_docs_path` fields and clear optional-usage comments | No |
| TC-02 | /setup single-repo — no System Docs block written | Run `/setup` in a test project; answer "no" to multi-repo question | Generated `.claude/pai-orbit-config.md` contains no `## System Docs` section and no `system_docs_repo` field (not even blank) | No |
| TC-03 | /setup multi-repo with relative path — System Docs block written | Run `/setup`; answer "yes" to multi-repo; provide `../project-system` (existing dir) | Config contains `## System Docs` with `system_docs_repo: ../project-system` and `system_docs_path: ./docs` | No |
| TC-04 | /setup multi-repo with git URL — System Docs block written | Run `/setup`; answer "yes"; provide a git URL | Config contains `## System Docs` with the git URL as `system_docs_repo`; no clone is attempted | No |
| TC-05 | /plan reads system docs when reachable | Config has `system_docs_repo: ../system` pointing to an existing dir with `docs/domain/`; run `/plan` | Claude acknowledges reading both local docs and system docs at session start; references system docs content if asked | No |
| TC-06 | process-and-practices.md has convention section | Read `docs/process-and-practices.md` | File contains a `## Multi-Repo Documentation Convention` section with service-repo vs system-repo guidance | No |

### Edge cases
| ID | Scenario | Steps | Expected result | Automated? |
|----|----------|-------|-----------------|------------|
| TC-10 | Existing single-repo config — backward compatibility | Open a project with a pre-existing `pai-orbit-config.md` that has no `## System Docs` section; run `/plan` | Claude proceeds normally with no error, no warning, no mention of system docs | No |
| TC-11 | /setup relative path that does not exist | Run `/setup`; answer "yes"; provide `../nonexistent-repo` (dir absent) | Claude warns: "System docs path not found — writing the pointer anyway; ensure the repo is cloned before running commands"; writes the pointer regardless | No |
| TC-12 | /setup multi-repo then answer no — no residual fields | Run `/setup`; answer "no" to multi-repo | Config has no `system_docs_repo`, no `system_docs_path`, no `## System Docs` heading anywhere in the file | No |
| TC-13 | system_docs_path defaults to ./docs | Run `/setup` multi-repo; provide only `system_docs_repo`; do not specify a custom path | Config writes `system_docs_path: ./docs` | No |
| TC-14 | /domain reads system docs when reachable | Same setup as TC-05; run `/domain` | Claude acknowledges both doc paths at session start | No |
| TC-15 | /groom reads system docs when reachable | Same setup as TC-05; run `/groom` | Claude acknowledges both doc paths at session start | No |
| TC-16 | /design reads system docs when reachable | Same setup as TC-05; run `/design` | Claude acknowledges both doc paths at session start | No |
| TC-17 | /build reads system docs when reachable | Same setup as TC-05; run `/build` | Claude acknowledges both doc paths at session start | No |

### Failure / error paths
| ID | Scenario | Steps | Expected result | Automated? |
|----|----------|-------|-----------------|------------|
| TC-20 | /plan — system_docs_repo set, relative path unreachable | Config has `system_docs_repo: ../missing-repo`; run `/plan` | Claude prints exactly one warning ("System docs path unreachable — continuing with local docs only") and proceeds; does not abort or repeat the warning | No |
| TC-21 | /plan — system_docs_repo is a git URL, not cloned locally | Config has a git URL as `system_docs_repo`; URL is not cloned; run `/plan` | Claude warns once and continues with local docs only | No |
| TC-22 | Warning fires only once per session | Same as TC-20; interact further in the session (ask follow-up questions) | Warning message appears only once at session start, not on every response | No |
| TC-23 | /domain — system_docs_repo unreachable | Config has `system_docs_repo: ../missing-repo`; run `/domain` | Claude warns once and continues with local docs only; does not abort | No |
| TC-24 | /groom — system_docs_repo unreachable | Config has `system_docs_repo: ../missing-repo`; run `/groom` | Claude warns once and continues with local docs only; does not abort | No |
| TC-25 | /design — system_docs_repo unreachable | Config has `system_docs_repo: ../missing-repo`; run `/design` | Claude warns once and continues with local docs only; does not abort | No |
| TC-26 | /build — system_docs_repo unreachable | Config has `system_docs_repo: ../missing-repo`; run `/build` | Claude warns once and continues with local docs only; does not abort | No |

## Acceptance criteria coverage

| Criterion | TC ID | Status |
|-----------|-------|--------|
| AC-1: Single-repo config has no system_docs_repo field | TC-02, TC-12 | Covered |
| AC-2: Multi-repo config has ## System Docs with all three fields | TC-03, TC-04, TC-13 | Covered |
| AC-3: /plan reads from both paths when system_docs_repo set | TC-05 | Covered — observable via Claude's session-start acknowledgement |
| AC-4: /plan warns and continues when system_docs_repo unreachable | TC-20, TC-21 | Covered |
| AC-5: Same behavior for /domain, /groom, /design, /build | TC-14–TC-17, TC-23–TC-26 | Covered |
| AC-6: process-and-practices.md has convention section | TC-06 | Covered |

## Manual test checklist
All test cases require manual execution in a Claude Code session.

**Setup required for session-behavior tests (TC-05, TC-14–TC-17, TC-20–TC-22):**
- [ ] Create a throwaway test project with a `.claude/pai-orbit-config.md` containing a `## System Docs` section pointing to a local directory
- [ ] Create a second throwaway config pointing to a non-existent path (for failure path tests)

**Test execution:**
- [ ] TC-01: Inspect template file directly
- [ ] TC-02: Run /setup in test project, answer no to multi-repo
- [ ] TC-03: Run /setup, answer yes, provide relative path to existing dir
- [ ] TC-04: Run /setup, answer yes, provide a git URL
- [ ] TC-05: Run /plan in multi-repo test project; verify session-start acknowledgement
- [ ] TC-06: Inspect process-and-practices.md directly
- [ ] TC-10: Open existing single-repo project, run /plan — verify no errors
- [ ] TC-11: Run /setup with a non-existent relative path — verify warning
- [ ] TC-12: Run /setup answering no — verify no residual System Docs fields
- [ ] TC-13: Run /setup multi-repo — verify system_docs_path defaults to ./docs
- [ ] TC-14–TC-17: Repeat TC-05 for /domain, /groom, /design, /build
- [ ] TC-20: Run /plan with unreachable relative path — verify single warning
- [ ] TC-21: Run /plan with git URL not cloned — verify single warning
- [ ] TC-22: Verify warning fires only once per session in TC-20 setup
- [ ] TC-23: Run /domain with unreachable system_docs_repo — verify single warning
- [ ] TC-24: Run /groom with unreachable system_docs_repo — verify single warning
- [ ] TC-25: Run /design with unreachable system_docs_repo — verify single warning
- [ ] TC-26: Run /build with unreachable system_docs_repo — verify single warning

## Known risks
- **Instruction-following variability:** Claude may not consistently produce an explicit session-start acknowledgement for TC-05/TC-14–17. If no acknowledgement is produced, test by placing a unique sentinel file in the system docs path and asking Claude to reference it — if it can, it read from the path.
- **"Warn once" enforcement:** TC-22 relies on Claude following the instruction to warn only once. This is not mechanically enforced; it depends on the instruction being followed across a session's context window.
- **git URL resolution:** TC-21 assumes Claude can distinguish a git URL from a relative path. If the resolution logic in the instruction block is ambiguous, Claude may apply the wrong check.

## Sign-off
- [ ] All acceptance criteria covered
- [ ] Edge cases documented
- [ ] Manual checklist reviewed
- QA: Punit Singhal — 2026-05-12
