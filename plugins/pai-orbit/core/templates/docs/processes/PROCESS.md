# Process: {{PROCESS_NAME}}

Spec: [specs/{{SLUG}}.json](specs/{{SLUG}}.json)
Last updated: {{DATE}}

<!-- To-be process map, produced by /process-map. The JSON spec is the source of truth:
     edit it, then run `python3 _render/swimlane.py build specs/{{SLUG}}.json`.
     Everything between the generated markers below is rewritten on every build. -->

## Summary

- **Trigger:** <event that starts the process>
- **Outcome:** <end state that means the process succeeded>
- **In scope:** <...>
- **Out of scope:** <...>

## Diagram

<!-- process-map:generated:start — do not edit by hand; run _render/swimlane.py build -->
<!-- process-map:generated:end -->

## Solution implications

### Integration points
<!-- Every hand-off between two system lanes → candidate interface for /design. Cite step IDs. -->

### Architecture gaps
<!-- New system lanes, or existing systems asked to do something system.md does not declare → /arch update -->

### Automation and control points
<!-- Manual steps, approvals, re-keying, SLAs -->

### Feature slices
| Candidate feature | Step IDs | Next |
|-------------------|----------|------|

## Baseline (as-is)

<!-- Optional. How the process works today, for contrast. Never mixed into the to-be spec. -->

## Open questions

| ID | Question | Owner | Step IDs |
|----|----------|-------|----------|
