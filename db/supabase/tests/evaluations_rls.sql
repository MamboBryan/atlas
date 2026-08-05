BEGIN;
SELECT plan(21);

-- Tables exist
SELECT has_table('public','evaluations','evaluations table exists');
SELECT has_table('public','evaluation_questions','questions table exists');
SELECT has_table('public','evaluation_candidates','candidates table exists');
SELECT has_table('public','evaluation_answers','answers table exists');
SELECT has_table('public','evaluation_panelists','panelists table exists');
SELECT has_table('public','evaluation_ratings','ratings table exists');
SELECT has_table('public','evaluation_owners','owners table exists');

-- RLS enabled on the privacy-critical tables
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.evaluation_ratings'::regclass),
  'evaluation_ratings has RLS');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.evaluation_answers'::regclass),
  'evaluation_answers has RLS');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.evaluation_candidates'::regclass),
  'evaluation_candidates has RLS');

-- Helper + constant present
SELECT is(public.evaluation_min_raters(), 3, 'min raters is 3');
SELECT has_function('public','atlas_is_panelist',
  ARRAY['uuid','uuid'], 'atlas_is_panelist(uuid,uuid) exists');
SELECT has_function('public','atlas_is_evaluation_owner',
  ARRAY['uuid','uuid'], 'atlas_is_evaluation_owner(uuid,uuid) exists');

-- Ratings has exactly 2 policies: read-self (select) + write-self (all)
SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE schemaname='public' AND tablename='evaluation_ratings'),
  2, 'evaluation_ratings has 2 policies (read-self + write-self)');

-- Answers has exactly 2 policies: panelist/admin read + owner write
SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE schemaname='public' AND tablename='evaluation_answers'),
  2, 'evaluation_answers has 2 policies (read + owner write)');

-- Owner list: read + write policies present
SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE schemaname='public' AND tablename='evaluation_owners'),
  2, 'evaluation_owners has 2 policies (read + owner write)');

-- Management authority is owner-based, not admin-based
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='evaluations' AND policyname='evaluations_owner_write'),
  'evaluations has owner-write policy');

-- RPCs exist (behavioral suppression is proven in Task 10 integration tests).
SELECT has_function('public','evaluation_results',
  ARRAY['uuid'], 'evaluation_results(uuid) exists');
SELECT has_function('public','evaluation_panel_progress',
  ARRAY['uuid'], 'evaluation_panel_progress(uuid) exists');

-- CSV import / hidden-field columns exist
SELECT has_column('public','evaluations','hide_names', 'evaluations.hide_names exists');
SELECT has_column('public','evaluation_questions','is_hidden', 'evaluation_questions.is_hidden exists');

SELECT * FROM finish();
ROLLBACK;
