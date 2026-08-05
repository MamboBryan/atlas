---
title: Thamani accounts metric — small card + detail dialog with date comparison
type: design
status: awaiting-approval
date: 2026-08-04
supersedes-ui-of: docs/superpowers/plans/2026-07-30-thamani-metrics-accounts-slice.md (Tasks 7 & 11 UI)
---

# Thamani accounts metric — small card + detail dialog with date comparison

## Context

The Thamani growth dashboard's first metric — **New accounts** — is already built and
shipped end-to-end (see the 2026-07-30 accounts-slice plan): a daily cron reads Thamani
prod's `accounts` table and writes pre-aggregated counts into atlas's `thamani_metrics`
facts table at grains `day | week | month | quarter | year`; the home page reads only that
table. Today the metric renders as a **full-width card**: a left column of five roll-ups
(Today / This week / This month / This quarter / This year, each with an up/down trend arrow
vs the previous period) beside a large month-by-month line chart.

This design reshapes that presentation. It does **not** change the data source, the cron's
auth, the migration, or the accounts compute logic — only the UI surface, one read helper,
one addition to the period set, and a new pure comparison module.

### What changes, in one line

The metric becomes a **small clickable card** (the five roll-ups + trend arrows only). Clicking
opens a **detail dialog** that shows the full roll-ups, the month-by-month chart (moved off the
card), and a new **Compare** tool for comparing arbitrary dates and date ranges.

## Goals

1. Shrink the on-dashboard footprint to a small card showing the five roll-ups + trend arrows.
2. On click, open a dialog containing all the detail: roll-ups, the month chart, and a compare tool.
3. Let the user compare, within a single mode at a time and with non-overlapping selections:
   - **single date ↔ single date** (each selection is one day),
   - **multiple dates ↔ multiple dates** (each selection is a set of specific days),
   - **date range ↔ date range** (each selection is a contiguous from→to range).
     Each selection shows its **count of new accounts**; selections are compared side by side.

## Non-goals

- No change to the cron route, its `x-cron-secret` auth, the `0024_thamani_metrics` migration,
  the Thamani-prod read client, or `lib/thamani/metrics/accounts.ts` compute.
- No generalization of the compare tool to future metrics. It is built for the accounts
  metric only; generalization is deferred.
- No revenue/PostHog work — this remains the accounts (SQL-count) metric.
- No new npm dependency (no calendar/date-picker library).
- No cross-year comparison — only the current year's data is stored (backfill scope), so the
  compare tool is bounded to the current year.

## Decisions locked in (from brainstorming)

| Decision              | Choice                                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Small card content    | Five roll-ups (Today/Week/Month/Quarter/Year) **+ trend arrows**, clickable                                                                     |
| Where the chart lives | Moved from the card **into the dialog**                                                                                                         |
| Compare semantics     | Homogeneous per mode: date↔date, date-set↔date-set, range↔range. Each selection → **count of new accounts** within it                           |
| Overlap               | Selections in a comparison **must not share any calendar day**; overlapping selection is flagged and its bar suppressed until fixed             |
| Compare data source   | **Store daily rows** in `thamani_metrics` (extend `computeSet` to emit every day Jan→today); dialog reads the daily series and sums client-side |
| Date input            | Native `<input type="date">` styled via the existing `Input` — no new dependency                                                                |
| Comparison scope      | **Current year only** (the only data stored); inputs clamped to Jan 1 this year → today                                                         |
| Time zone             | **UTC** bucketing, consistent with the existing slice (documented skew)                                                                         |

## Design

### 1. Data layer

**1a. Daily rows in the facts table.**
`lib/thamani/periods.ts` — `computeSet(now)` currently emits: every month-start Jan→current,
every quarter-start Q1→current, the current year-start, the current week's Monday, and today.
It gains **every day-start from Jan 1 → today** at `grain: "day"`. Because `bucketAccounts`
maps over `computeSet(now) ∪ comparisonSet(now)` and `periodEndMs("day", …)` already exists,
this alone causes the cron to upsert one `grain:"day"` row per day of the current year. No
change to `bucketAccounts`, the cron route, or the accounts compute is required.

- Volume: ≈216 rows today (Jan 1→Aug 4), ≤366/year, per metric. Trivial. Upsert stays
  idempotent on `(metric_key, grain, period_start)`; closed days recompute to the same value.
- `comparisonSet(now)` already contributes "yesterday" as a day; it is now a subset of the
  daily span and dedupes away — no double rows.

**1b. Daily read helper.**
`lib/thamani/read.ts` gains:

