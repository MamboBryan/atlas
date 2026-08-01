create type public.game_kind as enum ('target_number','zero_in');
create type public.game_round_status as enum ('active','finished');

create table public.game_rounds (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null unique references public.meetings(id) on delete cascade,
  kind          public.game_kind not null,
  puzzle        jsonb not null,
  started_at    timestamptz not null default now(),
  ends_at       timestamptz not null,
  status        public.game_round_status not null default 'active',
  finalized_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > started_at),
  check ((status = 'finished') = (finalized_at is not null))
);

create index game_rounds_meeting_idx on public.game_rounds(meeting_id);
create index game_rounds_status_ends_idx on public.game_rounds(status, ends_at);

create table public.game_submissions (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references public.game_rounds(id) on delete cascade,
  player_id     uuid not null references public.profiles(id) on delete cascade,
  payload       jsonb not null,
  submitted_at  timestamptz not null default now(),
  points        int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (round_id, player_id)
);

create index game_submissions_round_idx on public.game_submissions(round_id);
create index game_submissions_player_idx on public.game_submissions(player_id);

alter table public.game_rounds      enable row level security;
alter table public.game_submissions enable row level security;

-- Reuses the participant/host/creator gate applied to agenda_items.
create policy game_rounds_read on public.game_rounds
  for select using (
    exists (
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

-- Anyone who can read the meeting can ensure/insert the round.
create policy game_rounds_insert on public.game_rounds
  for insert with check (
    exists (
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

-- No direct update from clients; finalization only via atlas_finalize_game_round.
-- (Absence of an UPDATE policy denies by default under RLS.)

create policy game_submissions_read on public.game_submissions
  for select using (
    exists (
      select 1 from public.game_rounds r
      join public.meetings m on m.id = r.meeting_id
      where r.id = round_id
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

create policy game_submissions_write_self on public.game_submissions
  for insert with check (
    player_id = auth.uid()
    and exists (
      select 1 from public.game_rounds r
      where r.id = round_id
        and r.status = 'active'
        and now() < r.ends_at
    )
  );

create policy game_submissions_update_self on public.game_submissions
  for update using (
    player_id = auth.uid()
    and exists (
      select 1 from public.game_rounds r
      where r.id = round_id
        and r.status = 'active'
        and now() < r.ends_at
    )
  ) with check (
    player_id = auth.uid()
    and points is null  -- clients may never write points
  );

create trigger game_rounds_touch      before update on public.game_rounds
  for each row execute function public.atlas_touch_updated_at();
create trigger game_submissions_touch before update on public.game_submissions
  for each row execute function public.atlas_touch_updated_at();

grant select, insert, update, delete on public.game_rounds       to authenticated;
grant select, insert, update, delete on public.game_submissions  to authenticated;
grant select, insert, update, delete on public.game_rounds       to service_role;
grant select, insert, update, delete on public.game_submissions  to service_role;

-- Finalization function. SECURITY DEFINER so it can bypass the "points must be null"
-- update constraint on game_submissions. Callable only by authenticated users who
-- can read the parent meeting.
create or replace function public.atlas_finalize_game_round(
  p_round  uuid,
  p_results jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.game_rounds%rowtype;
  can_see boolean;
  rec jsonb;
begin
  select * into r from public.game_rounds where id = p_round for update;
  if not found then
    raise exception 'round not found';
  end if;

  select exists (
    select 1 from public.meetings m
    where m.id = r.meeting_id
      and (
        m.participants_override is null
        or exists (
          select 1 from jsonb_array_elements_text(m.participants_override) x
          where x.value = auth.uid()::text
        )
        or m.host_user_id = auth.uid()
        or m.created_by = auth.uid()
      )
  ) into can_see;
  if not can_see then
    raise exception 'not authorised';
  end if;

  if r.status = 'finished' then
    return;
  end if;

  for rec in select * from jsonb_array_elements(p_results)
  loop
    update public.game_submissions
       set points = (rec->>'points')::int
     where round_id = p_round
       and player_id = (rec->>'player_id')::uuid;
  end loop;

  update public.game_rounds
     set status = 'finished', finalized_at = now()
   where id = p_round;
end;
$$;

revoke all on function public.atlas_finalize_game_round(uuid, jsonb) from public;
grant execute on function public.atlas_finalize_game_round(uuid, jsonb) to authenticated;
