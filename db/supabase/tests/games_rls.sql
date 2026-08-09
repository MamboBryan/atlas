BEGIN;
SELECT plan(10);

SELECT has_table('public', 'game_rounds', 'game_rounds table exists');
SELECT has_table('public', 'game_submissions', 'game_submissions table exists');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.game_rounds'::regclass),
  'game_rounds has RLS'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.game_submissions'::regclass),
  'game_submissions has RLS'
);

SELECT ok(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'game_rounds') = 2,
  'game_rounds has 2 policies (read + insert-host)'
);

SELECT ok(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'game_rounds'
     AND policyname = 'game_rounds_insert_host') = 1,
  'game_rounds insert is gated to the host'
);

SELECT ok(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'game_submissions') = 3,
  'game_submissions has 3 policies (read + insert-self + update-self)'
);

SELECT has_column('public', 'game_rounds', 'agenda_item_id',
  'game_rounds is anchored to an agenda item');

SELECT ok(
  (SELECT count(*) FROM pg_constraint
   WHERE conrelid = 'public.game_rounds'::regclass
     AND conname = 'game_rounds_agenda_item_key') = 1,
  'one round per agenda item'
);

-- game_rounds.puzzle carries an active Zero In round's secret; it must never
-- be broadcast over the game_rounds realtime channel (see 0034).
SELECT ok(
  (SELECT NOT ('puzzle' = ANY(t.attnames))
   FROM pg_publication_tables t
   WHERE t.pubname = 'supabase_realtime' AND t.tablename = 'game_rounds'),
  'game_rounds realtime publication excludes puzzle'
);

SELECT * FROM finish();
ROLLBACK;
