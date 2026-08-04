import { describe, it, expect, vi } from "vitest";
import {
  pickCurrent,
  trendDirection,
  pickPrevious,
  getAccountsSnapshot,
} from "@/lib/thamani/read";
import type { MetricRow } from "@/lib/thamani/types";

describe("pickCurrent", () => {
  const now = new Date("2026-07-30T18:05:00Z");
  const rows: MetricRow[] = [
    {
      metric_key: "accounts_new",
      grain: "day",
      period_start: "2026-07-30",
      value: 1,
    },
    {
      metric_key: "accounts_new",
      grain: "week",
      period_start: "2026-07-27",
      value: 3,
    },
    {
      metric_key: "accounts_new",
      grain: "month",
      period_start: "2026-07-01",
      value: 8,
    },
    {
      metric_key: "accounts_new",
      grain: "quarter",
      period_start: "2026-07-01",
      value: 20,
    },
    {
      metric_key: "accounts_new",
      grain: "year",
      period_start: "2026-01-01",
      value: 74,
    },
  ];

  it("selects the current period value for each grain", () => {
    expect(pickCurrent(rows, now)).toEqual({
      today: 1,
      week: 3,
      month: 8,
      quarter: 20,
      year: 74,
    });
  });

  it("defaults missing grains to 0", () => {
    expect(pickCurrent([], now)).toEqual({
      today: 0,
      week: 0,
      month: 0,
      quarter: 0,
      year: 0,
    });
  });
});

describe("trendDirection", () => {
  it("up when current > previous", () =>
    expect(trendDirection(74, 0)).toBe("up"));
  it("down when current < previous", () =>
    expect(trendDirection(1, 2)).toBe("down"));
  it("flat when equal", () => expect(trendDirection(0, 0)).toBe("flat"));
});

describe("pickPrevious", () => {
  const now = new Date("2026-07-30T18:05:00Z");
  const rows: MetricRow[] = [
    {
      metric_key: "accounts_new",
      grain: "month",
      period_start: "2026-06-01",
      value: 2,
    },
    {
      metric_key: "accounts_new",
      grain: "year",
      period_start: "2025-01-01",
      value: 0,
    },
  ];
  it("selects the previous period per grain, 0 when absent", () => {
    expect(pickPrevious(rows, now)).toEqual({
      today: 0,
      week: 0,
      month: 2,
      quarter: 0,
      year: 0,
    });
  });
});

describe("getAccountsSnapshot error surfacing", () => {
  it("logs when the query returns an error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: null, error: { message: "boom" } }),
        }),
      }),
    } as unknown as import("@/lib/thamani/read").MinimalClient;

    await getAccountsSnapshot(client, new Date("2026-07-30T18:05:00Z"));
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("thamani_metrics read failed"),
      "boom",
    );
    spy.mockRestore();
  });
});
