# Atlas

Internal meeting webapp — meetings with agendas, attributed + hard-anonymous
polls, rotation-based series, and per-user email notifications.

- Design: `docs/superpowers/specs/2026-07-24-atlas-design.md`
- Phased plan: `docs/superpowers/plans/2026-07-24-atlas-implementation.md`
- Pre-release QA checklist: `docs/qa/atlas.md`
- First-deploy runbook: `docs/deploy.md`

## Dev

```bash
pnpm install
pnpm supabase start
cp .env.example .env.local  # fill in local Supabase keys from `pnpm supabase status`
pnpm dev
```

## Tests

- `pnpm test` — Vitest unit + integration
- `pnpm test:rls` — pgTAP against local Supabase
- `pnpm test:e2e` — Playwright against local dev
- `pnpm typecheck` — TypeScript, no emit

## Layout

- `app/(app)/…` — authenticated app routes (dashboard, roster, meetings, polls, series, notifications, settings)
- `app/(auth)/sign-in` — Supabase magic-link + Google
- `app/api/cron/*` — Vercel cron endpoints (require `x-cron-secret`)
- `lib/actions/*` — server actions
- `lib/notify/*` — notification emit + email delivery
- `components/*` — shared UI (shadcn + custom)
- `db/supabase/supabase/migrations/*` — SQL migrations
- `db/supabase/supabase/tests/*` — pgTAP RLS tests
- `tests/*` — Vitest unit + integration
- `e2e/*` — Playwright specs

## Deploying

See `docs/deploy.md`.
