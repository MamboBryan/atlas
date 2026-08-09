-- 0035_game_round_hardening.sql
-- Two authorization gaps found in the games-as-agenda-item review:
--
-- 1. atlas_finalize_game_round's authorization check was "can the caller
--    read the meeting" (participants_override null-or-listed, host, or
--    creator). Most meetings have participants_override = null, so that
--    check passed for every authenticated user, not just the host. Any
--    signed-in user could call the RPC from devtools to end a round early
--    and write arbitrary `points` into game_submissions — the sole input
--    to the leaderboard. Tighten to host-or-admin, mirroring the
--    game_rounds_insert_host policy from 0033.
--
-- 2. game_submissions_read (0025) let any meeting participant select every
--    other player's `payload` while the round was still active. For Zero
--    In, payload is {guesses:[{value,at,feedback}], best_guess} — a
--    participant could read another player's higher/lower feedback and
--    collapse the 1-1000 search space, or read the secret outright once
--    anyone guessed "exact". Split the read policy: a player can always
--    read their own row; other players' rows are visible only once the
--    parent round has status = 'finished'. The finished-round result
--    queries in game-play-overlay.tsx and present-shell.tsx already only
--    run once a round is finished, so they keep working unchanged.
--
-- Also restricts the game_submissions realtime publication to exclude
-- payload, the same way 0034 restricted game_rounds to exclude puzzle.
-- Nothing in the app reads payload off a realtime event — SubmissionCounter
-- and GamePlayCard both use postgres_changes events only as a signal to
-- re-fetch through a server action or a column-safe query, never reading
-- event.new/event.old directly.

-- ---------------------------------------------------------------------
-- 1. Host-or-admin gate on atlas_finalize_game_round.
--    Everything else about the function — the FOR UPDATE lock, the early
--    return once already finished, the flip-then-write-points-then-catch-
--    stragglers ordering 0026 established — is unchanged. The local
--    variable formerly named `can_see` is renamed `is_host` to describe
--    what it now actually gates.
-- ---------------------------------------------------------------------
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
  is_host  boolean;
  rec      jsonb;
begin
  select * into r from public.game_rounds where id = p_round for update;
  if not found then
    raise exception 'round not found';
  end if;

  select exists (
    select 1 from public.meetings m
    where m.id = r.meeting_id
      and (m.host_user_id = auth.uid() or public.atlas_is_admin(auth.uid()))
  ) into is_host;
  if not is_host then
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

-- ---------------------------------------------------------------------
-- 2. Split game_submissions_read into "own row, always" and "any row,
--    once the round is finished". RLS policies for the same command are
--    OR'd together, so a player's own in-progress row stays visible.
-- ---------------------------------------------------------------------
drop policy if exists game_submissions_read on public.game_submissions;
drop policy if exists game_submissions_read_self on public.game_submissions;
drop policy if exists game_submissions_read_finished on public.game_submissions;

create policy game_submissions_read_self on public.game_submissions
  for select using (
    player_id = auth.uid()
  );

create policy game_submissions_read_finished on public.game_submissions
  for select using (
    exists (
      select 1 from public.game_rounds r
      join public.meetings m on m.id = r.meeting_id
      where r.id = round_id
        and r.status = 'finished'
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

-- ---------------------------------------------------------------------
-- 3. Realtime publication: exclude payload from game_submissions.
--    Guarded with the same existence-lookup idiom as 0027/0034 so this
--    migration is safe to re-run.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_submissions'
  ) then
    alter publication supabase_realtime drop table public.game_submissions;
  end if;
  alter publication supabase_realtime add table public.game_submissions
    (id, round_id, player_id, submitted_at, points, created_at, updated_at);
end $$;
