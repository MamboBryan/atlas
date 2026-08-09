BEGIN;
SELECT plan(18);

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
  'game_rounds has 2 policies (read + insert-host)'
);

SELECT ok(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'game_rounds'
     AND policyname = 'game_rounds_insert_host') = 1,
  'game_rounds insert is gated to the host'
);

SELECT ok(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'game_submissions') = 5,
  'game_submissions has 5 policies (read-self + read-finished + read-host + insert-self + update-self)'
);

SELECT has_column('public', 'game_rounds', 'agenda_item_id',
  'game_rounds is anchored to an agenda item');

SELECT ok(
  (SELECT count(*) FROM pg_constraint
   WHERE conrelid = 'public.game_rounds'::regclass
     AND conname = 'game_rounds_agenda_item_key') = 1,
  'one round per agenda item'
);

-- game_rounds.puzzle carries an active Zero In round's secret; it must never
-- be broadcast over the game_rounds realtime channel (see 0034).
SELECT ok(
  (SELECT NOT ('puzzle' = ANY(t.attnames))
   FROM pg_publication_tables t
   WHERE t.pubname = 'supabase_realtime' AND t.tablename = 'game_rounds'),
  'game_rounds realtime publication excludes puzzle'
);

-- game_submissions.payload can carry another player's guesses/feedback,
-- which for Zero In can reveal the secret; it must never be broadcast (0035).
SELECT ok(
  (SELECT NOT ('payload' = ANY(t.attnames))
   FROM pg_publication_tables t
   WHERE t.pubname = 'supabase_realtime' AND t.tablename = 'game_submissions'),
  'game_submissions realtime publication excludes payload'
);

SELECT ok(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'game_submissions'
     AND policyname = 'game_submissions_read_self') = 1,
  'game_submissions_read_self policy exists'
);

SELECT ok(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'game_submissions'
     AND policyname = 'game_submissions_read_finished') = 1,
  'game_submissions_read_finished policy exists'
);

SELECT ok(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'game_submissions'
     AND policyname = 'game_submissions_read_host') = 1,
  'game_submissions_read_host policy exists'
);

