BEGIN;
SELECT plan(6);

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
  'game_rounds has 2 policies (read + insert)'
);

SELECT ok(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'game_submissions') = 3,
  'game_submissions has 3 policies (read + insert-self + update-self)'
);

SELECT * FROM finish();
ROLLBACK;
