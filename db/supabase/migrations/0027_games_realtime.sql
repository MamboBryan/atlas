-- 0027_games_realtime.sql
-- Add pre-meeting game tables to supabase_realtime so postgres_changes fire.
-- The submission counter and round scoreboard subscribe via postgres_changes;
-- without this the live updates never arrive.
-- Idempotent: skips tables already in the publication.

do $$
declare
  t text;
begin
  foreach t in array array[
    'game_rounds',
    'game_submissions'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
