import { assertEquals } from "jsr:@std/assert@1";
import { bucketCounts } from "./_shared/aggregate.ts";
import { periodStart } from "./_shared/periods.ts";

const now = new Date("2026-07-30T18:05:00Z");
const createdAts = [
  "2026-01-10T09:00:00Z",
  "2026-07-15T09:00:00Z",
  "2026-07-30T08:00:00Z", // today
];

Deno.test("periodStart: Monday-start week", () => {
  assertEquals(periodStart(new Date("2026-08-02T10:00:00Z"), "week"), "2026-07-27");
});

Deno.test("bucketCounts tags every row with the metric key", () => {
  const rows = bucketCounts("accounts_new", createdAts, now);
  assertEquals(rows.every((r) => r.metric_key === "accounts_new"), true);
});

Deno.test("bucketCounts: Jan month = 1, Jul month = 2, year = 3, today = 1", () => {
  const rows = bucketCounts("accounts_new", createdAts, now);
  const at = (grain: string, ps: string) =>
    rows.find((r) => r.grain === grain && r.period_start === ps)?.value;
  assertEquals(at("month", "2026-01-01"), 1);
  assertEquals(at("month", "2026-07-01"), 2);
  assertEquals(rows.find((r) => r.grain === "year")?.value, 3);
  assertEquals(at("day", "2026-07-30"), 1);
});

Deno.test("bucketCounts: empty input → all-zero rows, unique keys", () => {
  const rows = bucketCounts("accounts_new", [], now);
  assertEquals(rows.length > 0, true);
  assertEquals(rows.every((r) => r.value === 0), true);
  const keys = rows.map((r) => `${r.grain}|${r.period_start}`);
  assertEquals(new Set(keys).size, keys.length);
});

Deno.test("bucketCounts: includes previous-period buckets", () => {
  const rows = bucketCounts("accounts_new", [], now);
  assertEquals(rows.some((r) => r.grain === "month" && r.period_start === "2026-06-01"), true);
  assertEquals(rows.some((r) => r.grain === "year" && r.period_start === "2025-01-01"), true);
});
