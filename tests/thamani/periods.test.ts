import { describe, it, expect } from "vitest";
import { periodStart, periodEndMs, computeSet } from "@/lib/thamani/periods";

const d = (iso: string) => new Date(iso);

describe("periodStart", () => {
  it("day → same UTC date", () => {
    expect(periodStart(d("2026-07-30T18:05:00Z"), "day")).toBe("2026-07-30");
  });
  it("week → Monday of the week (Thu 2026-07-30 → Mon 2026-07-27)", () => {
    expect(periodStart(d("2026-07-30T18:05:00Z"), "week")).toBe("2026-07-27");
  });
  it("week → Sunday belongs to the prior Monday (2026-08-02 → 2026-07-27)", () => {
    expect(periodStart(d("2026-08-02T10:00:00Z"), "week")).toBe("2026-07-27");
  });
  it("month → first of month", () => {
    expect(periodStart(d("2026-07-30T18:05:00Z"), "month")).toBe("2026-07-01");
  });
  it("quarter → first day of calendar quarter (Jul → Q3 = 07-01)", () => {
    expect(periodStart(d("2026-07-30T18:05:00Z"), "quarter")).toBe("2026-07-01");
  });
  it("quarter → Feb belongs to Q1 (01-01)", () => {
    expect(periodStart(d("2026-02-15T00:00:00Z"), "quarter")).toBe("2026-01-01");
  });
  it("year → Jan 1", () => {
    expect(periodStart(d("2026-07-30T18:05:00Z"), "year")).toBe("2026-01-01");
  });
});

describe("periodEndMs", () => {
  it("month end is exclusive first-of-next-month", () => {
    expect(periodEndMs("month", "2026-07-01")).toBe(Date.parse("2026-08-01T00:00:00Z"));
  });
  it("quarter end (Q3) is 10-01", () => {
    expect(periodEndMs("quarter", "2026-07-01")).toBe(Date.parse("2026-10-01T00:00:00Z"));
  });
  it("year end is next Jan 1", () => {
    expect(periodEndMs("year", "2026-01-01")).toBe(Date.parse("2027-01-01T00:00:00Z"));
  });
  it("week end is +7 days", () => {
    expect(periodEndMs("week", "2026-07-27")).toBe(Date.parse("2026-08-03T00:00:00Z"));
  });
  it("day end is +1 day", () => {
    expect(periodEndMs("day", "2026-07-30")).toBe(Date.parse("2026-07-31T00:00:00Z"));
  });
});

describe("computeSet", () => {
  it("covers months Jan→current, quarters Q1→current, year, this week, today", () => {
    const set = computeSet(d("2026-07-30T18:05:00Z"));
    const byGrain = (g: string) => set.filter((p) => p.grain === g).map((p) => p.period_start);
    expect(byGrain("month")).toEqual([
      "2026-01-01","2026-02-01","2026-03-01","2026-04-01",
      "2026-05-01","2026-06-01","2026-07-01",
    ]);
    expect(byGrain("quarter")).toEqual(["2026-01-01","2026-04-01","2026-07-01"]);
    expect(byGrain("year")).toEqual(["2026-01-01"]);
    expect(byGrain("week")).toEqual(["2026-07-27"]);
    expect(byGrain("day")).toEqual(["2026-07-30"]);
  });
});
