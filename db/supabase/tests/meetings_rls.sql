BEGIN;
SELECT plan(9);

SELECT has_table('public','meetings','meetings table exists');
SELECT has_table('public','agenda_items','agenda_items table exists');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.meetings'::regclass),
  'meetings has RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.agenda_items'::regclass),
  'agenda_items has RLS enabled'
);

SELECT ok(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'meetings') = 3,
  'meetings has 3 policies (read, insert, update)'
);
SELECT ok(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'agenda_items') = 3,
  'agenda_items has 3 policies (read, write_host, insert_participant)'
);

SELECT has_function(
  'public','atlas_prompt_denominator', ARRAY['uuid'],
  'atlas_prompt_denominator(uuid) exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prompts_meeting_fk'
      AND conrelid = 'public.prompts'::regclass
  ),
  'prompts.meeting_id FK to meetings.id exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='prompts' AND policyname='prompts_read'
  ),
  'prompts read policy updated for meeting scope'
);

SELECT * FROM finish();
ROLLBACK;
