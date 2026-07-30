-- db/supabase/supabase/migrations/0024_thamani_metrics.sql
-- Pre-aggregated Thamani growth metrics. Written by the thamani-metrics cron
-- (service role, bypasses RLS); read by the home dashboard (authenticated).

create table if not exists public.thamani_metrics (
  metric_key   text        not null,
  grain        text        not null check (grain in ('day','week','month','quarter','year')),
  period_start date        not null,
  value        numeric     not null,
  computed_at  timestamptz not null default now(),
  primary key (metric_key, grain, period_start)
);

alter table public.thamani_metrics enable row level security;

drop policy if exists "thamani_metrics_read_authenticated" on public.thamani_metrics;
create policy "thamani_metrics_read_authenticated"
  on public.thamani_metrics
  for select
  to authenticated
  using (true);

grant select on public.thamani_metrics to authenticated;
grant select, insert, update, delete on public.thamani_metrics to service_role;
