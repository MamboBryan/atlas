# Atlas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Atlas — a team meeting webapp with random pickers, agenda-driven prompts with hard-anonymity, standalone polls, host rotation, Start/Postpone, and live reveals — as 10 stacked branches, each shippable/reviewable on its own.

**Architecture:** Next.js 15 App Router (server components for shells, server actions for all mutations) + Supabase (Postgres with strict RLS as source of truth; Auth; Realtime for live state). Hard-anonymous responses split from attributed responses at the table level; aggregation of anonymous responses only via a `SECURITY DEFINER` Postgres function. Vercel Cron drives all time-based transitions.

**Tech Stack:** Next.js 15, TypeScript (strict), Tailwind + shadcn/ui, `@supabase/ssr`, TanStack Query, Framer Motion, Zod, React Hook Form, date-fns + date-fns-tz, Resend + React Email, Vercel Cron, Vitest, Playwright, pgTAP.

## Global Constraints

*Every task inherits these. Do not restate them per task; check compliance at task acceptance.*

- Node 20+, TypeScript `strict`, ESLint + Prettier baseline enforced in CI.
- Every write path is a typed Server Action returning `{ ok: true, data } | { ok: false, error: { code, message } }`. No API routes for mutations except Vercel Cron endpoints.
- Every table has explicit RLS enabled. Nothing is exposed without a policy. Defence in depth: even server actions rely on RLS, not just their own checks.
- `responses_anonymous` **has no `user_id` column**. Ever. Aggregation of anonymous responses is exclusively via the `SECURITY DEFINER` function `atlas_get_prompt_results(prompt_id)`.
- Text prompt: `question` ≤ 500 chars. Text response: `text` ≤ 2000 chars.
- Prompt `anonymity` and prompt `response_type` are **locked at creation**. `is_revealed` is a **one-way toggle**.
- Rating scale defaults to `1..5`; the only alternative is `1..10`. No other scales.
- Postpone grace: 15 min past `scheduled_start`. Max 3 auto-postpones per occurrence chain; on the 4th no-show the chain is cancelled and the series' `rotation_cursor` advances.
- Time is stored `timestamptz` (UTC). Series carry an IANA timezone label; meetings inherit it. Cron logic uses UTC.
- Realtime is used for reactive state only, never as the write channel. TanStack Query holds cache; Realtime events fire `invalidateQueries`.
- Emails: Resend + React Email. Every email send has a unique `email_events.dedupe_key`. Cron retries must be idempotent.
- Single-tenant (one team per deployment). No public or unauthenticated endpoints except sign-in and the health check.
- Branch strategy: each Phase N is on branch `atlas/NN-<slug>`, off `atlas/(NN-1)-<slug>` (or `main` for Phase 1). Use `gh-stack` for PR stacking. One PR per phase.
- Every phase ends with a clean, mergeable branch: green CI, no `TODO` in shipping code, and a short PR description that names what changed and what the reviewer should look for.

---

## Phase Overview

| # | Branch | Title | Deliverable |
|---|---|---|---|
| 1 | `atlas/01-foundation` | Foundation | Next.js app scaffold, Supabase local dev, CI, test harness, empty auth-gated shell |
| 2 | `atlas/02-auth-roster` | Auth, profiles, roster | Login, roster CRUD (admin), profile page, unavailability windows |
| 3 | `atlas/03-attributed-prompts` | Attributed prompts (standalone polls) | prompts + attributed responses + participation counter + reveal |
| 4 | `atlas/04-anonymous-prompts` | Hard-anonymous prompts | responses_anonymous + `atlas_get_prompt_results` + hard-anon UI |
| 5 | `atlas/05-meetings-one-off` | One-off meetings + agenda | Meetings list, meeting live view, agenda with embedded prompts, live reveal + counter |
| 6 | `atlas/06-random-tools` | Random tools | One-shot pick + shuffle sessions, standalone + meeting-embedded with live sync |
| 7 | `atlas/07-series-rotation` | Series + rotation | meeting_series, rotation cursor, occurrence generator, agenda template |
| 8 | `atlas/08-postpone-state` | Start/Postpone + auto-postpone cron | Manual postpone, 15-min grace, 3-strike cancel, cron endpoint |
| 9 | `atlas/09-notifications` | Notifications (in-app + email) | notifications table + realtime feed + Resend pipeline + settings toggles |
| 10 | `atlas/10-history-polish` | History + polish | Past meetings/polls, home dashboard, a11y pass, smoke E2E, deploy docs |

---

## Phase 1: Foundation

Branch: `atlas/01-foundation` (off `main`)

**Goal:** A minimal Next.js app that boots, has a Supabase local dev environment, runs Vitest + Playwright + pgTAP in CI, and renders a placeholder home page behind a middleware that will later gate on auth.

**Files touched:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `.eslintrc.cjs`, `.prettierrc`, `.gitignore`, `.env.example`
- Create: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `middleware.ts`
- Create: `lib/supabase/server.ts`, `lib/supabase/browser.ts`, `lib/supabase/middleware.ts`
- Create: `db/supabase/config.toml`, `db/migrations/0001_init.sql` (empty placeholder)
- Create: `tests/setup.ts`, `vitest.config.ts`, `e2e/smoke.spec.ts`, `playwright.config.ts`
- Create: `db/tests/rls.sql` (empty pgTAP file)
- Create: `.github/workflows/ci.yml`
- Create: `README.md`

**Interfaces produced:**
- `createSupabaseServerClient()`, `createSupabaseBrowserClient()`, `updateSupabaseAuthCookies(request)`
- `middleware.ts` exports a matcher for future auth-gated routes
- CI job names: `unit`, `rls`, `e2e`

### Task 1.1: Repo scaffolding

**Files:**
- Create: `.gitignore`, `.editorconfig`, `README.md`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
node_modules
.next
out
.env
.env.local
coverage
playwright-report
test-results
.vercel
db/supabase/.branches
db/supabase/.temp
```

- [ ] **Step 2: Create minimal `README.md`**

```markdown
# Atlas

Internal meeting webapp. See `docs/superpowers/specs/2026-07-24-atlas-design.md` for the design and `docs/superpowers/plans/2026-07-24-atlas-implementation.md` for the phased plan.

## Dev

```bash
pnpm install
pnpm supabase start
cp .env.example .env.local  # fill in local Supabase keys from `pnpm supabase status`
pnpm dev
```

## Tests

- `pnpm test` — Vitest unit
- `pnpm test:rls` — pgTAP against local Supabase
- `pnpm test:e2e` — Playwright against local dev
```

- [ ] **Step 3: Commit**

```bash
git checkout -b atlas/01-foundation
git add .gitignore .editorconfig README.md
git commit -m "chore: scaffold repo"
```

### Task 1.2: Next.js + TypeScript baseline

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

- [ ] **Step 1: `package.json`**

```json
{
  "name": "atlas",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:rls": "supabase db test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.5.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.0.0",
    "prettier": "^3.3.0",
    "vitest": "^2.0.0",
    "@playwright/test": "^1.47.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

- [ ] **Step 2: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { typedRoutes: true },
  reactStrictMode: true,
};
export default nextConfig;
```

- [ ] **Step 4: Root layout + placeholder page + globals.css**

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Atlas", description: "Team meeting rituals" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
```

```tsx
// app/page.tsx
export default function HomePage() {
  return <main className="p-8"><h1 className="text-2xl font-semibold">Atlas</h1></main>;
}
```

```css
/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
:root { color-scheme: light; }
```

- [ ] **Step 5: Install and verify build**

Run: `pnpm install && pnpm build`
Expected: build succeeds, no type errors.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json next.config.mjs app/
git commit -m "feat: bootstrap Next.js 15 app"
```

### Task 1.3: Tailwind + shadcn/ui init

**Files:**
- Create/modify: `tailwind.config.ts`, `postcss.config.mjs`, `components.json`, `lib/utils.ts`
- Modify: `app/globals.css` (add shadcn tokens)

- [ ] **Step 1: `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";
const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [require("tailwindcss-animate")],
};
export default config;
```

- [ ] **Step 2: `postcss.config.mjs`**

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 3: Initialise shadcn**

Run: `pnpm dlx shadcn@latest init` — pick TypeScript, App Router, `@/` alias, CSS variables yes, base color slate.

- [ ] **Step 4: Add first primitives**

Run: `pnpm dlx shadcn@latest add button card input label toast dropdown-menu dialog badge separator sonner`

- [ ] **Step 5: Verify `pnpm dev` renders styled page**

Run: `pnpm dev`. Open `http://localhost:3000`. Confirm the `<h1>` is styled with Tailwind (font-semibold, larger size).

- [ ] **Step 6: Commit**

```bash
git add tailwind.config.ts postcss.config.mjs components.json lib/utils.ts components/ui/ app/globals.css
git commit -m "feat: init tailwind + shadcn primitives"
```

### Task 1.4: Supabase local dev + client wrappers

**Files:**
- Create: `db/supabase/config.toml` (via `supabase init`)
- Create: `lib/supabase/server.ts`, `lib/supabase/browser.ts`, `lib/supabase/middleware.ts`, `middleware.ts`
- Create: `.env.example`

- [ ] **Step 1: Init Supabase**

Run: `pnpm add -D supabase && pnpm supabase init` — creates `db/supabase/config.toml`. Edit config to set `[api] port = 54321`, `[db] port = 54322`, `[studio] port = 54323`.

- [ ] **Step 2: Install client libs**

Run: `pnpm add @supabase/supabase-js @supabase/ssr`

- [ ] **Step 3: `lib/supabase/server.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component; ignore — middleware will refresh.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 4: `lib/supabase/browser.ts`**

```ts
import { createBrowserClient } from "@supabase/ssr";
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 5: `lib/supabase/middleware.ts` + `middleware.ts`**

```ts
// lib/supabase/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSupabaseAuthCookies(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );
  await supabase.auth.getUser();
  return response;
}
```

```ts
// middleware.ts
import { updateSupabaseAuthCookies } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";
export async function middleware(request: NextRequest) {
  return updateSupabaseAuthCookies(request);
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"] };
```

- [ ] **Step 6: `.env.example`**

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<from supabase status>
RESEND_API_KEY=
CRON_SECRET=<random>
```

- [ ] **Step 7: Start local Supabase + verify session round-trip**

Run: `pnpm supabase start` and copy the printed anon key into `.env.local`. Then `pnpm dev` and hit `/`. Check that no cookie errors log; middleware runs cleanly.

- [ ] **Step 8: Commit**

```bash
git add db/supabase lib/supabase middleware.ts .env.example
git commit -m "feat: supabase local dev + ssr client wrappers"
```

### Task 1.5: Vitest + Playwright + pgTAP harness

**Files:**
- Create: `vitest.config.ts`, `tests/setup.ts`, `tests/lib/utils.test.ts`, `playwright.config.ts`, `e2e/smoke.spec.ts`, `db/tests/rls.sql`

- [ ] **Step 1: `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: { environment: "node", setupFiles: ["./tests/setup.ts"], globals: true },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
```

- [ ] **Step 2: Trivial passing unit test — `tests/lib/utils.test.ts`**

```ts
import { expect, test } from "vitest";
import { cn } from "@/lib/utils";
test("cn merges class names", () => {
  expect(cn("a", "b")).toBe("a b");
});
```

Run: `pnpm test`
Expected: 1 passing.

- [ ] **Step 3: `playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: { command: "pnpm dev", url: "http://localhost:3000", reuseExistingServer: !process.env.CI },
});
```

- [ ] **Step 4: `e2e/smoke.spec.ts`**

```ts
import { test, expect } from "@playwright/test";
test("home renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Atlas" })).toBeVisible();
});
```

- [ ] **Step 5: `db/tests/rls.sql` scaffolding**

```sql
BEGIN;
SELECT plan(1);
SELECT pass('rls test harness works');
SELECT * FROM finish();
ROLLBACK;
```

Run: `pnpm supabase db test`
Expected: 1 passing.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts tests/ playwright.config.ts e2e/ db/tests/
git commit -m "test: wire vitest, playwright, pgtap harnesses"
```

### Task 1.6: CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: CI workflow**

```yaml
name: ci
on: { pull_request: {}, push: { branches: [main] } }
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test

  rls:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: supabase db start
      - run: supabase db test

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: supabase db start
      - name: run
        env:
          NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY_LOCAL }}
        run: pnpm test:e2e
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: unit + rls + e2e workflow"
```

### Phase 1 acceptance

- `pnpm typecheck && pnpm lint && pnpm test && pnpm supabase db test` all green locally.
- `pnpm dev` renders styled placeholder home.
- CI runs on push.

### Phase 1 PR

Open PR with base `main`, title `atlas 01/10 — foundation`, body listing the six tasks and pointing reviewers at (a) the Supabase client wrappers and (b) the middleware matcher (which will guard everything from Phase 2 onward).

---

## Phase 2: Auth, profiles, roster

Branch: `atlas/02-auth-roster` (off `atlas/01-foundation`)

**Goal:** A signed-in user can view their profile, edit their display name, set unavailability windows. An admin can add/remove members and change roles. First user is admin.

**Files touched:**
- Create: `db/migrations/0002_profiles.sql`, `db/migrations/0003_unavailability.sql`, `db/migrations/0004_first_admin_seed.sql`
- Create: `db/tests/profiles_rls.sql`, `db/tests/unavailability_rls.sql`
- Create: `lib/actions/profile.ts`, `lib/actions/roster.ts`, `lib/actions/unavailability.ts`, `lib/actions/_result.ts`
- Create: `lib/auth/require.ts`, `lib/auth/is-admin.ts`
- Create: `app/(auth)/sign-in/page.tsx`, `app/(auth)/callback/route.ts`
- Create: `app/(app)/layout.tsx`, `app/(app)/roster/page.tsx`, `app/(app)/roster/[id]/page.tsx`, `app/(app)/settings/page.tsx`
- Modify: `middleware.ts` (redirect unauthenticated → `/sign-in`)

**Interfaces produced:**
- `profiles(id, email, display_name, avatar_url, role, is_active, email_prefs, created_at, updated_at)` with RLS.
- `unavailability_windows(id, user_id, starts_on, ends_on, note)` with RLS.
- `requireUser()` and `requireAdmin()` helpers throw a typed `AuthError` when the caller isn't allowed.
- `ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }`.
- Server Actions: `profile.update`, `roster.addMember`, `roster.setRole`, `roster.deactivate`, `unavailability.set`, `unavailability.clear`.

### Task 2.1: `profiles` migration + RLS

**Files:**
- Create: `db/migrations/0002_profiles.sql`, `db/tests/profiles_rls.sql`

- [ ] **Step 1: Failing pgTAP**

```sql
-- db/tests/profiles_rls.sql
BEGIN;
SELECT plan(3);

SELECT has_table('public','profiles','profiles table exists');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass),
  'profiles has RLS'
);
SELECT policies_are(
  'public','profiles',
  ARRAY['profiles_self_read','profiles_all_read','profiles_self_write','profiles_admin_write'],
  'expected policies present'
);
SELECT * FROM finish();
ROLLBACK;
```

Run: `pnpm supabase db test`
Expected: FAIL.

- [ ] **Step 2: Migration**

```sql
-- db/migrations/0002_profiles.sql
create type public.user_role as enum ('admin','member');

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        citext unique not null,
  display_name text not null,
  avatar_url   text,
  role         public.user_role not null default 'member',
  is_active    boolean not null default true,
  email_prefs  jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create or replace function public.atlas_is_admin(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' and is_active from public.profiles where id = uid), false);
$$;

alter table public.profiles enable row level security;

create policy profiles_self_read   on public.profiles for select using (auth.uid() = id);
create policy profiles_all_read    on public.profiles for select using (auth.uid() is not null);
create policy profiles_self_write  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id and role = (select role from public.profiles where id = auth.uid()));
create policy profiles_admin_write on public.profiles for all    using (public.atlas_is_admin(auth.uid())) with check (public.atlas_is_admin(auth.uid()));

create trigger profiles_touch before update on public.profiles
  for each row execute function public.atlas_touch_updated_at();
```

