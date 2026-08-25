---
name: {{SERVICE_NAME}}-builder
description: Implementation work in the {{SERVICE_NAME}} Next.js app ({{SERVICE_PATH}}). Use for pages, components, API routes, hooks, and data fetching. Runs npm run lint (zero warnings) and npm run build before claiming completion. Does not touch other sub-repos.
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
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
