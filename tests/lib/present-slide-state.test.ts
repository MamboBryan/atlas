import { expect, test } from "vitest";
import {
  deriveSlideState,
  type MeetingLite,
  type AgendaItemLite,
  type PromptLite,
} from "@/lib/present/slide-state";

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
