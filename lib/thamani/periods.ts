import type { Grain } from "./types";

function iso(year: number, month1: number, day: number): string {
  const mm = String(month1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function periodStart(date: Date, grain: Grain): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth(); // 0-11
  const d = date.getUTCDate();
  switch (grain) {
    case "day":
      return iso(y, m + 1, d);
    case "week": {
      // Monday-start. getUTCDay: 0=Sun..6=Sat → days since Monday.
      const dow = date.getUTCDay();
      const daysSinceMonday = (dow + 6) % 7;
      const monday = new Date(Date.UTC(y, m, d - daysSinceMonday));
      return iso(
        monday.getUTCFullYear(),
        monday.getUTCMonth() + 1,
        monday.getUTCDate(),
      );
    }
    case "month":
      return iso(y, m + 1, 1);
    case "quarter": {
      const qStartMonth0 = Math.floor(m / 3) * 3; // 0,3,6,9
      return iso(y, qStartMonth0 + 1, 1);
    }
    case "year":
      return iso(y, 1, 1);
  }
}

export function periodEndMs(grain: Grain, periodStartIso: string): number {
  const start = new Date(`${periodStartIso}T00:00:00Z`);
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth();
  const d = start.getUTCDate();
  switch (grain) {
    case "day":
      return Date.UTC(y, m, d + 1);
    case "week":
      return Date.UTC(y, m, d + 7);
    case "month":
      return Date.UTC(y, m + 1, 1);
    case "quarter":
      return Date.UTC(y, m + 3, 1);
    case "year":
      return Date.UTC(y + 1, 0, 1);
  }
}

export function computeSet(
  now: Date,
): { grain: Grain; period_start: string }[] {
  const y = now.getUTCFullYear();
  const currentMonth0 = now.getUTCMonth();
  const out: { grain: Grain; period_start: string }[] = [];

  // Months Jan → current month (inclusive)
  for (let mo = 0; mo <= currentMonth0; mo++) {
    out.push({ grain: "month", period_start: iso(y, mo + 1, 1) });
  }
  // Quarters Q1 → current quarter (inclusive)
  const currentQStart0 = Math.floor(currentMonth0 / 3) * 3;
  for (let qs = 0; qs <= currentQStart0; qs += 3) {
    out.push({ grain: "quarter", period_start: iso(y, qs + 1, 1) });
  }
  // Year and this week
  out.push({ grain: "year", period_start: periodStart(now, "year") });
  out.push({ grain: "week", period_start: periodStart(now, "week") });

  // Every day Jan 1 → today (inclusive), ascending.
  const todayMs = Date.UTC(y, currentMonth0, now.getUTCDate());
  for (let ms = Date.UTC(y, 0, 1); ms <= todayMs; ms += 86_400_000) {
    const day = new Date(ms);
    out.push({
      grain: "day",
      period_start: iso(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()),
    });
  }
  return out;
}

const ALL_GRAINS: Grain[] = ["day", "week", "month", "quarter", "year"];

export function previousPeriodStart(now: Date, grain: Grain): string {
  const cur = new Date(`${periodStart(now, grain)}T00:00:00Z`);
  const y = cur.getUTCFullYear();
  const m = cur.getUTCMonth();
  const d = cur.getUTCDate();
  let ms: number;
  switch (grain) {
    case "day":
      ms = Date.UTC(y, m, d - 1);
      break;
    case "week":
      ms = Date.UTC(y, m, d - 7);
      break;
    case "month":
      ms = Date.UTC(y, m - 1, 1);
      break;
    case "quarter":
      ms = Date.UTC(y, m - 3, 1);
      break;
    case "year":
      ms = Date.UTC(y - 1, 0, 1);
      break;
  }
  const p = new Date(ms);
  return iso(p.getUTCFullYear(), p.getUTCMonth() + 1, p.getUTCDate());
}

export function comparisonSet(
  now: Date,
): { grain: Grain; period_start: string }[] {
  return ALL_GRAINS.map((grain) => ({
    grain,
    period_start: previousPeriodStart(now, grain),
  }));
}