-- End-to-end proof that a non-host, non-admin authenticated user cannot
-- finalize someone else's round. Uses two real auth.users rows so
-- auth.uid() resolves inside the SECURITY DEFINER function exactly as it
-- would over PostgREST. Wrapped in a pg_temp function returning setof text
-- (rather than a bare DO block) because pgTAP's ok()/is() TAP output rows
-- only reach pg_prove when they are actually SELECTed at the top level —
-- calling them via PERFORM inside a DO block discards the returned rows,
-- silently dropping the assertions from the plan.
CREATE FUNCTION pg_temp.test_finalize_round_host_gate() RETURNS SETOF TEXT AS $test$
DECLARE
  host_id    uuid := gen_random_uuid();
  other_id   uuid := gen_random_uuid();
  meeting_id uuid;
  item_id    uuid;
  round_id   uuid;
  raised     boolean := false;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  VALUES
    (host_id,  'games-rls-host@atlas.test',  'x', now(), '{}'::jsonb, '{}'::jsonb),
    (other_id, 'games-rls-other@atlas.test', 'x', now(), '{}'::jsonb, '{}'::jsonb);

  INSERT INTO public.meetings (title, scheduled_start, timezone, host_user_id, created_by, status)
  VALUES ('RLS finalize gate', now(), 'UTC', host_id, host_id, 'live')
  RETURNING id INTO meeting_id;

  INSERT INTO public.agenda_items (meeting_id, ordinal, title, kind)
  VALUES (meeting_id, 1, 'Warm-up game', 'game')
  RETURNING id INTO item_id;

  INSERT INTO public.game_rounds (meeting_id, agenda_item_id, kind, puzzle, started_at, ends_at, status)
  VALUES (meeting_id, item_id, 'zero_in', '{"secret":500}'::jsonb, now(), now() + interval '45 seconds', 'active')
  RETURNING id INTO round_id;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', other_id::text, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.atlas_finalize_game_round(round_id, '[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  RETURN NEXT is(raised, true, 'non-host, non-admin caller cannot finalize a round');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', host_id::text, 'role', 'authenticated')::text, true);
  PERFORM public.atlas_finalize_game_round(round_id, '[]'::jsonb);
  RETURN NEXT is(
    (SELECT status::text FROM public.game_rounds WHERE id = round_id),
    'finished',
    'the host can finalize the round'
  );

  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$test$ LANGUAGE plpgsql;

SELECT * FROM pg_temp.test_finalize_round_host_gate();

-- 0036: the host must be able to read game_submissions for a round in
-- their own meeting WHILE IT IS STILL ACTIVE — finalizeRoundAction reads
-- submissions through the host's own RLS-bound client before flipping the
-- round to finished, to compute scores. Without this, every submission
-- gets scored 0 (see 0036's migration comment for the full story). At the
-- same time, another player who is neither the host nor the submitter
-- must still see nothing while the round is active — that's the secrecy
-- property 0035 exists to protect, and this policy must not have widened
-- it beyond the host.
CREATE FUNCTION pg_temp.test_game_submissions_host_read() RETURNS SETOF TEXT AS $test$
DECLARE
  v_host     uuid := gen_random_uuid();
  v_player   uuid := gen_random_uuid();
  v_other    uuid := gen_random_uuid();
  v_meeting  uuid;
  v_item     uuid;
  v_round    uuid;
  v_count    int;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  VALUES
    (v_host,   'games-rls-read-host@atlas.test',   'x', now(), '{}'::jsonb, '{}'::jsonb),
    (v_player, 'games-rls-read-player@atlas.test', 'x', now(), '{}'::jsonb, '{}'::jsonb),
    (v_other,  'games-rls-read-other@atlas.test',  'x', now(), '{}'::jsonb, '{}'::jsonb);

  INSERT INTO public.meetings (title, scheduled_start, timezone, host_user_id, created_by, status)
  VALUES ('RLS submission read', now(), 'UTC', v_host, v_host, 'live')
  RETURNING id INTO v_meeting;

  INSERT INTO public.agenda_items (meeting_id, ordinal, title, kind)
  VALUES (v_meeting, 1, 'Warm-up game', 'game')
  RETURNING id INTO v_item;

  INSERT INTO public.game_rounds (meeting_id, agenda_item_id, kind, puzzle, started_at, ends_at, status)
  VALUES (v_meeting, v_item, 'zero_in', '{"secret":500}'::jsonb, now(), now() + interval '45 seconds', 'active')
  RETURNING id INTO v_round;

  INSERT INTO public.game_submissions (round_id, player_id, payload)
  VALUES (
    v_round, v_player,
    '{"guesses":[{"value":500,"at":"2026-01-01T00:00:00Z","feedback":"exact"}],"best_guess":500}'::jsonb
  );

  -- The pgTAP runner connects as `postgres`, which has BYPASSRLS — so a
  -- plain SELECT here would see every row regardless of policy and prove
  -- nothing. Actually exercise RLS by switching the *Postgres* role to
  -- `authenticated` (which has no bypass) for the duration of each read;
  -- auth.uid() still resolves from the request.jwt.claims GUC set above,
  -- independent of the role switch.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_host::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.game_submissions WHERE round_id = v_round;
  RESET ROLE;
  RETURN NEXT is(v_count, 1, 'the host can read a submission during an active round');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.game_submissions WHERE round_id = v_round;
  RESET ROLE;
  RETURN NEXT is(v_count, 0, 'another player still cannot read a submission during an active round');

  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$test$ LANGUAGE plpgsql;

SELECT * FROM pg_temp.test_game_submissions_host_read();

SELECT * FROM finish();
ROLLBACK;
