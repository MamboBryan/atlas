-- 0023_realtime_publication.sql
-- Add present-mode tables to supabase_realtime so postgres_changes fire.
-- Idempotent: skips tables already in the publication.

do $$
declare
  t text;
begin
  foreach t in array array[
    'meetings',
    'agenda_items',
    'prompts',
    'meeting_comments',
    'meeting_comment_reactions'
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
