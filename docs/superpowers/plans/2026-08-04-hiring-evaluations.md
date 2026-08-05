# Hiring Evaluations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Hiring section to Atlas where admins import candidate responses from a private Google Sheet, a chosen panel rates each answer 1–5, and results stay private per-evaluator until an admin closes the evaluation and an aggregate is revealed.

**Architecture:** New `evaluation_*` Postgres schema with RLS enforcing per-evaluator privacy; a `security definer` RPC exposes the closed aggregate with two-grain small-panel suppression. A dependency-free Google Sheets client (service-account JWT signed with Node `crypto` + `fetch`) feeds an idempotent importer. Server actions in `lib/actions/evaluation.ts` orchestrate; App-Router pages under `app/(app)/hiring` render.

**Tech Stack:** Next.js 15 (App Router, server actions), React 19, Supabase (Postgres + RLS), `zod`, Vitest (unit + integration), pgTAP (RLS), Playwright (optional e2e). No new npm dependencies.

## Global Constraints

- **No new npm dependencies.** Sheets access via Node `crypto` + `fetch`; parsing in-house; `zod` already present.
- **Migrations are append-only and numbered.** Next numbers: `0028`, `0029` under `db/supabase/supabase/migrations/`.
- **Every new table:** `enable row level security`; `grant` to `authenticated` (least-privilege) and full to `service_role`. Tables with mutable non-key columns also get `updated_at timestamptz not null default now()` + a BEFORE UPDATE `public.atlas_touch_updated_at()` trigger (`evaluations`, `evaluation_ratings`, `evaluation_questions`, `evaluation_candidates`, `evaluation_answers`). `evaluation_panelists` is a pure junction (composite PK only, insert/delete-only) and is intentionally trigger-free.
- **Server-action files** are `"use server"` and may export **only async functions**. Constants/types go in non-`"use server"` modules.
- **Admin gate:** reuse `requireAdmin()` from `lib/auth/require.ts` and `public.atlas_is_admin(uid)` in SQL. Panelist gate: new `public.atlas_is_panelist(uid, eval_id)`.
- **Privacy invariant (non-negotiable):** no user (admins included) may read another user's individual `evaluation_ratings` rows. Raw candidate/question/answer rows are readable only by that evaluation's panelists + admins, at every status. Non-panelists receive the closed aggregate only via the `evaluation_results` RPC.
- **Small-panel suppression constant:** `MIN_RATERS_FOR_AGGREGATE = 3`, defined once as `public.evaluation_min_raters()` and reused by RPC + tests.
- **Env var:** `GOOGLE_SERVICE_ACCOUNT_JSON` (service-account JSON string). Never `NEXT_PUBLIC_`.
- **Aggregation semantics:** per-question average = mean over raters who scored that cell; candidate overall = mean-of-means over active questions (personal view: questions the caller rated; closed aggregate: qualifying cells only, i.e. cells scored by ≥ `MIN_RATERS_FOR_AGGREGATE` distinct raters). Ranking: overall desc, ties by display name. Only `is_active = true` candidates/questions are aggregated. Ratings from now-inactive profiles still count post-close.
- **Commit after every task** with a `feat:`/`test:`/`docs:` message. Do **not** add any `Co-Authored-By` trailer.

---

## File Structure

**Database**

- `db/supabase/supabase/migrations/0028_hiring_evaluations.sql` — enum, 6 tables, indexes, `atlas_is_panelist`, `evaluation_min_raters`, RLS policies.
- `db/supabase/supabase/migrations/0029_evaluation_rpcs.sql` — `evaluation_results`, `evaluation_panel_progress` RPCs + grants.
- `db/supabase/supabase/tests/evaluations_rls.sql` — pgTAP structural + behavioral.

**Sheets ingestion (pure, unit-tested)**

- `lib/sheets/types.ts` — shared types.
- `lib/sheets/parse.ts` — `detectMapping`, `normalizeRows`.
- `lib/sheets/jwt.ts` — `mintServiceJwt`.
- `lib/sheets/client.ts` — `getAccessToken`, `readSheet`.

**Aggregation (pure)**

- `lib/evaluation/aggregate.ts` — `computePersonalScores`.

**Server layer**

- `lib/zod/evaluation.ts` — input schemas.
- `lib/actions/evaluation.ts` — all server actions.
- `lib/evaluation/queries.ts` — page data fetchers.

**UI**

- `app/(app)/hiring/page.tsx` + `app/(app)/hiring/_ui/*` — list, create dialog, status badge.
- `app/(app)/hiring/[id]/page.tsx` + `app/(app)/hiring/[id]/_ui/*` — detail router, admin controls, mapping dialog, rating panel, results view.
- `components/app/nav.tsx` — add Hiring nav item (desktop sidebar only; mobile bottom bar is a fixed 5-slot bar, left untouched).

**Config / docs**

- `.env.example` — add `GOOGLE_SERVICE_ACCOUNT_JSON`.
- `docs/hiring-sheets-setup.md` — service-account runbook.

**Tests**

- `tests/sheets/*.test.ts`, `tests/evaluation/*.test.ts`, `tests/actions/evaluation.integration.test.ts`.
- `e2e/hiring.spec.ts` (optional).

---

## Task 1: Database schema + RLS (migration 0028)

**Files:**

- Create: `db/supabase/supabase/migrations/0028_hiring_evaluations.sql`
- Create/Test: `db/supabase/supabase/tests/evaluations_rls.sql`

**Interfaces:**

