import { expect, test } from "vitest";
import { AuthError } from "@/lib/auth/require";

test("AuthError carries code", () => {
  const e = new AuthError("forbidden", "no");
  expect(e.code).toBe("forbidden");
  expect(e.message).toBe("no");
});
