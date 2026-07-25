BEGIN;
SELECT plan(3);

SELECT has_table('public', 'profiles', 'profiles table exists');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass),
  'profiles has RLS'
);
SELECT policies_are(
  'public', 'profiles',
  ARRAY['profiles_self_read','profiles_all_read','profiles_self_write','profiles_admin_write'],
  'expected policies present'
);
SELECT * FROM finish();
ROLLBACK;