- Produces (SQL objects later tasks rely on):
  - enum `public.evaluation_status` = `('draft','open','closed')`
  - tables `evaluations`, `evaluation_questions`, `evaluation_candidates`, `evaluation_answers`, `evaluation_panelists`, `evaluation_ratings` (columns exactly as in the spec's Data model section).
  - `public.evaluation_min_raters() returns int` (immutable, returns 3).
  - `public.atlas_is_panelist(uid uuid, eval_id uuid) returns boolean` (security definer, stable).

- [ ] **Step 1: Write the failing RLS test**

Create `db/supabase/supabase/tests/evaluations_rls.sql`. **Structural only** — matching every other RLS test in this repo (`has_table`, `pg_policies` counts, `relrowsecurity`). The _behavioral_ privacy guarantee (rater-A-can't-read-rater-B, closed-reveal, suppression) is proven in the Vitest integration test in Task 10, which drives real authenticated PostgREST clients — a stronger and more maintainable check than role-switching inside pgTAP.

```sql
BEGIN;
SELECT plan(13);

-- Tables exist
SELECT has_table('public','evaluations','evaluations table exists');
SELECT has_table('public','evaluation_questions','questions table exists');
SELECT has_table('public','evaluation_candidates','candidates table exists');
SELECT has_table('public','evaluation_answers','answers table exists');
SELECT has_table('public','evaluation_panelists','panelists table exists');
SELECT has_table('public','evaluation_ratings','ratings table exists');

-- RLS enabled on the privacy-critical tables
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.evaluation_ratings'::regclass),
  'evaluation_ratings has RLS');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.evaluation_answers'::regclass),
  'evaluation_answers has RLS');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.evaluation_candidates'::regclass),
  'evaluation_candidates has RLS');

-- Helper + constant present
SELECT is(public.evaluation_min_raters(), 3, 'min raters is 3');
SELECT has_function('public','atlas_is_panelist',
  ARRAY['uuid','uuid'], 'atlas_is_panelist(uuid,uuid) exists');

-- Ratings has exactly 2 policies: read-self (select) + write-self (all)
SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE schemaname='public' AND tablename='evaluation_ratings'),
  2, 'evaluation_ratings has 2 policies (read-self + write-self)');

-- Answers has exactly 2 policies: panelist/admin read + admin write
SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE schemaname='public' AND tablename='evaluation_answers'),
  2, 'evaluation_answers has 2 policies (read + admin write)');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm supabase start` (if not already up), then `pnpm supabase db test`
Expected: FAIL — `evaluations` and related tables/functions do not exist.

- [ ] **Step 3: Write the migration**

Create `db/supabase/supabase/migrations/0028_hiring_evaluations.sql`:

```sql
-- Hiring evaluations: import candidate responses, panel rates 1-5,
-- per-evaluator privacy until an admin closes and an aggregate is revealed.

create type public.evaluation_status as enum ('draft','open','closed');

create table public.evaluations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  status            public.evaluation_status not null default 'draft',
  sheet_id          text,
  sheet_tab         text,
  email_column      text,
  name_column       text,
  timestamp_column  text,
  mapping_confirmed boolean not null default false,
  created_by        uuid references public.profiles(id) on delete set null,
  last_synced_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.evaluation_questions (
  id            uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  column_key    text not null,
  prompt        text not null,
  position      int  not null,
  is_active     boolean not null default true,
  updated_at    timestamptz not null default now(),
  unique (evaluation_id, column_key)
);

create table public.evaluation_candidates (
  id            uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  email         citext not null,
  display_name  text not null,
  submitted_at  timestamptz,
  is_active     boolean not null default true,
  updated_at    timestamptz not null default now(),
  unique (evaluation_id, email)
);

create table public.evaluation_answers (
  id            uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  candidate_id  uuid not null references public.evaluation_candidates(id) on delete cascade,
  question_id   uuid not null references public.evaluation_questions(id) on delete cascade,
  answer_text   text,
  updated_at    timestamptz not null default now(),
  unique (candidate_id, question_id)
);

-- Pure junction (composite PK only, insert/delete-only): intentionally trigger-free.
create table public.evaluation_panelists (
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  primary key (evaluation_id, profile_id)
);

create table public.evaluation_ratings (
  id            uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  candidate_id  uuid not null references public.evaluation_candidates(id) on delete cascade,
  question_id   uuid not null references public.evaluation_questions(id) on delete cascade,
  rater_id      uuid not null references public.profiles(id) on delete cascade,
  score         smallint not null check (score between 1 and 5),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (evaluation_id, rater_id, candidate_id, question_id)
);

create index on public.evaluation_questions (evaluation_id);
create index on public.evaluation_candidates (evaluation_id);
create index on public.evaluation_answers (candidate_id);
create index on public.evaluation_answers (question_id);
create index on public.evaluation_ratings (evaluation_id, candidate_id, question_id);
create index on public.evaluation_ratings (rater_id);

create trigger evaluations_touch before update on public.evaluations
  for each row execute function public.atlas_touch_updated_at();
create trigger evaluation_ratings_touch before update on public.evaluation_ratings
  for each row execute function public.atlas_touch_updated_at();
create trigger evaluation_questions_touch before update on public.evaluation_questions
  for each row execute function public.atlas_touch_updated_at();
create trigger evaluation_candidates_touch before update on public.evaluation_candidates
  for each row execute function public.atlas_touch_updated_at();
create trigger evaluation_answers_touch before update on public.evaluation_answers
  for each row execute function public.atlas_touch_updated_at();

-- Suppression floor, single source of truth.
create or replace function public.evaluation_min_raters() returns int
language sql immutable as $$ select 3 $$;

-- Panelist check (security definer avoids recursive RLS on panelists).
create or replace function public.atlas_is_panelist(uid uuid, eval_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.evaluation_panelists ep
    join public.profiles p on p.id = ep.profile_id
    where ep.evaluation_id = eval_id and ep.profile_id = uid and p.is_active
  );
$$;

-- Enable RLS
alter table public.evaluations          enable row level security;
alter table public.evaluation_questions enable row level security;
alter table public.evaluation_candidates enable row level security;
alter table public.evaluation_answers   enable row level security;
alter table public.evaluation_panelists enable row level security;
alter table public.evaluation_ratings   enable row level security;

-- evaluations: admins full; non-admins may see non-draft rows exist.
create policy evaluations_read on public.evaluations for select using (
  public.atlas_is_admin(auth.uid()) or status <> 'draft'
);
create policy evaluations_admin_write on public.evaluations for all
  using (public.atlas_is_admin(auth.uid()))
  with check (public.atlas_is_admin(auth.uid()));

-- panelists: admins write; user may see their own membership rows.
create policy panelists_read on public.evaluation_panelists for select using (
  public.atlas_is_admin(auth.uid()) or profile_id = auth.uid()
);
create policy panelists_admin_write on public.evaluation_panelists for all
  using (public.atlas_is_admin(auth.uid()))
  with check (public.atlas_is_admin(auth.uid()));

-- questions: panelists + admins read; admins write.
create policy questions_read on public.evaluation_questions for select using (
  public.atlas_is_admin(auth.uid())
  or public.atlas_is_panelist(auth.uid(), evaluation_id)
);
create policy questions_admin_write on public.evaluation_questions for all
  using (public.atlas_is_admin(auth.uid()))
  with check (public.atlas_is_admin(auth.uid()));

-- candidates: panelists + admins read; admins write.
create policy candidates_read on public.evaluation_candidates for select using (
  public.atlas_is_admin(auth.uid())
  or public.atlas_is_panelist(auth.uid(), evaluation_id)
);
create policy candidates_admin_write on public.evaluation_candidates for all
  using (public.atlas_is_admin(auth.uid()))
  with check (public.atlas_is_admin(auth.uid()));

-- answers: panelists + admins read; admins write.
create policy answers_read on public.evaluation_answers for select using (
  public.atlas_is_admin(auth.uid())
  or public.atlas_is_panelist(auth.uid(), evaluation_id)
);
create policy answers_admin_write on public.evaluation_answers for all
  using (public.atlas_is_admin(auth.uid()))
  with check (public.atlas_is_admin(auth.uid()));

-- ratings: read ONLY your own; write your own while open + panelist.
create policy ratings_read_self on public.evaluation_ratings for select
  using (rater_id = auth.uid());
create policy ratings_write_self on public.evaluation_ratings for all
  using (
    rater_id = auth.uid()
    and public.atlas_is_panelist(auth.uid(), evaluation_id)
    and (select status from public.evaluations e where e.id = evaluation_id) = 'open'
  )
  with check (
    rater_id = auth.uid()
    and public.atlas_is_panelist(auth.uid(), evaluation_id)
    and (select status from public.evaluations e where e.id = evaluation_id) = 'open'
  );

-- Grants
grant select, insert, update, delete on public.evaluations          to authenticated, service_role;
grant select, insert, update, delete on public.evaluation_questions to authenticated, service_role;
grant select, insert, update, delete on public.evaluation_candidates to authenticated, service_role;
grant select, insert, update, delete on public.evaluation_answers   to authenticated, service_role;
grant select, insert, update, delete on public.evaluation_panelists to authenticated, service_role;
grant select, insert, update, delete on public.evaluation_ratings   to authenticated, service_role;
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm supabase db test`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add db/supabase/supabase/migrations/0028_hiring_evaluations.sql db/supabase/supabase/tests/evaluations_rls.sql
git commit -m "feat(db): hiring evaluations schema + RLS (per-evaluator rating privacy)"
```

---

## Task 2: Aggregation RPCs + suppression (migration 0029)

**Files:**

- Create: `db/supabase/supabase/migrations/0029_evaluation_rpcs.sql`
- Modify/Test: `db/supabase/supabase/tests/evaluations_rls.sql` (add RPC behavioral cases)

**Interfaces:**

- Produces:
  - `public.evaluation_results(p_evaluation_id uuid) returns jsonb` — security definer. Shape:
    `{ "status": "...", "suppressed": bool, "rater_count": int|null, "rater_bucket": text,
 "candidates": [ { "candidate_id": uuid, "display_name": text, "overall": numeric|null,
 "rank": int, "cells": [ { "question_id": uuid, "prompt": text, "avg": numeric|null } ] } ] }`.
    Returns `{"status":"open","suppressed":true,...,"candidates":[]}` unless status = `closed`.
  - `public.evaluation_panel_progress(p_evaluation_id uuid) returns jsonb` — security definer, admin-guarded; array of `{profile_id, display_name, rated, total}`.

- [ ] **Step 1: Add failing RPC structural tests**

Append before `SELECT * FROM finish();` in `evaluations_rls.sql`, and bump `plan(13)` → `plan(15)`:

```sql
-- RPCs exist (behavioral suppression is proven in Task 10 integration tests).
SELECT has_function('public','evaluation_results',
  ARRAY['uuid'], 'evaluation_results(uuid) exists');
SELECT has_function('public','evaluation_panel_progress',
  ARRAY['uuid'], 'evaluation_panel_progress(uuid) exists');
```

- [ ] **Step 2: Run, verify failure**

Run: `pnpm supabase db test`
Expected: FAIL — `evaluation_results` does not exist.

**Note:** the _behavioral_ suppression contract (open → suppressed; closed < 3 raters → `suppressed:true, rater_bucket:"<3"`; closed ≥ 3 raters → averages; per-cell single-rater → `avg:null`) is asserted end-to-end in Task 10's integration test, which calls the RPC as a real authenticated user.

- [ ] **Step 3: Write the RPC migration**

Create `db/supabase/supabase/migrations/0029_evaluation_rpcs.sql`:

```sql
-- Closed-aggregate exposure with two-grain small-panel suppression.
-- security definer: aggregates across raters without exposing individual rows;
-- emits only averages + bucketed counts.

create or replace function public.evaluation_results(p_evaluation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_status public.evaluation_status;
  v_min    int := public.evaluation_min_raters();
  v_raters int;
  v_result jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('status','forbidden','suppressed',true,
      'rater_count',null,'rater_bucket','<' || v_min,'candidates','[]'::jsonb);
  end if;

  select status into v_status from public.evaluations where id = p_evaluation_id;
  if v_status is null then
    return jsonb_build_object('status','not_found','suppressed',true,
      'rater_count',null,'rater_bucket','<' || v_min,'candidates','[]'::jsonb);
  end if;

  -- Don't reveal draft existence/status to non-admins (evaluations_read hides
  -- drafts from them; the RPC must not become an existence oracle).
  if v_status = 'draft' and not public.atlas_is_admin(auth.uid()) then
    return jsonb_build_object('status','not_found','suppressed',true,
      'rater_count',null,'rater_bucket','<' || v_min,'candidates','[]'::jsonb);
  end if;

  -- Status gate: nothing until closed.
  if v_status <> 'closed' then
    return jsonb_build_object('status',v_status,'suppressed',true,
      'rater_count',null,'rater_bucket','<' || v_min,'candidates','[]'::jsonb);
  end if;

  -- Evaluation-level floor: distinct raters over active cells.
  select count(distinct r.rater_id) into v_raters
  from public.evaluation_ratings r
  join public.evaluation_candidates c on c.id = r.candidate_id and c.is_active
  join public.evaluation_questions q on q.id = r.question_id and q.is_active
  where r.evaluation_id = p_evaluation_id;

  if coalesce(v_raters,0) < v_min then
    return jsonb_build_object('status','closed','suppressed',true,
      'rater_count',null,'rater_bucket','<' || v_min,'candidates','[]'::jsonb);
  end if;

  -- Per-cell averages, suppressing cells below the floor (avg => null).
  with cell as (
    select c.id as candidate_id, c.display_name, q.id as question_id, q.prompt,
           q.position,
           count(distinct r.rater_id) as cell_raters,
           avg(r.score)::numeric as cell_avg
    from public.evaluation_candidates c
    cross join public.evaluation_questions q
    left join public.evaluation_ratings r
      on r.candidate_id = c.id and r.question_id = q.id
     and r.evaluation_id = p_evaluation_id
    where c.evaluation_id = p_evaluation_id and c.is_active
      and q.evaluation_id = p_evaluation_id and q.is_active
    group by c.id, c.display_name, q.id, q.prompt, q.position
  ),
  qualified as (
    select candidate_id, display_name, question_id, prompt, position,
           case when cell_raters >= v_min then round(cell_avg,2) end as avg
    from cell
  ),
  candidate_overall as (
    select candidate_id, display_name,
           avg(avg) filter (where avg is not null) as overall
    from qualified group by candidate_id, display_name
  ),
  ranked as (
    select candidate_id, display_name, round(overall,2) as overall,
           rank() over (order by overall desc nulls last, display_name) as rank
    from candidate_overall
  )
  select jsonb_build_object(
    'status','closed','suppressed',false,
    'rater_count',v_raters,'rater_bucket',v_raters::text,
    'candidates', coalesce(jsonb_agg(
       jsonb_build_object(
         'candidate_id', rk.candidate_id,
         'display_name', rk.display_name,
         'overall', rk.overall,
         'rank', rk.rank,
         'cells', (select jsonb_agg(jsonb_build_object(
                     'question_id', ql.question_id,
                     'prompt', ql.prompt,
                     'avg', ql.avg) order by ql.position)
                   from qualified ql where ql.candidate_id = rk.candidate_id)
       ) order by rk.rank), '[]'::jsonb)
  ) into v_result
  from ranked rk;

  return v_result;
end $$;

revoke all on function public.evaluation_results(uuid) from public;
grant execute on function public.evaluation_results(uuid) to authenticated;

-- Admin-only panel progress (counts, never scores).
create or replace function public.evaluation_panel_progress(p_evaluation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_total int; v_result jsonb;
begin
  if not public.atlas_is_admin(auth.uid()) then
    return '[]'::jsonb;
  end if;
  select count(*) into v_total
  from public.evaluation_candidates c
  cross join public.evaluation_questions q
  where c.evaluation_id = p_evaluation_id and c.is_active
    and q.evaluation_id = p_evaluation_id and q.is_active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'profile_id', p.id, 'display_name', p.display_name,
    'rated', coalesce(cnt.n,0), 'total', v_total) order by p.display_name), '[]'::jsonb)
  into v_result
  from public.evaluation_panelists ep
  join public.profiles p on p.id = ep.profile_id
  left join (
    select r.rater_id, count(*) as n
    from public.evaluation_ratings r
    join public.evaluation_candidates c on c.id = r.candidate_id and c.is_active
    join public.evaluation_questions q on q.id = r.question_id and q.is_active
    where r.evaluation_id = p_evaluation_id
    group by r.rater_id
  ) cnt on cnt.rater_id = p.id
  where ep.evaluation_id = p_evaluation_id;
  return v_result;
end $$;

revoke all on function public.evaluation_panel_progress(uuid) from public;
grant execute on function public.evaluation_panel_progress(uuid) to authenticated;

-- Atomic panel replacement used by setPanelAction (service_role only; the
-- action gates on requireAdmin). Single transaction; distinct-dedups; empty
-- array clears the panel.
create or replace function public.set_evaluation_panel(p_evaluation_id uuid, p_profile_ids uuid[])
returns void language plpgsql as $$
begin
  delete from public.evaluation_panelists where evaluation_id = p_evaluation_id;
  insert into public.evaluation_panelists (evaluation_id, profile_id)
  select p_evaluation_id, x from (select distinct unnest(p_profile_ids) as x) s;
end $$;

revoke all on function public.set_evaluation_panel(uuid, uuid[]) from public;
grant execute on function public.set_evaluation_panel(uuid, uuid[]) to service_role;
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm supabase db test`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add db/supabase/supabase/migrations/0029_evaluation_rpcs.sql db/supabase/supabase/tests/evaluations_rls.sql
git commit -m "feat(db): evaluation_results + panel_progress RPCs with two-grain suppression"
```

---

## Task 3: Sheet types + column auto-detection

**Files:**

- Create: `lib/sheets/types.ts`
- Create: `lib/sheets/parse.ts` (detectMapping only in this task)
- Test: `tests/sheets/detect.test.ts`

**Interfaces:**

