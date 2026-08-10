// Shared fixtures for the game integration test suites (DB/RLS tests and
// action-level tests). Not a test file itself — vitest only picks up
// `tests/**/*.test.ts`.
import { createClient } from "@supabase/supabase-js";

export const url =
  process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
export const svc =
  process.env.SUPABASE_TEST_SERVICE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;
export const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const canRun = !!url && !!svc && !!anon;
export const admin = canRun ? createClient(url!, svc!) : null;

export async function userClient(
  email: string,
  role: "admin" | "member" = "member",
) {
  const { data } = await admin!.auth.admin.createUser({
    email,
    password: "passw0rd!",
    email_confirm: true,
  });
  await admin!.from("profiles").update({ role }).eq("id", data.user!.id);
  const c = createClient(url!, anon!);
  await c.auth.signInWithPassword({ email, password: "passw0rd!" });
  return { client: c, id: data.user!.id as string };
}

export async function makeMeeting(
  hostId: string,
  title: string,
  status: "live" | "scheduled" | "postponed" | "ended" = "live",
  participantsOverride?: string[],
) {
  const { data: meeting } = await admin!
    .from("meetings")
    .insert({
      title,
      scheduled_start: new Date(Date.now() + 60_000).toISOString(),
      timezone: "UTC",
      host_user_id: hostId,
      created_by: hostId,
      status,
      participants_override: participantsOverride ?? null,
    })
    .select("id")
    .single();
  return meeting!.id as string;
}

export async function makeAgendaItem(
  meetingId: string,
  ordinal: number,
  title: string,
  kind: "game" | "discussion" = "game",
) {
  const { data: item } = await admin!
    .from("agenda_items")
    .insert({ meeting_id: meetingId, ordinal, title, kind })
    .select("id")
    .single();
  return item!.id as string;
}

export async function makeMeetingWithGameItem(hostId: string, title: string) {
  const meetingId = await makeMeeting(hostId, title, "live");
  const itemId = await makeAgendaItem(meetingId, 1, "Warm-up game", "game");
  return { meetingId, itemId };
}

/** Clears all game-related rows and every auth user, so fixture emails are
 * reusable across runs and across the two game test files. */
export async function resetGameTestDb() {
  if (!admin) return;
  await admin
    .from("game_submissions")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  await admin
    .from("game_rounds")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  await admin
    .from("agenda_items")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  await admin
    .from("meetings")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data.users ?? []) await admin.auth.admin.deleteUser(u.id);
}
