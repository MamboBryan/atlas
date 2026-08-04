# Thamani Accounts Metric — Small Card + Detail Dialog with Date Comparison

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the shipped full-width "New accounts" card into a small clickable card that opens a detail dialog containing the roll-ups, the month-by-month chart, and a new tool to compare arbitrary dates and date ranges.

**Architecture:** No change to the data source, cron, migration, or accounts compute. `computeSet` is extended to emit a `day` row for every day Jan→today, so the existing daily cron already writes a full daily series into `thamani_metrics`. A new pure module buckets/compares those daily values; the home page fetches the daily series and hands it to a client `AccountsMetric` component that renders the small card as a dialog trigger.

**Tech Stack:** Next.js 15 (App Router, server + client components), `@supabase/supabase-js` (existing clients), `luxon` (already a dependency) for date math, base-ui `Dialog` (`components/ui/dialog`), native `<input type="date">` via `components/ui/input`, vitest.

## Global Constraints

- **No new npm dependency.** Date selection uses native `<input type="date">`; date math uses `luxon` (already installed). No calendar/date-picker library.
- **No change** to `app/api/cron/thamani-metrics/route.ts`, `db/supabase/supabase/migrations/0024_thamani_metrics.sql`, `lib/supabase/thamani.ts`, or `lib/thamani/metrics/accounts.ts`. `grain` already permits `'day'`; day rows already write today+yesterday — this only widens the set.
- **UTC** bucketing throughout, consistent with the existing slice. `period_start` keys are `YYYY-MM-DD`.
- **Current year only.** The daily backfill and all compare inputs are bounded to the current calendar year (`min={year}-01-01`, `max=today`).
- **Metric key:** `accounts_new` (exported as `ACCOUNTS_NEW` from `lib/thamani/metrics/accounts.ts`).
- **Existing shared exports to reuse (do not redefine):** `Grain`, `MetricRow` (`lib/thamani/types.ts`); `CurrentValues`, `MinimalClient`, `trendDirection`, `getAccountsSnapshot`, `getAccountsMonthly` (`lib/thamani/read.ts`).
- **Bar rendering** guards its divisor with `Math.max(1, …)` so an all-empty comparison never divides by zero (mirrors `AccountsChart`).
- Run `pnpm test`, `pnpm typecheck`, `pnpm lint` as specified; commit after each task. Commit messages: no Claude/co-author trailer.

## File Structure

| File | Create/Modify | Responsibility |
| --- | --- | --- |
| `lib/thamani/periods.ts` | Modify | `computeSet` also emits every `day` Jan→today |
| `tests/thamani/periods.test.ts` | Modify | Update the `computeSet` "day" assertion |
| `lib/thamani/compare.ts` | Create | Pure `Selection` type + date enumeration, sums, overlap detection |
| `tests/thamani/compare.test.ts` | Create | Unit tests for `compare.ts` |
| `lib/thamani/read.ts` | Modify | `getAccountsDaily(supabase, year)` read helper |
| `components/thamani/accounts-card.tsx` | Modify | Slim presentational stat face + exported `TrendArrow` |
| `components/thamani/accounts-compare.tsx` | Create | Client compare tool (mode/selection state, bars, overlap UI) |
| `components/thamani/accounts-metric.tsx` | Create | Client: small card as `DialogTrigger` + dialog composition |
| `app/(app)/page.tsx` | Modify | Fetch `daily`, render `<AccountsMetric>` |
| `components/thamani/accounts-chart.tsx` | Unchanged | Reused inside the dialog |

---

### Task 1: `computeSet` emits a daily span (Jan → today)

**Files:**
- Modify: `lib/thamani/periods.ts:57-78` (the `computeSet` function)
- Test: `tests/thamani/periods.test.ts:68-91` (the `describe("computeSet")` block)

**Interfaces:**
- Consumes: `periodStart`, `iso` (already in this file).
- Produces: `computeSet(now: Date)` unchanged signature — still returns `{ grain: Grain; period_start: string }[]` — but now additionally includes one `{ grain: "day", period_start }` per day from `YYYY-01-01` through the UTC date of `now`, ascending. Months/quarters/year/week entries are unchanged. (The old single "today" day entry is now the last element of the daily span.)

- [ ] **Step 1: Update the failing test**

Replace the `describe("computeSet")` block in `tests/thamani/periods.test.ts` (lines 68-91) with:

