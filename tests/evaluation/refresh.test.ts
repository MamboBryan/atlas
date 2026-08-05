import { describe, it, expect } from "vitest";
import { partitionRefreshColumns } from "@/lib/evaluation/refresh";

describe("partitionRefreshColumns", () => {
  it("keeps a brand-new header as a visible question", () => {
    const out = partitionRefreshColumns([], ["Q1"]);
    expect(out).toEqual({ questionColumns: ["Q1"], hiddenColumns: [] });
  });

  it("routes an existing hidden (active) field to hiddenColumns", () => {
    const out = partitionRefreshColumns(
      [{ column_key: "Q1", is_active: true, is_hidden: true }],
      ["Q1"],
    );
    expect(out).toEqual({ questionColumns: [], hiddenColumns: ["Q1"] });
  });

  it("drops a disabled field from both arrays", () => {
    const out = partitionRefreshColumns(
      [{ column_key: "Q1", is_active: false, is_hidden: false }],
      ["Q1"],
    );
    expect(out).toEqual({ questionColumns: [], hiddenColumns: [] });
  });

  it("keeps an existing active+visible field as a question", () => {
    const out = partitionRefreshColumns(
      [{ column_key: "Q1", is_active: true, is_hidden: false }],
      ["Q1"],
    );
    expect(out).toEqual({ questionColumns: ["Q1"], hiddenColumns: [] });
  });
});
