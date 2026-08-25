---
mode: agent
description: "[agent] React/Vite app implementation — components, pages, hooks, API consumers. Lint + build before claiming done."
tools: ["codebase", "editFiles", "runCommands", "search"]
---

> **Generic template — resolved at runtime.** The `{{SERVICE_NAME}}`, `{{SERVICE_PATH}}`, `{{LANGUAGE}}`, `{{FRAMEWORK}}`, and other `{{PLACEHOLDER}}` markers below are NOT substituted at install time. Copilot's agent runtime resolves them per invocation by reading `AGENTS.md` and detecting the target service context (in a monorepo: the service whose folder contains the files currently being edited).
>
> Do not hand-fill the markers — they are substitution points, not blanks to complete. If Copilot cannot resolve a marker (ambiguous service context in a monorepo, missing `AGENTS.md` service table, unclear stack), it will ask you to disambiguate before proceeding.


# {{SERVICE_NAME}} Builder

Implementation agent for `{{SERVICE_PATH}}/`.

## Setup

1. Read `{{SERVICE_PATH}}/AGENTS.md` first (if it exists), then the root `AGENTS.md`
2. Work only inside `{{SERVICE_PATH}}/` — never modify other repos
3. Dev server: `npm run dev` (port {{PORT}})

## Stack

- React {{REACT_VERSION}} + TypeScript + Vite
- Styling: {{STYLING}}
<!-- e.g.: Tailwind CSS | CSS Modules | styled-components -->
- State: {{STATE}}
<!-- e.g.: React Query + Context | Zustand | Redux Toolkit -->
- API: {{API_PATTERN}}
<!-- e.g.: lib/api.ts with fetch wrappers | axios instance in lib/http.ts -->

## Structure

```
{{SERVICE_PATH}}/src/
├── components/       # Shared UI components
├── pages/ or views/  # Route-level components
├── hooks/            # Custom React hooks
├── lib/              # API clients, utilities
├── contexts/         # React context providers
└── types/            # TypeScript interfaces (api.ts for API response types)
```

## Conventions

- API response types in `src/types/api.ts` — keep in sync with backend
- No Redux or global state for server data — use React Query or SWR
- {{I18N_CONVENTION}}
<!-- e.g.: All UI strings in public/locales/en/ | react-i18next | hardcoded (note if so) -->
- {{ADDITIONAL_CONVENTIONS}}

## Before claiming completion

1. `npm run lint` — zero warnings
2. `npm run build` — must succeed with no type errors
3. Test the golden path in the browser before reporting done
