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

create policy ee_admin_read on public.email_events
  for select using (public.atlas_is_admin(auth.uid()));

grant select on public.email_events to authenticated;
grant select, insert, update, delete on public.email_events to service_role;