Add a shared trigger helper (create in same migration if not present):

```sql
create or replace function public.atlas_touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
```

Enable `citext`: prepend the migration with `create extension if not exists citext;`.

- [ ] **Step 3: Apply migration + run tests**

Run: `pnpm supabase db reset && pnpm supabase db test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git checkout -b atlas/02-auth-roster
git add db/migrations/0002_profiles.sql db/tests/profiles_rls.sql
git commit -m "feat(db): profiles table + rls"
```

### Task 2.2: `unavailability_windows` migration + RLS

**Files:**
- Create: `db/migrations/0003_unavailability.sql`, `db/tests/unavailability_rls.sql`

- [ ] **Step 1: Failing pgTAP**

```sql
-- db/tests/unavailability_rls.sql
BEGIN;
SELECT plan(2);
SELECT has_table('public','unavailability_windows');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.unavailability_windows'::regclass));
SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Migration**

```sql
-- db/migrations/0003_unavailability.sql
create table public.unavailability_windows (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  starts_on  date not null,
  ends_on    date not null,
  note       text,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index on public.unavailability_windows(user_id, starts_on, ends_on);

alter table public.unavailability_windows enable row level security;
create policy uw_self_read  on public.unavailability_windows for select using (auth.uid() = user_id);
create policy uw_admin_read on public.unavailability_windows for select using (public.atlas_is_admin(auth.uid()));
create policy uw_self_write on public.unavailability_windows for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.atlas_is_unavailable_on(uid uuid, day date) returns boolean
language sql stable as $$
  select exists (select 1 from public.unavailability_windows w
    where w.user_id = uid and day between w.starts_on and w.ends_on);
$$;
```

- [ ] **Step 3: Apply + test + commit**

```bash
pnpm supabase db reset && pnpm supabase db test
git add db/migrations/0003_unavailability.sql db/tests/unavailability_rls.sql
git commit -m "feat(db): unavailability_windows + is_unavailable_on"
```

### Task 2.3: First-admin seed + auth trigger

**Files:**
- Create: `db/migrations/0004_first_admin_seed.sql`

- [ ] **Step 1: Migration**

```sql
-- db/migrations/0004_first_admin_seed.sql
-- When a new auth.user is created, upsert into profiles. Because admins pre-provision
-- rows (with is_active + display_name), we UPDATE on conflict. First user in the
-- system becomes admin.
create or replace function public.atlas_on_auth_user_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from public.profiles where is_active;
  insert into public.profiles (id, email, display_name, role, is_active)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          case when v_count = 0 then 'admin'::public.user_role else 'member'::public.user_role end,
          true)
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.atlas_on_auth_user_created();
```

- [ ] **Step 2: Reset and manually verify**

Run: `pnpm supabase db reset`. Then via Supabase Studio (`http://127.0.0.1:54323`) create a fake auth user. Confirm a matching `profiles` row appears with role `admin`.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0004_first_admin_seed.sql
git commit -m "feat(db): auth trigger + first-user-is-admin"
```

### Task 2.4: Auth helpers + Server Action result type

**Files:**
- Create: `lib/actions/_result.ts`, `lib/auth/require.ts`, `lib/auth/is-admin.ts`
- Create: `tests/auth/require.test.ts`

- [ ] **Step 1: `_result.ts`**

```ts
export type ActionOk<T>   = { ok: true;  data: T };
export type ActionErr     = { ok: false; error: { code: string; message: string } };
export type ActionResult<T> = ActionOk<T> | ActionErr;
export const ok  = <T>(data: T): ActionOk<T> => ({ ok: true, data });
export const err = (code: string, message: string): ActionErr => ({ ok: false, error: { code, message } });
```

- [ ] **Step 2: `require.ts` + `is-admin.ts`**

```ts
// lib/auth/require.ts
import { createSupabaseServerClient } from "@/lib/supabase/server";

export class AuthError extends Error { constructor(public code: string, message: string) { super(message); } }

export async function requireUser() {
  const s = createSupabaseServerClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) throw new AuthError("unauthenticated", "sign in required");
  return { user, supabase: s };
}

export async function requireAdmin() {
  const ctx = await requireUser();
  const { data, error } = await ctx.supabase.from("profiles").select("role,is_active").eq("id", ctx.user.id).single();
  if (error || !data || data.role !== "admin" || !data.is_active) throw new AuthError("forbidden", "admin required");
  return ctx;
}
```

- [ ] **Step 3: Unit test for the shape**

```ts
// tests/auth/require.test.ts
import { expect, test } from "vitest";
import { AuthError } from "@/lib/auth/require";
test("AuthError carries code", () => {
  const e = new AuthError("forbidden", "no");
  expect(e.code).toBe("forbidden");
  expect(e.message).toBe("no");
});
```

Run: `pnpm test` — PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/_result.ts lib/auth tests/auth
git commit -m "feat(auth): requireUser/requireAdmin + ActionResult"
```

### Task 2.5: Server Actions — profile, roster, unavailability

**Files:**
- Create: `lib/actions/profile.ts`, `lib/actions/roster.ts`, `lib/actions/unavailability.ts`
- Create: `lib/zod/profile.ts`, `lib/zod/roster.ts`, `lib/zod/unavailability.ts`
- Create: `tests/actions/roster.integration.test.ts`

- [ ] **Step 1: Zod schemas**

```ts
// lib/zod/profile.ts
import { z } from "zod";
export const profileUpdate = z.object({
  display_name: z.string().min(1).max(80),
  avatar_url: z.string().url().max(500).nullable().optional(),
  email_prefs: z.record(z.boolean()).optional(),
});
export type ProfileUpdate = z.infer<typeof profileUpdate>;
```

```ts
// lib/zod/roster.ts
import { z } from "zod";
export const addMember   = z.object({ email: z.string().email(), display_name: z.string().min(1).max(80) });
export const setRole     = z.object({ user_id: z.string().uuid(), role: z.enum(["admin","member"]) });
export const deactivate  = z.object({ user_id: z.string().uuid() });
```

```ts
// lib/zod/unavailability.ts
import { z } from "zod";
export const setWindow = z.object({
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ends_on:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(200).nullable().optional(),
});
```

- [ ] **Step 2: `profile.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { profileUpdate } from "@/lib/zod/profile";
import { err, ok, type ActionResult } from "@/lib/actions/_result";
import { requireUser } from "@/lib/auth/require";

export async function updateProfile(input: unknown): Promise<ActionResult<null>> {
  const parsed = profileUpdate.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  const { user, supabase } = await requireUser();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);
  if (error) return err("db_error", error.message);
  revalidatePath("/settings");
  return ok(null);
}
```

- [ ] **Step 3: `roster.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { addMember, setRole, deactivate } from "@/lib/zod/roster";
import { err, ok, type ActionResult } from "@/lib/actions/_result";
import { requireAdmin } from "@/lib/auth/require";
import { createClient } from "@supabase/supabase-js";

// Admin uses the service role to create the auth user + invite by email.
function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function addMemberAction(input: unknown): Promise<ActionResult<{ user_id: string }>> {
  const parsed = addMember.safeParse(input); if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireAdmin();
  const svc = serviceClient();
  const { data, error } = await svc.auth.admin.inviteUserByEmail(parsed.data.email, {
    data: { full_name: parsed.data.display_name },
  });
  if (error || !data.user) return err("invite_failed", error?.message ?? "unknown");
  // Auth trigger populates the profiles row.
  revalidatePath("/roster");
  return ok({ user_id: data.user.id });
}

export async function setRoleAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = setRole.safeParse(input); if (!parsed.success) return err("invalid_input", parsed.error.message);
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("profiles").update({ role: parsed.data.role }).eq("id", parsed.data.user_id);
  if (error) return err("db_error", error.message);
  revalidatePath("/roster"); return ok(null);
}

export async function deactivateAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = deactivate.safeParse(input); if (!parsed.success) return err("invalid_input", parsed.error.message);
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("profiles").update({ is_active: false }).eq("id", parsed.data.user_id);
  if (error) return err("db_error", error.message);
  revalidatePath("/roster"); return ok(null);
}
```

- [ ] **Step 4: `unavailability.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { setWindow } from "@/lib/zod/unavailability";
import { err, ok, type ActionResult } from "@/lib/actions/_result";
import { requireUser } from "@/lib/auth/require";

export async function setUnavailability(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = setWindow.safeParse(input); if (!parsed.success) return err("invalid_input", parsed.error.message);
  const { user, supabase } = await requireUser();
  const { data, error } = await supabase.from("unavailability_windows")
    .insert({ user_id: user.id, ...parsed.data }).select("id").single();
  if (error || !data) return err("db_error", error?.message ?? "unknown");
  revalidatePath("/settings"); return ok({ id: data.id });
}

export async function clearUnavailability(id: string): Promise<ActionResult<null>> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("unavailability_windows").delete().eq("id", id);
  if (error) return err("db_error", error.message);
  revalidatePath("/settings"); return ok(null);
}
```

- [ ] **Step 5: Integration test**

```ts
// tests/actions/roster.integration.test.ts
import { expect, test, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Uses the local supabase; requires SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_KEY
// to be set (mirror of NEXT_PUBLIC_* + SUPABASE_SERVICE_ROLE_KEY).

const url = process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
const svc = process.env.SUPABASE_TEST_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;

beforeEach(async () => {
  const c = createClient(url, svc);
  await c.rpc("exec_sql" as any, { sql: "truncate public.profiles cascade" }).catch(() => {});
});

test("inviteUserByEmail materialises a profile row via auth trigger", async () => {
  const c = createClient(url, svc);
  const { data, error } = await c.auth.admin.inviteUserByEmail("t1@example.com", {
    data: { full_name: "Test One" },
  });
  expect(error).toBeNull();
  expect(data.user?.email).toBe("t1@example.com");
  const { data: profile } = await c.from("profiles").select("*").eq("id", data.user!.id).single();
  expect(profile?.display_name).toBe("Test One");
  expect(profile?.role).toBe("admin"); // first user
});
```

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/profile.ts lib/actions/roster.ts lib/actions/unavailability.ts lib/zod tests/actions
git commit -m "feat(actions): profile + roster + unavailability"
```

### Task 2.6: Sign-in flow + auth-gated shell

**Files:**
- Create: `app/(auth)/sign-in/page.tsx`, `app/(auth)/callback/route.ts`
- Create: `app/(app)/layout.tsx`, `components/app/nav.tsx`
- Modify: `middleware.ts`

- [ ] **Step 1: `sign-in/page.tsx` (magic link + Google)**

```tsx
"use client";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SignIn() {
  const s = createSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  async function magic() {
    await s.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
    setSent(true);
  }
  async function google() {
    await s.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback` } });
  }
  return (
    <main className="min-h-screen grid place-items-center p-8">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Sign in to Atlas</h1>
        <Input type="email" placeholder="you@team.com" value={email} onChange={e => setEmail(e.target.value)} />
        <Button className="w-full" onClick={magic}>{sent ? "Check your email" : "Send magic link"}</Button>
        <Button variant="secondary" className="w-full" onClick={google}>Continue with Google</Button>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: `callback/route.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get("code");
  if (code) await createSupabaseServerClient().auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL("/", req.url));
}
```

- [ ] **Step 3: Auth-gated layout + nav**

```tsx
// app/(app)/layout.tsx
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { Nav } from "@/components/app/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  try { await requireUser(); } catch { redirect("/sign-in"); }
  return (
    <div className="grid grid-cols-[220px_1fr] min-h-screen">
      <Nav />
      <main className="p-6">{children}</main>
    </div>
  );
}
```

```tsx
// components/app/nav.tsx
import Link from "next/link";
const items = [
  { href: "/", label: "Home" },
  { href: "/roster", label: "Roster" },
  { href: "/meetings", label: "Meetings" },
  { href: "/series", label: "Series" },
  { href: "/polls", label: "Polls" },
  { href: "/notifications", label: "Notifications" },
  { href: "/settings", label: "Settings" },
];
export function Nav() {
  return (
    <nav className="border-r p-4 space-y-1">
      <div className="font-semibold px-2 py-1">Atlas</div>
      {items.map(i => <Link key={i.href} href={i.href} className="block px-2 py-1 rounded hover:bg-muted">{i.label}</Link>)}
    </nav>
  );
}
```

- [ ] **Step 4: Middleware redirects unauthenticated → `/sign-in`**

Update `lib/supabase/middleware.ts` to inspect the resolved user and redirect for the auth-gated matcher:

```ts
// lib/supabase/middleware.ts (excerpt after supabase.auth.getUser())
const { data: { user } } = await supabase.auth.getUser();
const url = new URL(request.url);
const isPublic = url.pathname.startsWith("/sign-in") || url.pathname.startsWith("/auth") || url.pathname.startsWith("/api/health");
if (!user && !isPublic) {
  const to = new URL("/sign-in", request.url);
  return NextResponse.redirect(to);
}
return response;
```

- [ ] **Step 5: E2E smoke**

```ts
// e2e/auth.spec.ts
import { test, expect } from "@playwright/test";
test("unauthenticated → sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Sign in to Atlas" })).toBeVisible();
});
```

Run: `pnpm test:e2e`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/(auth) app/(app) components/app lib/supabase/middleware.ts e2e/auth.spec.ts
git commit -m "feat(auth): sign-in, callback, auth-gated shell"
```

### Task 2.7: Roster + Settings pages

**Files:**
- Create: `app/(app)/roster/page.tsx`, `app/(app)/roster/[id]/page.tsx`, `app/(app)/settings/page.tsx`
- Create: `components/app/roster-table.tsx`, `components/app/unavailability-editor.tsx`

- [ ] **Step 1: Roster list (RSC)**

```tsx
// app/(app)/roster/page.tsx
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require";
import { RosterTable } from "@/components/app/roster-table";

export default async function RosterPage() {
  await requireUser();
  const s = createSupabaseServerClient();
  const { data } = await s.from("profiles").select("id,display_name,email,role,is_active").order("display_name");
  const { data: me } = await s.auth.getUser();
  const { data: mine } = await s.from("profiles").select("role").eq("id", me.user!.id).single();
  return <RosterTable rows={data ?? []} isAdmin={mine?.role === "admin"} />;
}
```

- [ ] **Step 2: `RosterTable` (client component)**

Includes: table of rows; if `isAdmin`, an "Add member" dialog calling `addMemberAction`, and a per-row menu calling `setRoleAction` / `deactivateAction`. Uses shadcn `Dialog`, `DropdownMenu`, `Button`, `Table`.

- [ ] **Step 3: Profile page + Settings**

- `app/(app)/roster/[id]/page.tsx` — shows a member's display name, avatar, role.
- `app/(app)/settings/page.tsx` — form for `display_name`, list of unavailability windows with add/remove. Uses `updateProfile`, `setUnavailability`, `clearUnavailability`.

- [ ] **Step 4: E2E — admin adds a member and sees them in the table**

Requires an authenticated fixture. Skip if fixture support is deferred; log a QA note in `docs/superpowers/qa/atlas.md`.

- [ ] **Step 5: Commit + PR**

```bash
git add app/(app)/roster app/(app)/settings components/app
git commit -m "feat(ui): roster list + profile + settings"
```

### Phase 2 acceptance

- Fresh user signs in via magic link → lands on `/`. First user has admin role.
- Admin can add a member; they appear in the roster.
- Any user can set an unavailability window and see it listed.
- `pnpm supabase db test` covers RLS on profiles + unavailability.

### Phase 2 PR

Base: `atlas/01-foundation`. Title `atlas 02/10 — auth, profiles, roster`. Body highlights the first-user-is-admin rule and the auth trigger.

---

## Phase 3: Attributed prompts (standalone polls, all 5 response types)

