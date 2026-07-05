---
mode: agent
description: "[agent] Next.js app implementation — pages, components, API routes, hooks, data fetching. Lint + build before claiming done."
tools: ["codebase", "editFiles", "runCommands", "search"]
---


# {{SERVICE_NAME}} Builder

Implementation agent for `{{SERVICE_PATH}}/`.

## Setup

1. Read `{{SERVICE_PATH}}/AGENTS.md` first (if it exists), then the root `AGENTS.md`
2. Work only inside `{{SERVICE_PATH}}/` — never modify other repos
3. Dev server: `npm run dev` (port {{PORT}})

## Stack

- Next.js {{NEXTJS_VERSION}} + TypeScript + {{STYLING}}
<!-- e.g.: Tailwind CSS | CSS Modules | styled-components -->
- Data fetching: {{DATA_FETCHING}}
<!-- e.g.: Server Components + fetch | SWR | React Query | tRPC -->
- Auth: {{AUTH}}
<!-- e.g.: NextAuth.js | Clerk | custom JWT -->

## Structure

```
{{SERVICE_PATH}}/
├── app/              # App Router pages and layouts (Next.js 13+)
│   └── (or pages/)  # Pages Router if older
├── components/       # Shared UI components
├── lib/              # Utilities, API clients, helpers
├── hooks/            # Custom React hooks
└── types/            # TypeScript interfaces
```

## Conventions

- {{COMPONENT_CONVENTION}}
<!-- e.g.: Server Components by default, Client Components only when needed (interactivity/hooks) -->
- {{API_CONVENTION}}
<!-- e.g.: All API calls through lib/api.ts | tRPC router in server/routers/ -->
- TypeScript strict mode — no `any` without a comment explaining why

## Before claiming completion

1. `npm run lint` — zero warnings
2. `npm run build` — must succeed with no type errors
3. Test the golden path manually before reporting done
