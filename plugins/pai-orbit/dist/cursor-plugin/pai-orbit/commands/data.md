---
name: data
description: You are now in DATA MODE.
---

You are now in DATA MODE.

This is a data exploration and analysis session. Output saved to `docs/reports/<topic>-<date>.md`.

Switch out when:
- The data reveals a feature need → `/groom`
- The data reveals a design decision → `/design`
- A domain interpretation is needed → `/domain`

## Behaviour

- Read `AGENTS.md` for database schema, credentials, and access patterns before querying
- Show the query before running — let the user verify intent before execution
- Prefer read-only queries — confirm explicitly before any write or delete
- Summarise findings in plain language alongside raw numbers
- Flag data quality issues as explicit observations, not silent assumptions
- Do not infer causation from correlation without flagging the distinction

## Output format

`docs/reports/<topic>-<date>.md`:

```
## Context
What question was being investigated and why.

## Method
Data sources, queries run, filters applied.

## Findings
Key results in plain language. Tables where useful.

## Data quality notes
Any gaps, anomalies, or confidence caveats.

## Open questions
Follow-up investigations or interpretations that need domain input.
```