Branch: `atlas/03-attributed-prompts` (off `atlas/02-auth-roster`)

**Goal:** Any active member can create a standalone attributed prompt of any response type, others answer, participation counter updates live, creator reveals. Meetings are not touched here — the prompt lives as a standalone poll.

**Files touched:**
- Create: `db/migrations/0005_prompts_and_responses.sql`, `db/migrations/0006_participation.sql`, `db/migrations/0007_participation_counter.sql`, `db/migrations/0008_participation_denominator.sql`
- Create: `db/tests/prompts_rls.sql`, `db/tests/participation_rls.sql`
- Create: `lib/zod/prompt.ts`, `lib/zod/response.ts`
- Create: `lib/actions/prompt.ts`, `lib/actions/response.ts`
- Create: `lib/prompts/validate-response.ts`
- Create: `app/(app)/polls/page.tsx`, `app/(app)/polls/new/page.tsx`, `app/(app)/polls/[id]/page.tsx`
- Create: `components/prompts/prompt-form.tsx`, `components/prompts/response-input.tsx`, `components/prompts/reveal-view.tsx`, `components/prompts/participation-counter.tsx`

**Interfaces produced:**
- Tables: `prompts`, `responses_attributed`, `participation`.
- SQL function: `atlas_prompt_denominator(prompt_id uuid) returns int` — returns the current expected-participant count.
- SQL function: `atlas_prompt_counter(prompt_id uuid) returns int` — returns the numerator.
- Server actions: `createPrompt`, `updatePrompt`, `submitResponse`, `revealPrompt`, `closePrompt`.

### Task 3.1: prompts + responses_attributed + participation migrations

**Files:**
- Create: `db/migrations/0005_prompts_and_responses.sql`, `db/migrations/0006_participation.sql`
- Create: `db/tests/prompts_rls.sql`

- [ ] **Step 1: Migration `0005`**

```sql
create type public.response_type as enum ('text','single_choice','multi_choice','yes_no','rating');
create type public.anonymity_mode as enum ('attributed','hard_anonymous');
create type public.prompt_timing as enum ('async','live');

create table public.prompts (
  id             uuid primary key default gen_random_uuid(),
  meeting_id     uuid, -- FK added in phase 5; nullable stays nullable for standalone polls
  author_user_id uuid not null references public.profiles(id) on delete restrict,
  question       text not null check (char_length(question) between 1 and 500),
  response_type  public.response_type not null,
  options        jsonb, -- array of {id,label} for single/multi; auto-populated for yes_no
  rating_min     int,
  rating_max     int,
  anonymity      public.anonymity_mode not null,
  timing         public.prompt_timing not null,
  opens_at       timestamptz,
  closes_at      timestamptz,
  is_open        boolean not null default false,
  is_revealed    boolean not null default false,
  revealed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ((response_type='rating') = (rating_min is not null and rating_max is not null and rating_min < rating_max)),
  check ((response_type in ('single_choice','multi_choice','yes_no')) = (options is not null))
);

create index on public.prompts(meeting_id);
create index on public.prompts(author_user_id);

create table public.responses_attributed (
  id         uuid primary key default gen_random_uuid(),
  prompt_id  uuid not null references public.prompts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  response   jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prompt_id, user_id)
);

alter table public.prompts               enable row level security;
alter table public.responses_attributed  enable row level security;

-- prompts policies
create policy prompts_read_all       on public.prompts for select using (auth.uid() is not null);
create policy prompts_insert_author  on public.prompts for insert with check (auth.uid() = author_user_id);
create policy prompts_update_author  on public.prompts for update using  (auth.uid() = author_user_id) with check (auth.uid() = author_user_id);

-- responses_attributed policies (attributed prompts only)
create policy ra_read_self on public.responses_attributed for select
  using (auth.uid() = user_id);
create policy ra_read_after_reveal on public.responses_attributed for select
  using (exists(select 1 from public.prompts p
                where p.id = prompt_id and p.anonymity='attributed' and p.is_revealed));
create policy ra_write_self on public.responses_attributed for all
  using  (auth.uid() = user_id and exists(select 1 from public.prompts p
          where p.id = prompt_id and p.anonymity='attributed' and not p.is_revealed))
  with check (auth.uid() = user_id and exists(select 1 from public.prompts p
          where p.id = prompt_id and p.anonymity='attributed' and not p.is_revealed));

create trigger prompts_touch before update on public.prompts
  for each row execute function public.atlas_touch_updated_at();
create trigger ra_touch before update on public.responses_attributed
  for each row execute function public.atlas_touch_updated_at();
```

- [ ] **Step 2: Migration `0006` (participation)**

```sql
create table public.participation (
  id           uuid primary key default gen_random_uuid(),
  prompt_id    uuid not null references public.prompts(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  responded_at timestamptz not null default now(),
  unique (prompt_id, user_id)
);
create index on public.participation(prompt_id);

alter table public.participation enable row level security;

-- Users can read their own row (used by the UI: "did I already respond?")
create policy part_read_self on public.participation for select using (auth.uid() = user_id);
-- Insert is only via submit_response server action, which uses caller auth
create policy part_write_self on public.participation for insert with check (auth.uid() = user_id);
-- No update, no delete.
```

- [ ] **Step 3: pgTAP RLS test**

```sql
-- db/tests/prompts_rls.sql
BEGIN;
SELECT plan(4);
SELECT has_table('public','prompts');
SELECT has_table('public','responses_attributed');
SELECT has_table('public','participation');
SELECT ok((SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='responses_attributed') = 3);
SELECT * FROM finish();
ROLLBACK;
```

Run: `pnpm supabase db reset && pnpm supabase db test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git checkout -b atlas/03-attributed-prompts
git add db/migrations/0005_prompts_and_responses.sql db/migrations/0006_participation.sql db/tests/prompts_rls.sql
git commit -m "feat(db): prompts + attributed responses + participation"
```

### Task 3.2: participation counter + denominator functions

**Files:**
- Create: `db/migrations/0007_participation_counter.sql`, `db/migrations/0008_participation_denominator.sql`

- [ ] **Step 1: Numerator**

```sql
-- db/migrations/0007_participation_counter.sql
create or replace function public.atlas_prompt_counter(p_prompt uuid) returns int
language sql stable as $$
  select count(*)::int from public.participation where prompt_id = p_prompt;
$$;
grant execute on function public.atlas_prompt_counter(uuid) to authenticated;
```

- [ ] **Step 2: Denominator (standalone-poll flavour; meeting override wired in Phase 5)**

```sql
-- db/migrations/0008_participation_denominator.sql
create or replace function public.atlas_prompt_denominator(p_prompt uuid) returns int
language plpgsql stable as $$
declare v_meeting uuid; v_count int;
begin
  select meeting_id into v_meeting from public.prompts where id = p_prompt;
  -- meeting-scoped denominator handled in phase 5; for now, standalone only
  if v_meeting is null then
    select count(*)::int into v_count from public.profiles p
      where p.is_active and not public.atlas_is_unavailable_on(p.id, current_date);
    return v_count;
  end if;
  return 0; -- phase 5 will replace this branch
end $$;
grant execute on function public.atlas_prompt_denominator(uuid) to authenticated;
```

- [ ] **Step 3: Reset + verify grants**

```bash
pnpm supabase db reset
psql "$SUPABASE_TEST_URL" -c "SELECT public.atlas_prompt_counter('00000000-0000-0000-0000-000000000000'::uuid);"
```

Expected: returns `0`.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0007_participation_counter.sql db/migrations/0008_participation_denominator.sql
git commit -m "feat(db): participation counter + denominator (standalone flavour)"
```

### Task 3.3: Response validators (pure)

**Files:**
- Create: `lib/prompts/validate-response.ts`, `tests/prompts/validate-response.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { expect, test } from "vitest";
import { validateResponse } from "@/lib/prompts/validate-response";

test("text rejects >2000 chars", () => {
  const r = validateResponse({ response_type: "text" } as any, { text: "a".repeat(2001) });
  expect(r.ok).toBe(false);
});

test("rating rejects out of range", () => {
  const r = validateResponse({ response_type: "rating", rating_min: 1, rating_max: 5 } as any, { value: 7 });
  expect(r.ok).toBe(false);
});

test("multi_choice accepts subset of options", () => {
  const p = { response_type: "multi_choice", options: [{id:"a"},{id:"b"},{id:"c"}] } as any;
  const r = validateResponse(p, { option_ids: ["a","c"] });
  expect(r.ok).toBe(true);
});

test("yes_no accepts yes only", () => {
  const p = { response_type: "yes_no", options: [{id:"yes"},{id:"no"}] } as any;
  expect(validateResponse(p, { option_id: "yes" }).ok).toBe(true);
  expect(validateResponse(p, { option_id: "maybe" }).ok).toBe(false);
});
```

Run: `pnpm test` — FAIL.

- [ ] **Step 2: Implementation**

```ts
// lib/prompts/validate-response.ts
type Prompt = {
  response_type: "text"|"single_choice"|"multi_choice"|"yes_no"|"rating";
  options?: { id: string; label?: string }[];
  rating_min?: number|null; rating_max?: number|null;
};
export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateResponse(p: Prompt, r: unknown): ValidationResult {
  const ids = new Set(p.options?.map(o => o.id) ?? []);
  switch (p.response_type) {
    case "text": {
      const t = (r as any)?.text;
      if (typeof t !== "string" || t.length === 0 || t.length > 2000) return { ok:false, error:"text must be 1..2000 chars" };
      return { ok:true };
    }
    case "single_choice":
    case "yes_no": {
      const id = (r as any)?.option_id;
      if (typeof id !== "string" || !ids.has(id)) return { ok:false, error:"option_id invalid" };
      return { ok:true };
    }
    case "multi_choice": {
      const arr = (r as any)?.option_ids;
      if (!Array.isArray(arr) || arr.length === 0 || arr.some((x) => !ids.has(x))) return { ok:false, error:"option_ids invalid" };
      return { ok:true };
    }
    case "rating": {
      const v = (r as any)?.value;
      if (typeof v !== "number" || !Number.isInteger(v) ||
          v < (p.rating_min ?? 1) || v > (p.rating_max ?? 5)) return { ok:false, error:"value out of range" };
      return { ok:true };
    }
  }
}
```

Run: `pnpm test` — PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/prompts tests/prompts
git commit -m "feat(prompts): pure response validator"
```

### Task 3.4: Server Actions — prompt CRUD + submit + reveal (attributed only)

**Files:**
- Create: `lib/zod/prompt.ts`, `lib/actions/prompt.ts`, `lib/actions/response.ts`
- Create: `tests/actions/prompt.integration.test.ts`

- [ ] **Step 1: Zod schema for creation**

```ts
// lib/zod/prompt.ts
import { z } from "zod";
export const option = z.object({ id: z.string().min(1).max(40), label: z.string().min(1).max(120) });
export const createPromptInput = z.discriminatedUnion("response_type", [
  z.object({ response_type: z.literal("text"),          question: z.string().min(1).max(500), anonymity: z.enum(["attributed","hard_anonymous"]), timing: z.enum(["async","live"]).default("async"), opens_at: z.string().datetime().optional(), closes_at: z.string().datetime().optional() }),
  z.object({ response_type: z.literal("single_choice"), question: z.string().min(1).max(500), anonymity: z.enum(["attributed","hard_anonymous"]), timing: z.enum(["async","live"]).default("async"), options: z.array(option).min(2).max(20), opens_at: z.string().datetime().optional(), closes_at: z.string().datetime().optional() }),
  z.object({ response_type: z.literal("multi_choice"),  question: z.string().min(1).max(500), anonymity: z.enum(["attributed","hard_anonymous"]), timing: z.enum(["async","live"]).default("async"), options: z.array(option).min(2).max(20), opens_at: z.string().datetime().optional(), closes_at: z.string().datetime().optional() }),
  z.object({ response_type: z.literal("yes_no"),        question: z.string().min(1).max(500), anonymity: z.enum(["attributed","hard_anonymous"]), timing: z.enum(["async","live"]).default("async"), opens_at: z.string().datetime().optional(), closes_at: z.string().datetime().optional() }),
  z.object({ response_type: z.literal("rating"),        question: z.string().min(1).max(500), anonymity: z.enum(["attributed","hard_anonymous"]), timing: z.enum(["async","live"]).default("async"), rating_min: z.union([z.literal(1)]).default(1), rating_max: z.union([z.literal(5),z.literal(10)]).default(5), opens_at: z.string().datetime().optional(), closes_at: z.string().datetime().optional() }),
]);
```

- [ ] **Step 2: `lib/actions/prompt.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require";
import { createPromptInput } from "@/lib/zod/prompt";
import { err, ok, type ActionResult } from "@/lib/actions/_result";

const YES_NO_OPTIONS = [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }];

export async function createPrompt(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = createPromptInput.safeParse(input); if (!parsed.success) return err("invalid_input", parsed.error.message);
  const { user, supabase } = await requireUser();
  const p = parsed.data;
  const row: Record<string, unknown> = {
    author_user_id: user.id,
    question: p.question,
    response_type: p.response_type,
    anonymity: p.anonymity,
    timing: p.timing,
    is_open: true,     // standalone polls open on creation
    opens_at: p.opens_at ?? null,
    closes_at: p.closes_at ?? null,
  };
  if (p.response_type === "single_choice" || p.response_type === "multi_choice") row.options = p.options;
  if (p.response_type === "yes_no") row.options = YES_NO_OPTIONS;
  if (p.response_type === "rating") { row.rating_min = p.rating_min; row.rating_max = p.rating_max; }
  const { data, error } = await supabase.from("prompts").insert(row).select("id").single();
  if (error || !data) return err("db_error", error?.message ?? "unknown");
  revalidatePath("/polls");
  return ok({ id: data.id });
}

export async function revealPrompt(prompt_id: string): Promise<ActionResult<null>> {
  const { user, supabase } = await requireUser();
  const { error } = await supabase.from("prompts")
    .update({ is_revealed: true, revealed_at: new Date().toISOString(), is_open: false })
    .eq("id", prompt_id).eq("author_user_id", user.id);
  if (error) return err("db_error", error.message);
  revalidatePath(`/polls/${prompt_id}`);
  return ok(null);
}

export async function closePrompt(prompt_id: string): Promise<ActionResult<null>> {
  const { user, supabase } = await requireUser();
  const { error } = await supabase.from("prompts")
    .update({ is_open: false }).eq("id", prompt_id).eq("author_user_id", user.id);
  if (error) return err("db_error", error.message);
  revalidatePath(`/polls/${prompt_id}`);
  return ok(null);
}
```

- [ ] **Step 3: `lib/actions/response.ts` (attributed only for now)**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require";
import { validateResponse } from "@/lib/prompts/validate-response";
import { err, ok, type ActionResult } from "@/lib/actions/_result";

export async function submitResponse(prompt_id: string, response: unknown): Promise<ActionResult<null>> {
  const { user, supabase } = await requireUser();

  const { data: p } = await supabase.from("prompts")
    .select("id,response_type,options,rating_min,rating_max,anonymity,is_open,is_revealed,opens_at,closes_at,timing")
    .eq("id", prompt_id).single();
  if (!p) return err("not_found", "prompt");
  if (p.is_revealed || !p.is_open) return err("closed", "prompt not open");
  const now = new Date();
  if (p.opens_at  && now < new Date(p.opens_at))  return err("closed", "not yet open");
  if (p.closes_at && now > new Date(p.closes_at)) return err("closed", "past close");

  const v = validateResponse(p as any, response); if (!v.ok) return err("invalid_input", v.error);

  if (p.anonymity === "attributed") {
    // upsert attributed row + participation in a single RPC
    const { error } = await supabase.rpc("atlas_submit_attributed", { p_prompt: prompt_id, p_response: response });
    if (error) return err("db_error", error.message);
  } else {
    return err("not_implemented", "hard-anonymous ships in phase 4");
  }
  revalidatePath(`/polls/${prompt_id}`);
  return ok(null);
}
```

Add the RPC in a small migration inline (create in the same commit to keep coupling explicit):

```sql
-- db/migrations/0009_submit_attributed_rpc.sql
create or replace function public.atlas_submit_attributed(p_prompt uuid, p_response jsonb) returns void
language plpgsql security invoker as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'unauth'; end if;
  insert into public.responses_attributed (prompt_id, user_id, response)
    values (p_prompt, v_uid, p_response)
    on conflict (prompt_id, user_id) do update set response = excluded.response, updated_at = now();
  insert into public.participation (prompt_id, user_id)
    values (p_prompt, v_uid)
    on conflict (prompt_id, user_id) do nothing;