- Produces:
  - `type SheetGrid = { headers: string[]; rows: string[][] }`
  - `type DetectedMapping = { emailColumn: string; nameColumn: string | null; timestampColumn: string | null; questionColumns: string[] }`
  - `detectMapping(grid: SheetGrid): DetectedMapping`

- [ ] **Step 1: Write the failing test**

Create `tests/sheets/detect.test.ts`:

```ts
import { expect, test } from "vitest";
import { detectMapping } from "@/lib/sheets/parse";

test("detects email, timestamp, name; rest are questions", () => {
  const grid = {
    headers: [
      "Timestamp",
      "Email Address",
      "Full Name",
      "Why this role?",
      "Strengths",
    ],
    rows: [["2026-01-01", "a@x.com", "Ann", "…", "…"]],
  };
  const m = detectMapping(grid);
  expect(m.emailColumn).toBe("Email Address");
  expect(m.timestampColumn).toBe("Timestamp");
  expect(m.nameColumn).toBe("Full Name");
  expect(m.questionColumns).toEqual(["Why this role?", "Strengths"]);
});

test("falls back to value-shape email detection when header is generic", () => {
  const grid = {
    headers: ["Timestamp", "Contact", "Pitch"],
    rows: [["2026-01-01", "b@y.com", "hi"]],
  };
  expect(detectMapping(grid).emailColumn).toBe("Contact");
});

test("no name column => nameColumn null, column stays a question if ambiguous", () => {
  const grid = { headers: ["Email", "Q1"], rows: [["c@z.com", "x"]] };
  const m = detectMapping(grid);
  expect(m.emailColumn).toBe("Email");
  expect(m.nameColumn).toBeNull();
  expect(m.questionColumns).toEqual(["Q1"]);
});
```

- [ ] **Step 2: Run, verify failure**

Run: `pnpm test tests/sheets/detect.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement types + detectMapping**

Create `lib/sheets/types.ts`:

```ts
export type SheetGrid = { headers: string[]; rows: string[][] };

export type DetectedMapping = {
  emailColumn: string;
  nameColumn: string | null;
  timestampColumn: string | null;
  questionColumns: string[];
};

export type NormalizedCandidate = {
  email: string;
  displayName: string;
  submittedAt: string | null;
  answers: { columnKey: string; text: string }[];
};

export type ImportSummary = {
  candidatesSeen: number;
  rowsSkipped: { reason: string; count: number }[];
  duplicateEmails: string[];
  questionColumns: string[];
};
```

Create `lib/sheets/parse.ts`:

```ts
import type { SheetGrid, DetectedMapping } from "@/lib/sheets/types";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function columnValues(grid: SheetGrid, idx: number): string[] {
  return grid.rows.map((r) => (r[idx] ?? "").trim()).filter(Boolean);
}

export function detectMapping(grid: SheetGrid): DetectedMapping {
  const headers = grid.headers;
  const lower = headers.map((h) => h.toLowerCase());

  const timestampColumn =
    headers[lower.findIndex((h) => /time\s?stamp/.test(h))] ?? null;

  // Email: header match first, else a column whose values look like emails.
  let emailIdx = lower.findIndex((h) => /e-?mail/.test(h));
  if (emailIdx === -1) {
    emailIdx = headers.findIndex((_, i) => {
      const vals = columnValues(grid, i);
      return vals.length > 0 && vals.every((v) => EMAIL_RE.test(v));
    });
  }
  const emailColumn = emailIdx === -1 ? headers[0] : headers[emailIdx];

  const nameIdx = lower.findIndex(
    (h) => /\bname\b/.test(h) && headers[lower.indexOf(h)] !== emailColumn,
  );
  const nameColumn = nameIdx === -1 ? null : headers[nameIdx];

  const identity = new Set(
    [emailColumn, nameColumn, timestampColumn].filter(Boolean) as string[],
  );
  const questionColumns = headers.filter((h) => !identity.has(h));

  return { emailColumn, nameColumn, timestampColumn, questionColumns };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm test tests/sheets/detect.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sheets/types.ts lib/sheets/parse.ts tests/sheets/detect.test.ts
git commit -m "feat(sheets): column auto-detection for evaluation import"
```

---

## Task 4: Row normalization (candidates, answers, skips, dups)

**Files:**

- Modify: `lib/sheets/parse.ts` (add `normalizeRows`)
- Test: `tests/sheets/normalize.test.ts`

**Interfaces:**

- Consumes: `SheetGrid`, `DetectedMapping` (Task 3).
- Produces: `normalizeRows(grid: SheetGrid, mapping: { emailColumn: string; nameColumn: string | null; timestampColumn: string | null; questionColumns: string[] }): { candidates: NormalizedCandidate[]; summary: ImportSummary }`
  - Rows without a valid email are skipped and counted.
  - Duplicate emails: last row wins; email recorded in `summary.duplicateEmails`.
  - `displayName` = name column value, else email local-part.

- [ ] **Step 1: Write failing test**

Create `tests/sheets/normalize.test.ts`:

```ts
import { expect, test } from "vitest";
import { normalizeRows } from "@/lib/sheets/parse";

const grid = {
  headers: ["Timestamp", "Email", "Name", "Q1", "Q2"],
  rows: [
    ["2026-01-01T10:00:00Z", "a@x.com", "Ann", "a1", "a2"],
    ["", "notanemail", "Bad", "x", "y"], // skipped: bad email
    ["2026-01-02T10:00:00Z", "a@x.com", "Ann2", "a1b", "a2b"], // dup: last wins
    ["2026-01-03T10:00:00Z", "b@x.com", "", "b1", "b2"], // name from local-part
  ],
};
const mapping = {
  emailColumn: "Email",
  nameColumn: "Name",
  timestampColumn: "Timestamp",
  questionColumns: ["Q1", "Q2"],
};

test("normalizes, skips bad email, dedups last-wins, derives name", () => {
  const { candidates, summary } = normalizeRows(grid, mapping);
  expect(candidates).toHaveLength(2);
  const a = candidates.find((c) => c.email === "a@x.com")!;
  expect(a.displayName).toBe("Ann2"); // last wins
  expect(a.answers).toEqual([
    { columnKey: "Q1", text: "a1b" },
    { columnKey: "Q2", text: "a2b" },
  ]);
  const b = candidates.find((c) => c.email === "b@x.com")!;
  expect(b.displayName).toBe("b"); // local-part
  expect(summary.rowsSkipped).toEqual([
    { reason: "missing_or_invalid_email", count: 1 },
  ]);
  expect(summary.duplicateEmails).toEqual(["a@x.com"]);
});
```

- [ ] **Step 2: Run, verify failure**

Run: `pnpm test tests/sheets/normalize.test.ts`
Expected: FAIL — `normalizeRows` not exported.

- [ ] **Step 3: Implement `normalizeRows`**

Append to `lib/sheets/parse.ts`:

```ts
import type { NormalizedCandidate, ImportSummary } from "@/lib/sheets/types";

export function normalizeRows(
  grid: SheetGrid,
  mapping: {
    emailColumn: string;
    nameColumn: string | null;
    timestampColumn: string | null;
    questionColumns: string[];
  },
): { candidates: NormalizedCandidate[]; summary: ImportSummary } {
  const idx = (h: string) => grid.headers.indexOf(h);
  const emailI = idx(mapping.emailColumn);
  const nameI = mapping.nameColumn ? idx(mapping.nameColumn) : -1;
  const tsI = mapping.timestampColumn ? idx(mapping.timestampColumn) : -1;
  const qCols = mapping.questionColumns.map((h) => ({ key: h, i: idx(h) }));

  const byEmail = new Map<string, NormalizedCandidate>();
  const dupes = new Set<string>();
  let skipped = 0;

  for (const row of grid.rows) {
    const email = (row[emailI] ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      skipped++;
      continue;
    }
    if (byEmail.has(email)) dupes.add(email);
    const nameVal = nameI >= 0 ? (row[nameI] ?? "").trim() : "";
    byEmail.set(email, {
      email,
      displayName: nameVal || email.split("@")[0],
      submittedAt: tsI >= 0 ? (row[tsI] ?? "").trim() || null : null,
      answers: qCols.map((q) => ({
        columnKey: q.key,
        text: (row[q.i] ?? "").trim(),
      })),
    });
  }

  const summary: ImportSummary = {
    candidatesSeen: byEmail.size,
    rowsSkipped: skipped
      ? [{ reason: "missing_or_invalid_email", count: skipped }]
      : [],
    duplicateEmails: [...dupes],
    questionColumns: mapping.questionColumns,
  };
  return { candidates: [...byEmail.values()], summary };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm test tests/sheets/normalize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sheets/parse.ts tests/sheets/normalize.test.ts
git commit -m "feat(sheets): normalize rows into candidates + import summary"
```

---

## Task 5: Service-account JWT minting

**Files:**

- Create: `lib/sheets/jwt.ts`
- Test: `tests/sheets/jwt.test.ts`

**Interfaces:**

- Produces: `mintServiceJwt(sa: { client_email: string; private_key: string }, nowSec?: number): string` — a signed RS256 JWT with `scope: https://www.googleapis.com/auth/spreadsheets.readonly`, `aud: https://oauth2.googleapis.com/token`, `iss/sub = client_email`, `iat/exp` (1h).

- [ ] **Step 1: Write failing test**

Create `tests/sheets/jwt.test.ts` (generates a throwaway RSA keypair, signs, verifies):

```ts
import { expect, test } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { mintServiceJwt } from "@/lib/sheets/jwt";

function b64urlToJson(seg: string) {
  return JSON.parse(Buffer.from(seg, "base64url").toString("utf8"));
}

test("mints a verifiable RS256 JWT with the right claims", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const now = 1_700_000_000;
  const jwt = mintServiceJwt(
    { client_email: "svc@proj.iam.gserviceaccount.com", private_key: pem },
    now,
  );

  const [h, p, s] = jwt.split(".");
  expect(b64urlToJson(h)).toEqual({ alg: "RS256", typ: "JWT" });
  const claims = b64urlToJson(p);
  expect(claims.iss).toBe("svc@proj.iam.gserviceaccount.com");
  expect(claims.scope).toBe(
    "https://www.googleapis.com/auth/spreadsheets.readonly",
  );
  expect(claims.aud).toBe("https://oauth2.googleapis.com/token");
  expect(claims.iat).toBe(now);
  expect(claims.exp).toBe(now + 3600);

  const v = createVerify("RSA-SHA256");
  v.update(`${h}.${p}`);
  expect(v.verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);
});
```

- [ ] **Step 2: Run, verify failure**

Run: `pnpm test tests/sheets/jwt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `mintServiceJwt`**

Create `lib/sheets/jwt.ts`:

```ts
import { createSign } from "node:crypto";

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

export function mintServiceJwt(
  sa: { client_email: string; private_key: string },
  nowSec?: number,
): string {
  const iat = nowSec ?? Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      sub: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat,
      exp: iat + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  // private_key may arrive with literal "\n"; normalize.
  const pem = sa.private_key.replace(/\\n/g, "\n");
  const sig = signer.sign(pem);
  return `${signingInput}.${b64url(sig)}`;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm test tests/sheets/jwt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sheets/jwt.ts tests/sheets/jwt.test.ts
git commit -m "feat(sheets): RS256 service-account JWT minting (no googleapis dep)"
```

---

## Task 6: Sheets client — token exchange + read

**Files:**

- Create: `lib/sheets/client.ts`
- Test: `tests/sheets/client.test.ts`

**Interfaces:**

- Consumes: `mintServiceJwt` (Task 5), `SheetGrid` (Task 3).
- Produces:
  - `readSheet(spreadsheetId: string, tab?: string | null): Promise<SheetGrid>` — reads `GOOGLE_SERVICE_ACCOUNT_JSON` from env, gets an access token (cached in-module until ~60s before expiry), calls Sheets `values.get`, returns `{ headers, rows }` (first non-empty row is headers; ragged rows padded).
  - Throws `Error` with a clear message on auth/HTTP failure.

- [ ] **Step 1: Write failing test (mock global fetch)**

Create `tests/sheets/client.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

const SA = {
  client_email: "svc@proj.iam.gserviceaccount.com",
  private_key:
    "-----BEGIN PRIVATE KEY-----\\nMIIB...\\n-----END PRIVATE KEY-----\\n",
};

beforeEach(() => {
  vi.resetModules();
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify(SA);
});

test("exchanges JWT for token then returns headers+rows", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "tok", expires_in: 3600 }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        values: [
          ["Timestamp", "Email", "Q1"],
          ["t", "a@x.com", "hi"],
          ["t2", "b@x.com"],
        ],
      }),
    });
  vi.stubGlobal("fetch", fetchMock);
  // Avoid real signing: stub the jwt module.
  vi.doMock("@/lib/sheets/jwt", () => ({
    mintServiceJwt: () => "fake.jwt.sig",
  }));
  const { readSheet } = await import("@/lib/sheets/client");

  const grid = await readSheet("sheet123", "Form Responses 1");
  expect(grid.headers).toEqual(["Timestamp", "Email", "Q1"]);
  expect(grid.rows[1]).toEqual(["t2", "b@x.com", ""]); // padded ragged row
  // token request used the token endpoint
  expect(fetchMock.mock.calls[0][0]).toContain("oauth2.googleapis.com/token");
});

