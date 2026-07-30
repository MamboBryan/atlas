import { describe, it, expect } from "vitest";
import { smoothPath } from "@/lib/thamani/chart-path";

describe("smoothPath", () => {
  it("returns empty string for no points", () => {
    expect(smoothPath([])).toBe("");
  });
  it("returns a single moveto for one point", () => {
    expect(smoothPath([[10, 20]])).toBe("M 10.0,20.0");
  });
  it("starts with a moveto to the first point", () => {
    expect(smoothPath([[0, 0], [10, 5], [20, 0]])).toMatch(/^M 0\.0,0\.0/);
  });
  it("emits one cubic-bezier (C) segment per gap between points", () => {
    const d = smoothPath([[0, 0], [10, 5], [20, 0], [30, 8]]);
    expect((d.match(/C /g) ?? []).length).toBe(3);
  });
});
