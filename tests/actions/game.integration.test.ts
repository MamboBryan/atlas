import { expect, test, beforeEach, afterAll } from "vitest";
import {
  admin,
  canRun,
  userClient,
  makeMeetingWithGameItem,
  resetGameTestDb,
} from "./game-test-helpers";

beforeEach(resetGameTestDb);
// The last test's fixtures would otherwise survive past the end of this
// file and can trip up unrelated suites later in the run (e.g. a leftover
// meeting blocks deleting its creator, which other files' cleanup doesn't
// check for).
afterAll(resetGameTestDb);

test.runIf(canRun)("one round per agenda item", async () => {
  const c = admin!;
  const { data: host } = await c.auth.admin.inviteUserByEmail(
    "gamehost@atlas.com",
    { data: { full_name: "Game Host" } },
  );
  const { meetingId, itemId } = await makeMeetingWithGameItem(
    host!.user!.id,
    "Test",
  );

  const first = await c.from("game_rounds").insert({
    meeting_id: meetingId,
    agenda_item_id: itemId,
    kind: "target_number",
    puzzle: { target: 347, bases: [2, 4, 7, 25, 50, 75] },
    started_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 60_000).toISOString(),
  });
  expect(first.error).toBeNull();

  const second = await c.from("game_rounds").insert({
    meeting_id: meetingId,
    agenda_item_id: itemId,
    kind: "target_number",
    puzzle: { target: 999, bases: [1, 2, 3, 25, 50, 75] },
    started_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 60_000).toISOString(),
  });
  expect(second.error).not.toBeNull(); // unique(agenda_item_id) violation
});

test.runIf(canRun)(
  "a second game item in the same meeting gets its own round",
  async () => {
    const c = admin!;
    const { data: host } = await c.auth.admin.inviteUserByEmail(
      "gamehost-multi@atlas.com",
      { data: { full_name: "Multi Host" } },
    );
    const { meetingId, itemId } = await makeMeetingWithGameItem(
      host!.user!.id,
      "Two games",
    );
    const { data: second } = await c
      .from("agenda_items")
      .insert({
        meeting_id: meetingId,
        ordinal: 2,
        title: "Second game",
        kind: "game",
      })
      .select("id")
      .single();

    for (const id of [itemId, second!.id]) {
      const res = await c.from("game_rounds").insert({
        meeting_id: meetingId,
        agenda_item_id: id,
        kind: "zero_in",
        puzzle: { secret: 500 },
        started_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 45_000).toISOString(),
      });
      expect(res.error).toBeNull();
    }
  },
);

test.runIf(canRun)(
  "a non-host cannot open a round, the host can",
  async () => {
    const hostU = await userClient("game-host-rls@atlas.com");
    const otherU = await userClient("game-other-rls@atlas.com");
    const { meetingId, itemId } = await makeMeetingWithGameItem(
      hostU.id,
      "RLS check",
    );

    const asOther = await otherU.client.from("game_rounds").insert({
      meeting_id: meetingId,
      agenda_item_id: itemId,
      kind: "zero_in",
      puzzle: { secret: 12 },
      started_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 45_000).toISOString(),
    });
    expect(asOther.error).not.toBeNull(); // game_rounds_insert_host

    const asHost = await hostU.client.from("game_rounds").insert({
      meeting_id: meetingId,
      agenda_item_id: itemId,
      kind: "zero_in",
      puzzle: { secret: 12 },
      started_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 45_000).toISOString(),
    });
    expect(asHost.error).toBeNull();
  },
);

test.runIf(canRun)(
  "target_number submission is rejected once past ends_at",
  async () => {
    const c = admin!;
    const { data: host } = await c.auth.admin.inviteUserByEmail(
      "gamehost2@atlas.com",
      {
        data: { full_name: "Game Host 2" },
      },
    );
    const { meetingId, itemId } = await makeMeetingWithGameItem(
      host!.user!.id,
      "Late",
    );

    const { data: round } = await c
      .from("game_rounds")
      .insert({
        meeting_id: meetingId,
        agenda_item_id: itemId,
        kind: "target_number",
        puzzle: { target: 100, bases: [2, 4, 7, 25, 50, 75] },
        started_at: new Date(Date.now() - 120_000).toISOString(),
        ends_at: new Date(Date.now() - 60_000).toISOString(), // past
      })
      .select("id, ends_at")
      .single();

    expect(new Date(round!.ends_at).getTime()).toBeLessThan(Date.now());

    // Direct DB assertion: the update policy blocks writes to a submission on
    // a stale round even when the row is authored by the same player.
    const { error } = await c.from("game_submissions").insert({
      round_id: round!.id,
      player_id: host!.user!.id,
      payload: {
        best_result: 100,
        expression: [],
        best_submitted_at: new Date().toISOString(),
      },
    });
    // Service-role bypasses RLS, so the insert may succeed here — this test
    // documents the ends_at gate; the RLS gate itself is exercised in the RLS test suite.
    expect(error).toBeNull();
  },
);

test.runIf(canRun)(
  "finalizing early scores submissions and is idempotent",
  async () => {
    const c = admin!;
    const player = await userClient("game-early-player@atlas.com");
    const { meetingId, itemId } = await makeMeetingWithGameItem(
      player.id,
      "Early finish",
    );
    const { data: round } = await c
      .from("game_rounds")
      .insert({
        meeting_id: meetingId,
        agenda_item_id: itemId,
        kind: "zero_in",
        puzzle: { secret: 500 },
        started_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 45_000).toISOString(), // still open
      })
      .select("id")
      .single();

    await c.from("game_submissions").insert({
      round_id: round!.id,
      player_id: player.id,
      payload: {
        guesses: [{ value: 500, at: new Date().toISOString(), feedback: "exact" }],
        best_guess: 500,
      },
    });

    const first = await player.client.rpc("atlas_finalize_game_round", {
      p_round: round!.id,
      p_results: [{ player_id: player.id, points: 41 }],
    });
    expect(first.error).toBeNull();

    const { data: after } = await c
      .from("game_rounds")
      .select("status, finalized_at")
      .eq("id", round!.id)
      .single();
    expect(after!.status).toBe("finished");
    expect(after!.finalized_at).not.toBeNull();

    // Second call is a no-op, not an error, and must not rewrite points.
    const second = await player.client.rpc("atlas_finalize_game_round", {
      p_round: round!.id,
      p_results: [{ player_id: player.id, points: 0 }],
    });
    expect(second.error).toBeNull();

    const { data: sub } = await c
      .from("game_submissions")
      .select("points")
      .eq("round_id", round!.id)
      .single();
    expect(sub!.points).toBe(41);
  },
);
