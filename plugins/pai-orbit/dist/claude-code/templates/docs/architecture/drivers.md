# Architecture Drivers: {{PROJECT_NAME}}
Last updated: {{DATE}}
Status: draft

<!-- Written by /arch define. The forces every architectural choice must trace back to.
     /design reads the quality scenarios; /arch validate checks the fitness functions they imply. -->

## Business goals

| ID | Goal | Measure of success | Horizon |
|----|------|--------------------|---------|
| BG-1 | <!-- e.g. onboard a new partner without engineering work --> | <!-- e.g. < 1 day, config only --> | <!-- e.g. 12 months --> |

## Quality-attribute scenarios

<!-- Measurable, not adjectives. "Fast" is not a scenario; "p95 checkout < 300 ms at 500 rps" is.
     Priority: H / M / L. Rank — the top three drive the style choice. -->

| ID | Attribute | Scenario (source → stimulus → environment → response) | Measure | Priority | Rank |
|----|-----------|--------------------------------------------------------|---------|----------|------|
| QA-1 | <!-- performance --> | <!-- 500 shoppers submit checkout at peak → order confirmed --> | <!-- p95 < 300 ms --> | H | 1 |

## Constraints

<!-- Givens that are not up for decision. -->

| ID | Type | Constraint | Source |
|----|------|-----------|--------|
| C-1 | <!-- technical / organisational / regulatory / commercial --> | <!-- e.g. data must stay in the EU --> | <!-- e.g. GDPR, client contract --> |

## Team and operations

- **Teams and size:** <!-- e.g. 2 teams, 9 engineers -->
- **Distributed-systems experience:** <!-- none / some / production -->
- **Operations capability:** <!-- e.g. managed PaaS only, no on-call yet -->
- **Delivery timeline:** <!-- e.g. MVP in 4 months -->

## Assumptions

| ID | Assumption | Validate by | Owner |
|----|-----------|-------------|-------|

## Risks

<!-- Riskiest architectural bets, and the thin end-to-end slice (walking skeleton) that tests them earliest. -->

| ID | Risk | Affected drivers | Mitigation / spike | Owner |
|----|------|------------------|--------------------|-------|
