BEGIN;
SELECT plan(6);

SELECT has_table('public','meeting_series','meeting_series table exists');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.meeting_series'::regclass),
  'meeting_series has RLS enabled'
);

SELECT ok(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'meeting_series') = 2,
  'meeting_series has 2 policies (read, write_owner_admin)'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'meetings_series_fk'
      AND conrelid = 'public.meetings'::regclass
  ),
  'meetings.series_id FK to meeting_series.id exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meeting_series'
      AND column_name = 'owner_user_id'
  ),
  'meeting_series has owner_user_id column'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meeting_series'
      AND column_name = 'created_by'
  ),
  'meeting_series has created_by column'
);

SELECT * FROM finish();
ROLLBACK;
