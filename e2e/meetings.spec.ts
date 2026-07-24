import { test, expect } from "@playwright/test";

// Full one-off meeting happy path (host creates → adds agenda → starts →
// advances → participants see live sync → ends) requires seeded magic-link
// sessions for two users. Wiring those fixtures is deferred; server actions,
// RLS, and denominator logic are covered by pgTAP and unit/integration tests.
test.skip("one-off meeting happy path", async () => {
  /*
   * host: create meeting, add 3 agenda items (discussion + 2 prompts of
   * different types/anonymities), start, advance through each, reveal
   * last prompt, end. non-host participant sees state changes live.
   */
});

test("meetings list requires auth", async ({ page }) => {
  await page.goto("/meetings");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("new meeting page requires auth", async ({ page }) => {
  await page.goto("/meetings/new");
  await expect(page).toHaveURL(/\/sign-in/);
});