```ts
// grain:"day" rows for `year`, ascending, as { date, value }.
export async function getAccountsDaily(
  supabase: MinimalClient,
  year: number,
): Promise<{ date: string; value: number }[]>;
```

Queries `thamani_metrics` where `metric_key = ACCOUNTS_NEW`, `grain = 'day'`,
`period_start >= '{year}-01-01'` and `< '{year+1}-01-01'`, ordered ascending; maps
`period_start → date`, `Number(value) → value`. ≤366 rows.

**1c. Pure comparison module (TDD).**
New `lib/thamani/compare.ts` — no I/O, fully unit-tested:

```ts
export type DayValue = { date: string; value: number }; // date = "YYYY-MM-DD"

// enumerate inclusive calendar dates between from..to (UTC), ascending.
export function datesInRange(from: string, to: string): string[];

// sum daily values for an explicit set of dates (single/multiple modes).
export function sumDays(daily: Map<string, number>, dates: string[]): number;

// sum daily values across an inclusive range (range mode).
export function sumRange(
  daily: Map<string, number>,
  from: string,
  to: string,
): number;

// the set of calendar days a selection occupies, for overlap detection.
export function selectionDays(sel: Selection): string[];

// true if any two selections share a calendar day.
export function hasOverlap(selections: Selection[]): boolean;

// per-selection: which indices overlap an earlier selection (for flagging).
export function overlappingIndices(selections: Selection[]): number[];
```

`Selection` is a discriminated union carried by the compare UI:
`{ kind: "single"; date: string }` | `{ kind: "multiple"; dates: string[] }` |
`{ kind: "range"; from: string; to: string }`. A missing/blank endpoint yields an **empty**
day set (counts as 0, never overlaps), so partially-filled selections don't throw.

Range/day math uses UTC (`YYYY-MM-DD` string arithmetic via `luxon`, already a dependency),
matching the stored `period_start` keys.

### 2. Small card (the trigger)

`components/thamani/accounts-card.tsx` becomes a **slim presentational stat list**: the five
roll-ups with their `TrendArrow` (unchanged trend logic), a `New accounts` heading, and a quiet
"tap for details" line. It renders no chart. It is presentational only — the click/dialog
wiring lives in the metric component (§3) so this stays a dumb, easily-styled face.

### 3. Metric component + dialog

New `components/thamani/accounts-metric.tsx` (**client component**) owns interactivity:

- Renders the small `AccountsCard` as the `DialogTrigger` face (base-ui `render` prop),
  as a real `<button>` for keyboard/focus.
- Renders `DialogContent` with three regions:
  1. **Roll-ups** — the five values with trend arrows, roomier, each showing the previous-period
     number beside the arrow.
  2. **Month-by-month** — the existing `AccountsChart`, moved here unchanged.
  3. **Compare** — `<AccountsCompare daily={…} year={…} />` (§4).

`TrendArrow` and `Stat` are currently module-private in `accounts-card.tsx`. The roomier
dialog roll-up (showing the previous-period number beside the arrow) shares the same trend
logic (`trendDirection`, already exported from `read.ts`); the implementation should export or
extract the shared arrow/stat pieces rather than duplicate them.

Props (all server-fetched, passed down): `current`, `previous` (`CurrentValues`),
`monthly` (`{ period_start; value }[]`), `daily` (`{ date; value }[]`), `year`.

### 4. Compare tool

New `components/thamani/accounts-compare.tsx` (**client component**). Local state:
`mode: "single" | "multiple" | "range"` and `selections: Selection[]` (default two).

- **Mode toggle** — three buttons (Single dates · Multiple dates · Date ranges). Switching
  mode resets `selections` to two empty selections of that kind (kinds never mix).
- **Selection editors**, one row each:
  - _single_: one `<input type="date">`.
  - _multiple_: a list of date inputs with add/remove ("＋ add date"); each selection is its
    own set of days.
  - _range_: two date inputs (from, to); if `from > to` the row is invalid (shown, 0).
  - All date inputs `min={year}-01-01`, `max={today}` (UTC). A helper line notes comparisons
    cover the current year only when a bound is hit.
- **Add/remove selection** — up to a small cap (e.g. 4) selections; minimum 2.
- **Result** — for each selection compute its count via `sumDays`/`sumRange` over a
  `Map<date, value>` built from `daily`. Render each as a labelled horizontal bar (width ∝
  count / max count) with the numeric count, side by side. Uses the accent color, consistent
  with `AccountsChart`. The bar-width divisor is guarded `Math.max(1, …)` so an all-empty/zero
  comparison never divides by zero (mirrors `AccountsChart`).