test("throws a clear error on HTTP failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => "denied",
    }),
  );
  vi.doMock("@/lib/sheets/jwt", () => ({
    mintServiceJwt: () => "fake.jwt.sig",
  }));
  const { readSheet } = await import("@/lib/sheets/client");
  await expect(readSheet("sheet123")).rejects.toThrow(/token/i);
});
```

- [ ] **Step 2: Run, verify failure**

Run: `pnpm test tests/sheets/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `readSheet`**

Create `lib/sheets/client.ts`:

```ts
import { mintServiceJwt } from "@/lib/sheets/jwt";
import type { SheetGrid } from "@/lib/sheets/types";

type SA = { client_email: string; private_key: string };

let cachedToken: { value: string; expiresAt: number } | null = null;

function readSA(): SA {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  const sa = JSON.parse(raw) as SA;
  if (!sa.client_email || !sa.private_key)
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON missing client_email/private_key",
    );
  return sa;
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.value;

  const sa = readSA();
  const assertion = mintServiceJwt(sa, now);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok)
    throw new Error(
      `Sheets token exchange failed: ${res.status} ${await res.text()}`,
    );
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = { value: json.access_token, expiresAt: now + json.expires_in };
  return json.access_token;
}

export async function readSheet(
  spreadsheetId: string,
  tab?: string | null,
): Promise<SheetGrid> {
  const token = await getAccessToken();
  const range = tab ? encodeURIComponent(tab) : "A1:ZZ";
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}?majorDimension=ROWS`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok)
    throw new Error(`Sheets read failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { values?: string[][] };
  const values = (json.values ?? []).filter((r) =>
    r.some((c) => (c ?? "").trim() !== ""),
  );
  if (values.length === 0) return { headers: [], rows: [] };
  const headers = values[0].map((h) => (h ?? "").trim());
  const width = headers.length;
  const rows = values.slice(1).map((r) => {
    const padded = r.slice(0, width);
    while (padded.length < width) padded.push("");
    return padded.map((c) => c ?? "");
  });
  return { headers, rows };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm test tests/sheets/client.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add lib/sheets/client.ts tests/sheets/client.test.ts
git commit -m "feat(sheets): access-token exchange + values read with caching"
```

---

## Task 7: Personal-view aggregation (pure)

**Files:**

- Create: `lib/evaluation/aggregate.ts`
- Test: `tests/evaluation/aggregate.test.ts`

**Interfaces:**

- Produces:
  - `type RatingRow = { candidateId: string; questionId: string; score: number }`
  - `type PersonalScore = { candidateId: string; average: number | null; ratedCount: number }`
  - `computePersonalScores(rows: RatingRow[], activeCandidateIds: string[], activeQuestionIds: string[]): PersonalScore[]` — mean-of-means over the caller's rated active questions per candidate; candidates with no ratings get `average: null`; sorted average desc (nulls last).

- [ ] **Step 1: Write failing test**

Create `tests/evaluation/aggregate.test.ts`:

```ts
import { expect, test } from "vitest";
import { computePersonalScores } from "@/lib/evaluation/aggregate";

test("mean-of-means over rated active questions, sorted desc", () => {
  const rows = [
    { candidateId: "c1", questionId: "q1", score: 4 },
    { candidateId: "c1", questionId: "q2", score: 2 }, // c1 avg = 3
    { candidateId: "c2", questionId: "q1", score: 5 }, // c2 avg = 5
  ];
  const out = computePersonalScores(rows, ["c1", "c2", "c3"], ["q1", "q2"]);
  expect(out).toEqual([
    { candidateId: "c2", average: 5, ratedCount: 1 },
    { candidateId: "c1", average: 3, ratedCount: 2 },
    { candidateId: "c3", average: null, ratedCount: 0 },
  ]);
});

test("ignores ratings for inactive candidates/questions", () => {
  const rows = [
    { candidateId: "c1", questionId: "qDead", score: 1 },
    { candidateId: "cDead", questionId: "q1", score: 1 },
  ];
  const out = computePersonalScores(rows, ["c1"], ["q1"]);
  expect(out).toEqual([{ candidateId: "c1", average: null, ratedCount: 0 }]);
});
```

- [ ] **Step 2: Run, verify failure**

Run: `pnpm test tests/evaluation/aggregate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/evaluation/aggregate.ts`:

```ts
export type RatingRow = {
  candidateId: string;
  questionId: string;
  score: number;
};
export type PersonalScore = {
  candidateId: string;
  average: number | null;
  ratedCount: number;
};

export function computePersonalScores(
  rows: RatingRow[],
  activeCandidateIds: string[],
  activeQuestionIds: string[],
): PersonalScore[] {
  const activeQ = new Set(activeQuestionIds);
  const activeC = new Set(activeCandidateIds);
  const byCandidate = new Map<string, number[]>();
  for (const c of activeCandidateIds) byCandidate.set(c, []);
  for (const r of rows) {
    if (!activeC.has(r.candidateId) || !activeQ.has(r.questionId)) continue;
    byCandidate.get(r.candidateId)!.push(r.score);
  }
  const out: PersonalScore[] = activeCandidateIds.map((candidateId) => {
    const scores = byCandidate.get(candidateId)!;
    const average = scores.length
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) /
        100
      : null;
    return { candidateId, average, ratedCount: scores.length };
  });
  out.sort((a, b) => (b.average ?? -Infinity) - (a.average ?? -Infinity));
  return out;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm test tests/evaluation/aggregate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluation/aggregate.ts tests/evaluation/aggregate.test.ts
git commit -m "feat(evaluation): personal-view mean-of-means aggregation"
```

---

## Task 8: Zod schemas + admin CRUD/status actions

**Files:**

- Create: `lib/zod/evaluation.ts`
- Create: `lib/actions/evaluation.ts` (create/connectSheet/setPanel/open/close/reopen in this task)
- Test: `tests/actions/evaluation.integration.test.ts`

**Interfaces:**

- Consumes: `requireAdmin` (`lib/auth/require.ts`), `atlasServiceClient` (`lib/supabase/service.ts`), `ok/err/ActionResult` (`lib/actions/_result.ts`).
- Produces (server actions, all `(input: unknown) => Promise<ActionResult<…>>`):
  - `createEvaluationAction` → `{ id: string }`
  - `connectSheetAction` → `null`
  - `setPanelAction` → `null`
  - `openEvaluationAction` / `closeEvaluationAction` / `reopenEvaluationAction` → `null`

**Note on integration tests:** follow `tests/actions/roster.integration.test.ts` — `test.runIf(canRun)` guarded by `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, `beforeEach` deletes all `auth.users`. Actions call `requireAdmin()` which needs a signed-in user; in integration tests we exercise the **service-client DB effects** by calling the action with a mocked auth context is complex — instead these tests seed via the service client and assert the SQL/RLS behavior directly (the actions are thin wrappers over the same queries). Action-level auth is covered by `tests/auth/require.test.ts` patterns.

- [ ] **Step 1: Write failing integration test (DB behavior the actions depend on)**

Create `tests/actions/evaluation.integration.test.ts`:

```ts
import { expect, test, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url =
  process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc =
  process.env.SUPABASE_TEST_SERVICE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const canRun = !!url && !!svc;
const admin = canRun ? createClient(url!, svc!) : null;

async function makeUser(email: string, role: "admin" | "member") {
  const { data } = await admin!.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  await admin!.from("profiles").update({ role }).eq("id", data.user!.id);
  return data.user!.id;
}

beforeEach(async () => {
  if (!admin) return;
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data.users ?? []) await admin.auth.admin.deleteUser(u.id);
});

test.runIf(canRun)(
  "evaluation lifecycle: create draft, add panel, open",
  async () => {
    const c = admin!;
    const adminId = await makeUser("admin@atlas.com", "admin");
    const panelId = await makeUser("panel@atlas.com", "member");

    const { data: ev } = await c
      .from("evaluations")
      .insert({ name: "Backend – Aug", created_by: adminId })
      .select("id,status")
      .single();
    expect(ev!.status).toBe("draft");

    await c
      .from("evaluation_panelists")
      .insert({ evaluation_id: ev!.id, profile_id: panelId });
    await c.from("evaluations").update({ status: "open" }).eq("id", ev!.id);

    const { data: check } = await c
      .from("evaluations")
      .select("status")
      .eq("id", ev!.id)
      .single();
    expect(check!.status).toBe("open");
  },
);
```

- [ ] **Step 2: Run, verify failure or skip**

Run: `pnpm test tests/actions/evaluation.integration.test.ts`
Expected: If local Supabase is up → FAIL only if schema missing (it exists from Task 1, so this passes once actions/schema align); if env not set → test is skipped (`runIf`). Ensure it at least does not error on import. (This test validates schema/lifecycle; it exercises the same tables the actions write.)

- [ ] **Step 3: Implement zod schemas**

Create `lib/zod/evaluation.ts`:

```ts
import { z } from "zod";

export const createEvaluationInput = z.object({
  name: z.string().min(1).max(200),
});

export const connectSheetInput = z.object({
  evaluationId: z.string().uuid(),
  sheetId: z.string().min(1),
  sheetTab: z.string().min(1).nullable().optional(),
});

export const confirmMappingInput = z.object({
  evaluationId: z.string().uuid(),
  emailColumn: z.string().min(1),
  nameColumn: z.string().min(1).nullable(),
  timestampColumn: z.string().min(1).nullable(),
  questionColumns: z.array(z.string().min(1)).min(1),
});

export const evaluationIdInput = z.object({ evaluationId: z.string().uuid() });

export const setPanelInput = z.object({
  evaluationId: z.string().uuid(),
  profileIds: z.array(z.string().uuid()),
});

export const rateAnswerInput = z.object({
  evaluationId: z.string().uuid(),
  candidateId: z.string().uuid(),
  questionId: z.string().uuid(),
  score: z.number().int().min(1).max(5),
});
```

- [ ] **Step 4: Implement CRUD/status actions**

Create `lib/actions/evaluation.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require";
import { atlasServiceClient } from "@/lib/supabase/service";
import { err, ok, type ActionResult } from "@/lib/actions/_result";
import {
  createEvaluationInput,
  connectSheetInput,
  setPanelInput,
  evaluationIdInput,
} from "@/lib/zod/evaluation";

export async function createEvaluationAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createEvaluationInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  const { user } = await requireAdmin();
  const svc = atlasServiceClient();
  const { data, error } = await svc
    .from("evaluations")
    .insert({ name: parsed.data.name, created_by: user.id })
    .select("id")
    .single();
  if (error) return err("db_error", error.message);
  revalidatePath("/hiring");
  return ok({ id: data.id });
}

