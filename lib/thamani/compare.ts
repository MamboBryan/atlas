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
