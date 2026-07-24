BEGIN;
SELECT plan(5);

SELECT has_table('public', 'prompts', 'prompts table exists');
SELECT has_table('public', 'responses_attributed', 'responses_attributed table exists');
SELECT has_table('public', 'participation', 'participation table exists');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.prompts'::regclass),
  'prompts has RLS'
);

SELECT ok(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'responses_attributed') = 3,
  'responses_attributed has 3 policies'
);

SELECT * FROM finish();
ROLLBACK;
