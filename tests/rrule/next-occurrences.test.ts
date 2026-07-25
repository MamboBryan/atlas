import { expect, test } from "vitest";
import { nextOccurrences } from "@/lib/rrule/next-occurrences";

test("weekly Monday 10:00 Africa/Nairobi", () => {
  const out = nextOccurrences(
    "FREQ=WEEKLY;BYDAY=MO;BYHOUR=10;BYMINUTE=0",
    "Africa/Nairobi",
    new Date("2026-01-01T00:00:00Z"),
    new Date("2026-01-31T00:00:00Z"),
  );
  expect(out.length).toBeGreaterThan(3);
  // 10:00 EAT = 07:00 UTC
  expect(out[0].toISOString().endsWith("07:00:00.000Z")).toBe(true);
});

test("daily at 09:00 UTC returns each day", () => {
  const out = nextOccurrences(
    "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
    "UTC",
    new Date("2026-02-01T00:00:00Z"),
    new Date("2026-02-05T00:00:00Z"),
  );
  expect(out.length).toBe(4);
  expect(out[0].toISOString()).toBe("2026-02-01T09:00:00.000Z");
});