export async function connectSheetAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = connectSheetInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireAdmin();
  const svc = atlasServiceClient();
  const { error } = await svc
    .from("evaluations")
    .update({
      sheet_id: parsed.data.sheetId,
      sheet_tab: parsed.data.sheetTab ?? null,
    })
    .eq("id", parsed.data.evaluationId);
  if (error) return err("db_error", error.message);
  revalidatePath(`/hiring/${parsed.data.evaluationId}`);
  return ok(null);
}

export async function setPanelAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = setPanelInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireAdmin();
  const svc = atlasServiceClient();
  const { evaluationId, profileIds } = parsed.data;
  // Atomic + deduping: a plpgsql function body is one transaction, so a bad
  // profile_id can never leave the evaluation with zero panelists.
  const { error } = await svc.rpc("set_evaluation_panel", {
    p_evaluation_id: evaluationId,
    p_profile_ids: profileIds,
  });
  if (error) return err("db_error", error.message);
  revalidatePath(`/hiring/${evaluationId}`);
  return ok(null);
}

async function setStatus(
  input: unknown,
  status: "open" | "closed",
): Promise<ActionResult<null>> {
  const parsed = evaluationIdInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireAdmin();
  const svc = atlasServiceClient();
  const { error } = await svc
    .from("evaluations")
    .update({ status })
    .eq("id", parsed.data.evaluationId);
  if (error) return err("db_error", error.message);
  revalidatePath(`/hiring/${parsed.data.evaluationId}`);
  revalidatePath("/hiring");
  return ok(null);
}

export async function openEvaluationAction(input: unknown) {
  return setStatus(input, "open");
}
export async function closeEvaluationAction(input: unknown) {
  return setStatus(input, "closed");
}
export async function reopenEvaluationAction(input: unknown) {
  return setStatus(input, "open");
}
```

- [ ] **Step 5: Run test + typecheck, verify pass**

Run: `pnpm test tests/actions/evaluation.integration.test.ts && pnpm typecheck`
Expected: PASS (or skipped if no local DB); typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add lib/zod/evaluation.ts lib/actions/evaluation.ts tests/actions/evaluation.integration.test.ts
git commit -m "feat(evaluation): zod schemas + admin CRUD/status server actions"
```

---

## Task 9: Import — preview mapping, confirm, refresh

**Files:**

- Modify: `lib/actions/evaluation.ts` (add `previewMappingAction`, `confirmMappingAction`, `refreshEvaluationAction`)
- Create: `lib/evaluation/sync.ts` (pure-ish sync core, testable with an injected grid)
- Test: `tests/evaluation/sync.test.ts`

**Interfaces:**

- Consumes: `readSheet` (Task 6), `detectMapping`/`normalizeRows` (Tasks 3–4), `atlasServiceClient`.
- Produces:
  - `syncEvaluation(svc, evaluationId, grid, mapping): Promise<ImportSummary & { candidatesDeactivated: number; questionsDeactivated: number }>` in `lib/evaluation/sync.ts` — idempotent upserts; soft-deactivates rows/questions absent from `grid`; preserves ratings.
  - `previewMappingAction(input)` → `{ detected: DetectedMapping; sampleHeaders: string[] }`
  - `confirmMappingAction(input)` → `ImportSummary` (persists identity mapping + questions, sets `mapping_confirmed`, runs first sync)
  - `refreshEvaluationAction(input)` → `ImportSummary` (re-sync using stored mapping)

- [ ] **Step 1: Write failing test for `syncEvaluation`**

Create `tests/evaluation/sync.test.ts` (uses the service client against local DB; `runIf` guarded):

```ts
import { expect, test, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { syncEvaluation } from "@/lib/evaluation/sync";

const url =
  process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc =
  process.env.SUPABASE_TEST_SERVICE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const canRun = !!url && !!svc;
const admin = canRun ? createClient(url!, svc!) : null;

beforeEach(async () => {
  if (!admin) return;
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data.users ?? []) await admin.auth.admin.deleteUser(u.id);
  await admin
    .from("evaluations")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
});

test.runIf(canRun)(
  "first sync creates questions/candidates/answers; refresh deactivates removed",
  async () => {
    const c = admin!;
    const { data: u } = await c.auth.admin.createUser({
      email: "admin@atlas.com",
      email_confirm: true,
    });
    const { data: ev } = await c
      .from("evaluations")
      .insert({ name: "T", created_by: u!.user!.id })
      .select("id")
      .single();
    const id = ev!.id;
    const mapping = {
      emailColumn: "Email",
      nameColumn: "Name",
      timestampColumn: null,
      questionColumns: ["Q1", "Q2"],
    };

    const g1 = {
      headers: ["Email", "Name", "Q1", "Q2"],
      rows: [
        ["a@x.com", "Ann", "a1", "a2"],
        ["b@x.com", "Bob", "b1", "b2"],
      ],
    };
    const s1 = await syncEvaluation(c, id, g1, mapping);
    expect(s1.candidatesSeen).toBe(2);
    expect(
      (
        await c
          .from("evaluation_candidates")
          .select("id")
          .eq("evaluation_id", id)
          .eq("is_active", true)
      ).data,
    ).toHaveLength(2);

    // Refresh with b@x.com removed => b deactivated, a still active, ratings preserved.
    const g2 = {
      headers: ["Email", "Name", "Q1", "Q2"],
      rows: [["a@x.com", "Ann", "a1-upd", "a2"]],
    };
    const s2 = await syncEvaluation(c, id, g2, mapping);
    expect(s2.candidatesDeactivated).toBe(1);
    const active = (
      await c
        .from("evaluation_candidates")
        .select("email")
        .eq("evaluation_id", id)
        .eq("is_active", true)
    ).data;
    expect(active).toEqual([{ email: "a@x.com" }]);
    const ans = (
      await c
        .from("evaluation_answers")
        .select("answer_text")
        .eq("evaluation_id", id)
        .order("answer_text")
    ).data;
    expect(ans!.some((a) => a.answer_text === "a1-upd")).toBe(true); // upsert updated
  },
);
```

- [ ] **Step 2: Run, verify failure**

Run: `pnpm test tests/evaluation/sync.test.ts`
Expected: FAIL — `syncEvaluation` not found (or skipped without DB).

- [ ] **Step 3: Implement `syncEvaluation`**

Create `lib/evaluation/sync.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeRows } from "@/lib/sheets/parse";
import type { SheetGrid, ImportSummary } from "@/lib/sheets/types";

type Mapping = {
  emailColumn: string;
  nameColumn: string | null;
  timestampColumn: string | null;
  questionColumns: string[];
};

export async function syncEvaluation(
  svc: SupabaseClient,
  evaluationId: string,
  grid: SheetGrid,
  mapping: Mapping,
): Promise<
  ImportSummary & {
    candidatesDeactivated: number;
    questionsDeactivated: number;
  }
> {
  const { candidates, summary } = normalizeRows(grid, mapping);

  // 1. Questions: upsert active set, then deactivate any not in the mapping
  //    (fetch-then-deactivate-by-id — same shape as candidates below; no
  //    string-interpolated `.in()` filters).
  const qRows = mapping.questionColumns.map((column_key, position) => ({
    evaluation_id: evaluationId,
    column_key,
    prompt: column_key,
    position,
    is_active: true,
  }));
  if (qRows.length)
    await svc
      .from("evaluation_questions")
      .upsert(qRows, { onConflict: "evaluation_id,column_key" });
  const { data: allQs } = await svc
    .from("evaluation_questions")
    .select("id,column_key,is_active")
    .eq("evaluation_id", evaluationId);
  const keepKeys = new Set(mapping.questionColumns);
  const qToDeactivate = (allQs ?? []).filter(
    (q) => !keepKeys.has(q.column_key) && q.is_active,
  );
  if (qToDeactivate.length)
    await svc
      .from("evaluation_questions")
      .update({ is_active: false })
      .in(
        "id",
        qToDeactivate.map((q) => q.id),
      );
  const qByKey = new Map((allQs ?? []).map((q) => [q.column_key, q.id]));
  const questionsDeactivated = qToDeactivate.length;

  // 2. Candidates: upsert active set, deactivate absent.
  const emails = candidates.map((c) => c.email);
  const candRows = candidates.map((c) => ({
    evaluation_id: evaluationId,
    email: c.email,
    display_name: c.displayName,
    submitted_at: c.submittedAt,
    is_active: true,
  }));
  if (candRows.length)
    await svc
      .from("evaluation_candidates")
      .upsert(candRows, { onConflict: "evaluation_id,email" });
  const { data: beforeActive } = await svc
    .from("evaluation_candidates")
    .select("id,email")
    .eq("evaluation_id", evaluationId)
    .eq("is_active", true);
  const toDeactivate = (beforeActive ?? []).filter(
    (c) => !emails.includes(c.email),
  );
  if (toDeactivate.length)
    await svc
      .from("evaluation_candidates")
      .update({ is_active: false })
      .in(
        "id",
        toDeactivate.map((c) => c.id),
      );

  const { data: cands } = await svc
    .from("evaluation_candidates")
    .select("id,email")
    .eq("evaluation_id", evaluationId);
  const cByEmail = new Map((cands ?? []).map((c) => [c.email, c.id]));

  // 3. Answers: upsert (candidate,question).
  const answerRows: {
    evaluation_id: string;
    candidate_id: string;
    question_id: string;
    answer_text: string;
  }[] = [];
  for (const c of candidates) {
    const candidateId = cByEmail.get(c.email);
    if (!candidateId) continue;
    for (const a of c.answers) {
      const questionId = qByKey.get(a.columnKey);
      if (!questionId) continue;
      answerRows.push({
        evaluation_id: evaluationId,
        candidate_id: candidateId,
        question_id: questionId,
        answer_text: a.text,
      });
    }
  }
  if (answerRows.length)
    await svc
      .from("evaluation_answers")
      .upsert(answerRows, { onConflict: "candidate_id,question_id" });

  await svc
    .from("evaluations")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", evaluationId);

  return {
    ...summary,
    candidatesDeactivated: toDeactivate.length,
    questionsDeactivated: Math.max(0, questionsDeactivated),
  };
}
```

- [ ] **Step 4: Implement the three import actions**

Append to `lib/actions/evaluation.ts` (add imports at top):

```ts
import { readSheet } from "@/lib/sheets/client";
import { detectMapping } from "@/lib/sheets/parse";
import { syncEvaluation } from "@/lib/evaluation/sync";
import { confirmMappingInput } from "@/lib/zod/evaluation";
```

