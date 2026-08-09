-- 0034_game_rounds_realtime_columns.sql
-- game_rounds.puzzle carries an active Zero In round's secret. 0027 added
-- game_rounds to supabase_realtime with no column restriction, so every
-- postgres_changes payload broadcast the full row — including the raw
-- secret — over the websocket to every subscribed participant from the
-- moment the round was created, regardless of any client-side redaction.
-- Re-register with an explicit column list that excludes puzzle so the
-- secret never leaves the server on this channel. The replica identity
-- column (id, the primary key, since no REPLICA IDENTITY was set) must be
-- part of the list; it is.

alter publication supabase_realtime drop table public.game_rounds;
alter publication supabase_realtime add table public.game_rounds
  (id, meeting_id, agenda_item_id, kind, started_at, ends_at, status, finalized_at, created_at, updated_at);
