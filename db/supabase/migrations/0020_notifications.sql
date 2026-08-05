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
create index on public.notifications(user_id) where read_at is null;

alter table public.notifications enable row level security;

create policy notif_read_self on public.notifications
  for select using (auth.uid() = user_id);

create policy notif_update_self on public.notifications
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, update on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;

alter publication supabase_realtime add table public.notifications;
