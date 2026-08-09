// Action-level integration tests for startRoundAction / finalizeRoundAction.
//
// These exercise the real actions against the real local Supabase database,
// with RLS genuinely enforced: only the Next.js request plumbing
// (`requireUser`'s cookie-based session lookup, and `revalidatePath`, which
// requires a live Next request context) is stubbed. The `supabase` client
// handed back by the stubbed `requireUser()` is a real `@supabase/supabase-js`
// client signed in via the anon key as a specific test user, so every query
// the action makes still goes through Postgres RLS exactly as it would in
// production — only *who* is asking is fixed ahead of time per test via
// `actingAs()`.
import { expect, test, beforeEach, afterAll, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  admin,
  canRun,
  userClient,
  makeMeeting,
  makeAgendaItem,
  makeMeetingWithGameItem,
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

// finalizeRoundAction calls revalidatePath, which throws outside a live
// Next.js request context.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { startRoundAction, finalizeRoundAction } from "@/lib/actions/game";

function actingAs(id: string, supabase: SupabaseClient) {
  identity.current = { id, supabase };
}

beforeEach(async () => {
  identity.current = null;
  await resetGameTestDb();
});
// The last test's fixtures would otherwise survive past the end of this
// file and can trip up unrelated suites later in the run (e.g. a leftover
// meeting blocks deleting its creator, which other files' cleanup doesn't
// check for).
afterAll(resetGameTestDb);

// --- startRoundAction -------------------------------------------------

test.runIf(canRun)(
  "startRoundAction rejects a non-host, non-admin caller",
  async () => {
    const host = await userClient("action-start-forbid-host@atlas.com");
    const other = await userClient("action-start-forbid-other@atlas.com");
    const { itemId } = await makeMeetingWithGameItem(
      host.id,
      "Start forbidden",
    );

    actingAs(other.id, other.client);
    const res = await startRoundAction({ agenda_item_id: itemId });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("forbidden");
  },
);

test.runIf(canRun)(
  "startRoundAction rejects an agenda item that is not a game",
  async () => {
    const host = await userClient("action-start-wrongkind@atlas.com");
    const meetingId = await makeMeeting(host.id, "Wrong kind", "live");
    const itemId = await makeAgendaItem(
      meetingId,
      1,
      "Discussion item",
      "discussion",
    );

    actingAs(host.id, host.client);
    const res = await startRoundAction({ agenda_item_id: itemId });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("wrong_kind");
  },
);

test.runIf(canRun)(
  "startRoundAction rejects a meeting that is not live",
  async () => {
    const host = await userClient("action-start-notlive@atlas.com");
    const meetingId = await makeMeeting(host.id, "Not live", "scheduled");
    const itemId = await makeAgendaItem(meetingId, 1, "Warm-up game", "game");

    actingAs(host.id, host.client);
    const res = await startRoundAction({ agenda_item_id: itemId });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("not_live");
  },
);

test.runIf(canRun)(
  "startRoundAction: host starts a round; a repeat call is idempotent",
  async () => {
    const host = await userClient("action-start-idempotent@atlas.com");
    const { itemId } = await makeMeetingWithGameItem(
      host.id,
      "Idempotent start",
    );

    actingAs(host.id, host.client);
    const first = await startRoundAction({ agenda_item_id: itemId });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await startRoundAction({ agenda_item_id: itemId });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    // Same round, not a re-roll: a double-click must not generate a new puzzle.
    expect(second.data.round_id).toBe(first.data.round_id);
    expect(second.data.puzzle).toEqual(first.data.puzzle);
  },
);

test.runIf(canRun)(
  "startRoundAction withholds the zero_in secret while the round is active",
  async () => {
    const host = await userClient("action-start-zeroin@atlas.com");
    const meetingId = await makeMeeting(host.id, "Zero in secrecy", "live");
    actingAs(host.id, host.client);

    // pickGame() is a 50/50 coin flip; retry across fresh agenda items
    // (one round per item) until we land on zero_in rather than assume it.
    let found = false;
    for (let i = 0; i < 25 && !found; i++) {
      const itemId = await makeAgendaItem(
        meetingId,
        i + 1,
        `Round ${i}`,
        "game",
      );
      const res = await startRoundAction({ agenda_item_id: itemId });
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      if (res.data.kind === "zero_in") {
        found = true;
        expect(res.data.status).toBe("active");
        expect("secret" in res.data.puzzle).toBe(false);
      }
    }
    expect(found).toBe(true); // P(25 flips, never zero_in) ≈ 0
  },
);

test.runIf(canRun)(
  "startRoundAction allows an admin who is not the host",
  async () => {
    const host = await userClient("action-start-admin-host@atlas.com");
    const adminCaller = await userClient(
      "action-start-admin-caller@atlas.com",
      "admin",
    );
    const { itemId } = await makeMeetingWithGameItem(
      host.id,
      "Admin break-glass",
    );

    actingAs(adminCaller.id, adminCaller.client);
    const res = await startRoundAction({ agenda_item_id: itemId });
    expect(res.ok).toBe(true);
  },
);

// --- finalizeRoundAction -----------------------------------------------

test.runIf(canRun)(
  "finalizeRoundAction rejects a non-host caller",
  async () => {
    const host = await userClient("action-finalize-forbid-host@atlas.com");
    const other = await userClient("action-finalize-forbid-other@atlas.com");
    const { meetingId, itemId } = await makeMeetingWithGameItem(
      host.id,
      "Finalize forbidden",
    );

    const { data: round } = await admin!
      .from("game_rounds")
      .insert({
        meeting_id: meetingId,
        agenda_item_id: itemId,
        kind: "zero_in",
        puzzle: { secret: 12 },
        started_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 45_000).toISOString(),
      })
      .select("id")
      .single();

    actingAs(other.id, other.client);
    const res = await finalizeRoundAction({ round_id: round!.id });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("forbidden");
  },
);

