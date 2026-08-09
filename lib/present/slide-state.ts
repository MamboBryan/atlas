import type { RoundLite } from "@/lib/games/types";

export type MeetingLite = {
  status: "scheduled" | "live" | "ended" | "postponed" | "cancelled";
  current_agenda_item_id: string | null;
  has_started: boolean;
};

export type AgendaItemLite = {
  id: string;
  ordinal: number;
  title: string;
  kind: "discussion" | "prompt" | "picker" | "game";
  prompt_id: string | null;
  picker_config: { mode: "oneshot" | "shuffle" } | null;
  picker_result: unknown;
  timer_ends_at: string | null;
};

export type PromptLite = {
  id: string;
  is_open: boolean;
  question?: string;
  response_type?:
    "text" | "single_choice" | "multi_choice" | "yes_no" | "rating";
  options?: unknown;
  rating_min?: number | null;
  rating_max?: number | null;
};

export type SlideState =
  | { kind: "not-live" }
  | { kind: "standby" }
  | { kind: "curtain" }
  | { kind: "discussion"; item: AgendaItemLite }
  | { kind: "prompt-open"; item: AgendaItemLite; prompt: PromptLite }
  | { kind: "prompt-closed"; item: AgendaItemLite; prompt: PromptLite }
  | { kind: "picker-oneshot-idle"; item: AgendaItemLite }
  | { kind: "picker-oneshot-revealed"; item: AgendaItemLite }
  | { kind: "picker-shuffle-idle"; item: AgendaItemLite }
  | { kind: "picker-shuffle-revealed"; item: AgendaItemLite }
  | { kind: "game-idle"; item: AgendaItemLite }
  | { kind: "game-active"; item: AgendaItemLite; round: RoundLite }
  | { kind: "game-finished"; item: AgendaItemLite; round: RoundLite };

export function deriveSlideState(
  meeting: MeetingLite,
  items: AgendaItemLite[],
  promptsById: Record<string, PromptLite>,
  roundsByItemId: Record<string, RoundLite> = {},
): SlideState {
  if (meeting.status !== "live") return { kind: "not-live" };
  if (meeting.current_agenda_item_id == null) {
    return meeting.has_started ? { kind: "curtain" } : { kind: "standby" };
  }
  const item = items.find((i) => i.id === meeting.current_agenda_item_id);
  if (!item) return { kind: "standby" }; // stale pointer; fail safe

  if (item.kind === "discussion") return { kind: "discussion", item };

  if (item.kind === "prompt") {
    const prompt = item.prompt_id ? promptsById[item.prompt_id] : undefined;
    if (!prompt)
      return {
        kind: "prompt-closed",
        item,
        prompt: { id: item.prompt_id ?? "", is_open: false },
      };
    return prompt.is_open
      ? { kind: "prompt-open", item, prompt }
      : { kind: "prompt-closed", item, prompt };
  }

  if (item.kind === "game") {
    const round = roundsByItemId[item.id];
    if (!round) return { kind: "game-idle", item };
    return round.status === "finished"
      ? { kind: "game-finished", item, round }
      : { kind: "game-active", item, round };
  }

  // picker
  const mode = item.picker_config?.mode;
  const revealed = item.picker_result != null;
  if (mode === "oneshot") {
    return revealed
      ? { kind: "picker-oneshot-revealed", item }
      : { kind: "picker-oneshot-idle", item };
  }
  return revealed
    ? { kind: "picker-shuffle-revealed", item }
    : { kind: "picker-shuffle-idle", item };
}
