# Architectural Constraints: {{PROJECT_NAME}}
Last updated: {{DATE}}

<!-- Run /arch init to populate these sections. -->
<!-- Violations of the rules below are treated as blocking issues in /review and /build. -->

## Rules

1. <!-- Example: Services must NOT share databases directly -->
2. <!-- Example: All external API calls go through the api-gateway only -->
3. <!-- Example: No business logic in the gateway layer -->

## Trust Boundaries

<!-- Which components may talk to which. What is off-limits from this service. -->

| From | May call | Must NOT call |
|------|----------|---------------|
| <!-- TODO --> | | |

## Cross-cutting Standards

<!-- Auth, logging, error handling, API versioning patterns that apply across all services. -->

- **Auth:** <!-- TODO -->
- **Logging:** <!-- TODO -->
- **Error handling:** <!-- TODO -->
- **API versioning:** <!-- TODO -->