test.runIf(canRun)(
  "finalizeRoundAction: host finalizes; points are written and a repeat call does not rewrite them",
  async () => {
    const host = await userClient("action-finalize-host@atlas.com");
    const player = await userClient("action-finalize-player@atlas.com");
    const { meetingId, itemId } = await makeMeetingWithGameItem(
      host.id,
      "Finalize action",
    );

    const { data: round } = await admin!
      .from("game_rounds")
      .insert({
        meeting_id: meetingId,
        agenda_item_id: itemId,
        kind: "zero_in",
        puzzle: { secret: 500 },
        started_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 45_000).toISOString(),
      })
      .select("id")
      .single();

    await admin!.from("game_submissions").insert({
      round_id: round!.id,
      player_id: player.id,
      payload: {
        guesses: [
          { value: 500, at: new Date().toISOString(), feedback: "exact" },
        ],
        best_guess: 500,
      },
    });

    actingAs(host.id, host.client);
    const first = await finalizeRoundAction({ round_id: round!.id });
    expect(first.ok).toBe(true);

    const { data: roundAfterFirst } = await admin!
      .from("game_rounds")
      .select("status")
      .eq("id", round!.id)
      .single();
    expect(roundAfterFirst!.status).toBe("finished");

    const { data: subAfterFirst } = await admin!
      .from("game_submissions")
      .select("points")
      .eq("round_id", round!.id)
      .single();
    // A lone exact guess on a Zero In round scores the full 46: 1
    // (participation) + 3 (within 5%) + 5 (within 1%) + 12 (closest — the
    // only player) + 25 (exact). Asserting "not null" here was the gap
    // that let a real regression slip through: finalizeRoundAction reads
    // submissions through the HOST's RLS-bound client before flipping the
    // round to finished, and a prior read-policy split (0035, before the
    // 0036 host-read fix) gave the host zero visible rows during an
    // active round — so it silently computed [] and every submission's
    // points landed at 0, which is not null and would have passed here.
    expect(subAfterFirst!.points).toBe(46);

    const second = await finalizeRoundAction({ round_id: round!.id });
    expect(second.ok).toBe(true);

    const { data: subAfterSecond } = await admin!
      .from("game_submissions")
      .select("points")
      .eq("round_id", round!.id)
      .single();
    expect(subAfterSecond!.points).toBe(subAfterFirst!.points);
  },
);
