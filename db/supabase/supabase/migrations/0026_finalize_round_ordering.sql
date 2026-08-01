-- Fix the race between a last-second submission and atlas_finalize_game_round.
--
-- Previous order:
--   1. (caller) read submissions
--   2. (caller) compute points
--   3. (RPC)    write points
--   4. (RPC)    flip round.status → 'finished'
--
-- A submission INSERT/UPDATE landing between steps 1 and 4 would get
-- points = NULL permanently and be excluded from the leaderboard.
--
-- New order:
--   1. (RPC) flip round.status → 'finished'     ← blocks new submission writes via RLS
--   2. (RPC) write points from p_results array
--   3. (RPC) set points = 0 for any remaining NULL submissions (defensive catch)
--
-- The round row is still locked with FOR UPDATE so concurrent calls are
-- serialized; the idempotency guard (if r.status = 'finished' then return)
-- remains in place.

create or replace function public.atlas_finalize_game_round(
  p_round   uuid,
  p_results jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.game_rounds%rowtype;
  can_see  boolean;
  rec      jsonb;
begin
  select * into r from public.game_rounds where id = p_round for update;
  if not found then
    raise exception 'round not found';
  end if;

  select exists (
    select 1 from public.meetings m
    where m.id = r.meeting_id
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
  ) into can_see;
  if not can_see then
    raise exception 'not authorised';
  end if;

  if r.status = 'finished' then
    return;
  end if;

  -- Step 1: flip status first to block any further submission writes via RLS
  -- (game_submissions_write_self and game_submissions_update_self both gate on
  -- round.status = 'active').
  update public.game_rounds
     set status = 'finished', finalized_at = now()
   where id = p_round;

  -- Step 2: write the caller-computed points
  for rec in select * from jsonb_array_elements(p_results)
  loop
    update public.game_submissions
       set points = (rec->>'points')::int
     where round_id = p_round
       and player_id = (rec->>'player_id')::uuid;
  end loop;

  -- Step 3: defensive catch — any submission that arrived in the narrow window
  -- between the caller's read and step 1 will have points = NULL; award 0 pts.
  update public.game_submissions
     set points = 0
   where round_id = p_round
     and points is null;
end;
$$;

revoke all  on function public.atlas_finalize_game_round(uuid, jsonb) from public;
grant execute on function public.atlas_finalize_game_round(uuid, jsonb) to authenticated;
