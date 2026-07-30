import { describe, it, expect } from "vitest";
import { bucketAccounts } from "@/lib/thamani/metrics/accounts";

describe("bucketAccounts", () => {
  const now = new Date("2026-07-30T18:05:00Z");
  // Three accounts: one in Jan, two in Jul (one of them today).
  const createdAts = [
    "2026-01-10T09:00:00Z",
    "2026-07-15T09:00:00Z",
    "2026-07-30T08:00:00Z", // today
  ];

  it("tags every row with accounts_new", () => {
    const rows = bucketAccounts(createdAts, now);
    expect(rows.every((r) => r.metric_key === "accounts_new")).toBe(true);
  });

  it("counts January's month bucket as 1", () => {
    const rows = bucketAccounts(createdAts, now);
    const jan = rows.find((r) => r.grain === "month" && r.period_start === "2026-01-01");
    expect(jan?.value).toBe(1);
  });

  it("counts July's month bucket as 2", () => {
    const rows = bucketAccounts(createdAts, now);
    const jul = rows.find((r) => r.grain === "month" && r.period_start === "2026-07-01");
    expect(jul?.value).toBe(2);
  });

  it("counts the year bucket as all 3", () => {
    const rows = bucketAccounts(createdAts, now);
    const year = rows.find((r) => r.grain === "year");
    expect(year?.value).toBe(3);
  });

  it("counts today's day bucket as 1", () => {
    const rows = bucketAccounts(createdAts, now);
    const today = rows.find((r) => r.grain === "day" && r.period_start === "2026-07-30");
    expect(today?.value).toBe(1);
  });

  it("empty input yields all-zero buckets, one row per period", () => {
    const rows = bucketAccounts([], now);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.value === 0)).toBe(true);
  });

  it("emits each (grain, period_start) at most once (no upsert-conflict dupes)", () => {
    const rows = bucketAccounts(["2026-07-15T09:00:00Z"], new Date("2026-07-30T18:05:00Z"));
    const keys = rows.map((r) => `${r.grain}|${r.period_start}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("includes previous-period buckets (e.g. last month 2026-06-01)", () => {
    const rows = bucketAccounts([], new Date("2026-07-30T18:05:00Z"));
    expect(rows.some((r) => r.grain === "month" && r.period_start === "2026-06-01")).toBe(true);
    expect(rows.some((r) => r.grain === "year" && r.period_start === "2025-01-01")).toBe(true);
  });
});
