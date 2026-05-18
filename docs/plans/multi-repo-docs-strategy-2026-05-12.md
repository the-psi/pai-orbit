# Multi-Repo Docs Strategy

**Date:** 2026-05-12  
**Status:** Analysis complete — awaiting decision  
**Context:** PAI-Orbit currently assumes a single-repo project. This note analyzes how to handle documentation when a project has one repository per microservice with cross-cutting concerns.

---

## Problem Statement

PAI-Orbit hardcodes `docs/` paths relative to the repo root. In a microservices project, three categories of documentation exist that don't map cleanly to a single repo:

1. **Service-specific** — how this service works, its schema, its API, its features
2. **Cross-cutting** — auth patterns, shared data contracts, inter-service protocols, system-wide ADRs
3. **System-level** — roadmaps, epics that span services, domain knowledge that applies everywhere

---

## Options Considered

### Option A — Distributed: Docs in each service repo, cross-cutting assigned to a designated service

Each service repo has a full `docs/` tree. Cross-cutting concerns get assigned to whichever service owns them (e.g., auth docs live in `auth-service`). No new repo.

**Tradeoffs:**
- `+` Docs co-located with code — PRs are self-contained
- `+` No extra repo to manage
- `–` Cross-cutting docs have an arbitrary home — hard to discover
- `–` `/plan` sessions require manually reading docs from multiple repos — no single system view
- `–` Epics and plans that span services get fragmented or have no natural home

---

### Option B — Centralized: Dedicated `project-docs` repo, service repos hold only code

One repo (`project-docs` or `<project>-system`) holds all documentation. Service repos have no `docs/` directory.

**Tradeoffs:**
- `+` Single place to navigate the entire system
- `+` Cross-cutting concerns have an obvious home
- `–` Feature PR in `user-service` and its doc PR in `project-docs` are separate — review friction, docs drift risk
- `–` Requires discipline to update the central repo when service code changes
- `–` PAI-Orbit's `/build` mode writes docs after shipping code — split-repo makes this awkward

---

### Option C — Hybrid (recommended): Each service owns service docs; one system repo owns cross-cutting and system-level docs

Each service repo has a minimal `docs/` for its own concerns:

```
user-service/docs/
  ├── features/user-registration/    ← service-specific features
  ├── decisions/                     ← service-level ADRs
  └── domain/                        ← domain knowledge specific to this service
```

A single system repo (could be `infra`, `platform`, or a standalone `<project>-system`) holds:

```
system/docs/
  ├── domain/               ← system-wide domain knowledge (shared across services)
  ├── plans/                ← roadmaps, epics that span services
  ├── decisions/            ← system-level ADRs (API contracts, auth patterns, shared protocols)
  ├── features/             ← cross-cutting features (e.g., SSO, rate limiting)
  └── ops/                  ← human-owned operational docs
```

PAI-Orbit config in each service's `.claude/pai-orbit-config.md` gains a pointer:

```markdown
## Docs
local_docs_root: ./docs
system_docs_repo: ../project-system        # relative path or git URL
system_docs_path: ./docs
```

**Tradeoffs:**
- `+` Service docs stay co-located with service code — PRs are self-contained for service-level work
- `+` Cross-cutting concerns have a designated home all teams know about
- `+` `/plan` and `/domain` sessions run in the system repo and see the whole picture
- `+` `cross-repo-impact` agent (already in PAI-Orbit) is positioned to traverse this boundary
- `–` Engineers must decide "is this service-level or cross-cutting?" — requires a clear convention
- `–` `/setup` and `pai-orbit-config.md` need updates to declare the system repo pointer
- `–` Two repos to clone for full context locally

---

## Recommendation

**Option C — Hybrid.**

The hybrid boundary maps directly to the two types of context Claude already distinguishes: the service's CLAUDE.md (local) and system-wide domain knowledge (global). Distributing docs (Option A) loses the system view; centralizing (Option B) breaks the co-location discipline that keeps docs honest.

The `cross-repo-impact` agent already handles read-only cross-repo traversal — it is the natural tool for `/analysis` to use when checking blast radius across services.

---

## Required PAI-Orbit Changes

| Area | Change |
|------|--------|
| `pai-orbit-config.md` template | Add `## Docs` section with `local_docs_root` and optional `system_docs_repo` / `system_docs_path` |
| `/setup` skill | Ask during setup: "Is this a multi-repo project? Which repo holds system-level docs?" — write the pointer |
| `/plan` and `/domain` command definitions | When `system_docs_repo` is set, read from that path in addition to local `docs/` |
| `/build` command | After shipping, determine whether the doc update is local or system-level and write accordingly |
| `process-and-practices.md` | Add convention section: what goes in the service repo vs the system repo |

---

## Next Steps

- `/groom` — formalize requirements for the config and setup changes
- `/design` — design the exact schema for `pai-orbit-config.md` changes and command modifications
