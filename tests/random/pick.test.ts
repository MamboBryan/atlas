import { expect, test } from "vitest";
import { pickOne, shuffle } from "@/lib/random/pick";

test("pickOne returns a member of the list", () => {
  const list = ["a", "b", "c"];
  for (let i = 0; i < 100; i++) expect(list).toContain(pickOne(list));
});

test("pickOne with seed is deterministic", () => {
  expect(pickOne(["a", "b", "c", "d"], 42)).toBe(
    pickOne(["a", "b", "c", "d"], 42),
  );
});

test("shuffle returns a permutation", () => {
  const list = ["a", "b", "c", "d"];
  const s = shuffle(list);
  expect(s.slice().sort()).toEqual(list.slice().sort());
  expect(s.length).toBe(list.length);
});

test("shuffle with seed is deterministic", () => {
  expect(shuffle(["a", "b", "c"], 42)).toEqual(shuffle(["a", "b", "c"], 42));
});

test("shuffle does not mutate the input", () => {
  const list = ["a", "b", "c", "d"];
  const copy = list.slice();
  shuffle(list, 7);
  expect(list).toEqual(copy);
});
