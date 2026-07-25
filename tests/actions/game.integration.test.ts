import { expect, test, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = process.env.SUPABASE_TEST_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const canRun = !!url && !!svc;
const admin = canRun ? createClient(url!, svc!) : null;

beforeEach(async () => {
  if (!admin) return;
  await admin.from("game_submissions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin.from("game_rounds").delete().neq("id", "00000000-0000-0000-0000-000000000000");
});

test.runIf(canRun)("game_rounds insert with valid meeting is idempotent per meeting", async () => {
  const c = admin!;
  const { data: host } = await c.auth.admin.inviteUserByEmail("gamehost@atlas.com", {
    data: { full_name: "Game Host" },
  });
  expect(host?.user).toBeTruthy();

  const { data: meeting } = await c
    .from("meetings")
    .insert({
      title: "Test",
      scheduled_start: new Date(Date.now() + 60_000).toISOString(),
      timezone: "UTC",
      host_user_id: host!.user!.id,
      created_by: host!.user!.id,
      status: "scheduled",
    })
    .select("id")
    .single();
  expect(meeting).toBeTruthy();

  const first = await c.from("game_rounds").insert({
    meeting_id: meeting!.id,
    kind: "target_number",
    puzzle: { target: 347, bases: [2, 4, 7, 25, 50, 75] },
    started_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 60_000).toISOString(),
  });
  expect(first.error).toBeNull();

  const second = await c.from("game_rounds").insert({
    meeting_id: meeting!.id,
    kind: "target_number",
    puzzle: { target: 999, bases: [1, 2, 3, 25, 50, 75] },
    started_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 60_000).toISOString(),
  });
  expect(second.error).not.toBeNull(); // unique(meeting_id) violation
});
