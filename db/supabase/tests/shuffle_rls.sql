BEGIN;
SELECT plan(6);

SELECT has_table('public','shuffle_sessions','shuffle_sessions table exists');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.shuffle_sessions'::regclass),
  'shuffle_sessions has RLS enabled'
);

SELECT ok(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'shuffle_sessions') = 3,
  'shuffle_sessions has 3 policies (owner read, meeting read, write)'
);

SELECT has_column('public','shuffle_sessions','owner_user_id','owner_user_id column exists');
SELECT has_column('public','shuffle_sessions','created_by','created_by column exists');

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'shuffle_status'
  ),
  'shuffle_status enum exists'
);

SELECT * FROM finish();
ROLLBACK;
