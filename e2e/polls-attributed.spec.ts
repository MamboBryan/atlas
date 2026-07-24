import { test, expect } from "@playwright/test";

// Full attributed-poll flow (create → respond → reveal) requires seeded
// magic-link sessions for two users. Wiring those fixtures is deferred; the
// action + RPC path is covered by tests/actions/prompt.integration.test.ts.

test.skip("attributed single_choice poll full flow", async () => {
  /* sign in as A, create poll, sign in as B, submit blue, sign in as A, reveal, see B → blue */
});

test("polls list requires auth", async ({ page }) => {
  await page.goto("/polls");
  await expect(page).toHaveURL(/\/sign-in/);
});
