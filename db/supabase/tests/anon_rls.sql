BEGIN;
SELECT plan(4);

SELECT hasnt_column(
  'public','responses_anonymous','user_id',
  'responses_anonymous MUST NOT have user_id'
);

SELECT ok(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'responses_anonymous') = 0,
  'no direct RLS policies — no direct access allowed'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class
   WHERE oid = 'public.responses_anonymous'::regclass),
  'RLS is enabled (deny-by-default)'
);

SELECT has_function(
  'public','atlas_get_prompt_results', ARRAY['uuid'],
  'atlas_get_prompt_results(uuid) exists'
);

SELECT * FROM finish();
ROLLBACK;
