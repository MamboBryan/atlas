export type MeetingStatus =
  "scheduled" | "live" | "ended" | "postponed" | "cancelled";

export type PostponeInput = {
  status: MeetingStatus;
  scheduled_start: string;
  auto_postpone_count: number;
  now: Date;
  graceMinutes: number;
  maxAutoPostpones: number;
};

export type PostponeDecision =
  | { action: "noop" }
  | {
      action: "auto_postpone";
      nextAutoPostponeCount: number;
      newScheduledStart: string;
    }
  | { action: "auto_cancel" };

export function decidePostponeAction(input: PostponeInput): PostponeDecision {
  if (input.status !== "scheduled") return { action: "noop" };

  const startMs = new Date(input.scheduled_start).getTime();
  const deadlineMs = startMs + input.graceMinutes * 60_000;
  if (input.now.getTime() <= deadlineMs) return { action: "noop" };

  if (input.auto_postpone_count >= input.maxAutoPostpones)
    return { action: "auto_cancel" };

  const nextStart = new Date(startMs + 24 * 3600_000).toISOString();
  return {
    action: "auto_postpone",
    nextAutoPostponeCount: input.auto_postpone_count + 1,
    newScheduledStart: nextStart,
  };
}