- **Overlap** — `overlappingIndices(selections)` flags any selection sharing a day with an
  earlier one; flagged rows show an inline "overlaps another selection" note and **suppress
  their bar** until the user fixes the dates. Non-overlapping selections still render.

Empty/partly-filled selections read as count 0 and are excluded from overlap (empty day set),
so the tool never errors mid-edit.

### 5. Page wiring

`app/(app)/page.tsx` additionally calls `getAccountsDaily(supabase, metricsYear)` in the
existing `Promise.all` (the two-element destructure at `page.tsx:10` becomes three), and
renders `<AccountsMetric … daily={daily} />` in place of the old `<AccountsCard … />`. The
right-rail relocation (accounts-slice Task 8) is untouched.

## Data flow

```
daily cron (unchanged route)
  → computeSet(now)  [now includes every day Jan→today]
  → bucketAccounts   [emits grain:"day" rows]
  → upsert thamani_metrics

home page (server)
  → getAccountsSnapshot → current/previous
  → getAccountsMonthly  → month series
  → getAccountsDaily    → daily series (NEW)
  → <AccountsMetric current previous monthly daily year />  (client)
       ├─ small AccountsCard (DialogTrigger)
       └─ DialogContent: rollups + AccountsChart + AccountsCompare
                                                   └─ compare.ts (pure) over daily Map
```

## Components / units (each independently testable)

| Unit                  | Kind                      | Responsibility                         | Depends on        |
| --------------------- | ------------------------- | -------------------------------------- | ----------------- |
| `computeSet` (edited) | pure                      | period set incl. daily span            | `periodStart`     |
| `getAccountsDaily`    | I/O                       | read daily rows for a year             | `thamani_metrics` |
| `compare.ts`          | pure                      | date enumeration, sums, overlap        | `luxon`           |
| `AccountsCard`        | presentational            | small stat face                        | trend logic       |
| `AccountsChart`       | presentational (existing) | month chart                            | —                 |
| `AccountsCompare`     | client                    | mode/selection state, bars, overlap UI | `compare.ts`      |
| `AccountsMetric`      | client                    | card-as-trigger + dialog composition   | `Dialog`, above   |

## Testing

**Unit (vitest, pure):**

- `compare.test.ts`:
  - `datesInRange` inclusive, ascending, single-day range, month boundary, `from > to` → empty.
  - `sumDays` sums a set incl. missing days (0), duplicate dates counted once via caller set.
  - `sumRange` inclusive sum over a range; empty range → 0.
  - `selectionDays` per kind (single→1, multiple→its set, range→enumerated, blanks→[]).
  - `hasOverlap` / `overlappingIndices`: disjoint→none; shared single day→flag later index;
    range∩range overlap; multiple∩range overlap; blank selections never overlap.
- `periods.test.ts` (**update existing**): the `computeSet` "day" assertion changes from a single
  `["2026-07-30"]` to Jan 1→today inclusive; add a case asserting first day is `YYYY-01-01`,
  last is today, and the count equals day-of-year, with months/quarters/year/week unchanged.

**Manual E2E (browser, after cron repopulate):**

- Small card shows five roll-ups + arrows; whole card opens the dialog on click/Enter.
- Dialog shows roll-ups, the month chart, and the compare tool.
- Single/multiple/range modes each compute correct counts (spot-check against known ~74 total).
- Overlapping selections flag + suppress; fixing the dates restores the bar.
- Date inputs won't select before Jan 1 or after today.

**Regression:** `pnpm test && pnpm typecheck && pnpm lint` green; re-running the cron is
idempotent (daily numbers don't double).

## Rollout

1. Extend `computeSet` (+ update its test); land the daily read helper and `compare.ts` (TDD).
2. Repopulate `thamani_metrics` by re-running the daily cron locally (now writes daily rows).
3. Refactor the card, add `AccountsMetric` + `AccountsCompare`, wire the page.
4. Verify locally; ship behind the existing deploy path. Prod cron backfills daily rows on its
   next run (idempotent); no migration needed — `grain` already permits `'day'`.

## Risks / open items

- **UTC vs EAT** day boundaries: an account created 00:00–03:00 EAT lands on the prior UTC day.
  Negligible at current volume; inherited from the existing slice, not introduced here.
- **Daily backfill only covers the current year.** Comparisons and inputs are bounded to it.
  Prior-year comparison would require widening the backfill scope — out of scope.
- **Page payload** grows by ≤366 small daily rows (~a few KB) even when the dialog isn't opened.
  Accepted for simplicity over a lazy server-action fetch; revisit only if it matters.
