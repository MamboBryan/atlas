import { expect, test } from "vitest";
import { validateResponse } from "@/lib/prompts/validate-response";

test("text rejects >2000 chars", () => {
  const r = validateResponse({ response_type: "text" } as any, {
    text: "a".repeat(2001),
  });
  expect(r.ok).toBe(false);
});

test("text accepts short string", () => {
  const r = validateResponse({ response_type: "text" } as any, {
    text: "hello",
  });
  expect(r.ok).toBe(true);
});

test("text rejects empty string", () => {
  const r = validateResponse({ response_type: "text" } as any, { text: "" });
  expect(r.ok).toBe(false);
});

test("rating rejects out of range", () => {
  const r = validateResponse(
    { response_type: "rating", rating_min: 1, rating_max: 5 } as any,
    { value: 7 },
  );
  expect(r.ok).toBe(false);
});

test("rating accepts in-range integer", () => {
  const r = validateResponse(
    { response_type: "rating", rating_min: 1, rating_max: 5 } as any,
    { value: 3 },
  );
  expect(r.ok).toBe(true);
});

test("rating rejects non-integer", () => {
  const r = validateResponse(
    { response_type: "rating", rating_min: 1, rating_max: 5 } as any,
    { value: 2.5 },
  );
  expect(r.ok).toBe(false);
});

test("single_choice accepts a known option", () => {
  const p = {
    response_type: "single_choice",
    options: [{ id: "a" }, { id: "b" }],
  } as any;
  expect(validateResponse(p, { option_id: "a" }).ok).toBe(true);
});

test("single_choice rejects unknown option", () => {
  const p = {
    response_type: "single_choice",
    options: [{ id: "a" }, { id: "b" }],
  } as any;
  expect(validateResponse(p, { option_id: "z" }).ok).toBe(false);
});

test("multi_choice accepts subset of options", () => {
  const p = {
    response_type: "multi_choice",
    options: [{ id: "a" }, { id: "b" }, { id: "c" }],
  } as any;
  const r = validateResponse(p, { option_ids: ["a", "c"] });
  expect(r.ok).toBe(true);
});

test("multi_choice rejects unknown id in list", () => {
  const p = {
    response_type: "multi_choice",
    options: [{ id: "a" }, { id: "b" }],
  } as any;
  expect(validateResponse(p, { option_ids: ["a", "z"] }).ok).toBe(false);
});

test("multi_choice rejects empty list", () => {
  const p = {
    response_type: "multi_choice",
    options: [{ id: "a" }, { id: "b" }],
  } as any;
  expect(validateResponse(p, { option_ids: [] }).ok).toBe(false);
});

test("yes_no accepts yes only", () => {
  const p = {
    response_type: "yes_no",
    options: [{ id: "yes" }, { id: "no" }],
  } as any;
  expect(validateResponse(p, { option_id: "yes" }).ok).toBe(true);
  expect(validateResponse(p, { option_id: "maybe" }).ok).toBe(false);
});
