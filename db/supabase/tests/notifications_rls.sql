BEGIN;
SELECT plan(8);

SELECT has_table('public','notifications','notifications table exists');
SELECT has_table('public','email_events','email_events table exists');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.notifications'::regclass),
  'notifications has RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.email_events'::regclass),
  'email_events has RLS enabled'
);

SELECT ok(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'notifications') = 2,
  'notifications has 2 policies (read_self, update_self)'
);

SELECT ok(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'email_events') = 1,
  'email_events has 1 policy (admin_read)'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_events_dedupe_key_key'
      AND conrelid = 'public.email_events'::regclass
  ),
  'email_events.dedupe_key has unique constraint'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'email_prefs'
  ),
  'profiles.email_prefs column exists'
);

SELECT * FROM finish();
ROLLBACK;