```ts
export async function previewMappingAction(input: unknown) {
  const parsed = evaluationIdInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireAdmin();
  const svc = atlasServiceClient();
  const { data: ev } = await svc
    .from("evaluations")
    .select("sheet_id,sheet_tab")
    .eq("id", parsed.data.evaluationId)
    .single();
  if (!ev?.sheet_id) return err("no_sheet", "connect a sheet first");
  try {
    const grid = await readSheet(ev.sheet_id, ev.sheet_tab);
    return ok({ detected: detectMapping(grid), sampleHeaders: grid.headers });
  } catch (e) {
    return err("sheet_error", (e as Error).message);
  }
}

export async function confirmMappingAction(input: unknown) {
  const parsed = confirmMappingInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireAdmin();
  const svc = atlasServiceClient();
  const {
    evaluationId,
    emailColumn,
    nameColumn,
    timestampColumn,
    questionColumns,
  } = parsed.data;
  const { data: ev } = await svc
    .from("evaluations")
    .select("sheet_id,sheet_tab")
    .eq("id", evaluationId)
    .single();
  if (!ev?.sheet_id) return err("no_sheet", "connect a sheet first");
  try {
    // Sync FIRST; only persist mapping_confirmed after a successful import, so a
    // failed first fetch leaves the evaluation un-confirmed and retryable.
    const grid = await readSheet(ev.sheet_id, ev.sheet_tab);
    const summary = await syncEvaluation(svc, evaluationId, grid, {
      emailColumn,
      nameColumn,
      timestampColumn,
      questionColumns,
    });
    await svc
      .from("evaluations")
      .update({
        email_column: emailColumn,
        name_column: nameColumn,
        timestamp_column: timestampColumn,
        mapping_confirmed: true,
      })
      .eq("id", evaluationId);
    revalidatePath(`/hiring/${evaluationId}`);
    return ok(summary);
  } catch (e) {
    return err("sheet_error", (e as Error).message);
  }
}

export async function refreshEvaluationAction(input: unknown) {
  const parsed = evaluationIdInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireAdmin();
  const svc = atlasServiceClient();
  const { data: ev } = await svc
    .from("evaluations")
    .select(
      "sheet_id,sheet_tab,email_column,name_column,timestamp_column,mapping_confirmed",
    )
    .eq("id", parsed.data.evaluationId)
    .single();
  if (!ev?.sheet_id || !ev.mapping_confirmed || !ev.email_column)
    return err("not_ready", "connect a sheet and confirm mapping first");
  try {
    const grid = await readSheet(ev.sheet_id, ev.sheet_tab);
    // Question columns = all headers minus identity columns (stable).
    const identity = new Set(
      [ev.email_column, ev.name_column, ev.timestamp_column].filter(
        Boolean,
      ) as string[],
    );
    const questionColumns = grid.headers.filter((h) => !identity.has(h));
    const summary = await syncEvaluation(svc, parsed.data.evaluationId, grid, {
      emailColumn: ev.email_column,
      nameColumn: ev.name_column,
      timestampColumn: ev.timestamp_column,
      questionColumns,
    });
    revalidatePath(`/hiring/${parsed.data.evaluationId}`);
    return ok(summary);
  } catch (e) {
    return err("sheet_error", (e as Error).message);
  }
}
```

- [ ] **Step 5: Run test + typecheck, verify pass**

Run: `pnpm test tests/evaluation/sync.test.ts && pnpm typecheck`
Expected: PASS (or skipped without DB); typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add lib/evaluation/sync.ts lib/actions/evaluation.ts tests/evaluation/sync.test.ts
git commit -m "feat(evaluation): sheet import — preview, confirm mapping, idempotent refresh"
```

---

## Task 10: Rate answer + page data queries

**Files:**

- Modify: `lib/actions/evaluation.ts` (add `rateAnswerAction`)
- Create: `lib/evaluation/queries.ts`
- Test: `tests/actions/evaluation.rating.integration.test.ts`

**Interfaces:**

- Consumes: `rateAnswerInput` (Task 8), `computePersonalScores` (Task 7), RPCs (Task 2).
- Produces:
  - `rateAnswerAction(input)` → `null` — upserts the caller's own rating via the **user** (RLS) client; RLS enforces panelist + open.
  - `lib/evaluation/queries.ts`:
    - `listEvaluations()` → `{ id; name; status; }[]` (RLS-visible)
    - `getEvaluationForViewer(id)` → detail incl. viewer role flags, candidates+answers+questions (if panelist/admin), and either personal scores (open) or results RPC payload (closed).

- [ ] **Step 1: Write failing rating-privacy integration test**

Create `tests/actions/evaluation.rating.integration.test.ts`:

```ts
import { expect, test, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url =
  process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc =
  process.env.SUPABASE_TEST_SERVICE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const canRun = !!url && !!svc && !!anon;
const admin = canRun ? createClient(url!, svc!) : null;

async function userClient(email: string, role: "admin" | "member" = "member") {
  const { data } = await admin!.auth.admin.createUser({
    email,
    password: "passw0rd!",
    email_confirm: true,
  });
  await admin!.from("profiles").update({ role }).eq("id", data.user!.id); // pin role (first user would else be admin)
  const c = createClient(url!, anon!);
  await c.auth.signInWithPassword({ email, password: "passw0rd!" });
  return c;
}

beforeEach(async () => {
  if (!admin) return;
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data.users ?? []) await admin.auth.admin.deleteUser(u.id);
});

test.runIf(canRun)(
  "panelist rates; other panelist cannot read it; closed reveals aggregate",
  async () => {
    const c = admin!;
    const A = await userClient("a@atlas.com");
    const B = await userClient("b@atlas.com");
    const aId = (await A.auth.getUser()).data.user!.id;
    const bId = (await B.auth.getUser()).data.user!.id;

    const { data: ev } = await c
      .from("evaluations")
      .insert({ name: "T", status: "open", created_by: aId })
      .select("id")
      .single();
    const { data: q } = await c
      .from("evaluation_questions")
      .insert({
        evaluation_id: ev!.id,
        column_key: "Q1",
        prompt: "Q1",
        position: 0,
      })
      .select("id")
      .single();
    const { data: cand } = await c
      .from("evaluation_candidates")
      .insert({
        evaluation_id: ev!.id,
        email: "cand@x.com",
        display_name: "Cand",
      })
      .select("id")
      .single();
    await c.from("evaluation_panelists").insert([
      { evaluation_id: ev!.id, profile_id: aId },
      { evaluation_id: ev!.id, profile_id: bId },
    ]);

    // A rates 4 (own client, RLS).
    const insA = await A.from("evaluation_ratings").insert({
      evaluation_id: ev!.id,
      candidate_id: cand!.id,
      question_id: q!.id,
      rater_id: aId,
      score: 4,
    });
    expect(insA.error).toBeNull();

    // B cannot see A's rating.
    const bSees = await B.from("evaluation_ratings")
      .select("*")
      .eq("evaluation_id", ev!.id);
    expect(bSees.data).toEqual([]);

    // Below-floor results are suppressed even after close.
    await c.from("evaluations").update({ status: "closed" }).eq("id", ev!.id);
    const { data: res } = await A.rpc("evaluation_results", {
      p_evaluation_id: ev!.id,
    });
    expect(res.suppressed).toBe(true);
    expect(res.rater_bucket).toBe("<3");
  },
);

test.runIf(canRun)(
  "closed with >=3 raters reveals; single-rater cell suppressed to null",
  async () => {
    const c = admin!;
    const A = await userClient("a@atlas.com");
    const B = await userClient("b@atlas.com");
    const D = await userClient("d@atlas.com");
    const ids = await Promise.all(
      [A, B, D].map(async (x) => (await x.auth.getUser()).data.user!.id),
    );
    const [aId] = ids;

    const { data: ev } = await c
      .from("evaluations")
      .insert({ name: "T", status: "open", created_by: aId })
      .select("id")
      .single();
    const { data: q1 } = await c
      .from("evaluation_questions")
      .insert({
        evaluation_id: ev!.id,
        column_key: "Q1",
        prompt: "Q1",
        position: 0,
      })
      .select("id")
      .single();
    const { data: q2 } = await c
      .from("evaluation_questions")
      .insert({
        evaluation_id: ev!.id,
        column_key: "Q2",
        prompt: "Q2",
        position: 1,
      })
      .select("id")
      .single();
    const { data: cand } = await c
      .from("evaluation_candidates")
      .insert({
        evaluation_id: ev!.id,
        email: "cand@x.com",
        display_name: "Cand",
      })
      .select("id")
      .single();
    await c
      .from("evaluation_panelists")
      .insert(ids.map((id) => ({ evaluation_id: ev!.id, profile_id: id })));

    // All 3 rate Q1 (cell qualifies); only A rates Q2 (cell must be suppressed).
    const clients = [A, B, D];
    for (let i = 0; i < 3; i++) {
      await clients[i].from("evaluation_ratings").insert({
        evaluation_id: ev!.id,
        candidate_id: cand!.id,
        question_id: q1!.id,
        rater_id: ids[i],
        score: i + 3, // 3,4,5 => avg 4
      });
    }
    await A.from("evaluation_ratings").insert({
      evaluation_id: ev!.id,
      candidate_id: cand!.id,
      question_id: q2!.id,
      rater_id: aId,
      score: 1,
    });

    await c.from("evaluations").update({ status: "closed" }).eq("id", ev!.id);
    const { data: res } = await A.rpc("evaluation_results", {
      p_evaluation_id: ev!.id,
    });
    expect(res.suppressed).toBe(false);
    expect(res.rater_count).toBe(3);
    const candOut = res.candidates[0];
    const q1cell = candOut.cells.find((x: any) => x.question_id === q1!.id);
    const q2cell = candOut.cells.find((x: any) => x.question_id === q2!.id);
    expect(Number(q1cell.avg)).toBe(4); // 3 raters => revealed
    expect(q2cell.avg).toBeNull(); // single-rater cell => suppressed
    expect(Number(candOut.overall)).toBe(4); // mean-of-means over qualifying cells only
  },
);
```

- [ ] **Step 2: Run, verify failure/behavior**

Run: `pnpm test tests/actions/evaluation.rating.integration.test.ts`
Expected: PASS with the schema+RPCs from Tasks 1–2 (or skipped without DB/anon key). This test is the privacy regression guard; it should pass immediately, proving RLS. If it fails, fix RLS before proceeding.

- [ ] **Step 3: Implement `rateAnswerAction`**

Append to `lib/actions/evaluation.ts` (add import `requireUser` and `rateAnswerInput`):

```ts
import { requireUser } from "@/lib/auth/require";
import { rateAnswerInput } from "@/lib/zod/evaluation";
```

```ts
export async function rateAnswerAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = rateAnswerInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  const { user, supabase } = await requireUser(); // user (RLS) client, not service
  const { evaluationId, candidateId, questionId, score } = parsed.data;
  const { error } = await supabase.from("evaluation_ratings").upsert(
    {
      evaluation_id: evaluationId,
      candidate_id: candidateId,
      question_id: questionId,
      rater_id: user.id,
      score,
    },
    { onConflict: "evaluation_id,rater_id,candidate_id,question_id" },
  );
  if (error) return err("forbidden_or_closed", error.message); // RLS rejects non-panelist/closed
  revalidatePath(`/hiring/${evaluationId}`);
  return ok(null);
}
```

- [ ] **Step 4: Implement queries**

Create `lib/evaluation/queries.ts`:

```ts
import { requireUser } from "@/lib/auth/require";
import { computePersonalScores } from "@/lib/evaluation/aggregate";

