// Action-level tests for addAgendaItemAction. Only Next.js request plumbing is
// stubbed (requireUser's cookie session, revalidatePath); the Supabase client
// is a real anon-key client signed in as a specific test user, so RLS is
// genuinely enforced underneath the action's own gate.
import { expect, test, beforeEach, afterAll, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canRun,
  userClient,
  makeMeeting,
  resetGameTestDb,
} from "./game-test-helpers";

const identity = vi.hoisted(() => ({
  current: null as { id: string; supabase: SupabaseClient } | null,
}));

vi.mock("@/lib/auth/require", () => ({
  requireUser: async () => {
    if (!identity.current) {
      throw new Error("test identity not set — call actingAs() first");
    }
    return {
      user: { id: identity.current.id },
      supabase: identity.current.supabase,
    };
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addAgendaItemAction } from "@/lib/actions/agenda";

function actingAs(id: string, supabase: SupabaseClient) {
  identity.current = { id, supabase };
}

beforeEach(async () => {
  identity.current = null;
  await resetGameTestDb();
});
afterAll(resetGameTestDb);

test.runIf(canRun)("participant add succeeds before the meeting is live", async () => {
  const host = await userClient("act-host-a@atlas.com");
  const guest = await userClient("act-guest-a@atlas.com");
  const meetingId = await makeMeeting(host.id, "Act A", "scheduled");

  actingAs(guest.id, guest.client);
  const res = await addAgendaItemAction({
    meeting_id: meetingId,
    kind: "discussion",
    title: "Guest topic",
  });
  expect(res.ok).toBe(true);
});

test.runIf(canRun)("participant add is forbidden once live", async () => {
  const host = await userClient("act-host-b@atlas.com");
  const guest = await userClient("act-guest-b@atlas.com");
  const meetingId = await makeMeeting(host.id, "Act B", "live");

  actingAs(guest.id, guest.client);
  const res = await addAgendaItemAction({
    meeting_id: meetingId,
    kind: "discussion",
    title: "Guest topic",
  });
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.error.code).toBe("forbidden");
});

test.runIf(canRun)("participant may not add a game item", async () => {
  const host = await userClient("act-host-c@atlas.com");
  const guest = await userClient("act-guest-c@atlas.com");
  const meetingId = await makeMeeting(host.id, "Act C", "scheduled");

  actingAs(guest.id, guest.client);
  const res = await addAgendaItemAction({
    meeting_id: meetingId,
    kind: "game",
    title: "Warm-up",
  });
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.error.code).toBe("forbidden");
});

test.runIf(canRun)("host may add while live", async () => {
  const host = await userClient("act-host-d@atlas.com");
  const meetingId = await makeMeeting(host.id, "Act D", "live");

  actingAs(host.id, host.client);
  const res = await addAgendaItemAction({
    meeting_id: meetingId,
    kind: "discussion",
    title: "Host topic",
  });
  expect(res.ok).toBe(true);
});

test.runIf(canRun)("host may add a game item", async () => {
  const host = await userClient("act-host-e@atlas.com");
  const meetingId = await makeMeeting(host.id, "Act E", "scheduled");

  actingAs(host.id, host.client);
  const res = await addAgendaItemAction({
    meeting_id: meetingId,
    kind: "game",
    title: "Warm-up",
  });
  expect(res.ok).toBe(true);
});

test.runIf(canRun)("atlas admin may add while live", async () => {
  const host = await userClient("act-host-f@atlas.com");
  const adminUser = await userClient("act-admin-f@atlas.com", "admin");
  const meetingId = await makeMeeting(host.id, "Act F", "live");

  actingAs(adminUser.id, adminUser.client);
  const res = await addAgendaItemAction({
    meeting_id: meetingId,
    kind: "discussion",
    title: "Admin topic",
  });
  expect(res.ok).toBe(true);
});