```ts
describe("computeSet", () => {
  it("covers months Jan→current, quarters Q1→current, year, this week", () => {
    const set = computeSet(d("2026-07-30T18:05:00Z"));
    const byGrain = (g: string) =>
      set.filter((p) => p.grain === g).map((p) => p.period_start);
    expect(byGrain("month")).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
      "2026-07-01",
    ]);
    expect(byGrain("quarter")).toEqual([
      "2026-01-01",
      "2026-04-01",
      "2026-07-01",
    ]);
    expect(byGrain("year")).toEqual(["2026-01-01"]);
    expect(byGrain("week")).toEqual(["2026-07-27"]);
  });

  it("emits a day row for every day Jan 1 → today (inclusive), ascending", () => {
    const set = computeSet(d("2026-07-30T18:05:00Z"));
    const days = set
      .filter((p) => p.grain === "day")
      .map((p) => p.period_start);
    // Jan 1 → Jul 30 2026 is day-of-year 211.
    expect(days.length).toBe(211);
    expect(days[0]).toBe("2026-01-01");
    expect(days[days.length - 1]).toBe("2026-07-30");
    // strictly ascending, no dupes
    const sorted = [...days].sort();
    expect(days).toEqual(sorted);
    expect(new Set(days).size).toBe(days.length);
  });

  it("first day of the year yields a single day row", () => {
    const days = computeSet(d("2026-01-01T05:00:00Z"))
      .filter((p) => p.grain === "day")
      .map((p) => p.period_start);
    expect(days).toEqual(["2026-01-01"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/thamani/periods.test.ts`
Expected: FAIL — `computeSet` still emits only one day row (`["2026-07-30"]`), so the new day-span assertions fail.

- [ ] **Step 3: Implement the daily span**

In `lib/thamani/periods.ts`, replace the tail of `computeSet` (the three `out.push(...)` lines for year/week/day at lines 73-77) with the year, week, and a daily loop from Jan 1 → today:

```ts
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
```

