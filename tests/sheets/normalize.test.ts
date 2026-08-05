import { expect, test } from "vitest";
import { normalizeRows } from "@/lib/sheets/parse";

const grid = {
  headers: ["Timestamp", "Email", "Name", "Q1", "Q2"],
  rows: [
    ["2026-01-01T10:00:00Z", "a@x.com", "Ann", "a1", "a2"],
    ["", "notanemail", "Bad", "x", "y"], // skipped: bad email
    ["2026-01-02T10:00:00Z", "a@x.com", "Ann2", "a1b", "a2b"], // dup: last wins
    ["2026-01-03T10:00:00Z", "b@x.com", "", "b1", "b2"], // name from local-part
  ],
};
const mapping = {
  emailColumn: "Email",
  nameColumn: "Name",
  timestampColumn: "Timestamp",
  questionColumns: ["Q1", "Q2"],
};

test("normalizes, skips bad email, dedups last-wins, derives name", () => {
  const { candidates, summary } = normalizeRows(grid, mapping);
  expect(candidates).toHaveLength(2);
  const a = candidates.find((c) => c.email === "a@x.com")!;
  expect(a.displayName).toBe("Ann2"); // last wins
  expect(a.answers).toEqual([
    { columnKey: "Q1", text: "a1b" },
    { columnKey: "Q2", text: "a2b" },
  ]);
  const b = candidates.find((c) => c.email === "b@x.com")!;
  expect(b.displayName).toBe("b"); // local-part
  expect(summary.rowsSkipped).toEqual([
    { reason: "missing_or_invalid_email", count: 1 },
  ]);
  expect(summary.duplicateEmails).toEqual(["a@x.com"]);
});