export async function listEvaluations() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("evaluations")
    .select("id,name,status,last_synced_at")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getEvaluationForViewer(id: string) {
  const { user, supabase } = await requireUser();
  const { data: ev } = await supabase
    .from("evaluations")
    .select("id,name,status,sheet_id,mapping_confirmed,last_synced_at")
    .eq("id", id)
    .single();
  if (!ev) return null;

  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = prof?.role === "admin";
  const { data: panelRow } = await supabase
    .from("evaluation_panelists")
    .select("profile_id")
    .eq("evaluation_id", id)
    .eq("profile_id", user.id)
    .maybeSingle();
  const isPanelist = !!panelRow;

  // Panelists/admins can read raw rows (RLS permits).
  let questions: { id: string; prompt: string; position: number }[] = [];
  let candidates: { id: string; display_name: string }[] = [];
  let answers: {
    candidate_id: string;
    question_id: string;
    answer_text: string | null;
  }[] = [];
  let personal: ReturnType<typeof computePersonalScores> = [];
  if (isPanelist || isAdmin) {
    questions =
      (
        await supabase
          .from("evaluation_questions")
          .select("id,prompt,position")
          .eq("evaluation_id", id)
          .eq("is_active", true)
          .order("position")
      ).data ?? [];
    candidates =
      (
        await supabase
          .from("evaluation_candidates")
          .select("id,display_name")
          .eq("evaluation_id", id)
          .eq("is_active", true)
          .order("display_name")
      ).data ?? [];
    answers =
      (
        await supabase
          .from("evaluation_answers")
          .select("candidate_id,question_id,answer_text")
          .eq("evaluation_id", id)
      ).data ?? [];
    if (isPanelist && ev.status === "open") {
      const my =
        (
          await supabase
            .from("evaluation_ratings")
            .select("candidate_id,question_id,score")
            .eq("evaluation_id", id)
        ).data ?? [];
      personal = computePersonalScores(
        my.map((r) => ({
          candidateId: r.candidate_id,
          questionId: r.question_id,
          score: r.score,
        })),
        candidates.map((c) => c.id),
        questions.map((q) => q.id),
      );
    }
  }

  // Closed aggregate (everyone) via RPC.
  let results: unknown = null;
  if (ev.status === "closed") {
    results = (
      await supabase.rpc("evaluation_results", { p_evaluation_id: id })
    ).data;
  }

  // Admin-only: roster for the panel selector + current panel membership.
  let roster: { id: string; display_name: string }[] = [];
  let panel: string[] = [];
  if (isAdmin) {
    roster =
      (
        await supabase
          .from("profiles")
          .select("id,display_name")
          .eq("is_active", true)
          .order("display_name")
      ).data ?? [];
    panel = (
      (
        await supabase
          .from("evaluation_panelists")
          .select("profile_id")
          .eq("evaluation_id", id)
      ).data ?? []
    ).map((p) => p.profile_id);
  }

  return {
    ev,
    isAdmin,
    isPanelist,
    questions,
    candidates,
    answers,
    personal,
    results,
    roster,
    panel,
  };
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm test tests/actions/evaluation.rating.integration.test.ts && pnpm typecheck`
Expected: PASS/skip; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/evaluation.ts lib/evaluation/queries.ts tests/actions/evaluation.rating.integration.test.ts
git commit -m "feat(evaluation): rateAnswer action (RLS-scoped) + viewer data queries"
```

---

## Task 11: Nav entry + Hiring list page + create dialog

**Files:**

- Modify: `components/app/nav.tsx` (desktop sidebar only)
- Create: `app/(app)/hiring/page.tsx`
- Create: `app/(app)/hiring/_ui/create-evaluation.tsx`, `app/(app)/hiring/_ui/status-badge.tsx`

**Interfaces:**

- Consumes: `listEvaluations` (Task 10), `createEvaluationAction` (Task 8), `isCurrentUserAdmin` (`lib/auth/is-admin.ts`).

**Nav decision:** add Hiring to the **desktop sidebar only** (`components/app/nav.tsx`). Do **not** touch `components/app/mobile-nav.tsx` — it is a fixed 5-slot bottom bar (`Home / Meetings / Polls / Roster / More`); a 6th tab would cramp it. Hiring is admin-heavy and lower-frequency, reachable on mobile via direct link / the desktop nav. Revisit later if it needs a mobile slot.

- [ ] **Step 1: Add nav item (desktop only)**

In `components/app/nav.tsx`, import a Hugeicon that exists in `@hugeicons/core-free-icons` (verify the export name before using — e.g. `UserCheck01Icon`; if absent, reuse `UserGroupIcon` already imported there) and add to the `items` array:

```ts
{ href: "/hiring" as Route, label: "Hiring", icon: UserGroupIcon },
```

- [ ] **Step 2: Status badge component**

Create `app/(app)/hiring/_ui/status-badge.tsx`:

```tsx
export function StatusBadge({
  status,
}: {
  status: "draft" | "open" | "closed";
}) {
  // Uses theme tokens (ink / primary / success), not raw Tailwind palette colors.
  const map = {
    draft: "bg-ink/10 text-ink/70",
    open: "bg-primary/15 text-primary",
    closed: "bg-success/15 text-success-ink",
  } as const;
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}
    >
      {status}
    </span>
  );
}
```

- [ ] **Step 3: Create-evaluation client component**

Create `app/(app)/hiring/_ui/create-evaluation.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEvaluationAction } from "@/lib/actions/evaluation";

export function CreateEvaluation() {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createEvaluationAction({ name });
          if (res.ok) {
            setName("");
            router.push(`/hiring/${res.data.id}`);
          }
        });
      }}
      className="flex gap-2"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Evaluation name"
        required
        className="rounded-md border border-ink/15 px-3 py-2 text-sm"
      />
      <button
        disabled={pending || !name}
        type="submit"
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Creating…" : "New evaluation"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: List page (admin-gated create)**

Create `app/(app)/hiring/page.tsx`:

```tsx
import Link from "next/link";
import { listEvaluations } from "@/lib/evaluation/queries";
import { isCurrentUserAdmin } from "@/lib/auth/is-admin";
import { CreateEvaluation } from "@/app/(app)/hiring/_ui/create-evaluation";
import { StatusBadge } from "@/app/(app)/hiring/_ui/status-badge";

export default async function HiringPage() {
  const [evals, admin] = await Promise.all([
    listEvaluations(),
    isCurrentUserAdmin(),
  ]);
  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Hiring</h1>
        {admin && <CreateEvaluation />}
      </header>
      <ul className="space-y-2">
        {evals.map((e) => (
          <li key={e.id}>
            <Link
              href={`/hiring/${e.id}`}
              className="flex items-center justify-between rounded-lg border border-ink/10 p-4 hover:bg-surface"
            >
              <span className="font-medium">{e.name}</span>
              <StatusBadge status={e.status} />
            </Link>
          </li>
        ))}
        {evals.length === 0 && (
          <li className="text-ink/60">No evaluations yet.</li>
        )}
      </ul>
    </div>
  );
}
```

(`lib/auth/is-admin.ts` exports `isCurrentUserAdmin(): Promise<boolean>` — no args, reads the current session. Confirmed.)

- [ ] **Step 5: Verify (typecheck + run)**

Run: `pnpm typecheck`
Then start the app (`pnpm dev`) and load `/hiring`; as an admin, create an evaluation and confirm redirect to the detail route (which 404s until Task 12 — acceptable here). Expected: list renders; create works.

- [ ] **Step 6: Commit**

```bash
git add components/app/nav.tsx "app/(app)/hiring/page.tsx" "app/(app)/hiring/_ui/create-evaluation.tsx" "app/(app)/hiring/_ui/status-badge.tsx"
git commit -m "feat(hiring): nav entry, evaluations list, create dialog"
```

---

## Task 12: Detail route — admin setup + rating + results

**Files:**

- Create: `app/(app)/hiring/[id]/page.tsx`
- Create: `app/(app)/hiring/[id]/_ui/admin-controls.tsx`
- Create: `app/(app)/hiring/[id]/_ui/mapping-dialog.tsx`
- Create: `app/(app)/hiring/[id]/_ui/rating-panel.tsx`
- Create: `app/(app)/hiring/[id]/_ui/results-view.tsx`

**Interfaces:**

- Consumes: `getEvaluationForViewer` (Task 10) and all actions.

- [ ] **Step 1: Rating panel (client, autosave)**

Create `app/(app)/hiring/[id]/_ui/rating-panel.tsx`:

```tsx
"use client";
import { useTransition } from "react";
import { rateAnswerAction } from "@/lib/actions/evaluation";

type Q = { id: string; prompt: string };
type C = { id: string; display_name: string };
type A = {
  candidate_id: string;
  question_id: string;
  answer_text: string | null;
};

