import { expect, test } from "vitest";
import { pickNextHost } from "@/lib/rotation/pick-next-host";

test("picks cursor when available", () => {
  const r = pickNextHost(["u1", "u2", "u3"], 1, () => false);
  expect(r.host).toBe("u2");
  expect(r.nextCursor).toBe(2);
  expect(r.skipped).toEqual([]);
});

test("skips unavailable and advances cursor accordingly", () => {
  const r = pickNextHost(["u1", "u2", "u3"], 0, (id) => id === "u1");
  expect(r.host).toBe("u2");
  expect(r.nextCursor).toBe(2);
  expect(r.skipped).toEqual(["u1"]);
});

test("wraps around", () => {
  const r = pickNextHost(["u1", "u2"], 3, () => false);
  expect(r.host).toBe("u2");
  expect(r.nextCursor).toBe(0);
});

test("returns null when everyone unavailable", () => {
  const r = pickNextHost(["u1", "u2"], 0, () => true);
  expect(r.host).toBeNull();
  expect(r.skipped).toEqual(["u1", "u2"]);
});

test("wraps cursor past end back to 0 when picking last slot", () => {
  const r = pickNextHost(["u1", "u2", "u3"], 2, () => false);
  expect(r.host).toBe("u3");
  expect(r.nextCursor).toBe(0);
});
