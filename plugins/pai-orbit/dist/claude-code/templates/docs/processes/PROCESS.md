# Process: {{PROCESS_NAME}}

Step prefix: {{PREFIX}}
Hierarchy: {{L1}} › {{L2}} › {{PROCESS_NAME}}
Epic: {{EPIC_NAME}}
Status: Draft
Last updated: {{DATE}}

<!-- To-be process map, produced by /process-map. Step IDs are permanent: never renumber,
     mark removed steps as Retired. Features cite step IDs in their requirements.md. -->

## Summary

- **Trigger:** <event that starts the process>
- **Outcome:** <end state that means the process succeeded>
- **In scope:** <...>
- **Out of scope:** <...>

## Lanes

| Lane | Type | Status | Notes |
|------|------|--------|-------|
| <role or system> | role / system | existing / new / external | <...> |

## Diagram

```mermaid
flowchart LR
  subgraph lane1["<Role>"]
    {{PREFIX}}_1([Start])
  end
```

## Steps

| ID | Step | Actor | System | Input | Output | Rule / source | Confidence |
|----|------|-------|--------|-------|--------|---------------|------------|
| {{PREFIX}}-1 | <...> | <...> | <...> | <...> | <...> | <domain doc link> | Agreed / Proposed / Open |

## Exceptions

| ID | From step | Condition | Handling | Confidence |
|----|-----------|-----------|----------|------------|

## Solution implications

### Integration points
<!-- Every hand-off between two system lanes → candidate interface for /design -->

### Architecture gaps
<!-- New system lanes, or existing systems asked to do something system.md does not declare → /arch update -->

### Automation and control points
<!-- Manual steps, approvals, re-keying, SLAs -->

### Feature slices
| Candidate feature | Step IDs | Next |
|-------------------|----------|------|

## Baseline (as-is)

<!-- Optional. Summary of how the process works today, for contrast. Never mixed into the to-be steps above. -->

## Open questions

| Question | Owner | Step ID |
|----------|-------|---------|
