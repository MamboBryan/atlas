import { test, expect } from "@playwright/test";

// Series admin happy path (create rotation series → cron generates 14 days
// of meetings → rotation cursor advances) requires seeded admin session
// plus a spawned cron POST. Deferred; RLS and rrule/rotation logic are
// covered by pgTAP and unit tests.
test.skip("series generation happy path", async () => {
  /*
   * admin: create weekly series with 3-person rotation, POST cron with
   * x-cron-secret, expect meetings appear on /series/[id] and hosts
   * cycle through the rotation cursor.
   */
});

test("series list requires auth", async ({ page }) => {
  await page.goto("/series");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("new series page requires auth", async ({ page }) => {
  await page.goto("/series/new");
  await expect(page).toHaveURL(/\/sign-in/);
});

// Cron endpoint auth is verified via manual curl during development and by
// the middleware allowlist for /api/cron. Full behavioural coverage of the
// generator (creation, rotation cursor advance) requires seeded fixtures and
// a service-role client; deferred to a later phase.
