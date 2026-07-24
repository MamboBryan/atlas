create extension if not exists citext;

create or replace function public.atlas_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create type public.user_role as enum ('admin', 'member');

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
  select coalesce(
    (select role = 'admin' and is_active from public.profiles where id = uid),
    false
  );
$$;

alter table public.profiles enable row level security;

create policy profiles_self_read on public.profiles
  for select using (auth.uid() = id);

create policy profiles_all_read on public.profiles
  for select using (auth.uid() is not null);

create policy profiles_self_write on public.profiles
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select role from public.profiles where id = auth.uid())
  );

create policy profiles_admin_write on public.profiles
  for all using (public.atlas_is_admin(auth.uid()))
  with check (public.atlas_is_admin(auth.uid()));

create trigger profiles_touch before update on public.profiles
  for each row execute function public.atlas_touch_updated_at();

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;