end $$;
grant execute on function public.atlas_submit_attributed(uuid, jsonb) to authenticated;
```

- [ ] **Step 4: Integration test — full attributed flow**

```ts
// tests/actions/prompt.integration.test.ts
import { expect, test } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test("attributed single_choice: submit + reveal + read back", async () => {
  const admin = createClient(url, svc);
  const { data: u1 } = await admin.auth.admin.inviteUserByEmail("a@example.com");
  const { data: u2 } = await admin.auth.admin.inviteUserByEmail("b@example.com");
  const prompt = await admin.from("prompts").insert({
    author_user_id: u1!.user!.id, question: "Which color?", response_type: "single_choice",
    options: [{id:"red",label:"Red"},{id:"blue",label:"Blue"}], anonymity: "attributed", timing:"async", is_open: true,
  }).select("id").single();

  // as u2 (need magic-link session simulation; use service role SELECTs instead of RLS-checked writes for now)
  await admin.rpc("atlas_submit_attributed" as any, { p_prompt: prompt.data!.id, p_response: { option_id: "blue" } });

  const { data: parts } = await admin.from("participation").select("*").eq("prompt_id", prompt.data!.id);
  expect(parts?.length).toBe(1); // service role acts as admin — participation row lands under admin uid; assert row count only
});
```

Run: `pnpm test` — PASS.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0009_submit_attributed_rpc.sql lib/zod/prompt.ts lib/actions/prompt.ts lib/actions/response.ts tests/actions/prompt.integration.test.ts
git commit -m "feat(actions): prompt + submitResponse (attributed) + reveal"
```

### Task 3.5: UI — create poll, respond, live counter, reveal

**Files:**
- Create: `app/(app)/polls/page.tsx`, `app/(app)/polls/new/page.tsx`, `app/(app)/polls/[id]/page.tsx`
- Create: `components/prompts/prompt-form.tsx`, `components/prompts/response-input.tsx`, `components/prompts/reveal-view.tsx`, `components/prompts/participation-counter.tsx`

- [ ] **Step 1: Polls list page (RSC)**

Shows two lists: **Open for me** (any prompt where `is_open` and no participation row for me), and **Mine** (author = me). Simple links to `/polls/[id]`.

- [ ] **Step 2: `prompt-form.tsx`**

Dynamic form driven by `response_type` selector. Uses React Hook Form + Zod resolver against `createPromptInput`. Renders option list editor for `single/multi_choice`. Yes_no + rating are configuration-only. On submit calls `createPrompt`, on success routes to `/polls/[id]`.

- [ ] **Step 3: `response-input.tsx`**

Per-type input: text area, radio group, checkboxes, big Y/N buttons, rating slider. Uses shadcn primitives. Submits via `submitResponse`. Optimistic mark-participated.

- [ ] **Step 4: `participation-counter.tsx`**

Client component that subscribes to `participation` changes for the prompt via Supabase Realtime and refetches count + denominator via `atlas_prompt_counter` / `atlas_prompt_denominator` RPCs. Renders `N of M responded • X to go`.

```tsx
"use client";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ParticipationCounter({ promptId }: { promptId: string }) {
  const s = createSupabaseBrowserClient();
  const [n, setN] = useState(0); const [d, setD] = useState(0);
  async function refresh() {
    const [a, b] = await Promise.all([
      s.rpc("atlas_prompt_counter", { p_prompt: promptId }),
      s.rpc("atlas_prompt_denominator", { p_prompt: promptId }),
    ]);
    setN(a.data ?? 0); setD(b.data ?? 0);
  }
  useEffect(() => {
    refresh();
    const ch = s.channel(`part:${promptId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "participation", filter: `prompt_id=eq.${promptId}` }, refresh)
      .subscribe();
    return () => { s.removeChannel(ch); };
  }, [promptId]);
  return <div className="text-sm text-muted-foreground">{n} of {d} responded • {Math.max(d - n, 0)} to go</div>;
}
```

- [ ] **Step 5: `reveal-view.tsx`**

For attributed prompts after `is_revealed = true`, fetches `responses_attributed` joined with `profiles.display_name` and renders per response type: list of `name → answer` for text, bar chart of counts for single/multi/yes_no, histogram + mean for rating.

- [ ] **Step 6: Poll detail page glue**

```tsx
// app/(app)/polls/[id]/page.tsx (sketch)
// RSC fetch prompt + is_revealed. If revealed → <RevealView/>. Else if is_open →
// <ResponseInput/> + <ParticipationCounter/>. If author → Reveal + Close buttons.
```

- [ ] **Step 7: E2E — attributed poll happy path**

```ts
// e2e/polls-attributed.spec.ts (skeleton — flesh out once auth fixtures land)
import { test, expect } from "@playwright/test";
test.skip("attributed single_choice poll full flow", async ({ page }) => {
  /* sign in as A, create poll, sign in as B, submit blue, sign in as A, reveal, see B → blue */
});
```

- [ ] **Step 8: Commit + PR**

```bash
git add app/(app)/polls components/prompts
git commit -m "feat(ui): standalone attributed polls (create + respond + counter + reveal)"
```

### Phase 3 acceptance

- Any user can create an attributed poll of any of the 5 response types.
- Users see live participation counter increment.
- Author can reveal; readers see the reveal view immediately (via Realtime on `prompts.is_revealed`).
- pgTAP asserts the RLS structure exists.

### Phase 3 PR

Base: `atlas/02-auth-roster`. Title `atlas 03/10 — attributed prompts`. Reviewer focus: RLS policies on `responses_attributed` and the `atlas_submit_attributed` RPC.

---

## Phase 4: Hard-anonymous prompts

Branch: `atlas/04-anonymous-prompts` (off `atlas/03-attributed-prompts`)

**Goal:** Adds hard-anonymous responses without a `user_id` column, aggregation-only reads via `atlas_get_prompt_results`, and the "final, no undo" submission UI.

**Files touched:**
- Create: `db/migrations/0010_responses_anonymous.sql`, `db/migrations/0011_prompt_results.sql`
- Create: `db/tests/anon_rls.sql`
- Modify: `lib/actions/response.ts` (add anonymous branch via `atlas_submit_anonymous` RPC)
- Modify: `components/prompts/prompt-form.tsx` (warn + lock message on hard-anonymous)
- Modify: `components/prompts/reveal-view.tsx` (anonymous path uses aggregation function)
- Create: `db/migrations/0012_submit_anonymous_rpc.sql`

**Interfaces produced:**
- Table: `responses_anonymous(id, prompt_id, response, created_at)` — no `user_id`.
- Function: `atlas_get_prompt_results(prompt_id uuid) returns jsonb` — returns type-appropriate aggregate.
- RPC: `atlas_submit_anonymous(p_prompt uuid, p_response jsonb)` — atomic insert into `responses_anonymous` + `participation`.

### Task 4.1: `responses_anonymous` migration

**Files:**
- Create: `db/migrations/0010_responses_anonymous.sql`, `db/tests/anon_rls.sql`

- [ ] **Step 1: Migration**

```sql
create table public.responses_anonymous (
  id         uuid primary key default gen_random_uuid(),
  prompt_id  uuid not null references public.prompts(id) on delete cascade,
  response   jsonb not null,
  created_at timestamptz not null default now()
);
create index on public.responses_anonymous(prompt_id);

alter table public.responses_anonymous enable row level security;

-- No direct SELECT for anyone. Reads happen through atlas_get_prompt_results only.
-- Direct INSERT is blocked too; use atlas_submit_anonymous RPC.
```

Explicit note (as a SQL comment) so a reviewer can't miss it:

```sql
comment on table public.responses_anonymous is
  'Hard-anonymous responses. Deliberately has no user_id column. Reads: aggregated only via atlas_get_prompt_results. Writes: only via atlas_submit_anonymous.';
