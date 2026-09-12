# CLAUDE.md

Engineering contract for FoodBridge. Keep this concise — update it when architecture decisions change, not when features change.

## Purpose

FoodBridge coordinates surplus food donations between donors, NGOs, and logistics partners: create a donation, match it to an organization, schedule and track pickup/delivery.

## Architecture

- **Next.js 16 (App Router) + React 19 + TypeScript (strict)**, deployed on Vercel via pnpm.
- **Supabase**: Postgres + PostGIS + pgvector, Supabase Auth, Row Level Security as the authorization boundary.
- Modular monolith, not microservices. No ORM, no GraphQL, no Redis/Kafka, no React Query, no second vector store — do not introduce these without a concrete, demonstrated need.
- Server Components by default. Client Components (`'use client'`) only where interactivity requires them (forms, menus, live search).
- Server Actions (`'use server'`) are the only mutation path from the UI. No new API routes unless something genuinely can't be a Server Action (e.g. a webhook).

## Directory conventions

```
app/                 routes (Server Components; redirect via getAuthContext())
components/          UI (Client Components where needed; server-fetched data passed in as props)
lib/
  actions/           'use server' entry points — auth + authorize + validate + DB op + typed result
  auth/               getAuthContext() — the only way to read the current user + profile server-side
  db/                 Database type (lib/db/types.ts) — hand-maintained, mirrors the SQL migrations
  services/           pure functions and privileged helpers, no 'use server' — imported only by actions
  supabase/           client.ts (browser), server.ts (RSC/Server Action, RLS-scoped), admin.ts (service-role, server-only)
  validations/        Zod schemas, one file per domain, co-located with related schemas
supabase/migrations/  ordered, idempotent SQL migrations — the source of truth for schema and RLS
```

## Database / Supabase rules

- `lib/db/types.ts` is hand-maintained to mirror the SQL migrations. When a migration changes a table/enum/function, update this file in the same change.
- Never trust a client-supplied role. `profiles.role` (set server-side by the `handle_new_user` trigger, protected from self-escalation by `trg_protect_profile_fields`) is the only source of authorization role. Always resolve it via `getAuthContext()`, never from `user_metadata`.
- RLS is the actual authorization boundary — it must hold even if application code has a bug. Pure functions in `lib/services/*-authorization.ts` mirror RLS predicates for fail-fast UX/error messages only; they never replace RLS, and must be kept in sync if the corresponding policy changes.
- The `claim_donation()` RPC is the only path to claim a donation — it is atomic (row-locked, status-checked) and `SECURITY DEFINER`. Do not reimplement claim logic in application code, and do not weaken its locking or authorization checks.
- New migrations are additive and idempotent (`IF NOT EXISTS` / `DROP POLICY IF EXISTS` + recreate), following the existing numbered-migration style in `supabase/migrations/`.

## Supabase client rules

- `lib/supabase/client.ts` — browser client, anon key only.
- `lib/supabase/server.ts` — RSC/Server Action client, cookie-scoped, RLS applies normally. Use this for all regular reads/writes.
- `lib/supabase/admin.ts` — service-role client. **Server-only, never imported by a Client Component.** Use only when RLS has no legitimate policy for the operation by design (e.g. writing a notification for a user other than the caller, or a system-triggered write). Never use it to bypass a permission check that RLS is intentionally enforcing.
- `SUPABASE_SERVICE_ROLE_KEY` must never be prefixed `NEXT_PUBLIC_*`, never logged, never returned from a Server Action.

## Matching engine

- `generate_match_recommendations(donation_id)` (SECURITY DEFINER RPC) scores every active `ngo_requirements` row against a donation: semantic (pgvector cosine on `food_embedding`/`requirement_embedding`), geographic (PostGIS `ST_DistanceSphere`), NGO capacity, and urgency — weighted per `lib/services/match-scoring.ts` (`MATCH_WEIGHTS`, kept in sync with the SQL migration's comment by hand). It runs automatically, best-effort, right after `createDonation()`.
- Embeddings: Gemini `gemini-embedding-2` (`output_dimensionality: 768` requested to match the schema — the model defaults to 3072-dim otherwise), called via plain `fetch()` in `lib/services/embeddings.ts` — no SDK dependency. The model used here previously was deprecated and shut down 2026-01-14; do not reintroduce a deprecated embedding model. Requires `GEMINI_API_KEY` (server-only, never `NEXT_PUBLIC_*`). Embedding generation is always best-effort — a donation/requirement must remain creatable if it fails; `semantic_score` falls back to a neutral 50 when either side lacks an embedding.
- `match_recommendations` scores and `explanation` are written only by the RPC, derived only from the four computed inputs — never invent reasoning text not backed by those numbers, and never let application code write to the score columns directly (RLS + `trg_protect_match_fields` also enforce this).

## Server Action rules (`lib/actions/*`)

Every action must, in order: authenticate (`getAuthContext()`), authorize (role/ownership check, via `lib/services/*-authorization.ts` where one exists), validate input (Zod schema from `lib/validations/`), perform the DB operation, return `ActionResult<T>` (`{success:true,data}` / `{success:false,error}` from `lib/actions/shared.ts`). Never return a raw Postgres error, stack trace, or internal identifier to the client — log server-side (`console.error`), return a safe message.

## Validation

Zod schemas live in `lib/validations/`, one file per domain, reused by both the action layer and (where relevant) client-side pre-checks. Do not duplicate a schema — extend or compose the existing one (`.partial()`, `.omit()`, etc.).

## Testing

Vitest, `*.test.ts` colocated with the module under test. Test pure functions: validation schemas, `lib/services/*` authorization and view-model logic. Do not test framework glue (Server Actions calling Supabase, page components) with unit tests — that needs a real database, which isn't available in this environment; a genuine integration-test setup is a deliberate follow-up decision, not a mock-heavy substitute.

## Commands

```
pnpm dev          # local dev server
pnpm typecheck    # tsc --noEmit — must pass, ignoreBuildErrors is intentionally off
pnpm test         # vitest run
pnpm build        # production build
```

## Non-negotiables

- Do not add a dependency to make the stack "look complete." Prefer the existing tool.
- Do not rewrite working code to restructure it; extend in place unless a change genuinely requires moving files.
- No secret (service-role key, etc.) may reach client bundles, logs, or Server Action return values.
- `next.config.mjs` must not re-enable `typescript.ignoreBuildErrors` — fix the type error instead.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
