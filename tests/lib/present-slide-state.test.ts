import { expect, test } from "vitest";
import {
  deriveSlideState,
  type MeetingLite,
  type AgendaItemLite,
  type PromptLite,
} from "@/lib/present/slide-state";
import type { RoundLite } from "@/lib/games/types";

const baseMeeting: MeetingLite = {
  status: "live",
  current_agenda_item_id: null,
  has_started: false,
};

const disc: AgendaItemLite = {
  id: "d1",
  ordinal: 1,
  title: "Discussion Item",
  kind: "discussion",
  prompt_id: null,
  picker_config: null,
  picker_result: null,
  timer_ends_at: null,
};
const pr: AgendaItemLite = {
  id: "p1",
  ordinal: 2,
  title: "Prompt Item",
  kind: "prompt",
  prompt_id: "q1",
  picker_config: null,
  picker_result: null,
  timer_ends_at: null,
};
const pkOne: AgendaItemLite = {
  id: "k1",
  ordinal: 3,
  title: "Picker Oneshot",
  kind: "picker",
  prompt_id: null,
  picker_config: { mode: "oneshot" },
  picker_result: null,
  timer_ends_at: null,
};
const pkShuf: AgendaItemLite = {
  id: "k2",
  ordinal: 4,
  title: "Picker Shuffle",
  kind: "picker",
  prompt_id: null,
  picker_config: { mode: "shuffle" },
  picker_result: null,
  timer_ends_at: null,
};

test("not-live when meeting is not live", () => {
  expect(
    deriveSlideState({ ...baseMeeting, status: "scheduled" }, [], {}).kind,
  ).toBe("not-live");
});

test("standby when live, no current item, has_started false", () => {
  expect(deriveSlideState(baseMeeting, [disc], {}).kind).toBe("standby");
});

test("curtain when live, no current item, has_started true", () => {
  const m = { ...baseMeeting, has_started: true };
  expect(deriveSlideState(m, [disc], {}).kind).toBe("curtain");
});

test("discussion state when current item is discussion", () => {
  const m = {
    ...baseMeeting,
    current_agenda_item_id: disc.id,
    has_started: true,
  };
  const s = deriveSlideState(m, [disc], {});
  expect(s.kind).toBe("discussion");
});

test("prompt-open when prompt is_open true", () => {
  const m = {
    ...baseMeeting,
    current_agenda_item_id: pr.id,
    has_started: true,
  };
  const prompts: Record<string, PromptLite> = {
    q1: { id: "q1", is_open: true },
  };
  expect(deriveSlideState(m, [pr], prompts).kind).toBe("prompt-open");
});

test("prompt-closed when prompt is_open false", () => {
  const m = {
    ...baseMeeting,
    current_agenda_item_id: pr.id,
    has_started: true,
  };
  const prompts: Record<string, PromptLite> = {
    q1: { id: "q1", is_open: false },
  };
  expect(deriveSlideState(m, [pr], prompts).kind).toBe("prompt-closed");
});

test("picker-oneshot idle vs revealed", () => {
  const m1 = {
    ...baseMeeting,
    current_agenda_item_id: pkOne.id,
    has_started: true,
  };
  expect(deriveSlideState(m1, [pkOne], {}).kind).toBe("picker-oneshot-idle");
  const revealed: AgendaItemLite = {
    ...pkOne,
    picker_result: { user_id: "u1" },
  };
  expect(deriveSlideState(m1, [revealed], {}).kind).toBe(
    "picker-oneshot-revealed",
  );
});

test("picker-shuffle idle vs revealed", () => {
  const m1 = {
    ...baseMeeting,
    current_agenda_item_id: pkShuf.id,
    has_started: true,
  };
  expect(deriveSlideState(m1, [pkShuf], {}).kind).toBe("picker-shuffle-idle");
  const revealed: AgendaItemLite = {
    ...pkShuf,
    picker_result: { shuffle_session_id: "s1" },
  };
  expect(deriveSlideState(m1, [revealed], {}).kind).toBe(
    "picker-shuffle-revealed",
  );
});

const gameItem: AgendaItemLite = {
  id: "g1",
  ordinal: 5,
  title: "Warm-up game",
  kind: "game",
  prompt_id: null,
  picker_config: null,
  picker_result: null,
  timer_ends_at: null,
};

const activeRound: RoundLite = {
  id: "r1",
  agenda_item_id: "g1",
  kind: "target_number",
  puzzle: { kind: "target_number", target: 347, bases: [2, 4, 7, 25, 50, 75] },
  ends_at: "2026-08-09T10:01:00.000Z",
  status: "active",
};

test("game item with no round is idle", () => {
  const s = deriveSlideState(
    { ...baseMeeting, current_agenda_item_id: "g1" },
    [gameItem],
    {},
    {},
  );
  expect(s.kind).toBe("game-idle");
});

test("game item with an active round is active and carries the round", () => {
  const s = deriveSlideState(
    { ...baseMeeting, current_agenda_item_id: "g1" },
    [gameItem],
    {},
    { g1: activeRound },
  );
  expect(s.kind).toBe("game-active");
  if (s.kind === "game-active") expect(s.round.id).toBe("r1");
});

test("game item with a finished round is finished", () => {
  const s = deriveSlideState(
    { ...baseMeeting, current_agenda_item_id: "g1" },
    [gameItem],
    {},
    { g1: { ...activeRound, status: "finished" } },
  );
  expect(s.kind).toBe("game-finished");
});

test("a round keyed to a different item does not leak into this one", () => {
  const s = deriveSlideState(
    { ...baseMeeting, current_agenda_item_id: "g1" },
    [gameItem],
    {},
    { someOtherItem: activeRound },
  );
  expect(s.kind).toBe("game-idle");
});

test("existing three-argument calls still derive non-game items", () => {
  const s = deriveSlideState(
    { ...baseMeeting, current_agenda_item_id: "d1" },
    [disc],
    {},
  );
  expect(s.kind).toBe("discussion");
});
