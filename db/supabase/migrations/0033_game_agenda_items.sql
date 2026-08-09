-- 0033_game_agenda_items.sql
-- Games move from the pre-meeting lobby to a presenter-run agenda item.
-- Supersedes the lobby delivery model in 0025; game rules and scoring are unchanged.

-- 1. A game is now an agenda item kind.
--    Postgres forbids *using* a new enum value in the transaction that adds it.
--    Nothing below references 'game', so a single migration file is safe. Any
--    future migration that needs 'game' in a predicate must be its own file.
alter type public.agenda_kind add value 'game';

-- 2. Lobby-era rounds have no agenda item to anchor to, and the new column is
--    NOT NULL. Cascades to game_submissions, zeroing the (not yet meaningful)
--    all-time leaderboard.
delete from public.game_rounds;

-- 3. Re-anchor rounds from the meeting to the agenda item. meeting_id stays:
--    the RLS predicates and the realtime filter both key off it.
alter table public.game_rounds
  drop constraint game_rounds_meeting_id_key;

alter table public.game_rounds
  add column agenda_item_id uuid not null
    references public.agenda_items(id) on delete cascade;

alter table public.game_rounds
  add constraint game_rounds_agenda_item_key unique (agenda_item_id);

create index game_rounds_agenda_item_idx on public.game_rounds(agenda_item_id);

-- 4. Players no longer open rounds — only the presenter does. Mirrors the
--    host-or-admin gate on agenda_items_write_host.
drop policy game_rounds_insert on public.game_rounds;

create policy game_rounds_insert_host on public.game_rounds
  for insert with check (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_id
        and (m.host_user_id = auth.uid() or public.atlas_is_admin(auth.uid()))
    )
  );
