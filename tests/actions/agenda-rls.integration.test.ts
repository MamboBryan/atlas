// RLS-level tests for who may insert agenda items. These talk to the local
// Supabase directly with per-user anon clients, so every assertion is about
// what Postgres allows — no server-action code is involved.
import { expect, test, beforeEach, afterAll } from "vitest";
import {
  admin,
  canRun,
  userClient,
  makeMeeting,
  makeAgendaItem,
  resetGameTestDb,
} from "./game-test-helpers";

beforeEach(resetGameTestDb);
afterAll(resetGameTestDb);

async function setup(
  status: "live" | "scheduled" | "postponed" | "ended",
  suffix: string,
) {
  const host = await userClient(`agenda-host-${suffix}@atlas.com`);
  const guest = await userClient(`agenda-guest-${suffix}@atlas.com`);
  const meetingId = await makeMeeting(host.id, `Agenda ${suffix}`, status);
  return { host, guest, meetingId };
}

test.runIf(canRun)("participant may insert into a scheduled meeting", async () => {
  const { guest, meetingId } = await setup("scheduled", "sched");
  const { error } = await guest.client
    .from("agenda_items")
    .insert({ meeting_id: meetingId, ordinal: 0, title: "My topic", kind: "discussion" });
  expect(error).toBeNull();
});

test.runIf(canRun)("participant may insert into a postponed meeting", async () => {
  const { guest, meetingId } = await setup("postponed", "postp");
  const { error } = await guest.client
    .from("agenda_items")
    .insert({ meeting_id: meetingId, ordinal: 0, title: "My topic", kind: "discussion" });
  expect(error).toBeNull();
});

test.runIf(canRun)("participant may not insert into a live meeting", async () => {
  const { guest, meetingId } = await setup("live", "live");
  const { error } = await guest.client
    .from("agenda_items")
    .insert({ meeting_id: meetingId, ordinal: 0, title: "Nope", kind: "discussion" });
  expect(error).not.toBeNull();
});

test.runIf(canRun)("participant may not insert into an ended meeting", async () => {
  const { guest, meetingId } = await setup("ended", "ended");
  const { error } = await guest.client
    .from("agenda_items")
    .insert({ meeting_id: meetingId, ordinal: 0, title: "Nope", kind: "discussion" });
  expect(error).not.toBeNull();
});

test.runIf(canRun)("participant may not insert a game item pre-live", async () => {
  const { guest, meetingId } = await setup("scheduled", "game");
  const { error } = await guest.client
    .from("agenda_items")
    .insert({ meeting_id: meetingId, ordinal: 0, title: "Warm-up", kind: "game" });
  expect(error).not.toBeNull();
});

test.runIf(canRun)("participant may not update or delete items pre-live", async () => {
  const { guest, meetingId } = await setup("scheduled", "mutate");
  const itemId = await makeAgendaItem(meetingId, 0, "Host topic", "discussion");

  const upd = await guest.client
    .from("agenda_items")
    .update({ title: "Hijacked" })
    .eq("id", itemId)
    .select("id");
  expect(upd.data ?? []).toHaveLength(0);

  const del = await guest.client
    .from("agenda_items")
    .delete()
    .eq("id", itemId)
    .select("id");
  expect(del.data ?? []).toHaveLength(0);

  const { data: still } = await admin!
    .from("agenda_items")
    .select("title")
    .eq("id", itemId)
    .single();
  expect(still!.title).toBe("Host topic");
});

test.runIf(canRun)("host may insert while live", async () => {
  const { host, meetingId } = await setup("live", "hostlive");
  const { error } = await host.client
    .from("agenda_items")
    .insert({ meeting_id: meetingId, ordinal: 0, title: "Host topic", kind: "discussion" });
  expect(error).toBeNull();
});

test.runIf(canRun)("atlas admin may insert while live", async () => {
  const host = await userClient("agenda-host-adm@atlas.com");
  const adminUser = await userClient("agenda-admin@atlas.com", "admin");
  const meetingId = await makeMeeting(host.id, "Agenda adm", "live");
  const { error } = await adminUser.client
    .from("agenda_items")
    .insert({ meeting_id: meetingId, ordinal: 0, title: "Admin topic", kind: "discussion" });
  expect(error).toBeNull();
});
