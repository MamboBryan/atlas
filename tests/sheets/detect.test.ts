import { expect, test } from "vitest";
import { detectMapping } from "@/lib/sheets/parse";

test("detects email, timestamp, name; rest are questions", () => {
  const grid = {
    headers: ["Timestamp", "Email Address", "Full Name", "Why this role?", "Strengths"],
    rows: [["2026-01-01", "a@x.com", "Ann", "…", "…"]],
  };
  const m = detectMapping(grid);
  expect(m.emailColumn).toBe("Email Address");
  expect(m.timestampColumn).toBe("Timestamp");
  expect(m.nameColumn).toBe("Full Name");
  expect(m.questionColumns).toEqual(["Why this role?", "Strengths"]);
});

test("falls back to value-shape email detection when header is generic", () => {
  const grid = {
    headers: ["Timestamp", "Contact", "Pitch"],
    rows: [["2026-01-01", "b@y.com", "hi"]],
  };
  expect(detectMapping(grid).emailColumn).toBe("Contact");
});

test("no name column => nameColumn null, column stays a question if ambiguous", () => {
  const grid = { headers: ["Email", "Q1"], rows: [["c@z.com", "x"]] };
  const m = detectMapping(grid);
  expect(m.emailColumn).toBe("Email");
  expect(m.nameColumn).toBeNull();
  expect(m.questionColumns).toEqual(["Q1"]);
});
