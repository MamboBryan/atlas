BEGIN;
SELECT plan(2);

SELECT has_table('public', 'unavailability_windows', 'unavailability_windows table exists');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.unavailability_windows'::regclass),
  'unavailability_windows has RLS'
);

SELECT * FROM finish();
ROLLBACK;
