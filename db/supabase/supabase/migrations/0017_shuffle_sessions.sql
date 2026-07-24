create type public.shuffle_status as enum ('active','finished');

create table public.shuffle_sessions (
  id               uuid primary key default gen_random_uuid(),
  created_by       uuid not null references public.profiles(id) on delete restrict,
  owner_user_id    uuid not null references public.profiles(id) on delete cascade,
  meeting_id       uuid references public.meetings(id) on delete cascade,
  roster_snapshot  jsonb not null,
  current_index    int  not null default 0,
  status           public.shuffle_status not null default 'active',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index shuffle_sessions_meeting_idx on public.shuffle_sessions(meeting_id);
create index shuffle_sessions_owner_idx   on public.shuffle_sessions(owner_user_id);

alter table public.shuffle_sessions enable row level security;

create policy ss_read_owner on public.shuffle_sessions
  for select using (
    auth.uid() = owner_user_id and meeting_id is null
  );

create policy ss_read_meeting_participants on public.shuffle_sessions
  for select using (
    meeting_id is not null and exists (
      select 1 from public.meetings m
      where m.id = meeting_id
        and auth.uid() is not null
        and (
          m.participants_override is null
          or exists (
            select 1 from jsonb_array_elements_text(m.participants_override) x
            where x.value = auth.uid()::text
          )
          or m.host_user_id = auth.uid()
          or m.created_by = auth.uid()
        )
    )
  );

create policy ss_write_owner_or_host on public.shuffle_sessions
  for all
  using (
    auth.uid() = owner_user_id
    or (meeting_id is not null and exists (
      select 1 from public.meetings m
      where m.id = meeting_id and m.host_user_id = auth.uid()
    ))
  )
  with check (
    auth.uid() = owner_user_id
    or (meeting_id is not null and exists (
      select 1 from public.meetings m
      where m.id = meeting_id and m.host_user_id = auth.uid()
    ))
  );

create trigger shuffle_sessions_touch before update on public.shuffle_sessions
  for each row execute function public.atlas_touch_updated_at();

grant select, insert, update, delete on public.shuffle_sessions to authenticated;
grant select, insert, update, delete on public.shuffle_sessions to service_role;
