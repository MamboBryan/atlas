import { expect, test } from "vitest";
import { decidePostponeAction } from "@/lib/postpone/decide";

const base = {
  status: "scheduled" as const,
  scheduled_start: "2026-07-24T10:00:00Z",
  auto_postpone_count: 0,
  now: new Date("2026-07-24T10:00:00Z"),
  graceMinutes: 15,
  maxAutoPostpones: 3,
};

test("noop when meeting is not scheduled", () => {
  expect(
    decidePostponeAction({ ...base, status: "live" }).action,
  ).toBe("noop");
  expect(
    decidePostponeAction({ ...base, status: "ended" }).action,
  ).toBe("noop");
  expect(
    decidePostponeAction({ ...base, status: "postponed" }).action,
  ).toBe("noop");
  expect(
    decidePostponeAction({ ...base, status: "cancelled" }).action,
  ).toBe("noop");
});

test("noop inside grace window", () => {
  const now = new Date("2026-07-24T10:14:59Z");
  expect(decidePostponeAction({ ...base, now }).action).toBe("noop");
});

test("auto_postpone at grace boundary + 1s when count < max", () => {
  const now = new Date("2026-07-24T10:15:01Z");
  const r = decidePostponeAction({ ...base, now, auto_postpone_count: 0 });
  expect(r.action).toBe("auto_postpone");
  if (r.action === "auto_postpone") {
    expect(r.nextAutoPostponeCount).toBe(1);
    expect(new Date(r.newScheduledStart).toISOString()).toBe(
      new Date("2026-07-25T10:00:00Z").toISOString(),
    );
  }
});

test("auto_postpone again when count = 1", () => {
  const now = new Date("2026-07-24T10:20:00Z");
  const r = decidePostponeAction({ ...base, now, auto_postpone_count: 1 });
  expect(r.action).toBe("auto_postpone");
  if (r.action === "auto_postpone") {
    expect(r.nextAutoPostponeCount).toBe(2);
  }
});

test("auto_postpone again when count = 2 (reaches max)", () => {
  const now = new Date("2026-07-24T10:20:00Z");
  const r = decidePostponeAction({ ...base, now, auto_postpone_count: 2 });
  expect(r.action).toBe("auto_postpone");
  if (r.action === "auto_postpone") {
    expect(r.nextAutoPostponeCount).toBe(3);
  }
});

test("auto_cancel when count = max (3)", () => {
  const now = new Date("2026-07-24T10:20:00Z");
  const r = decidePostponeAction({ ...base, now, auto_postpone_count: 3 });
  expect(r.action).toBe("auto_cancel");
});

test("respects custom grace window", () => {
  const now = new Date("2026-07-24T10:04:59Z");
  expect(
    decidePostponeAction({ ...base, now, graceMinutes: 5 }).action,
  ).toBe("noop");
  const now2 = new Date("2026-07-24T10:05:01Z");
  expect(
    decidePostponeAction({ ...base, now: now2, graceMinutes: 5 }).action,
  ).toBe("auto_postpone");
});
