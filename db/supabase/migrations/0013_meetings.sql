create type public.meeting_status as enum ('scheduled','live','ended','postponed','cancelled');

create table public.meetings (
  id                        uuid primary key default gen_random_uuid(),
  series_id                 uuid,
  title                     text not null check (char_length(title) between 1 and 120),
  scheduled_start           timestamptz not null,
  timezone                  text not null default 'UTC',
  host_user_id              uuid references public.profiles(id) on delete set null,
  status                    public.meeting_status not null default 'scheduled',
  auto_postpone_count       int  not null default 0,
  current_agenda_item_id    uuid,
  participants_override     jsonb,
  created_by                uuid not null references public.profiles(id) on delete restrict,
  started_at                timestamptz,
  ended_at                  timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index meetings_status_idx           on public.meetings(status);
create index meetings_scheduled_start_idx  on public.meetings(scheduled_start);
create index meetings_host_idx             on public.meetings(host_user_id);
create index meetings_created_by_idx       on public.meetings(created_by);

alter table public.meetings enable row level security;

create policy meetings_read_participants on public.meetings
  for select using (
    auth.uid() is not null and (
      participants_override is null
      or exists (
        select 1 from jsonb_array_elements_text(participants_override) x
        where x.value = auth.uid()::text
      )
      or host_user_id = auth.uid()
      or created_by = auth.uid()
    )
  );

create policy meetings_insert_self_host on public.meetings
  for insert with check (
    auth.uid() = created_by
    and host_user_id = auth.uid()
  );

create policy meetings_write_host_admin on public.meetings
  for update
  using      (auth.uid() = host_user_id or public.atlas_is_admin(auth.uid()))
  with check (auth.uid() = host_user_id or public.atlas_is_admin(auth.uid()));

create trigger meetings_touch before update on public.meetings
  for each row execute function public.atlas_touch_updated_at();

grant select, insert, update, delete on public.meetings to authenticated;
grant select, insert, update, delete on public.meetings to service_role;
