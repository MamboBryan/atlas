import { expect, test } from "vitest";
import { jokes, pickJoke } from "@/lib/present/jokes";

test("jokes pool has 20 unique entries", () => {
  expect(jokes.length).toBe(20);
  expect(new Set(jokes).size).toBe(20);
});

test("pickJoke is deterministic for a given meeting id", () => {
  const id = "abc-123-xyz";
  const first = pickJoke(id);
  expect(pickJoke(id)).toBe(first);
  expect(pickJoke(id)).toBe(first);
});

test("pickJoke returns different jokes for different ids", () => {
  const results = new Set(
    Array.from({ length: 50 }, (_, i) => pickJoke(`meeting-${i}`)),
  );
  expect(results.size).toBeGreaterThan(1);
});

test("pickJoke tolerates empty id", () => {
  expect(typeof pickJoke("")).toBe("string");
});
