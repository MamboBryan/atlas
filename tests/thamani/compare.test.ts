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
  it("flags transitive overlap through a flagged intermediate (3 selections)", () => {
    const sels: Selection[] = [
      { kind: "range", from: "2026-07-01", to: "2026-07-01" },
      { kind: "range", from: "2026-07-01", to: "2026-07-05" },
      { kind: "single", date: "2026-07-03" },
    ];
    expect(overlappingIndices(sels)).toEqual([1, 2]);
  });
});
