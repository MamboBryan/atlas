BEGIN;
SELECT plan(1);
SELECT pass('rls test harness works');
SELECT * FROM finish();
ROLLBACK;