(Leave the months and quarters loops above unchanged. The final `return out;` at the old line 77 is now inside this block — do not duplicate it.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test tests/thamani/periods.test.ts`
Expected: PASS (all cases, including the untouched `periodStart`/`periodEndMs`/`previousPeriodStart`/`comparisonSet` blocks).

- [ ] **Step 5: Commit**

```bash
git add lib/thamani/periods.ts tests/thamani/periods.test.ts
git commit -m "feat(thamani): computeSet emits daily span Jan→today for comparisons"
```

---

### Task 2: Pure comparison module

**Files:**
- Create: `lib/thamani/compare.ts`
- Test: `tests/thamani/compare.test.ts`

**Interfaces:**
- Consumes: `luxon` (`DateTime`).
- Produces:
  - `type Selection = { kind: "single"; date: string } | { kind: "multiple"; dates: string[] } | { kind: "range"; from: string; to: string }` — `date`/`from`/`to` are `YYYY-MM-DD` or `""` when unset.
  - `datesInRange(from: string, to: string): string[]` — inclusive, ascending; `[]` if either endpoint is blank or `from > to`.
  - `sumDays(daily: Map<string, number>, dates: string[]): number` — sum of `daily.get(date) ?? 0` over the unique dates.
  - `sumRange(daily: Map<string, number>, from: string, to: string): number` — `sumDays(daily, datesInRange(from, to))`.
  - `selectionDays(sel: Selection): string[]` — the unique, blank-filtered calendar days a selection occupies.
  - `selectionCount(daily: Map<string, number>, sel: Selection): number` — `sumDays(daily, selectionDays(sel))`.
  - `overlappingIndices(selections: Selection[]): number[]` — indices of selections that share a day with any *earlier* selection.
  - `hasOverlap(selections: Selection[]): boolean` — `overlappingIndices(selections).length > 0`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/thamani/compare.test.ts
import { describe, it, expect } from "vitest";
import {
  datesInRange,
  sumDays,
  sumRange,
  selectionDays,
  selectionCount,
  overlappingIndices,
  hasOverlap,
  type Selection,
} from "@/lib/thamani/compare";

const daily = new Map<string, number>([
  ["2026-07-01", 2],
  ["2026-07-02", 3],
  ["2026-07-03", 0],
  ["2026-07-04", 5],
]);

describe("datesInRange", () => {
  it("is inclusive and ascending", () => {
    expect(datesInRange("2026-07-01", "2026-07-04")).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
    ]);
  });
  it("single-day range yields one date", () => {
    expect(datesInRange("2026-07-02", "2026-07-02")).toEqual(["2026-07-02"]);
  });
  it("crosses a month boundary", () => {
    expect(datesInRange("2026-01-31", "2026-02-01")).toEqual([
      "2026-01-31",
      "2026-02-01",
    ]);
  });
  it("from > to yields empty", () => {
    expect(datesInRange("2026-07-04", "2026-07-01")).toEqual([]);
  });
  it("blank endpoint yields empty", () => {
    expect(datesInRange("", "2026-07-04")).toEqual([]);
    expect(datesInRange("2026-07-01", "")).toEqual([]);
  });
});

describe("sumDays", () => {
  it("sums present days, treats missing as 0", () => {
    expect(sumDays(daily, ["2026-07-01", "2026-07-02", "2026-12-25"])).toBe(5);
  });
  it("counts a duplicated date once", () => {
    expect(sumDays(daily, ["2026-07-04", "2026-07-04"])).toBe(5);
  });
  it("empty set is 0", () => {
    expect(sumDays(daily, [])).toBe(0);
  });
});

describe("sumRange", () => {
  it("inclusive range sum", () => {
    expect(sumRange(daily, "2026-07-01", "2026-07-04")).toBe(10);
  });
  it("empty/invalid range is 0", () => {
    expect(sumRange(daily, "2026-07-04", "2026-07-01")).toBe(0);
  });
});

describe("selectionDays", () => {
  it("single → one day (or empty when blank)", () => {
    expect(selectionDays({ kind: "single", date: "2026-07-02" })).toEqual([
      "2026-07-02",
    ]);
    expect(selectionDays({ kind: "single", date: "" })).toEqual([]);
  });
  it("multiple → unique, blank-filtered", () => {
    expect(
      selectionDays({
        kind: "multiple",
        dates: ["2026-07-01", "", "2026-07-01", "2026-07-02"],
      }),
    ).toEqual(["2026-07-01", "2026-07-02"]);
  });
  it("range → enumerated days", () => {
    expect(
      selectionDays({ kind: "range", from: "2026-07-01", to: "2026-07-03" }),
    ).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
  });
});

describe("selectionCount", () => {
  it("counts a range selection", () => {
    expect(
      selectionCount(daily, { kind: "range", from: "2026-07-01", to: "2026-07-02" }),
    ).toBe(5);
  });
  it("blank selection is 0", () => {
    expect(selectionCount(daily, { kind: "single", date: "" })).toBe(0);
  });
});

describe("overlappingIndices / hasOverlap", () => {
  it("disjoint selections do not overlap", () => {
    const sels: Selection[] = [
      { kind: "single", date: "2026-07-01" },
      { kind: "single", date: "2026-07-02" },
    ];
    expect(overlappingIndices(sels)).toEqual([]);
    expect(hasOverlap(sels)).toBe(false);
  });
  it("flags the later selection sharing a day", () => {
    const sels: Selection[] = [
      { kind: "range", from: "2026-07-01", to: "2026-07-03" },
      { kind: "single", date: "2026-07-02" },
    ];
    expect(overlappingIndices(sels)).toEqual([1]);
    expect(hasOverlap(sels)).toBe(true);
  });
  it("range ∩ range overlap flags the later", () => {
    const sels: Selection[] = [
      { kind: "range", from: "2026-07-01", to: "2026-07-03" },
      { kind: "range", from: "2026-07-03", to: "2026-07-05" },
    ];
    expect(overlappingIndices(sels)).toEqual([1]);
  });
  it("blank selections never overlap", () => {
    const sels: Selection[] = [
      { kind: "single", date: "" },
      { kind: "single", date: "" },
    ];
    expect(overlappingIndices(sels)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/thamani/compare.test.ts`
Expected: FAIL — `lib/thamani/compare.ts` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// lib/thamani/compare.ts
import { DateTime } from "luxon";

export type Selection =
  | { kind: "single"; date: string }
  | { kind: "multiple"; dates: string[] }
  | { kind: "range"; from: string; to: string };

/** Inclusive, ascending calendar dates from..to (UTC). Empty if blank or from > to. */
export function datesInRange(from: string, to: string): string[] {
  if (!from || !to || from > to) return [];
  const start = DateTime.fromISO(from, { zone: "utc" });
  const end = DateTime.fromISO(to, { zone: "utc" });
  if (!start.isValid || !end.isValid) return [];
  const out: string[] = [];
  for (let cur = start; cur <= end; cur = cur.plus({ days: 1 })) {
    out.push(cur.toISODate()!);
  }
  return out;
}

export function sumDays(daily: Map<string, number>, dates: string[]): number {
  let total = 0;
  for (const date of new Set(dates)) total += daily.get(date) ?? 0;
  return total;
}

export function sumRange(
  daily: Map<string, number>,
  from: string,
  to: string,
): number {
  return sumDays(daily, datesInRange(from, to));
}

export function selectionDays(sel: Selection): string[] {
  switch (sel.kind) {
    case "single":
      return sel.date ? [sel.date] : [];
    case "multiple":
      return [...new Set(sel.dates.filter(Boolean))];
    case "range":
      return datesInRange(sel.from, sel.to);
  }
}

export function selectionCount(
  daily: Map<string, number>,
  sel: Selection,
): number {
  return sumDays(daily, selectionDays(sel));
}

/** Indices of selections that share a calendar day with any earlier selection. */
export function overlappingIndices(selections: Selection[]): number[] {
  const seen = new Set<string>();
  const flagged: number[] = [];
  selections.forEach((sel, i) => {
    const days = selectionDays(sel);
    if (days.some((day) => seen.has(day))) flagged.push(i);
    else for (const day of days) seen.add(day);
  });
  return flagged;
}

export function hasOverlap(selections: Selection[]): boolean {
  return overlappingIndices(selections).length > 0;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test tests/thamani/compare.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/thamani/compare.ts tests/thamani/compare.test.ts
git commit -m "feat(thamani): pure date-comparison module (sums + overlap)"
```

---

### Task 3: Daily read helper

**Files:**
- Modify: `lib/thamani/read.ts` (append a new exported function)

**Interfaces:**
- Consumes: `ACCOUNTS_NEW` (`lib/thamani/metrics/accounts.ts`), `MinimalClient` (already defined and exported in `read.ts`).
- Produces: `getAccountsDaily(supabase: MinimalClient, year: number): Promise<{ date: string; value: number }[]>` — the year's `grain:"day"` rows, ascending, mapping `period_start → date` and `Number(value) → value`. Mirrors the existing `getAccountsMonthly`.

- [ ] **Step 1: Append the helper**

Add to the end of `lib/thamani/read.ts` (`ACCOUNTS_NEW` and `MinimalClient` are already imported/defined in this file — do not re-import):

```ts
export async function getAccountsDaily(
  supabase: MinimalClient,
  year: number,
): Promise<{ date: string; value: number }[]> {
  const { data } = await supabase
    .from("thamani_metrics")
    .select("period_start,value")
    .eq("metric_key", ACCOUNTS_NEW)
    .eq("grain", "day")
    .gte("period_start", `${year}-01-01`)
    .lt("period_start", `${year + 1}-01-01`)
    .order("period_start", { ascending: true });
  return ((data ?? []) as { period_start: string; value: number }[]).map(
    (r) => ({ date: r.period_start, value: Number(r.value) }),
  );
}
```

(This is an I/O query builder; like the existing `getAccountsMonthly` it has no unit test — it is exercised by the manual verification in Task 7.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors from `read.ts`).

- [ ] **Step 3: Commit**

```bash
git add lib/thamani/read.ts
git commit -m "feat(thamani): getAccountsDaily read helper for the year's daily series"
```

---

### Task 4: Slim the card into a presentational stat face

**Files:**
- Modify: `components/thamani/accounts-card.tsx` (full rewrite — smaller)

**Interfaces:**
- Consumes: `trendDirection`, `CurrentValues` (`lib/thamani/read.ts`); `Card`, `CardContent`, `CardHeader`, `CardTitle` (`@/components/ui/card`); Hugeicons.
- Produces:
  - `export function TrendArrow({ current, previous }: { current: number; previous: number })` — the up/down/flat arrow (now exported for reuse by the dialog roll-up).
  - `export function AccountsCard({ current, previous }: { current: CurrentValues; previous: CurrentValues })` — the small presentational card: heading, five stat rows with arrows, and a "Tap for details" line. **No chart, no `monthly`/`year` props.**

- [ ] **Step 1: Rewrite the card**

```tsx
// components/thamani/accounts-card.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trendDirection, type CurrentValues } from "@/lib/thamani/read";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUp02Icon, ArrowDown02Icon } from "@hugeicons/core-free-icons";

export function TrendArrow({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) {
  const dir = trendDirection(current, previous);
  if (dir === "up")
    return (
      <HugeiconsIcon
        icon={ArrowUp02Icon}
        size={16}
        strokeWidth={2.5}
        className="text-emerald-600 dark:text-emerald-400"
        aria-label="up"
      />
    );
  if (dir === "down")
    return (
      <HugeiconsIcon
        icon={ArrowDown02Icon}
        size={16}
        strokeWidth={2.5}
        className="text-rose-600 dark:text-rose-400"
        aria-label="down"
      />
    );
  return (
    <span className="text-ink-soft text-sm" aria-label="no change">
      –
    </span>
  );
}

function Stat({
  label,
  value,
  previous,
}: {
  label: string;
  value: number;
  previous: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
        {label}
      </span>
      <span className="flex items-center gap-1">
        <span className="font-display text-xl font-extrabold text-ink tabular-nums">
          {value}
        </span>
        <TrendArrow current={value} previous={previous} />
      </span>
    </div>
  );
}

export function AccountsCard({
  current,
  previous,
}: {
  current: CurrentValues;
  previous: CurrentValues;
}) {
  return (
    <Card interactive>
      <CardHeader>
        <CardTitle>New accounts</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-ink/10">
          <Stat label="Today" value={current.today} previous={previous.today} />
          <Stat
            label="This week"
            value={current.week}
            previous={previous.week}
          />
          <Stat
            label="This month"
            value={current.month}
            previous={previous.month}
          />
          <Stat
            label="This quarter"
            value={current.quarter}
            previous={previous.quarter}
          />
          <Stat label="This year" value={current.year} previous={previous.year} />
        </div>
        <p className="mt-3 text-xs text-ink-soft">Tap for details</p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: FAIL — `app/(app)/page.tsx` still passes the removed `monthly`/`year` props to `AccountsCard`. This is expected and fixed in Task 7. (If you want a green checkpoint here, proceed to commit; the page is rewired in Task 7. Do **not** edit the page yet.)

- [ ] **Step 3: Commit**

```bash
git add components/thamani/accounts-card.tsx
git commit -m "feat(thamani): slim AccountsCard to presentational stat face, export TrendArrow"
```

---

### Task 5: Compare tool component

**Files:**
- Create: `components/thamani/accounts-compare.tsx`

**Interfaces:**
- Consumes: `Selection`, `selectionCount`, `overlappingIndices` (`lib/thamani/compare.ts`); `Button` (`@/components/ui/button`, variants `accent`/`outline`/`ghost`, size `sm`); `Input` (`@/components/ui/input`, `type="date"`).
- Produces: `export function AccountsCompare({ daily, year }: { daily: { date: string; value: number }[]; year: number })` — the client compare tool.

- [ ] **Step 1: Write the component**

```tsx
// components/thamani/accounts-compare.tsx
"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type Selection,
  selectionCount,
  overlappingIndices,
} from "@/lib/thamani/compare";

type Mode = "single" | "multiple" | "range";

const MODES: { key: Mode; label: string }[] = [
  { key: "single", label: "Single dates" },
  { key: "multiple", label: "Multiple dates" },
  { key: "range", label: "Date ranges" },
];

const MAX_SELECTIONS = 4;

function emptySelection(mode: Mode): Selection {
  if (mode === "single") return { kind: "single", date: "" };
  if (mode === "multiple") return { kind: "multiple", dates: [""] };
  return { kind: "range", from: "", to: "" };
}

export function AccountsCompare({
  daily,
  year,
}: {
  daily: { date: string; value: number }[];
  year: number;
}) {
  const [mode, setMode] = useState<Mode>("single");
  const [selections, setSelections] = useState<Selection[]>(() => [
    emptySelection("single"),
    emptySelection("single"),
  ]);

  const dailyMap = useMemo(
    () => new Map(daily.map((row) => [row.date, row.value])),
    [daily],
  );
  const min = `${year}-01-01`;
  const max = new Date().toISOString().slice(0, 10);

  const overlaps = useMemo(
    () => new Set(overlappingIndices(selections)),
    [selections],
  );
  const counts = selections.map((sel) => selectionCount(dailyMap, sel));
  const maxCount = Math.max(
    1,
    ...counts.filter((_, i) => !overlaps.has(i)),
  );

  function switchMode(next: Mode) {
    setMode(next);
    setSelections([emptySelection(next), emptySelection(next)]);
  }
  function update(i: number, sel: Selection) {
    setSelections((prev) => prev.map((s, idx) => (idx === i ? sel : s)));
  }
  function addSelection() {
    setSelections((prev) =>
      prev.length >= MAX_SELECTIONS ? prev : [...prev, emptySelection(mode)],
    );
  }
  function removeSelection(i: number) {
    setSelections((prev) =>
      prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-ink-soft">
          Compare
        </div>
        <div className="flex gap-1">
          {MODES.map((m) => (
            <Button
              key={m.key}
              type="button"
              size="sm"
              variant={mode === m.key ? "accent" : "outline"}
              onClick={() => switchMode(m.key)}
            >
              {m.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {selections.map((sel, i) => (
          <SelectionRow
            key={i}
            index={i}
            selection={sel}
            min={min}
            max={max}
            count={counts[i]}
            barPct={overlaps.has(i) ? 0 : (counts[i] / maxCount) * 100}
            overlap={overlaps.has(i)}
            canRemove={selections.length > 2}
            onChange={(s) => update(i, s)}
            onRemove={() => removeSelection(i)}
          />
        ))}
      </div>

      {selections.length < MAX_SELECTIONS && (
        <Button type="button" variant="ghost" size="sm" onClick={addSelection}>
          ＋ Add selection
        </Button>
      )}

      <p className="text-[11px] text-ink-soft">
        Comparisons cover {year} only. Selections can’t overlap.
      </p>
    </div>
  );
}

function SelectionRow({
  index,
  selection,
  min,
  max,
  count,
  barPct,
  overlap,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  selection: Selection;
  min: string;
  max: string;
  count: number;
  barPct: number;
  overlap: boolean;
  canRemove: boolean;
  onChange: (s: Selection) => void;
  onRemove: () => void;
}) {
  const label = String.fromCharCode(65 + index); // A, B, C…
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="w-5 shrink-0 font-display text-sm font-bold text-ink">
          {label}
        </span>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {selection.kind === "single" && (
            <Input
              type="date"
              min={min}
              max={max}
              value={selection.date}
              className="h-9 w-auto"
              onChange={(e) =>
                onChange({ kind: "single", date: e.target.value })
              }
            />
          )}
          {selection.kind === "multiple" && (
            <MultiDateEditor
              selection={selection}
              min={min}
              max={max}
              onChange={onChange}
            />
          )}
          {selection.kind === "range" && (
            <>
              <Input
                type="date"
                min={min}
                max={max}
                value={selection.from}
                className="h-9 w-auto"
                onChange={(e) =>
                  onChange({ ...selection, from: e.target.value })
                }
              />
              <span className="text-ink-soft">→</span>
              <Input
                type="date"
                min={min}
                max={max}
                value={selection.to}
                className="h-9 w-auto"
                onChange={(e) => onChange({ ...selection, to: e.target.value })}
              />
            </>
          )}
        </div>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            aria-label={`Remove selection ${label}`}
          >
            ✕
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2 pl-7">
        <div className="h-4 flex-1 overflow-hidden rounded bg-ink/5">
          {!overlap && (
            <div
              className="h-full rounded bg-accent/70"
              style={{ width: `${barPct}%` }}
            />
          )}
        </div>
        {overlap ? (
          <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
            overlaps another selection
          </span>
        ) : (
          <span className="w-8 shrink-0 text-right font-display text-sm font-bold text-ink tabular-nums">
            {count}
          </span>
        )}
      </div>
    </div>
  );
}

function MultiDateEditor({
  selection,
  min,
  max,
  onChange,
}: {
  selection: { kind: "multiple"; dates: string[] };
  min: string;
  max: string;
  onChange: (s: Selection) => void;
}) {
  const setDate = (i: number, v: string) =>
    onChange({
      kind: "multiple",
      dates: selection.dates.map((d, idx) => (idx === i ? v : d)),
    });
  const addDate = () =>
    onChange({ kind: "multiple", dates: [...selection.dates, ""] });
  const removeDate = (i: number) =>
    onChange({
      kind: "multiple",
      dates: selection.dates.filter((_, idx) => idx !== i),
    });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selection.dates.map((d, i) => (
        <span key={i} className="flex items-center gap-0.5">
          <Input
            type="date"
            min={min}
            max={max}
            value={d}
            className="h-9 w-auto"
            onChange={(e) => setDate(i, e.target.value)}
          />
          {selection.dates.length > 1 && (
            <button
              type="button"
              className="text-ink-soft hover:text-ink"
              aria-label="Remove date"
              onClick={() => removeDate(i)}
            >
              ✕
            </button>
          )}
        </span>
      ))}
      <Button type="button" variant="ghost" size="sm" onClick={addDate}>
        ＋ date
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS for this file (the page still errors on `AccountsCard` props until Task 7 — that error is in `page.tsx`, not here).

- [ ] **Step 3: Commit**

```bash
git add components/thamani/accounts-compare.tsx
git commit -m "feat(thamani): date-comparison tool (modes, non-overlapping selections, bars)"
```

---

### Task 6: Metric component (card-as-trigger + dialog)

**Files:**
- Create: `components/thamani/accounts-metric.tsx`

**Interfaces:**
- Consumes: `Dialog`, `DialogContent`, `DialogTrigger`, `DialogHeader`, `DialogTitle` (`@/components/ui/dialog`); `AccountsCard`, `TrendArrow` (`@/components/thamani/accounts-card`); `AccountsChart` (`@/components/thamani/accounts-chart`); `AccountsCompare` (`@/components/thamani/accounts-compare`); `CurrentValues` (`lib/thamani/read.ts`).
- Produces: `export function AccountsMetric({ current, previous, monthly, daily, year })` — client component: the small card wrapped in a `DialogTrigger`, plus a `DialogContent` with roll-ups, the month chart, and the compare tool. Prop types:
  - `current: CurrentValues; previous: CurrentValues;`
  - `monthly: { period_start: string; value: number }[];`
  - `daily: { date: string; value: number }[];`
  - `year: number;`

- [ ] **Step 1: Write the component**

```tsx
// components/thamani/accounts-metric.tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AccountsCard, TrendArrow } from "@/components/thamani/accounts-card";
import { AccountsChart } from "@/components/thamani/accounts-chart";
import { AccountsCompare } from "@/components/thamani/accounts-compare";
import type { CurrentValues } from "@/lib/thamani/read";

const ROLLUPS: { key: keyof CurrentValues; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
  { key: "year", label: "This year" },
];

export function AccountsMetric({
  current,
  previous,
  monthly,
  daily,
  year,
}: {
  current: CurrentValues;
  previous: CurrentValues;
  monthly: { period_start: string; value: number }[];
  daily: { date: string; value: number }[];
  year: number;
}) {
  const byMonth = new Map(
    monthly.map((m) => [Number(m.period_start.slice(5, 7)) - 1, m.value]),
  );
  const now = new Date();
  const monthsToShow = year < now.getUTCFullYear() ? 12 : now.getUTCMonth() + 1;
  const values = Array.from(
    { length: monthsToShow },
    (_, i) => byMonth.get(i) ?? 0,
  );

  return (
    <Dialog>
      <DialogTrigger
        render={<button type="button" className="block w-full text-left" />}
      >
        <AccountsCard current={current} previous={previous} />
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New accounts</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {ROLLUPS.map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                  {label}
                </span>
                <span className="flex items-center gap-1">
                  <span className="font-display text-2xl font-extrabold text-ink tabular-nums">
                    {current[key]}
                  </span>
                  <TrendArrow current={current[key]} previous={previous[key]} />
                </span>
                <span className="text-[11px] text-ink-soft tabular-nums">
                  prev {previous[key]}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-soft">
              {year} · month by month
            </div>
            <AccountsChart values={values} year={year} />
          </div>

          <AccountsCompare daily={daily} year={year} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS for this file (the page still errors until Task 7).

- [ ] **Step 3: Commit**

```bash
git add components/thamani/accounts-metric.tsx
git commit -m "feat(thamani): AccountsMetric — small card trigger + detail dialog"
```

---

### Task 7: Wire the page, repopulate daily rows, verify live

**Files:**
- Modify: `app/(app)/page.tsx`

**Interfaces:**
- Consumes: `getAccountsSnapshot`, `getAccountsMonthly`, `getAccountsDaily` (`lib/thamani/read.ts`); `AccountsMetric` (`components/thamani/accounts-metric.tsx`); `requireUser` (existing).

- [ ] **Step 1: Rewrite the page**

```tsx
// app/(app)/page.tsx
import { requireUser } from "@/lib/auth/require";
import { AccountsMetric } from "@/components/thamani/accounts-metric";
import {
  getAccountsSnapshot,
  getAccountsMonthly,
  getAccountsDaily,
} from "@/lib/thamani/read";

export default async function HomePage() {
  const { supabase } = await requireUser();

  const metricsNow = new Date();
  const metricsYear = metricsNow.getUTCFullYear();
  const [{ current, previous }, accountsMonthly, accountsDaily] =
    await Promise.all([
      getAccountsSnapshot(supabase, metricsNow),
      getAccountsMonthly(supabase, metricsYear),
      getAccountsDaily(supabase, metricsYear),
    ]);

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-ink">
            Thamani
          </h1>
          <p className="text-sm text-ink-soft">Product growth at a glance.</p>
        </div>
      </header>

      <AccountsMetric
        current={current}
        previous={previous}
        monthly={accountsMonthly}
        daily={accountsDaily}
        year={metricsYear}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint (now fully green)**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS across the whole project (the `AccountsCard` prop mismatch from Task 4 is resolved now that the page uses `AccountsMetric`).

- [ ] **Step 3: Repopulate `thamani_metrics` with the daily rows**

Start the dev server (`pnpm dev`) and the local Supabase stack if not running. Then trigger the cron so `computeSet`'s new daily span is written:

```bash
curl -s -X POST http://localhost:3000/api/cron/thamani-metrics \
  -H "x-cron-secret: $(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)" | cat
```

Expected: `{"ok":true,"upserted":N}` where N is now much larger than before (months + quarters + year + week + one row per day Jan→today, deduped).

Confirm daily rows exist:

```bash
pnpm supabase db execute --query \
  "select count(*) from public.thamani_metrics where metric_key='accounts_new' and grain='day';"
```

Expected: a count equal to the current day-of-year (e.g. 216 on Aug 4). If the subcommand is unavailable, check Studio at `http://127.0.0.1:54323`.

- [ ] **Step 4: Manual E2E in the browser**

Open `http://localhost:3000`:
- The **small card** shows the five roll-ups + trend arrows and "Tap for details"; no chart on the card.
- Clicking the card (or focusing it and pressing Enter) opens the **dialog** with roll-ups (each showing `prev N`), the month-by-month chart, and the **Compare** tool.
- **Single dates**: pick two different days → each bar shows that day's new-account count.
- **Multiple dates**: add dates to each selection → counts sum correctly.
- **Date ranges**: pick two non-overlapping ranges → summed counts; the year figure sanity-checks against the known ~74 total.
- Make two selections share a day → the later one shows "overlaps another selection" and its bar disappears; fixing the dates restores it.
- Date inputs won't let you pick before Jan 1 this year or after today.

- [ ] **Step 5: Full suite + commit**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all green.

```bash
git add "app/(app)/page.tsx"
git commit -m "feat(thamani): home wires AccountsMetric with daily series for comparisons"
```

---

## Self-Review Notes

- **Spec coverage:**
  - Small card (5 roll-ups + arrows, clickable) → Task 4 (card) + Task 6 (trigger).
  - Chart moved into dialog → Task 6.
  - Dialog with all details → Task 6.
  - Compare: single/multiple/range, non-overlapping, per-selection counts, bars → Task 2 (pure) + Task 5 (UI).
  - Daily data in the facts table → Task 1 (`computeSet`) + Task 3 (read) + Task 7 (repopulate).
  - Current-year bound, UTC, no new dep, zero-divisor guard, shared `TrendArrow` → Global Constraints + Tasks 4/5.
- **Placeholder scan:** none — every step has concrete code or an exact command.
- **Type consistency:** `Selection`, `selectionCount`, `overlappingIndices` defined in Task 2 and consumed unchanged in Task 5. `getAccountsDaily`'s `{ date; value }[]` shape flows Task 3 → page (Task 7) → `AccountsMetric`/`AccountsCompare` (Tasks 5/6). `AccountsCard`'s narrowed props (`current`/`previous` only) are matched by `AccountsMetric` (Task 6) and no longer passed `monthly`/`year` from the page (Task 7). `TrendArrow` exported in Task 4, imported in Task 6.
- **Deferred / documented:** UTC skew (inherited), current-year-only comparisons, ≤366 daily rows added to page payload — all noted in the spec's Risks section.
- **Ordering note:** Task 4 intentionally leaves the project's typecheck red (the page still passes old props to `AccountsCard`); it goes green at Task 7. Per-file typechecks in Tasks 5/6 are unaffected because the error lives in `page.tsx`.