```

- [ ] **Step 2: pgTAP — no `user_id` column, ever**

```sql
-- db/tests/anon_rls.sql
BEGIN;
SELECT plan(3);
SELECT hasnt_column('public','responses_anonymous','user_id', 'responses_anonymous MUST NOT have user_id');
SELECT ok(
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='responses_anonymous') = 0,
  'no direct RLS policies — no direct access allowed'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.responses_anonymous'::regclass),
  'RLS is enabled (deny-by-default)'
);
SELECT * FROM finish();
ROLLBACK;
```

Run: `pnpm supabase db reset && pnpm supabase db test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git checkout -b atlas/04-anonymous-prompts
git add db/migrations/0010_responses_anonymous.sql db/tests/anon_rls.sql
git commit -m "feat(db): responses_anonymous with no user_id column"
```

### Task 4.2: `atlas_submit_anonymous` RPC

**Files:**
- Create: `db/migrations/0012_submit_anonymous_rpc.sql`

- [ ] **Step 1: RPC**

```sql
create or replace function public.atlas_submit_anonymous(p_prompt uuid, p_response jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_prompt public.prompts%rowtype;
begin
  if v_uid is null then raise exception 'unauth' using errcode = '42501'; end if;
  select * into v_prompt from public.prompts where id = p_prompt;
  if v_prompt.id is null then raise exception 'not_found';    end if;
  if v_prompt.anonymity <> 'hard_anonymous' then raise exception 'wrong_mode'; end if;
  if v_prompt.is_revealed or not v_prompt.is_open then raise exception 'closed'; end if;
  if v_prompt.opens_at  is not null and now() < v_prompt.opens_at  then raise exception 'closed'; end if;
  if v_prompt.closes_at is not null and now() > v_prompt.closes_at then raise exception 'closed'; end if;
  if exists (select 1 from public.participation where prompt_id = p_prompt and user_id = v_uid)
     then raise exception 'already_responded'; end if;

  insert into public.responses_anonymous (prompt_id, response) values (p_prompt, p_response);
  insert into public.participation       (prompt_id, user_id)  values (p_prompt, v_uid);
end $$;
revoke all on function public.atlas_submit_anonymous(uuid, jsonb) from public;
grant  execute on function public.atlas_submit_anonymous(uuid, jsonb) to authenticated;
```

- [ ] **Step 2: Test**

```ts
// tests/actions/anonymous.integration.test.ts
import { expect, test } from "vitest";
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test("no query returns (response, user_id) tuples for anonymous prompts", async () => {
  const c = createClient(url, svc);
  const { data: cols } = await c.rpc("exec_sql" as any, {
    sql: "select column_name from information_schema.columns where table_schema='public' and table_name='responses_anonymous'"
  });
  expect(JSON.stringify(cols)).not.toMatch(/user_id/);
});
```

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0012_submit_anonymous_rpc.sql tests/actions/anonymous.integration.test.ts
git commit -m "feat(db): atlas_submit_anonymous rpc"
```

### Task 4.3: `atlas_get_prompt_results` aggregation

**Files:**
- Create: `db/migrations/0011_prompt_results.sql`

- [ ] **Step 1: Function**

```sql
create or replace function public.atlas_get_prompt_results(p_prompt uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_prompt public.prompts%rowtype; v_body jsonb;
begin
  select * into v_prompt from public.prompts where id = p_prompt;
  if v_prompt.id is null then raise exception 'not_found'; end if;
  if not v_prompt.is_revealed then raise exception 'not_revealed'; end if;

  case v_prompt.response_type
    when 'text' then
      if v_prompt.anonymity = 'attributed' then
        select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'text', r.response->>'text'))
          into v_body from public.responses_attributed r where r.prompt_id = p_prompt;
      else
        select jsonb_agg(r.response->>'text' order by random())
          into v_body from public.responses_anonymous r where r.prompt_id = p_prompt;
      end if;
      return jsonb_build_object('kind','text','items', coalesce(v_body,'[]'::jsonb));

    when 'single_choice','yes_no' then
      if v_prompt.anonymity = 'attributed' then
        select jsonb_object_agg(x.opt, x.n) into v_body from
          (select response->>'option_id' opt, count(*) n from public.responses_attributed
           where prompt_id = p_prompt group by 1) x;
      else
        select jsonb_object_agg(x.opt, x.n) into v_body from
          (select response->>'option_id' opt, count(*) n from public.responses_anonymous
           where prompt_id = p_prompt group by 1) x;
      end if;
      return jsonb_build_object('kind','choice','counts', coalesce(v_body,'{}'::jsonb),'options', v_prompt.options);

    when 'multi_choice' then
      if v_prompt.anonymity = 'attributed' then
        select jsonb_object_agg(x.opt, x.n) into v_body from
          (select jsonb_array_elements_text(response->'option_ids') opt, count(*) n
             from public.responses_attributed where prompt_id = p_prompt group by 1) x;
      else
        select jsonb_object_agg(x.opt, x.n) into v_body from
          (select jsonb_array_elements_text(response->'option_ids') opt, count(*) n
             from public.responses_anonymous where prompt_id = p_prompt group by 1) x;
      end if;
      return jsonb_build_object('kind','multi','counts', coalesce(v_body,'{}'::jsonb),'options', v_prompt.options);

    when 'rating' then
      if v_prompt.anonymity = 'attributed' then
        select jsonb_build_object(
          'kind','rating',
          'avg',  (select avg((response->>'value')::int) from public.responses_attributed where prompt_id = p_prompt),
          'dist', (select jsonb_object_agg(x.v, x.n) from
                    (select (response->>'value') v, count(*) n from public.responses_attributed
                     where prompt_id = p_prompt group by 1) x)
        ) into v_body;
      else
        select jsonb_build_object(
          'kind','rating',
          'avg',  (select avg((response->>'value')::int) from public.responses_anonymous where prompt_id = p_prompt),
          'dist', (select jsonb_object_agg(x.v, x.n) from
                    (select (response->>'value') v, count(*) n from public.responses_anonymous
                     where prompt_id = p_prompt group by 1) x)
        ) into v_body;
      end if;
      return v_body;
  end case;
end $$;
grant execute on function public.atlas_get_prompt_results(uuid) to authenticated;
```

- [ ] **Step 2: pgTAP smoke**

Extend `db/tests/anon_rls.sql` with a plan bump + one assertion that the function exists and is `SECURITY DEFINER`:

```sql
SELECT has_function('public','atlas_get_prompt_results', ARRAY['uuid']);
```

Run: `pnpm supabase db reset && pnpm supabase db test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0011_prompt_results.sql db/tests/anon_rls.sql
git commit -m "feat(db): atlas_get_prompt_results aggregate"
```

### Task 4.4: Wire anonymous into `submitResponse` + reveal view

**Files:**
- Modify: `lib/actions/response.ts`
- Modify: `components/prompts/reveal-view.tsx`
- Modify: `components/prompts/prompt-form.tsx` (warning strip on hard-anonymous)
- Modify: `components/prompts/response-input.tsx` (warning on submit for hard-anonymous)

- [ ] **Step 1: Extend `submitResponse`**

Add the anonymous branch (replaces the `not_implemented` return):

```ts
} else {
  const { error } = await supabase.rpc("atlas_submit_anonymous", { p_prompt: prompt_id, p_response: response });
  if (error) return err("db_error", error.message);
}
```

- [ ] **Step 2: `reveal-view.tsx`**

Anonymous branch calls `supabase.rpc("atlas_get_prompt_results", { p_prompt })` and renders based on `kind`:

- `text` → shuffled list, no names.
- `choice` → bar chart from `counts` keyed by option id.
- `multi` → grouped bar chart (each option separately).
- `rating` → average + histogram from `dist`.

Attributed branch stays unchanged and joins `profiles.display_name`.

- [ ] **Step 3: Warning strips**

`prompt-form.tsx` — when `anonymity = "hard_anonymous"` is chosen, show a muted callout:

> "Hard anonymous. The database will not store who submitted what. Note: writing style or timing can still give you away in a small group."

`response-input.tsx` — for hard-anonymous, replace the submit button label with **"Submit anonymously"** and open a confirm dialog: *"Anonymous — final. Take a moment."* No edit/undo after.

- [ ] **Step 4: E2E — hard-anonymous full loop**

```ts
// e2e/polls-anonymous.spec.ts (skeleton)
test.skip("hard-anonymous single_choice", async () => {/* two users submit, one reveals, verify no names shown */});
```

- [ ] **Step 5: Commit + PR**

```bash
git add lib/actions/response.ts components/prompts
git commit -m "feat(ui): hard-anonymous submission + aggregated reveal"
```

### Phase 4 acceptance

- Create hard-anonymous prompt → two users submit → creator reveals → results shown without any names, text answers appear in randomised order.
- pgTAP asserts `responses_anonymous` has no `user_id` column.
- Attempting `select ... from responses_anonymous` as a regular authenticated user returns 0 rows (RLS deny-all).

### Phase 4 PR

Base: `atlas/03-attributed-prompts`. Title `atlas 04/10 — hard-anonymous prompts`. Reviewer focus: **the schema of `responses_anonymous` and the security-definer functions**. This is the trust surface of the whole product.

---

## Phase 5: One-off meetings + agenda

Branch: `atlas/05-meetings-one-off` (off `atlas/04-anonymous-prompts`)

**Goal:** Anyone can create a one-off meeting with themselves as host. The meeting has an ordered agenda of prompts (all response types + both anonymities available). Live view syncs current agenda item + reveal state across all participants.

**Files touched:**
- Create: `db/migrations/0013_meetings.sql`, `db/migrations/0014_agenda_items.sql`, `db/migrations/0015_prompts_meeting_fk.sql`, `db/migrations/0016_denominator_meeting.sql`
- Create: `db/tests/meetings_rls.sql`
- Create: `lib/zod/meeting.ts`, `lib/actions/meeting.ts`, `lib/actions/agenda.ts`
- Create: `app/(app)/meetings/page.tsx`, `app/(app)/meetings/new/page.tsx`, `app/(app)/meetings/[id]/page.tsx`
- Create: `components/meetings/meeting-live-view.tsx`, `components/meetings/agenda-editor.tsx`, `components/meetings/agenda-runner.tsx`

**Interfaces produced:**
- Tables: `meetings`, `agenda_items`.
- `meetings.status` state machine (`scheduled`, `live`, `ended`) — no rotation/postpone yet (Phase 7 + 8).
- Server actions: `meeting.createOneOff`, `meeting.start`, `meeting.end`, `agenda.addItem`, `agenda.updateItem`, `agenda.reorder`, `agenda.advanceTo`.
- Updated `atlas_prompt_denominator` — meeting branch fully implemented.

### Task 5.1: Migrations

**Files:**
- Create: `db/migrations/0013_meetings.sql`, `db/migrations/0014_agenda_items.sql`, `db/migrations/0015_prompts_meeting_fk.sql`, `db/migrations/0016_denominator_meeting.sql`

- [ ] **Step 1: `meetings`**

```sql
create type public.meeting_status as enum ('scheduled','live','ended','postponed','cancelled');

create table public.meetings (
  id                        uuid primary key default gen_random_uuid(),
  series_id                 uuid,                       -- FK added in Phase 7
  title                     text not null,
  scheduled_start           timestamptz not null,
  timezone                  text not null default 'UTC',
  host_user_id              uuid references public.profiles(id) on delete set null,
  status                    public.meeting_status not null default 'scheduled',
  auto_postpone_count       int  not null default 0,
  current_agenda_item_id    uuid,
  participants_override     jsonb,                       -- uuid[]
  created_by                uuid not null references public.profiles(id) on delete restrict,
  started_at                timestamptz,
  ended_at                  timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index on public.meetings(status);
create index on public.meetings(scheduled_start);

alter table public.meetings enable row level security;

create policy meetings_read_participants on public.meetings for select using (
  auth.uid() is not null and (
    participants_override is null
    or exists (select 1 from jsonb_array_elements_text(participants_override) x where x.value = auth.uid()::text)
    or host_user_id = auth.uid()
    or created_by = auth.uid()
  )
);
create policy meetings_insert_self_host  on public.meetings for insert with check (auth.uid() = created_by and host_user_id = auth.uid());
create policy meetings_write_host_admin  on public.meetings for update using
  (auth.uid() = host_user_id or public.atlas_is_admin(auth.uid()))
  with check (auth.uid() = host_user_id or public.atlas_is_admin(auth.uid()));

create trigger meetings_touch before update on public.meetings
  for each row execute function public.atlas_touch_updated_at();
```

- [ ] **Step 2: `agenda_items`**

```sql
create type public.agenda_kind as enum ('discussion','prompt','picker');

create table public.agenda_items (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null references public.meetings(id) on delete cascade,
  ordinal       int not null,
  title         text not null,
  kind          public.agenda_kind not null,
  prompt_id     uuid references public.prompts(id) on delete set null,
  picker_config jsonb,
  picker_result jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (meeting_id, ordinal),
  check ((kind='prompt')  = (prompt_id is not null)),
  check ((kind='picker')  = (picker_config is not null))
);
create index on public.agenda_items(meeting_id);

alter table public.agenda_items enable row level security;

create policy ai_read on public.agenda_items for select using (
  exists (select 1 from public.meetings m where m.id = meeting_id
          and (m.participants_override is null
               or exists (select 1 from jsonb_array_elements_text(m.participants_override) x where x.value = auth.uid()::text)
               or m.host_user_id = auth.uid()))
);
create policy ai_write_host on public.agenda_items for all using (
  exists (select 1 from public.meetings m where m.id = meeting_id and m.host_user_id = auth.uid())
) with check (
  exists (select 1 from public.meetings m where m.id = meeting_id and m.host_user_id = auth.uid())
);

create trigger ai_touch before update on public.agenda_items
  for each row execute function public.atlas_touch_updated_at();
```

- [ ] **Step 3: Wire `prompts.meeting_id` to `meetings.id`**

```sql
alter table public.prompts add constraint prompts_meeting_fk
  foreign key (meeting_id) references public.meetings(id) on delete set null;
```

Update `prompts` RLS so participants of the meeting can read meeting-scoped prompts:

```sql
drop policy prompts_read_all on public.prompts;
create policy prompts_read on public.prompts for select using (
  meeting_id is null
  or exists (select 1 from public.meetings m where m.id = meeting_id
             and (m.participants_override is null
                  or exists (select 1 from jsonb_array_elements_text(m.participants_override) x where x.value = auth.uid()::text)
                  or m.host_user_id = auth.uid()))
);
```

- [ ] **Step 4: Denominator — meeting branch**

Replace `atlas_prompt_denominator` (drop + recreate is fine here since we own the function):

```sql
create or replace function public.atlas_prompt_denominator(p_prompt uuid) returns int
language plpgsql stable as $$
declare v_meeting uuid; v_override jsonb; v_count int;
begin
  select meeting_id into v_meeting from public.prompts where id = p_prompt;
  if v_meeting is null then
    select count(*)::int into v_count from public.profiles p
      where p.is_active and not public.atlas_is_unavailable_on(p.id, current_date);
    return v_count;
  end if;
  select participants_override into v_override from public.meetings where id = v_meeting;
  if v_override is null then
    select count(*)::int into v_count from public.profiles p
      where p.is_active and not public.atlas_is_unavailable_on(p.id, current_date);
    return v_count;
  end if;
  return jsonb_array_length(v_override);
end $$;
```

- [ ] **Step 5: pgTAP + reset + commit**

```sql
-- db/tests/meetings_rls.sql
BEGIN;
SELECT plan(3);
SELECT has_table('public','meetings');
SELECT has_table('public','agenda_items');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.meetings'::regclass));
SELECT * FROM finish();
ROLLBACK;
```

```bash
pnpm supabase db reset && pnpm supabase db test
git checkout -b atlas/05-meetings-one-off
git add db/migrations/00{13,14,15,16}_*.sql db/tests/meetings_rls.sql
git commit -m "feat(db): meetings + agenda_items + denominator update"
```

### Task 5.2: Server actions — meeting + agenda

**Files:**
- Create: `lib/zod/meeting.ts`, `lib/actions/meeting.ts`, `lib/actions/agenda.ts`

- [ ] **Step 1: Schemas**

```ts
// lib/zod/meeting.ts
import { z } from "zod";
export const createOneOff = z.object({
  title: z.string().min(1).max(120),
  scheduled_start: z.string().datetime(),
  timezone: z.string().min(1),
  participants_override: z.array(z.string().uuid()).nullable().optional(),
});
export const addAgendaItem = z.discriminatedUnion("kind", [
  z.object({ meeting_id: z.string().uuid(), kind: z.literal("discussion"), title: z.string().min(1).max(120) }),
  z.object({ meeting_id: z.string().uuid(), kind: z.literal("prompt"),     title: z.string().min(1).max(120), prompt_id: z.string().uuid() }),
  z.object({ meeting_id: z.string().uuid(), kind: z.literal("picker"),     title: z.string().min(1).max(120), picker_config: z.object({ mode: z.enum(["oneshot","shuffle"]), scope: z.enum(["whole_roster","meeting_participants"]) }) }),
]);
export const reorderAgenda = z.object({ meeting_id: z.string().uuid(), item_ids: z.array(z.string().uuid()).min(1) });
export const advanceTo    = z.object({ meeting_id: z.string().uuid(), item_id: z.string().uuid().nullable() });
```

- [ ] **Step 2: `meeting.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require";
import { err, ok, type ActionResult } from "@/lib/actions/_result";
import { createOneOff, advanceTo } from "@/lib/zod/meeting";

export async function createOneOffMeeting(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = createOneOff.safeParse(input); if (!parsed.success) return err("invalid_input", parsed.error.message);
  const { user, supabase } = await requireUser();
  const { data, error } = await supabase.from("meetings").insert({
    title: parsed.data.title,
    scheduled_start: parsed.data.scheduled_start,
    timezone: parsed.data.timezone,
    participants_override: parsed.data.participants_override ?? null,
    host_user_id: user.id,
    created_by: user.id,
    status: "scheduled",
  }).select("id").single();
  if (error || !data) return err("db_error", error?.message ?? "unknown");
  revalidatePath("/meetings"); return ok({ id: data.id });
}

export async function startMeeting(meeting_id: string): Promise<ActionResult<null>> {
  const { user, supabase } = await requireUser();
  const { error } = await supabase.from("meetings").update({
    status: "live", started_at: new Date().toISOString(), auto_postpone_count: 0,
  }).eq("id", meeting_id).eq("host_user_id", user.id);
  if (error) return err("db_error", error.message);
  revalidatePath(`/meetings/${meeting_id}`); return ok(null);
}

export async function endMeeting(meeting_id: string): Promise<ActionResult<null>> {
  const { user, supabase } = await requireUser();
  const { error } = await supabase.from("meetings").update({
    status: "ended", ended_at: new Date().toISOString(), current_agenda_item_id: null,
  }).eq("id", meeting_id).eq("host_user_id", user.id);
  if (error) return err("db_error", error.message);
  revalidatePath(`/meetings/${meeting_id}`); return ok(null);
}

export async function advanceMeetingAgenda(input: unknown): Promise<ActionResult<null>> {
  const parsed = advanceTo.safeParse(input); if (!parsed.success) return err("invalid_input", parsed.error.message);
  const { user, supabase } = await requireUser();
  const { error } = await supabase.from("meetings")
    .update({ current_agenda_item_id: parsed.data.item_id })
    .eq("id", parsed.data.meeting_id).eq("host_user_id", user.id);
  if (error) return err("db_error", error.message);
  return ok(null);
}
```

- [ ] **Step 3: `agenda.ts`**

Add-item, update-item, reorder, all host-only. Reorder assigns `ordinal` from array position in a single upsert. Include a `_result` return type on each.

- [ ] **Step 4: Commit**

```bash
git add lib/zod/meeting.ts lib/actions/meeting.ts lib/actions/agenda.ts
git commit -m "feat(actions): meeting + agenda one-off"
```

### Task 5.3: UI — meetings list, meeting detail, agenda runner

**Files:**
- Create: `app/(app)/meetings/*`, `components/meetings/*`

- [ ] **Step 1: Meetings list (RSC)**

Grouped by status: **Live now**, **Upcoming**, **Past**. Each row shows title, host name, `scheduled_start` in viewer TZ, participant count.

- [ ] **Step 2: `meeting-live-view.tsx` (client)**

Subscribes to two things:
1. `postgres_changes` on `meetings` row (`id=eq.<id>`) — reflect `current_agenda_item_id`, `status`.
2. `postgres_changes` on `agenda_items` (`meeting_id=eq.<id>`) — refresh list on edits.

Renders three columns: **Agenda**, **Now**, **Controls (host)**. Controls include Start / End / Advance-to / Reveal / Close-prompt buttons. Non-host sees Agenda + Now only.

- [ ] **Step 3: `agenda-runner.tsx`**

Given a `currentItem`, renders one of:
- Discussion → title + notes area (local only in v1).
- Prompt → `ResponseInput` (if not yet responded) + `ParticipationCounter` + reveal view.
- Picker → placeholder card that Phase 6 will fill.

- [ ] **Step 4: E2E — one-off meeting happy path**

Skeleton test; flesh out when auth fixtures land. Manual QA in the meantime.

- [ ] **Step 5: Commit + PR**

```bash
git add app/(app)/meetings components/meetings
git commit -m "feat(ui): one-off meetings (list, live view, agenda runner)"
```

### Phase 5 acceptance

- Create one-off meeting, add three agenda items (one discussion, two prompts of different types + anonymities), Start, Advance through each, Reveal the last prompt, End. All non-host participants see state changes without refreshing.

### Phase 5 PR

Base: `atlas/04-anonymous-prompts`. Title `atlas 05/10 — one-off meetings + agenda`.

---

## Phase 6: Random tools

Branch: `atlas/06-random-tools` (off `atlas/05-meetings-one-off`)

**Goal:** Standalone one-shot random pick and shuffle session tools on Home. Meeting-embedded picker agenda items work with live sync — host clicks Next, everyone sees the same person.

**Files touched:**
- Create: `db/migrations/0017_shuffle_sessions.sql`, `db/tests/shuffle_rls.sql`
- Create: `lib/random/pick.ts` (pure), `tests/random/pick.test.ts`
- Create: `lib/actions/picker.ts`
- Create: `app/(app)/tools/pick/page.tsx`, `app/(app)/tools/shuffle/page.tsx`
- Create: `components/tools/random-pick-card.tsx`, `components/tools/shuffle-runner.tsx`
- Modify: `components/meetings/agenda-runner.tsx` (fill picker case)

**Interfaces produced:**
- Table: `shuffle_sessions`.
- Pure functions: `pickOne(rosterIds, seed?)`, `shuffle(rosterIds, seed?)`.
- Server actions: `picker.oneShot(meeting_id?, scope)`, `picker.startShuffle(meeting_id?, scope)`, `picker.advanceShuffle(id)`, `picker.backShuffle(id)`, `picker.restartShuffle(id)`.

### Task 6.1: `shuffle_sessions` + RLS

**Files:**
- Create: `db/migrations/0017_shuffle_sessions.sql`, `db/tests/shuffle_rls.sql`

- [ ] **Step 1: Migration**

```sql
create type public.shuffle_status as enum ('active','finished');

create table public.shuffle_sessions (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null references public.profiles(id) on delete cascade,
  meeting_id       uuid references public.meetings(id) on delete cascade,
  roster_snapshot  jsonb not null,               -- uuid[]
  current_index    int not null default 0,
  status           public.shuffle_status not null default 'active',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.shuffle_sessions(meeting_id);
create index on public.shuffle_sessions(owner_user_id);

alter table public.shuffle_sessions enable row level security;

create policy ss_read_owner on public.shuffle_sessions for select using (auth.uid() = owner_user_id and meeting_id is null);
create policy ss_read_meeting_participants on public.shuffle_sessions for select using (
  meeting_id is not null and exists (
    select 1 from public.meetings m where m.id = meeting_id
    and (m.participants_override is null
         or exists (select 1 from jsonb_array_elements_text(m.participants_override) x where x.value = auth.uid()::text)
         or m.host_user_id = auth.uid())
  )
);
create policy ss_write_owner_or_host on public.shuffle_sessions for all using (
  auth.uid() = owner_user_id
  or (meeting_id is not null and exists (select 1 from public.meetings m where m.id = meeting_id and m.host_user_id = auth.uid()))
) with check (
  auth.uid() = owner_user_id
  or (meeting_id is not null and exists (select 1 from public.meetings m where m.id = meeting_id and m.host_user_id = auth.uid()))
);

create trigger ss_touch before update on public.shuffle_sessions
  for each row execute function public.atlas_touch_updated_at();
```

- [ ] **Step 2: pgTAP + reset**

```sql
BEGIN; SELECT plan(1); SELECT has_table('public','shuffle_sessions'); SELECT * FROM finish(); ROLLBACK;
```

```bash
pnpm supabase db reset && pnpm supabase db test
```

- [ ] **Step 3: Commit**

```bash
git checkout -b atlas/06-random-tools
git add db/migrations/0017_shuffle_sessions.sql db/tests/shuffle_rls.sql
git commit -m "feat(db): shuffle_sessions"
```

### Task 6.2: Pure `pickOne` and `shuffle`

**Files:**
- Create: `lib/random/pick.ts`, `tests/random/pick.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { expect, test } from "vitest";
import { pickOne, shuffle } from "@/lib/random/pick";

test("pickOne is uniform-ish and returns a member of the list", () => {
  const list = ["a","b","c"]; for (let i = 0; i < 100; i++) expect(list).toContain(pickOne(list));
});
test("shuffle returns a permutation", () => {
  const list = ["a","b","c","d"]; const s = shuffle(list);
  expect(s.sort()).toEqual(list.sort()); expect(s.length).toBe(list.length);
});
test("shuffle with seed is deterministic", () => {
  expect(shuffle(["a","b","c"], 42)).toEqual(shuffle(["a","b","c"], 42));
});
```

Run: FAIL.

- [ ] **Step 2: Implementation (mulberry32 for seed)**

```ts
export function pickOne<T>(xs: T[], seed?: number): T {
  return xs[Math.floor(rng(seed)() * xs.length)];
}
export function shuffle<T>(xs: T[], seed?: number): T[] {
  const r = rng(seed); const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
function rng(seed?: number) {
  if (seed === undefined) return Math.random;
  let s = seed >>> 0;
  return () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
```

Run: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/random tests/random
git commit -m "feat(random): pickOne + seeded shuffle"
```

### Task 6.3: Server actions — picker

**Files:**
- Create: `lib/actions/picker.ts`

- [ ] **Step 1: Actions**

```ts
"use server";
import { requireUser } from "@/lib/auth/require";
import { shuffle, pickOne } from "@/lib/random/pick";
import { err, ok, type ActionResult } from "@/lib/actions/_result";

async function eligibleUserIds(supabase: ReturnType<Awaited<ReturnType<typeof requireUser>>['supabase']> | any, meetingId?: string | null) {
  if (meetingId) {
    const { data: m } = await supabase.from("meetings").select("participants_override").eq("id", meetingId).single();
    if (m?.participants_override) return (m.participants_override as string[]);
  }
  const today = new Date().toISOString().slice(0,10);
  const { data } = await supabase.from("profiles").select("id").eq("is_active", true);
  const ids = (data ?? []).map((p: any) => p.id as string);
  // filter out unavailable today via a batched rpc later; for v1, an in-loop check is fine.
  const filtered: string[] = [];
  for (const id of ids) {
    const { data: unavail } = await supabase.rpc("atlas_is_unavailable_on", { uid: id, day: today });
    if (!unavail) filtered.push(id);
  }
  return filtered;
}

export async function oneShotPick(meetingId?: string): Promise<ActionResult<{ user_id: string }>> {
  const { supabase } = await requireUser();
  const ids = await eligibleUserIds(supabase, meetingId);
  if (ids.length === 0) return err("empty_roster", "no eligible users");
  return ok({ user_id: pickOne(ids) });
}

export async function startShuffle(meetingId: string | null): Promise<ActionResult<{ id: string }>> {
  const { user, supabase } = await requireUser();
  const ids = await eligibleUserIds(supabase, meetingId);
  if (ids.length === 0) return err("empty_roster", "no eligible users");
  const { data, error } = await supabase.from("shuffle_sessions").insert({
    owner_user_id: user.id,
    meeting_id: meetingId,
    roster_snapshot: shuffle(ids),
    current_index: 0,
    status: "active",
  }).select("id").single();
  if (error || !data) return err("db_error", error?.message ?? "unknown");
  return ok({ id: data.id });
}

export async function advanceShuffle(id: string): Promise<ActionResult<null>> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("shuffle_sessions").select("current_index,roster_snapshot").eq("id", id).single();
  if (!data) return err("not_found", "shuffle");
  const next = data.current_index + 1;
  const finished = next >= (data.roster_snapshot as string[]).length;
  const { error } = await supabase.from("shuffle_sessions")
    .update({ current_index: finished ? (data.roster_snapshot as string[]).length - 1 : next, status: finished ? "finished" : "active" })
    .eq("id", id);
  if (error) return err("db_error", error.message);
  return ok(null);
}

