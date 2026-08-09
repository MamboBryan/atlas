-- 0036_game_submissions_host_read.sql
-- Corrects an oversight in 0035's game_submissions_read split: neither
-- game_submissions_read_self (player_id = auth.uid()) nor
-- game_submissions_read_finished (round.status = 'finished') match the
-- meeting HOST while a round is still active — the presenter never
-- submits, and the round isn't finished yet.
--
-- finalizeRoundAction (lib/actions/game.ts) reads submissions through the
-- host's own RLS-bound client, BEFORE flipping the round to finished, to
-- compute scores. Under 0035 alone that read returns zero rows, so every
-- submission is scored 0 via atlas_finalize_game_round's defensive
-- "straggler" step (any submission still null after the caller-supplied
-- points are applied gets 0) — the exact leaderboard data loss Critical 1
-- was raised to prevent, reintroduced a different way, on both
-- finalization paths ("Finish now"/countdown expiry, and endMeeting's
-- loop). The same gap zeroed SubmissionCounter's live "N of M submitted"
-- count for the presenter, since Realtime enforces the same SELECT policy
-- per subscriber.
--
-- Add a third SELECT policy: the meeting's host (or an admin) may read
-- game_submissions for rounds belonging to their own meeting, at any round
-- status. This does not weaken game_submissions_read_self or
-- game_submissions_read_finished — RLS policies for the same command are
-- OR'd together, so this is a parallel grant, not a replacement. The
-- security property those two protect — secrecy from other PLAYERS — is
-- untouched: the presenter is excluded from eligible players by design
-- (present/page.tsx computes eligibleCount as roster size minus one) and
-- does not play, so this visibility gives them no way to cheat.

drop policy if exists game_submissions_read_host on public.game_submissions;

create policy game_submissions_read_host on public.game_submissions
  for select using (
    exists (
      select 1 from public.game_rounds r
      join public.meetings m on m.id = r.meeting_id
      where r.id = round_id
        and (m.host_user_id = auth.uid() or public.atlas_is_admin(auth.uid()))
    )
  );