export function RatingPanel({
  evaluationId,
  candidates,
  questions,
  answers,
  myScores,
}: {
  evaluationId: string;
  candidates: C[];
  questions: Q[];
  answers: A[];
  myScores: {
    candidateId: string;
    average: number | null;
    ratedCount: number;
  }[];
}) {
  const [, start] = useTransition();
  const answerFor = (cid: string, qid: string) =>
    answers.find((a) => a.candidate_id === cid && a.question_id === qid)
      ?.answer_text ?? "—";

  return (
    <div className="space-y-8">
      {candidates.map((c) => (
        <section key={c.id} className="rounded-lg border border-ink/10 p-4">
          <h3 className="font-medium">{c.display_name}</h3>
          {questions.map((q) => (
            <div key={q.id} className="mt-3">
              <p className="text-sm font-medium text-ink/80">{q.prompt}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink/70">
                {answerFor(c.id, q.id)}
              </p>
              <div className="mt-2 flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    onClick={() =>
                      start(() =>
                        rateAnswerAction({
                          evaluationId,
                          candidateId: c.id,
                          questionId: q.id,
                          score: s,
                        }).then(() => {}),
                      )
                    }
                    className="h-8 w-8 rounded border border-ink/15 text-sm hover:bg-primary/10"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
```

(Highlighting the currently-saved score is a nice-to-have; the `myScores` sidebar can render running averages. Keep v1 minimal — the autosave is the requirement.)

- [ ] **Step 2: Results view**

Create `app/(app)/hiring/[id]/_ui/results-view.tsx`:

```tsx
type Cell = { question_id: string; prompt: string; avg: number | null };
type Cand = {
  candidate_id: string;
  display_name: string;
  overall: number | null;
  rank: number;
  cells: Cell[];
};
type Results = {
  suppressed: boolean;
  rater_bucket: string;
  rater_count: number | null;
  candidates: Cand[];
};

export function ResultsView({ results }: { results: Results }) {
  if (results.suppressed) {
    return (
      <p className="text-ink/60">
        Not enough evaluators to show results yet ({results.rater_bucket}{" "}
        raters).
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/60">{results.rater_count} evaluators</p>
      <ol className="space-y-2">
        {results.candidates.map((c) => (
          <li
            key={c.candidate_id}
            className="rounded-lg border border-ink/10 p-4"
          >
            <div className="flex justify-between">
              <span className="font-medium">
                #{c.rank} {c.display_name}
              </span>
              <span className="font-semibold">{c.overall ?? "—"}</span>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-ink/70">
              {c.cells.map((cell) => (
                <li key={cell.question_id} className="flex justify-between">
                  <span className="truncate">{cell.prompt}</span>
                  <span>{cell.avg ?? "—"}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 3: Mapping dialog**

Create `app/(app)/hiring/[id]/_ui/mapping-dialog.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmMappingAction } from "@/lib/actions/evaluation";

type Detected = {
  emailColumn: string;
  nameColumn: string | null;
  timestampColumn: string | null;
  questionColumns: string[];
};

export function MappingDialog({
  evaluationId,
  detected,
  headers,
  onClose,
}: {
  evaluationId: string;
  detected: Detected;
  headers: string[];
  onClose: () => void;
}) {
  const [emailColumn, setEmail] = useState(detected.emailColumn);
  const [nameColumn, setName] = useState<string>(detected.nameColumn ?? "");
  const [timestampColumn, setTs] = useState<string>(
    detected.timestampColumn ?? "",
  );
  const [pending, start] = useTransition();
  const router = useRouter();

  const identity = new Set(
    [emailColumn, nameColumn, timestampColumn].filter(Boolean),
  );
  const questionColumns = headers.filter((h) => !identity.has(h));

  return (
    <div className="rounded-lg border border-ink/15 p-4 space-y-3">
      <h3 className="font-medium">Confirm column mapping</h3>
      <label className="block text-sm">
        Email column
        <select
          value={emailColumn}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded border border-ink/15 px-2 py-1"
        >
          {headers.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Name column (optional)
        <select
          value={nameColumn}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full rounded border border-ink/15 px-2 py-1"
        >
          <option value="">— none —</option>
          {headers.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Timestamp column (optional)
        <select
          value={timestampColumn}
          onChange={(e) => setTs(e.target.value)}
          className="mt-1 block w-full rounded border border-ink/15 px-2 py-1"
        >
          <option value="">— none —</option>
          {headers.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </label>
      <div className="text-sm text-ink/70">
        Questions to be rated: {questionColumns.join(", ") || "(none)"}
      </div>
      <div className="flex gap-2">
        <button
          disabled={pending || !emailColumn || questionColumns.length === 0}
          onClick={() =>
            start(async () => {
              const res = await confirmMappingAction({
                evaluationId,
                emailColumn,
                nameColumn: nameColumn || null,
                timestampColumn: timestampColumn || null,
                questionColumns,
              });
              if (res.ok) {
                onClose();
                router.refresh();
              }
            })
          }
          className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Importing…" : "Confirm & import"}
        </button>
        <button
          onClick={onClose}
          className="rounded border border-ink/15 px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3b: Admin controls**

Pass the active roster into the page for the panel selector. In `getEvaluationForViewer` (or a small extra query in the page), fetch `profiles` where `is_active` → `{ id, display_name }[]`, current panel `profileIds`, and pass to `AdminControls`.

Create `app/(app)/hiring/[id]/_ui/admin-controls.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  connectSheetAction,
  previewMappingAction,
  refreshEvaluationAction,
  setPanelAction,
  openEvaluationAction,
  closeEvaluationAction,
  reopenEvaluationAction,
} from "@/lib/actions/evaluation";
import { MappingDialog } from "@/app/(app)/hiring/[id]/_ui/mapping-dialog";

type Ev = {
  id: string;
  status: "draft" | "open" | "closed";
  sheet_id: string | null;
  mapping_confirmed: boolean;
  last_synced_at: string | null;
};
type Detected = {
  emailColumn: string;
  nameColumn: string | null;
  timestampColumn: string | null;
  questionColumns: string[];
};

export function AdminControls({
  evaluation,
  roster = [],
  panel = [],
}: {
  evaluation: Ev;
  roster?: { id: string; display_name: string }[];
  panel?: string[];
}) {
  const [sheetId, setSheetId] = useState(evaluation.sheet_id ?? "");
  const [tab, setTab] = useState("");
  const [detected, setDetected] = useState<{
    d: Detected;
    headers: string[];
  } | null>(null);
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState<string[]>(panel);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (
    fn: () => Promise<{ ok: boolean; error?: { message: string } }>,
  ) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? "Done." : `Error: ${r.error?.message}`);
      router.refresh();
    });

  return (
    <section className="rounded-lg border border-ink/15 p-4 space-y-4">
      <h2 className="font-medium">Admin</h2>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          Spreadsheet ID
          <input
            value={sheetId}
            onChange={(e) => setSheetId(e.target.value)}
            className="mt-1 block rounded border border-ink/15 px-2 py-1"
          />
        </label>
        <label className="text-sm">
          Tab (optional)
          <input
            value={tab}
            onChange={(e) => setTab(e.target.value)}
            className="mt-1 block rounded border border-ink/15 px-2 py-1"
          />
        </label>
        <button
          className="rounded border border-ink/15 px-3 py-1.5 text-sm"
          onClick={() =>
            run(() =>
              connectSheetAction({
                evaluationId: evaluation.id,
                sheetId,
                sheetTab: tab || null,
              }),
            )
          }
        >
          Connect sheet
        </button>
        <button
          className="rounded border border-ink/15 px-3 py-1.5 text-sm"
          disabled={!evaluation.sheet_id}
          onClick={() =>
            start(async () => {
              const r = await previewMappingAction({
                evaluationId: evaluation.id,
              });
              if (r.ok)
                setDetected({
                  d: r.data.detected,
                  headers: r.data.sampleHeaders,
                });
              else setMsg(`Error: ${r.error.message}`);
            })
          }
        >
          Detect columns
        </button>
      </div>

      {detected && (
        <MappingDialog
          evaluationId={evaluation.id}
          detected={detected.d}
          headers={detected.headers}
          onClose={() => setDetected(null)}
        />
      )}

      <fieldset className="text-sm">
        <legend className="font-medium">Panel</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {roster.map((p) => (
            <label key={p.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={(e) =>
                  setSelected((s) =>
                    e.target.checked
                      ? [...s, p.id]
                      : s.filter((x) => x !== p.id),
                  )
                }
              />
              {p.display_name}
            </label>
          ))}
        </div>
        <button
          className="mt-2 rounded border border-ink/15 px-3 py-1.5"
          onClick={() =>
            run(() =>
              setPanelAction({
                evaluationId: evaluation.id,
                profileIds: selected,
              }),
            )
          }
        >
          Save panel
        </button>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button
          className="rounded border border-ink/15 px-3 py-1.5 text-sm"
          disabled={!evaluation.mapping_confirmed}
          onClick={() =>
            run(() => refreshEvaluationAction({ evaluationId: evaluation.id }))
          }
        >
          Refresh{" "}
          {evaluation.last_synced_at
            ? `(synced ${new Date(evaluation.last_synced_at).toLocaleString()})`
            : ""}
        </button>
        {evaluation.status === "draft" && (
          <button
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
            onClick={() =>
              run(() => openEvaluationAction({ evaluationId: evaluation.id }))
            }
          >
            Open
          </button>
        )}
        {evaluation.status === "open" && (
          <button
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
            onClick={() =>
              run(() => closeEvaluationAction({ evaluationId: evaluation.id }))
            }
          >
            Close
          </button>
        )}
        {evaluation.status === "closed" && (
          <button
            className="rounded border border-ink/15 px-3 py-1.5 text-sm"
            onClick={() =>
              run(() => reopenEvaluationAction({ evaluationId: evaluation.id }))
            }
          >
            Reopen
          </button>
        )}
      </div>
      {msg && <p className="text-sm text-ink/60">{msg}</p>}
    </section>
  );
}
```

Update `getEvaluationForViewer` to also return `roster` (`profiles` where `is_active`, `{id,display_name}`) and `panel` (`profileIds` for this evaluation) when `isAdmin`, and pass them to `<AdminControls roster={data.roster} panel={data.panel} />` in the page.

- [ ] **Step 4: Detail page (router by status/role)**

Create `app/(app)/hiring/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getEvaluationForViewer } from "@/lib/evaluation/queries";
import { RatingPanel } from "@/app/(app)/hiring/[id]/_ui/rating-panel";
import { ResultsView } from "@/app/(app)/hiring/[id]/_ui/results-view";
import { AdminControls } from "@/app/(app)/hiring/[id]/_ui/admin-controls";
import { StatusBadge } from "@/app/(app)/hiring/_ui/status-badge";

export default async function EvaluationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getEvaluationForViewer(id);
  if (!data) notFound();
  const {
    ev,
    isAdmin,
    isPanelist,
    candidates,
    questions,
    answers,
    personal,
    results,
    roster,
    panel,
  } = data;

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">{ev.name}</h1>
        <StatusBadge status={ev.status} />
      </header>

      {isAdmin && (
        <AdminControls evaluation={ev} roster={roster} panel={panel} />
      )}

      {ev.status === "closed" && results && (
        <ResultsView results={results as any} />
      )}

      {ev.status === "open" && isPanelist && (
        <RatingPanel
          evaluationId={ev.id}
          candidates={candidates}
          questions={questions}
          answers={answers}
          myScores={personal}
        />
      )}

      {ev.status === "open" && !isPanelist && !isAdmin && (
        <p className="text-ink/60">You’re not on this evaluation’s panel.</p>
      )}
      {ev.status === "draft" && !isAdmin && (
        <p className="text-ink/60">This evaluation isn’t open yet.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify end-to-end (manual, using the `verify` skill or `pnpm dev`)**

Run: `pnpm typecheck` then drive the flow locally: admin creates → connects a test sheet → detects/confirms mapping → sets panel → opens → a panelist rates → admin closes → aggregate shows (or suppressed if < 3 raters). Expected: each transition works; a non-panelist sees the "not on panel" state; ratings are private (verified by Task 10's test).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/hiring/[id]"
git commit -m "feat(hiring): evaluation detail — admin setup, rating panel, results view"
```

---

## Task 13: Env, docs, and Supabase setup runbook

**Files:**

- Modify: `.env.example`
- Create: `docs/hiring-sheets-setup.md`
- Modify: `README.md` (add Hiring to the Layout section)

- [ ] **Step 1: Add env var**

Append to `.env.example`:

```
# Google service account JSON (single line) for reading hiring evaluation sheets.
# Share each sheet (viewer) with the service account's client_email.
GOOGLE_SERVICE_ACCOUNT_JSON=
```

- [ ] **Step 2: Write the runbook**

Create `docs/hiring-sheets-setup.md` documenting: create a GCP project → enable the Google Sheets API → create a service account → create a JSON key → set `GOOGLE_SERVICE_ACCOUNT_JSON` (locally and in Vercel) → share the target sheet with the service-account email (Viewer). Include how to find the spreadsheet ID from its URL and the tab name.

- [ ] **Step 3: Update README layout list**

Add a bullet under `app/(app)/…`: `hiring — candidate evaluations (admin import from Google Sheets, panel rating, private-until-close aggregate)`.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm test && pnpm supabase db test`
Expected: all green (integration tests skip without a local DB; run `pnpm supabase start` first to exercise them).

- [ ] **Step 5: Commit**

```bash
git add .env.example docs/hiring-sheets-setup.md README.md
git commit -m "docs(hiring): service-account setup runbook + env + README"
```

---

## Task 14 (optional): Playwright e2e

**Files:**

- Create: `e2e/hiring.spec.ts`

- [ ] **Step 1:** Write an e2e that signs in via the existing test-signin route as an admin, creates an evaluation, and asserts it appears in `/hiring`. Extend to the full rate→close→aggregate flow if a fixture sheet or a seam to inject a grid (bypassing live Sheets) is available. Follow patterns in existing `e2e/*.spec.ts`.
- [ ] **Step 2:** Run `pnpm test:e2e`. Expected: PASS.
- [ ] **Step 3:** Commit `test(e2e): hiring evaluation smoke flow`.

---

## Self-Review Notes (author)

- **Spec coverage:** schema (T1), RPC + two-grain suppression (T2), Sheets private API via JWT (T5–T6), auto-detect + admin-confirm mapping (T3, T9, T12), idempotent refresh with soft-deactivation preserving ratings (T9), per-question 1–5 native rating (T10, T12), RLS privacy + panelist-only raw rows + closed-only aggregate (T1–T2, guarded by T10 integration test), multiple named evaluations (T1, T11), admin-picked panel (T8, T12), nav + routes (T11–T12), env/docs (T13). All spec sections map to a task.
- **Suppression + privacy behavior:** enforced in SQL (RLS in T1, RPC two-grain floor in T2 — per-cell via the CTE `cell_raters >= v_min`); pgTAP asserts these objects **exist/are structured** (repo convention), while the **behavioral** guarantees (rater-A-can't-read-rater-B, open→suppressed, closed<3→`"<3"`, closed≥3→revealed, single-rater cell→`null`) are asserted end-to-end in T10's integration test against real authenticated PostgREST clients.
- **Preflight (before Task 1):** run `pnpm supabase start` so pgTAP + integration tests actually execute (they self-skip otherwise). Optionally remove the stray untracked `supabase/.temp/` dir at repo root; it's CLI scratch and unrelated to this work.
- **Type consistency:** `SheetGrid`, `DetectedMapping`, `NormalizedCandidate`, `ImportSummary` defined in `lib/sheets/types.ts` (T3) and consumed unchanged in T4/T6/T9; `computePersonalScores` signature stable across T7/T10/T12; action names stable across T8/T9/T10/T11/T12.
- **Known follow-ups (non-blocking):** admin-controls/mapping-dialog full markup is described rather than fully transcribed in T12 Step 3 — the implementer builds them from the established `create-evaluation.tsx` pattern and the action signatures; highlighting the saved score in the rating panel is a deferred nicety.
