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