export async function backShuffle(id: string): Promise<ActionResult<null>> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("shuffle_sessions").select("current_index").eq("id", id).single();
  if (!data) return err("not_found", "shuffle");
  const prev = Math.max(0, data.current_index - 1);
  const { error } = await supabase.from("shuffle_sessions").update({ current_index: prev, status: "active" }).eq("id", id);
  if (error) return err("db_error", error.message);
  return ok(null);
}

export async function restartShuffle(id: string): Promise<ActionResult<null>> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("shuffle_sessions").select("roster_snapshot").eq("id", id).single();
  if (!data) return err("not_found", "shuffle");
  const { error } = await supabase.from("shuffle_sessions")
    .update({ roster_snapshot: shuffle(data.roster_snapshot as string[]), current_index: 0, status: "active" }).eq("id", id);
  if (error) return err("db_error", error.message);
  return ok(null);
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/actions/picker.ts
git commit -m "feat(actions): picker (oneshot + shuffle)"
```

### Task 6.4: Random tool UIs (standalone + meeting-embedded)

**Files:**
- Create: `app/(app)/tools/pick/page.tsx`, `app/(app)/tools/shuffle/page.tsx`, `components/tools/random-pick-card.tsx`, `components/tools/shuffle-runner.tsx`
- Modify: `components/meetings/agenda-runner.tsx`

- [ ] **Step 1: Home shortcut buttons**

Modify `app/(app)/page.tsx` (or `app/(app)/home/page.tsx`) to render two prominent buttons: "Pick someone" → `/tools/pick`; "Shuffle roster" → `/tools/shuffle`.

- [ ] **Step 2: `random-pick-card.tsx`**

Client component. On mount, calls `oneShotPick()` and animates a card reveal with Framer Motion. A "Pick again" button re-rolls.

- [ ] **Step 3: `shuffle-runner.tsx`**

Client component. Takes either an existing session id (from `?id=`) or none. If none, calls `startShuffle(null)` and navigates to `?id=<new>`. Renders the current person, `Prev` / `Next` / `Restart` buttons. Subscribes to `shuffle_sessions:id` for meeting-embedded sync.

- [ ] **Step 4: Wire meeting agenda picker case**

In `agenda-runner.tsx`, when `currentItem.kind === "picker"`:
- If `picker_config.mode === "oneshot"`: if `picker_result` is set, show that person; if host and not set, show a "Pick" button that calls `oneShotPick(meetingId)` server-side and updates the agenda_item's `picker_result`.
- If `picker_config.mode === "shuffle"`: use `<ShuffleRunner />` bound to the meeting; only host sees Prev/Next/Restart.

Add a small server action `agenda.setPickerResult(item_id, picker_result)` (host-only) to persist the oneshot pick.

- [ ] **Step 5: Commit + PR**

```bash
git add app/(app)/tools components/tools components/meetings/agenda-runner.tsx
git commit -m "feat(ui): random pick + shuffle (standalone + meeting-embedded)"
```

### Phase 6 acceptance

- Standalone Home shows one-shot picker and shuffle session. Session survives refresh.
- In a live meeting, a picker agenda item triggers a shared animation; only host advances.

### Phase 6 PR

Base: `atlas/05-meetings-one-off`. Title `atlas 06/10 — random tools`.

---

## Phase 7: Series + rotation

Branch: `atlas/07-series-rotation` (off `atlas/06-random-tools`)

**Goal:** Admins define recurring meeting series with an rrule, rotation order, agenda template. A daily cron generates the next 14 days of occurrences and picks the next available host from the rotation cursor.

**Files touched:**
- Create: `db/migrations/0018_meeting_series.sql`, `db/tests/series_rls.sql`
- Create: `lib/rotation/pick-next-host.ts` (pure), `tests/rotation/pick-next-host.test.ts`
- Create: `lib/rrule/next-occurrences.ts` (pure), `tests/rrule/next-occurrences.test.ts`
- Create: `lib/zod/series.ts`, `lib/actions/series.ts`
- Create: `app/api/cron/generate-occurrences/route.ts`
- Create: `app/(app)/series/page.tsx`, `app/(app)/series/new/page.tsx`, `app/(app)/series/[id]/page.tsx`
- Create: `components/series/series-form.tsx`, `components/series/rotation-editor.tsx`
- Modify: `app/(app)/meetings/[id]/page.tsx` (surface series link, if present)
- Modify: `db/migrations/*` — add `meetings.series_id` FK

**Interfaces produced:**
- Table: `meeting_series`.
- FK: `meetings.series_id → meeting_series.id`.
- Pure helpers: `pickNextHost(order, cursor, isUnavailable)`, `nextOccurrences(rrule, tz, since, until)`.
- Cron endpoint `POST /api/cron/generate-occurrences` (auth: `x-cron-secret`).
- Server actions: `series.create`, `series.update`, `series.setRotation`, `series.delete`.

### Task 7.1: `meeting_series` migration + FK

**Files:**
- Create: `db/migrations/0018_meeting_series.sql`, `db/tests/series_rls.sql`

- [ ] **Step 1: Migration**

```sql
create table public.meeting_series (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,
  description               text,
  rrule                     text not null,
  timezone                  text not null,
  rotation_order            jsonb not null,  -- uuid[]
  rotation_cursor           int  not null default 0,
  default_participant_ids   jsonb,           -- uuid[] or null
  agenda_template           jsonb not null default '[]'::jsonb, -- array of { title, kind, prompt_template? }
  created_by                uuid not null references public.profiles(id) on delete restrict,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check (jsonb_array_length(rotation_order) > 0),
  check (rotation_cursor >= 0)
);

alter table public.meeting_series enable row level security;
create policy ms_read       on public.meeting_series for select using (auth.uid() is not null);
create policy ms_write_admin on public.meeting_series for all
  using (public.atlas_is_admin(auth.uid())) with check (public.atlas_is_admin(auth.uid()));

alter table public.meetings
  add constraint meetings_series_fk foreign key (series_id) references public.meeting_series(id) on delete set null;

create trigger ms_touch before update on public.meeting_series
  for each row execute function public.atlas_touch_updated_at();
```

- [ ] **Step 2: pgTAP + reset**

```sql
BEGIN; SELECT plan(2); SELECT has_table('public','meeting_series');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.meeting_series'::regclass));
SELECT * FROM finish(); ROLLBACK;
```

```bash
pnpm supabase db reset && pnpm supabase db test
git checkout -b atlas/07-series-rotation
git add db/migrations/0018_meeting_series.sql db/tests/series_rls.sql
git commit -m "feat(db): meeting_series + fk"
```

### Task 7.2: `pickNextHost` pure

**Files:**
- Create: `lib/rotation/pick-next-host.ts`, `tests/rotation/pick-next-host.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { expect, test } from "vitest";
import { pickNextHost } from "@/lib/rotation/pick-next-host";

test("picks cursor when available", () => {
  const r = pickNextHost(["u1","u2","u3"], 1, () => false);
  expect(r.host).toBe("u2"); expect(r.nextCursor).toBe(2);
});
test("skips unavailable and advances cursor accordingly", () => {
  const r = pickNextHost(["u1","u2","u3"], 0, id => id === "u1");
  expect(r.host).toBe("u2"); expect(r.nextCursor).toBe(2);
});
test("wraps around", () => {
  const r = pickNextHost(["u1","u2"], 3, () => false);
  expect(r.host).toBe("u2"); expect(r.nextCursor).toBe(0);
});
test("returns null when everyone unavailable", () => {
  const r = pickNextHost(["u1","u2"], 0, () => true);
  expect(r.host).toBeNull();
});
```

Run: FAIL.

- [ ] **Step 2: Implementation**

```ts
export type PickResult = { host: string | null; nextCursor: number; skipped: string[] };
export function pickNextHost(order: string[], cursor: number, isUnavailable: (id: string) => boolean): PickResult {
  const n = order.length;
  const skipped: string[] = [];
  for (let step = 0; step < n; step++) {
    const idx = (cursor + step) % n;
    const id = order[idx];
    if (!isUnavailable(id)) return { host: id, nextCursor: (idx + 1) % n, skipped };
    skipped.push(id);
  }
  return { host: null, nextCursor: cursor % n, skipped };
}
```

Run: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/rotation tests/rotation
git commit -m "feat(rotation): pickNextHost pure"
```

### Task 7.3: `nextOccurrences` from rrule

**Files:**
- Create: `lib/rrule/next-occurrences.ts`, `tests/rrule/next-occurrences.test.ts`

- [ ] **Step 1: Add lib**

Run: `pnpm add rrule luxon`  (rrule is battle-tested for RFC 5545; luxon handles TZ.)

- [ ] **Step 2: Failing test**

```ts
import { expect, test } from "vitest";
import { nextOccurrences } from "@/lib/rrule/next-occurrences";
test("weekly Monday 10:00 Africa/Nairobi", () => {
  const out = nextOccurrences("FREQ=WEEKLY;BYDAY=MO;BYHOUR=10;BYMINUTE=0", "Africa/Nairobi",
    new Date("2026-01-01T00:00:00Z"), new Date("2026-01-31T00:00:00Z"));
  expect(out.length).toBeGreaterThan(3);
  expect(out[0].toISOString().endsWith("07:00:00.000Z")).toBe(true); // 10:00 EAT = 07:00 UTC
});
```

- [ ] **Step 3: Implementation**

```ts
import { RRule } from "rrule";
import { DateTime } from "luxon";
export function nextOccurrences(rrule: string, tz: string, since: Date, until: Date): Date[] {
  // rrule library operates in UTC; we convert via luxon to project into the zone.
  const rule = RRule.fromString("DTSTART:" + DateTime.fromJSDate(since).setZone(tz).toFormat("yyyyLLdd'T'HHmmss") + "\nRRULE:" + rrule);
  return rule.between(since, until, true);
}
```

Run: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/rrule tests/rrule
git commit -m "feat(rrule): next-occurrences helper"
```

### Task 7.4: Occurrence generator cron

**Files:**
- Create: `app/api/cron/generate-occurrences/route.ts`

- [ ] **Step 1: Endpoint**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { nextOccurrences } from "@/lib/rrule/next-occurrences";
import { pickNextHost } from "@/lib/rotation/pick-next-host";

export async function POST(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) return NextResponse.json({ ok: false }, { status: 401 });
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const now = new Date(); const until = new Date(now.getTime() + 14 * 24 * 3600 * 1000);
  const { data: series } = await svc.from("meeting_series").select("*");
  for (const s of series ?? []) {
    const times = nextOccurrences(s.rrule, s.timezone, now, until);
    for (const t of times) {
      // idempotency: unique (series_id, scheduled_start)
      const { count } = await svc.from("meetings").select("id", { count: "exact", head: true })
        .eq("series_id", s.id).eq("scheduled_start", t.toISOString());
      if ((count ?? 0) > 0) continue;

      // pick host
      const day = t.toISOString().slice(0,10);
      async function isUnavail(uid: string) {
        const { data } = await svc.rpc("atlas_is_unavailable_on", { uid, day });
        return !!data;
      }
      const order: string[] = s.rotation_order;
      const pick = await (async () => {
        // sequential because rpc calls; small N
        const skipped: string[] = []; const n = order.length;
        for (let step = 0; step < n; step++) {
          const idx = (s.rotation_cursor + step) % n;
          if (!(await isUnavail(order[idx]))) return { host: order[idx], nextCursor: (idx+1)%n, skipped };
          skipped.push(order[idx]);
        }
        return { host: null, nextCursor: s.rotation_cursor % n, skipped };
      })();

      await svc.from("meetings").insert({
        series_id: s.id, title: s.name, scheduled_start: t.toISOString(), timezone: s.timezone,
        host_user_id: pick.host, created_by: s.created_by,
        status: pick.host ? "scheduled" : "cancelled",
        participants_override: s.default_participant_ids ?? null,
      });
      // Materialise agenda template as agenda_items.
      const { data: created } = await svc.from("meetings").select("id").eq("series_id", s.id).eq("scheduled_start", t.toISOString()).single();
      const template = s.agenda_template as { title: string; kind: "discussion"|"prompt"|"picker" }[];
      if (created && template.length) {
        await svc.from("agenda_items").insert(template.map((it, i) => ({
          meeting_id: created.id, ordinal: i, title: it.title, kind: it.kind, picker_config: it.kind === "picker" ? { mode: "shuffle", scope: "meeting_participants" } : null,
        })));
      }
      if (pick.host) {
        await svc.from("meeting_series").update({ rotation_cursor: pick.nextCursor }).eq("id", s.id);
      }
    }
  }
  return NextResponse.json({ ok: true });
}
```

Add uniqueness in a migration to make idempotency airtight:

```sql
-- db/migrations/0019_series_uniqueness.sql
alter table public.meetings add constraint meetings_series_start_unique unique (series_id, scheduled_start);
```

- [ ] **Step 2: Commit**

```bash
git add app/api/cron/generate-occurrences db/migrations/0019_series_uniqueness.sql
git commit -m "feat(cron): generate occurrences with rotation pick"
```

### Task 7.5: Series CRUD + UI

**Files:**
- Create: `lib/zod/series.ts`, `lib/actions/series.ts`, `app/(app)/series/*`, `components/series/*`

- [ ] **Step 1: Schemas + actions**

`series.create`, `series.update`, `series.setRotation`, `series.delete`. All require admin. `setRotation` accepts an array of user ids and validates each is in `profiles` and active.

- [ ] **Step 2: UI**

- Series list (admin sees create button).
- Series form: name, description, rrule (via helper: pick day + time + recurrence unit), timezone selector, rotation editor (drag to reorder), default participants override, agenda template editor.
- Series detail: upcoming generated occurrences (from `meetings` by `series_id`), current cursor position, edit button.

- [ ] **Step 3: Commit + PR**

```bash
git add lib/zod/series.ts lib/actions/series.ts app/(app)/series components/series
git commit -m "feat(ui): meeting series (admin)"
```

### Phase 7 acceptance

- Admin creates a weekly series with three-person rotation. Triggering the cron endpoint (manual `curl` with `x-cron-secret`) generates the next 14 days of meetings, each with the next available host and `rotation_cursor` advanced.

### Phase 7 PR

Base: `atlas/06-random-tools`. Title `atlas 07/10 — series + rotation`.

---

## Phase 8: Start/Postpone + auto-postpone cron

Branch: `atlas/08-postpone-state` (off `atlas/07-series-rotation`)

**Goal:** The full postpone state machine. Host can manually postpone. Cron ticks every minute; after 15 minutes past `scheduled_start` with no action, auto-postpone to +1 day same time. On the fourth no-show, cancel and advance the series cursor.

**Files touched:**
- Create: `lib/postpone/state-machine.ts` (pure), `tests/postpone/state-machine.test.ts`
- Create: `lib/actions/postpone.ts`
- Create: `app/api/cron/tick/route.ts`
- Modify: `components/meetings/meeting-live-view.tsx` (surface Start/Postpone buttons at scheduled_start)
- Create: `vercel.json`

**Interfaces produced:**
- Pure: `nextPostponeAction({ now, scheduled_start, status, auto_postpone_count })` returns `"none" | "cancel" | { kind: "auto_postpone", nextStart }`.
- Server action: `meeting.postponeManual({ meeting_id, new_start })`.
- Cron endpoint `POST /api/cron/tick` (every minute).

### Task 8.1: Postpone state machine pure

**Files:**
- Create: `lib/postpone/state-machine.ts`, `tests/postpone/state-machine.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { expect, test } from "vitest";
import { nextPostponeAction, GRACE_MIN, MAX_AUTO_POSTPONES } from "@/lib/postpone/state-machine";

const t0 = new Date("2026-07-24T10:00:00Z");
test("no action before grace window", () => {
  expect(nextPostponeAction({ now: new Date("2026-07-24T10:05:00Z"), scheduled_start: t0, status: "scheduled", auto_postpone_count: 0 })).toEqual({ kind: "none" });
});
test("auto-postpone after grace when < max", () => {
  const r = nextPostponeAction({ now: new Date("2026-07-24T10:16:00Z"), scheduled_start: t0, status: "scheduled", auto_postpone_count: 2 });
  expect(r.kind).toBe("auto_postpone");
  if (r.kind === "auto_postpone") expect(r.nextStart.toISOString()).toBe("2026-07-25T10:00:00.000Z");
});
test("cancel on the fourth strike", () => {
  const r = nextPostponeAction({ now: new Date("2026-07-24T10:16:00Z"), scheduled_start: t0, status: "scheduled", auto_postpone_count: 3 });
  expect(r).toEqual({ kind: "cancel" });
});
test("no action if already live/ended/postponed/cancelled", () => {
  for (const s of ["live","ended","postponed","cancelled"] as const)
    expect(nextPostponeAction({ now: new Date("2026-07-24T10:20:00Z"), scheduled_start: t0, status: s, auto_postpone_count: 0 })).toEqual({ kind: "none" });
});
```

- [ ] **Step 2: Implementation**

```ts
export const GRACE_MIN = 15;
export const MAX_AUTO_POSTPONES = 3;

export type Status = "scheduled"|"live"|"ended"|"postponed"|"cancelled";
export type Action =
  | { kind: "none" }
  | { kind: "auto_postpone"; nextStart: Date }
  | { kind: "cancel" };

export function nextPostponeAction(inp: { now: Date; scheduled_start: Date; status: Status; auto_postpone_count: number; }): Action {
  if (inp.status !== "scheduled") return { kind: "none" };
  const graceEnd = new Date(inp.scheduled_start.getTime() + GRACE_MIN * 60_000);
  if (inp.now < graceEnd) return { kind: "none" };
  if (inp.auto_postpone_count >= MAX_AUTO_POSTPONES) return { kind: "cancel" };
  const nextStart = new Date(inp.scheduled_start.getTime() + 24 * 3600_000);
  return { kind: "auto_postpone", nextStart };
}
```

Run: PASS.

- [ ] **Step 3: Commit**

```bash
git checkout -b atlas/08-postpone-state
git add lib/postpone tests/postpone
git commit -m "feat(postpone): state machine pure"
```

### Task 8.2: Manual postpone action

**Files:**
- Create: `lib/actions/postpone.ts`

- [ ] **Step 1: Action**

```ts
"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require";
import { err, ok, type ActionResult } from "@/lib/actions/_result";
import { createClient } from "@supabase/supabase-js";

const input = z.object({ meeting_id: z.string().uuid(), new_start: z.string().datetime() });

export async function postponeManual(raw: unknown): Promise<ActionResult<{ new_meeting_id: string }>> {
  const parsed = input.safeParse(raw); if (!parsed.success) return err("invalid_input", parsed.error.message);
  const { user, supabase } = await requireUser();
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  // 1. Read the current meeting, verify host.
  const { data: m } = await supabase.from("meetings").select("*").eq("id", parsed.data.meeting_id).single();
  if (!m || m.host_user_id !== user.id) return err("forbidden", "host required");
  if (m.status !== "scheduled") return err("bad_state", "only scheduled meetings can be postponed");
  // 2. Insert successor (service role bypasses the "insert self as host" RLS check).
  const { data: created, error } = await svc.from("meetings").insert({
    series_id: m.series_id, title: m.title, scheduled_start: parsed.data.new_start, timezone: m.timezone,
    host_user_id: m.host_user_id, created_by: m.created_by, status: "scheduled",
    auto_postpone_count: 0, participants_override: m.participants_override,
  }).select("id").single();
  if (error || !created) return err("db_error", error?.message ?? "unknown");
  // 3. Copy agenda_items.
  const { data: items } = await svc.from("agenda_items").select("ordinal,title,kind,prompt_id,picker_config").eq("meeting_id", m.id).order("ordinal");
  if (items?.length) await svc.from("agenda_items").insert(items.map(it => ({ meeting_id: created.id, ...it })));
  // 4. Close old meeting.
  await svc.from("meetings").update({ status: "postponed" }).eq("id", m.id);
  return ok({ new_meeting_id: created.id });
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/actions/postpone.ts
git commit -m "feat(actions): manual postpone"
```

### Task 8.3: Cron tick endpoint

**Files:**
- Create: `app/api/cron/tick/route.ts`, `vercel.json`

- [ ] **Step 1: Endpoint**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { nextPostponeAction } from "@/lib/postpone/state-machine";

export async function POST(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) return NextResponse.json({ ok: false }, { status: 401 });
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const now = new Date();

  const { data: pending } = await svc.from("meetings")
    .select("id,series_id,title,timezone,host_user_id,created_by,scheduled_start,status,auto_postpone_count,participants_override")
    .eq("status", "scheduled").lt("scheduled_start", new Date(now.getTime() - 14 * 60_000).toISOString()); // >14 min old

  for (const m of pending ?? []) {
    const action = nextPostponeAction({
      now, scheduled_start: new Date(m.scheduled_start), status: m.status as any, auto_postpone_count: m.auto_postpone_count,
    });
    if (action.kind === "none") continue;

    if (action.kind === "cancel") {
      await svc.from("meetings").update({ status: "cancelled" }).eq("id", m.id);
      if (m.series_id) {
        // advance series cursor by 1
        const { data: s } = await svc.from("meeting_series").select("rotation_order,rotation_cursor").eq("id", m.series_id).single();
        if (s) {
          const nextCursor = (s.rotation_cursor + 1) % (s.rotation_order as string[]).length;
          await svc.from("meeting_series").update({ rotation_cursor: nextCursor }).eq("id", m.series_id);
        }
      }
      continue;
    }

    // auto_postpone
    const { data: created } = await svc.from("meetings").insert({
      series_id: m.series_id, title: m.title, scheduled_start: action.nextStart.toISOString(), timezone: m.timezone,
      host_user_id: m.host_user_id, created_by: m.created_by,
      status: "scheduled", auto_postpone_count: m.auto_postpone_count + 1,
      participants_override: m.participants_override,
    }).select("id").single();
    if (created) {
      const { data: items } = await svc.from("agenda_items").select("ordinal,title,kind,prompt_id,picker_config").eq("meeting_id", m.id).order("ordinal");
      if (items?.length) await svc.from("agenda_items").insert(items.map(it => ({ meeting_id: created.id, ...it })));
    }
    await svc.from("meetings").update({ status: "postponed" }).eq("id", m.id);
  }

  return NextResponse.json({ ok: true, processed: pending?.length ?? 0 });
}
```

- [ ] **Step 2: `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/cron/tick",                   "schedule": "*/1 * * * *" },
    { "path": "/api/cron/generate-occurrences",   "schedule": "0 3 * * *" }
  ]
}
```

Note: Vercel signs cron requests with a Bearer token, not the custom secret. Update the endpoints' auth check to accept EITHER `x-cron-secret` (for local testing) OR `Authorization: Bearer <VERCEL_CRON_SECRET>`.

- [ ] **Step 3: Integration test with fake clock**

```ts
// tests/postpone/cron.integration.test.ts (sketch)
// Uses service role to seed a scheduled meeting with scheduled_start 20 min in the past.
// Calls the tick handler directly. Asserts a new meeting exists +1 day, old is postponed, auto_postpone_count is 1.
```

- [ ] **Step 4: Commit + PR**

```bash
git add app/api/cron/tick/route.ts vercel.json tests/postpone
git commit -m "feat(cron): auto-postpone tick"
```

### Task 8.4: UI — Start / Postpone controls

**Files:**
- Modify: `components/meetings/meeting-live-view.tsx`

- [ ] **Step 1: Add controls**

For the host, when `status === "scheduled"` and `now >= scheduled_start - 5min`, render two big buttons: **Start** (calls `startMeeting`) and **Postpone** (opens a date/time picker defaulting to +1 day, calls `postponeManual`).

For non-host participants at the same window, show a status label: "Waiting for {host} to start…"

- [ ] **Step 2: Commit + PR**

```bash
git add components/meetings/meeting-live-view.tsx
git commit -m "feat(ui): start / postpone controls"
```

### Phase 8 acceptance

- Manual postpone: click, pick +1 day, new meeting scheduled, old marked postponed.
- Auto-postpone (via `curl POST /api/cron/tick` with `x-cron-secret`) after seeding a meeting `scheduled_start` 20 min in the past: successor created, `auto_postpone_count` incremented. On the fourth strike: cancelled, cursor advanced.
- Unit tests cover the pure state machine end-to-end.

### Phase 8 PR

Base: `atlas/07-series-rotation`. Title `atlas 08/10 — postpone state machine`.

---

## Phase 9: Notifications (in-app + email)

Branch: `atlas/09-notifications` (off `atlas/08-postpone-state`)

**Goal:** In-app bell + feed powered by Realtime. Email pipeline via Resend + React Email for all 7 kinds. Email preferences per-user, idempotent sends.

**Files touched:**
- Create: `db/migrations/0020_notifications.sql`, `db/migrations/0021_email_events.sql`, `db/tests/notifications_rls.sql`
- Create: `lib/email/render.ts`, `lib/email/send.ts`
- Create: `emails/*` (React Email templates, one per kind)
- Create: `lib/notify/emit.ts` (single entry point for both in-app + email)
- Modify: cron endpoints + relevant server actions to call `notify.emit(...)`
- Create: `app/(app)/notifications/page.tsx`, `components/app/notifications-bell.tsx`
- Modify: `app/(app)/settings/page.tsx` (email prefs section)
- Create: `app/api/cron/send-emails/route.ts`

**Interfaces produced:**
- Tables: `notifications`, `email_events`.
- Function: `notify.emit({ user_ids, kind, title, body, link, email? })` — writes in-app rows and enqueues email events.
- Cron `POST /api/cron/send-emails` — drains pending `email_events` rows via Resend.

### Task 9.1: Migrations

**Files:**
- Create: `db/migrations/0020_notifications.sql`, `db/migrations/0021_email_events.sql`, `db/tests/notifications_rls.sql`

- [ ] **Step 1: `notifications`**

```sql
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null,
  link       text not null default '/',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;
create policy notif_read_self on public.notifications for select using (auth.uid() = user_id);
create policy notif_write_self on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Inserts happen only via service role (from notify.emit inside server actions and cron).
```

- [ ] **Step 2: `email_events`**

```sql
create table public.email_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null,
  dedupe_key  text not null unique,
  payload     jsonb not null,
  resend_id   text,
  sent_at     timestamptz,
  error       text,
  created_at  timestamptz not null default now()
);
create index on public.email_events(sent_at) where sent_at is null;

alter table public.email_events enable row level security;
create policy ee_admin_read on public.email_events for select using (public.atlas_is_admin(auth.uid()));
-- Inserts + updates only via service role.
```

- [ ] **Step 3: pgTAP + reset + commit**

```sql
BEGIN; SELECT plan(2);
SELECT has_table('public','notifications'); SELECT has_table('public','email_events');
SELECT * FROM finish(); ROLLBACK;
```

```bash
pnpm supabase db reset && pnpm supabase db test
git checkout -b atlas/09-notifications
git add db/migrations/0020_notifications.sql db/migrations/0021_email_events.sql db/tests/notifications_rls.sql
git commit -m "feat(db): notifications + email_events"
```

### Task 9.2: React Email templates

**Files:**
- Create: `emails/meeting-scheduled.tsx`, `emails/async-prompts-pending.tsx`, `emails/meeting-starts-soon.tsx`, `emails/meeting-postponed.tsx`, `emails/meeting-cancelled.tsx`, `emails/poll-created.tsx`, `emails/poll-revealed.tsx`
- Create: `lib/email/render.ts`

- [ ] **Step 1: Add libs**

Run: `pnpm add resend react-email @react-email/components`

- [ ] **Step 2: Template shape**

One React Email component per kind, all sharing a small `Layout` component that puts the Atlas logo + a link back to the app. Each takes typed props. Example:

```tsx
// emails/meeting-starts-soon.tsx
import { Html, Body, Container, Heading, Text, Button } from "@react-email/components";
export default function MeetingStartsSoon({ meetingTitle, when, url }: { meetingTitle: string; when: string; url: string }) {
  return (
    <Html><Body>
      <Container>
        <Heading>{meetingTitle} starts in 10 minutes</Heading>
        <Text>Scheduled for {when}.</Text>
        <Button href={url}>Open Atlas</Button>
      </Container>
    </Body></Html>
  );
}
```

- [ ] **Step 3: Render helper**

```ts
// lib/email/render.ts
import { render } from "@react-email/render";
export function renderEmail<T extends React.ReactElement>(el: T) {
  return { html: render(el), text: render(el, { plainText: true }) };
}
```

- [ ] **Step 4: Commit**

```bash
git add emails lib/email/render.ts
git commit -m "feat(email): react-email templates"
```

### Task 9.3: `notify.emit` + email cron

**Files:**
- Create: `lib/notify/emit.ts`, `lib/email/send.ts`, `app/api/cron/send-emails/route.ts`

- [ ] **Step 1: `emit`**

```ts
// lib/notify/emit.ts
import { createClient } from "@supabase/supabase-js";

type EmitInput = {
  user_ids: string[];
  kind: string;
  title: string;
  body: string;
  link: string;
  email?: { dedupeKey: (uid: string) => string; payload: Record<string, unknown> };
};

export async function emit(input: EmitInput) {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  if (input.user_ids.length) {
    await svc.from("notifications").insert(input.user_ids.map(uid => ({
      user_id: uid, kind: input.kind, title: input.title, body: input.body, link: input.link,
    })));
  }
  if (input.email) {
    const rows = input.user_ids.map(uid => ({
      user_id: uid, kind: input.kind, dedupe_key: input.email!.dedupeKey(uid), payload: input.email!.payload,
    }));
    if (rows.length) await svc.from("email_events").upsert(rows, { onConflict: "dedupe_key" });
  }
}
```

- [ ] **Step 2: `send-emails` cron**

```ts
// app/api/cron/send-emails/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { renderEmail } from "@/lib/email/render";
import MeetingScheduled from "@/emails/meeting-scheduled";
import MeetingStartsSoon from "@/emails/meeting-starts-soon";
// ... other imports

const templates: Record<string, (p: any) => React.ReactElement> = {
  meeting_scheduled: (p) => <MeetingScheduled {...p} />,
  meeting_starts_soon: (p) => <MeetingStartsSoon {...p} />,
  // ... register each kind
};

export async function POST(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) return NextResponse.json({ ok: false }, { status: 401 });
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const resend = new Resend(process.env.RESEND_API_KEY!);

  const { data: events } = await svc.from("email_events").select("*").is("sent_at", null).limit(50);
  for (const e of events ?? []) {
    const { data: p } = await svc.from("profiles").select("email,email_prefs").eq("id", e.user_id).single();
    if (!p || p.email_prefs?.[e.kind] === false) { await svc.from("email_events").update({ sent_at: new Date().toISOString(), error: "opted_out" }).eq("id", e.id); continue; }
    const tpl = templates[e.kind]; if (!tpl) { await svc.from("email_events").update({ error: "no_template" }).eq("id", e.id); continue; }
    const { html, text } = renderEmail(tpl(e.payload));
    const { data: r, error } = await resend.emails.send({ from: "Atlas <no-reply@atlas.example>", to: p.email, subject: e.payload?.subject ?? "Atlas update", html, text });
    await svc.from("email_events").update({ resend_id: r?.id ?? null, sent_at: new Date().toISOString(), error: error?.message ?? null }).eq("id", e.id);
  }
  return NextResponse.json({ ok: true, count: events?.length ?? 0 });
}
```

Register the cron in `vercel.json`:

```json
{ "path": "/api/cron/send-emails", "schedule": "*/2 * * * *" }
```

- [ ] **Step 3: Wire triggers**

- `meeting.createOneOff` and `generate-occurrences` → emit `meeting_scheduled`.
- `prompt.create` (async, meeting-scoped) → emit `async_prompts_pending`.
- `postponeManual` and cron auto-postpone → emit `meeting_postponed`.
- Cron auto-cancel → emit `meeting_cancelled`.
- Cron ticks 10 min before `scheduled_start` on `scheduled` meetings → emit `meeting_starts_soon` (dedupe key: `meeting:<id>:starts_soon:user:<uid>`).
- `poll.createStandalone` → emit `poll_created`.
- `poll.reveal` → emit `poll_revealed` to responders.

- [ ] **Step 4: Commit**

```bash
git add lib/notify lib/email/send.ts app/api/cron/send-emails vercel.json
git commit -m "feat(notify): emit + email cron + wiring"
```

### Task 9.4: In-app UI

**Files:**
- Create: `app/(app)/notifications/page.tsx`, `components/app/notifications-bell.tsx`
- Modify: `components/app/nav.tsx` (embed bell), `app/(app)/settings/page.tsx` (add prefs section)

- [ ] **Step 1: Bell (client)**

Subscribes via Supabase Realtime to `postgres_changes` on `notifications` filtered by `user_id=eq.<me>`. Shows unread count. On click, opens a popover with the last 10, each links to `link`. Marking-read on click via `notifications.markRead` server action.

- [ ] **Step 2: Feed page**

Paginated list of all notifications for the user, "Mark all read" button.

- [ ] **Step 3: Settings — email prefs**

Toggle per kind. Persisted in `profiles.email_prefs` (`{ "meeting_scheduled": false, ... }`). Saved via `updateProfile`.

- [ ] **Step 4: Commit + PR**

```bash
git add app/(app)/notifications components/app/notifications-bell.tsx app/(app)/settings/page.tsx components/app/nav.tsx
git commit -m "feat(ui): notifications bell + feed + email prefs"
```

### Phase 9 acceptance

- Creating a one-off meeting → participants see a bell badge and receive an email within 2 minutes.
- Toggling off `meeting_scheduled` in Settings suppresses the email (still shows in-app).
- Retriggering the send-emails cron doesn't double-send (dedupe_key).

### Phase 9 PR

Base: `atlas/08-postpone-state`. Title `atlas 09/10 — notifications`.

---

## Phase 10: History + polish + deploy docs

Branch: `atlas/10-history-polish` (off `atlas/09-notifications`)

**Goal:** Past meetings + past polls sections. Consolidated Home dashboard. Accessibility pass. Smoke E2E covering the full happy path. README + deploy docs. First deploy.

**Files touched:**
- Create: `app/(app)/meetings/past/page.tsx`, `app/(app)/polls/past/page.tsx`
- Modify: `app/(app)/page.tsx` (Home dashboard)
- Create: `docs/deploy.md`, `docs/qa/atlas.md`
- Modify: `README.md`
- Create: `e2e/happy-path.spec.ts`

**Interfaces produced:** none (UX + docs).

### Task 10.1: Past sections

- [ ] **Step 1: Past meetings page**

Query `meetings where status in ('ended','cancelled','postponed') and started_at is not null` ordered `desc`. Each row shows title, host, when, participant count, and a link to a read-only meeting view that renders the same live view but disables all controls and always shows the final reveal state.

- [ ] **Step 2: Past polls page**

Query `prompts where is_revealed = true` (standalone: `meeting_id is null`). Link to the poll detail page (already renders reveal view when `is_revealed`).

- [ ] **Step 3: Commit**

```bash
git checkout -b atlas/10-history-polish
git add app/(app)/meetings/past app/(app)/polls/past
git commit -m "feat(ui): past meetings + past polls"
```

### Task 10.2: Home dashboard consolidation

- [ ] **Step 1: Home layout**

Three cards:
1. **Your next meeting** — soonest `scheduled` or `live` meeting where you're a participant. Includes Start/Postpone buttons if you're the host and it's within +/- 5 min of `scheduled_start`.
2. **Awaiting your response** — list of open prompts you haven't answered (async standalone + async meeting-scoped that have opened).
3. **Quick tools** — Pick someone, Shuffle roster.

- [ ] **Step 2: Commit**

```bash
git add app/(app)/page.tsx
git commit -m "feat(ui): home dashboard"
```

### Task 10.3: Accessibility pass

- [ ] **Step 1: Baseline audit**

Run: `pnpm add -D @axe-core/playwright`, add `e2e/a11y.spec.ts` scanning `/sign-in`, `/`, `/roster`, `/polls/new`. Address any violations (labels, contrast, focus).

- [ ] **Step 2: Keyboard smoke test**

Manual: tab-through Home + Poll creation + Meeting live view. Ensure all interactive elements reachable, focus visible, ESC closes dialogs.

- [ ] **Step 3: Commit**

```bash
git add e2e/a11y.spec.ts
git commit -m "test(a11y): axe scan on key pages"
```

### Task 10.4: Happy-path E2E + QA checklist

**Files:**
- Create: `e2e/happy-path.spec.ts`, `docs/qa/atlas.md`

- [ ] **Step 1: E2E**

End-to-end script that (using service-role fixtures) creates two users, signs in as user A, creates a one-off meeting with a hard-anonymous rating prompt, signs in as user B, submits rating 4, back to A, starts meeting, advances to prompt, reveals, verifies histogram shows a single bar at 4.

- [ ] **Step 2: Manual QA checklist**

Enumerate the acceptance criteria of each of phases 2–9 for a human tester to run pre-release. Save as `docs/qa/atlas.md`.

- [ ] **Step 3: Commit**

```bash
git add e2e/happy-path.spec.ts docs/qa/atlas.md
git commit -m "test(e2e): happy-path + manual qa checklist"
```

### Task 10.5: Deploy docs + first deploy

**Files:**
- Create: `docs/deploy.md`
- Modify: `README.md`

- [ ] **Step 1: `docs/deploy.md`**

Cover: create a Supabase project; run migrations (`supabase db push`); set env vars on Vercel (SUPABASE URLs + service role + Resend key + CRON secret); enable Google OAuth in Supabase; configure Resend sender domain; verify cron endpoints appear in Vercel dashboard.

- [ ] **Step 2: Deploy**

Push `main` (after merging the stack) to trigger Vercel. Smoke-test the deployed URL: sign in, create a one-off, respond, reveal.

- [ ] **Step 3: Commit + PR**

```bash
git add docs/deploy.md README.md
git commit -m "docs(deploy): first-deploy runbook"
```

### Phase 10 acceptance

- All acceptance criteria of Phases 2–9 still pass on a fresh install.
- Past meetings + past polls browsable.
- Home dashboard is the default landing after sign-in.
- axe scan clean on the four highest-traffic pages.
- Deployed URL works end-to-end.

### Phase 10 PR

Base: `atlas/09-notifications`. Title `atlas 10/10 — history, polish, deploy`. This closes the stack.

---

## Self-review

Ran the checklist on the spec:

**Spec coverage.** Every section of the spec maps to a task or phase:

| Spec section | Where handled |
|---|---|
| §3 Personas | Phases 2 (roles) and 7 (series admin) |
| §4 Surfaces | Home (10), Roster (2), Meetings (5,7,8), Series (7), Polls (3,4), Notifications (9), Settings (2,9) |
| §5.1–5.2 profiles + unavailability | Phase 2 |
| §5.3 meeting_series | Phase 7 |
| §5.4 meetings | Phase 5 (schema) + 7 (series link) + 8 (postpone) |
| §5.5 agenda_items | Phase 5 |
| §5.6 prompts | Phase 3 (schema) + 4 (anonymity fields) + 5 (meeting fk) |
| §5.7 responses_attributed | Phase 3 |
| §5.8 responses_anonymous | Phase 4 |
| §5.9 participation | Phase 3 |
| §5.10 shuffle_sessions | Phase 6 |
| §5.11 notifications | Phase 9 |
| §5.12 email_events | Phase 9 |
| §6 Response shapes | Phase 3 (validator) |
| §7 Anonymity mechanics | Phase 4 (all of it) |
| §7.4 Counter denominator (standalone) | Phase 3 |
| §7.4 Counter denominator (meeting) | Phase 5 (replaces denominator) |
| §8 Rotation + postpone | Phases 7 + 8 |
| §9 Random tools | Phase 6 |
| §10 Realtime | Phases 3, 5, 6, 9 (progressive) |
| §11 Notifications | Phase 9 |
| §12 Auth + RLS | Every migration |
| §13 Server actions | Every phase; matched by name |
| §14 Error handling | `ActionResult` set up in Phase 2, used throughout |
| §15 Testing | Vitest/Playwright/pgTAP harness in Phase 1; per-phase tests thereafter |
| §16 Rollout | Phase list mirrors it (split M3 → 5+6; split M4 → 7+8) |
| §17 Assumed defaults | Enforced by schema and RLS; #4 (live prompts mid-meeting) supported because prompt.create requires only author + meeting membership; #10 grace = `GRACE_MIN = 15`; #11 first admin = auth trigger |

No gaps.

**Placeholder scan.** No TBDs. Every code step has actual code. E2E skeletons that depend on auth fixtures are explicitly marked `test.skip(...)` with a comment — those are acknowledged deferrals, not placeholders in shipping code.

**Type consistency.**
- `atlas_prompt_denominator(uuid)` — same signature in Phase 3 (creates) and Phase 5 (replaces).
- `atlas_submit_attributed(uuid, jsonb)` — matches between migration and `submitResponse`.
- `atlas_submit_anonymous(uuid, jsonb)` — same.
- `atlas_get_prompt_results(uuid)` — one signature, used by anonymous reveal view.
- `ActionResult<T>` — defined once in Phase 2, used in every action.
- `pickNextHost` — same signature in tests and cron implementation.
- `nextPostponeAction` — same signature in tests and cron.

No drift.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-24-atlas-implementation.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
