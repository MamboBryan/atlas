create table public.unavailability_windows (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  starts_on  date not null,
  ends_on    date not null,
  note       text,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index unavailability_windows_user_range_idx
  on public.unavailability_windows (user_id, starts_on, ends_on);

alter table public.unavailability_windows enable row level security;

create policy uw_self_read on public.unavailability_windows
  for select using (auth.uid() = user_id);

create policy uw_admin_read on public.unavailability_windows
  for select using (public.atlas_is_admin(auth.uid()));

create policy uw_self_write on public.unavailability_windows
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.atlas_is_unavailable_on(uid uuid, day date)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.unavailability_windows w
    where w.user_id = uid and day between w.starts_on and w.ends_on
  );
$$;
