create table public.meeting_series (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null check (char_length(name) between 1 and 120),
  description               text,
  rrule                     text not null,
  timezone                  text not null,
  rotation_order            jsonb not null,
  rotation_cursor           int  not null default 0,
  default_participant_ids   jsonb,
  agenda_template           jsonb not null default '[]'::jsonb,
  created_by                uuid not null references public.profiles(id) on delete restrict,
  owner_user_id             uuid not null references public.profiles(id) on delete restrict,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check (jsonb_array_length(rotation_order) > 0),
  check (rotation_cursor >= 0)
);

create index meeting_series_owner_idx      on public.meeting_series(owner_user_id);
create index meeting_series_created_by_idx on public.meeting_series(created_by);

alter table public.meeting_series enable row level security;

create policy ms_read on public.meeting_series
  for select using (auth.uid() is not null);

create policy ms_write_owner_admin on public.meeting_series
  for all
  using      (auth.uid() = owner_user_id or public.atlas_is_admin(auth.uid()))
  with check (auth.uid() = owner_user_id or public.atlas_is_admin(auth.uid()));

alter table public.meetings
  add constraint meetings_series_fk foreign key (series_id) references public.meeting_series(id) on delete set null;

create index meetings_series_idx on public.meetings(series_id);

create trigger ms_touch before update on public.meeting_series
  for each row execute function public.atlas_touch_updated_at();

grant select, insert, update, delete on public.meeting_series to authenticated;
grant select, insert, update, delete on public.meeting_series to service_role;
