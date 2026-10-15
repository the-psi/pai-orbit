---
status: accepted
date: 2026-10-05
deciders: [upneet01]
scope: system
supersedes: ""
superseded-by: ""
---

# ADR: Check related open stories before ticketed work

## Context

An open ticket can become stale while a developer is grooming, designing, implementing, or testing
it. A newer or older open story may change the same behavior without linking itself to the ticket
already in hand. Matching only linked tickets, recent stories, or similar titles misses requirement
changes such as an upload limit moving from 10 MB to 25 MB. Continuing against the old ticket can
leave its acceptance criteria and downstream artifacts inconsistent with the current request.

Issue [#69](https://github.com/the-psi/pai-orbit/issues/69) adds a related-open-story check before
creating stories and before starting or resuming ticketed work in Groom, Design, Build, and Test.

## Decision

In the context of **creating a story or starting/resuming work on an open ticket**,
facing **related requirement changes that may not be linked to the ticket in hand**,
we decided **to scan the configured board's open stories, compare their actual behavior, constraints,
values, and acceptance criteria, and report plausible matches with evidence and confidence; the
developer classifies the relationship and chooses the disposition**,
to achieve **early detection of changed, overlapping, or duplicate requirements without silently
changing scope or ticket data**,
accepting **an extra board query and a pause for developer input when the relationship could affect
the work**.

For a confirmed requirement change, the developer identifies the canonical ticket. Orbit compares
affected acceptance criteria and proposes exact edits classified as retain, revise, remove, or add,
with rationale. It waits for approval before changing ticket content, routes the approved requirement
delta through Groom first, then continues through the relevant Design, Build, and Test work. Orbit
does not infer the relationship, edit tickets, create links/comments, close duplicates, or notify
assignees without the required developer confirmation. If the board cannot be queried, Orbit reports
that limitation and asks whether to continue without the check.

### Resumption checkpoint

Orbit keeps scan state in one stable file per configured board/project and in-hand ticket:
`<docs root>/wip/related-open-story-checkpoints/<board-key>-<ticket-id>.md`, with the docs root
resolved using `reference/docs-path-resolution.md`. The board key comes from the configured board
or project identity, and the ticket ID is its stable identifier. This lets later work find the same
checkpoint across dates and sessions. The checkpoint records the scan start and completion times in
UTC, whether it was full or incremental, and candidate IDs, URLs, statuses, and classifications or
pending decisions. It contains scan state only, not a workflow handoff; Orbit does not create a
generic `session-capture-<date>.md` for this purpose.

On resumption, Orbit always rereads the in-hand ticket and its current comments. It may use an
incremental query for open stories created or updated since the previous scan's start only when the
configured board can return a reliable, complete result. Otherwise, or when the checkpoint is absent
or does not match the board and ticket, Orbit runs the full scan. A checkpoint is an optimization,
not a source of current ticket truth.

Native changed-since query paths are available for GitHub Issues, GitLab, Linear, Jira, and Azure
DevOps. GitHub Projects v2 uses its underlying issue tracker rather than a separate project-item
changed-since query. This does not guarantee incremental scanning through every CLI or MCP
integration: Orbit uses it only when the configured integration supports the filter and can retrieve
all matching pages for the configured board/project. Otherwise it runs a full scan.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (chosen) Scan all open stories and pause for developer classification | Finds unlinked changes independent of title or age; preserves developer control over scope and ticket edits | Adds board-query time and may surface false positives that need a decision |
| Check only stories already linked to the ticket or with matching titles | Faster and produces fewer candidates | Misses precisely the unlinked or differently worded requirement changes this workflow must catch |
| Automatically update or close the older ticket when a match is found | Reduces manual steps for an obvious duplicate | The agent may choose the wrong canonical story or mistake related work for a replacement |
| Run the check only when creating a story | Catches duplicates at intake | Misses changes that arrive after Groom, Design, Build, or Test has started |

## Consequences

**Positive:**
- Developers see likely requirement changes before proceeding with stale assumptions.
- Acceptance-criteria changes are made explicit and reviewable before ticket edits.
- Confirmed changes flow through the existing modes so requirements, design, implementation, and test artifacts can stay aligned.
- Ticket relationship decisions remain with the developer.
- A stable per-board, per-ticket checkpoint avoids repeating unchanged scan results across sessions
  while remaining separate from generic mode handoffs.

**Negative / trade-offs:**
- Ticketed workflows require an additional board scan; plausible conflicts can pause work until the developer classifies them.
- Incremental scans depend on the configured board's ability to return a complete created-or-updated-since result; otherwise each resumption uses a full scan.
- An unavailable board prevents the check from completing and requires the developer to choose whether to continue.

**Neutral:**
- The check applies to open stories across the configured board or project, not only newly created or already-linked items.
- Read-only board browsing remains outside this gate.

## Related Decisions

- [2026-09-08-groom-ticket-entry-gate](2026-09-08-groom-ticket-entry-gate.md) — establishes the ticket entry gate in Groom.
- [2026-09-08-centralize-docs-path-resolution](2026-09-08-centralize-docs-path-resolution.md) — defines how feature documentation paths are resolved.
- [Issue #69](https://github.com/the-psi/pai-orbit/issues/69) — requirement changes to an in-flight ticket.
- [PR #77](https://github.com/the-psi/pai-orbit/pull/77) — implementation of the related-story gate.

## Review Date

Revisit after the first few real workflows pause on a related open story, to check whether the
candidate evidence and developer classification options are sufficient.
