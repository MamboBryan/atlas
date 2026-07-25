import { test, expect } from "@playwright/test";

test("present route requires auth", async ({ page }) => {
  await page.goto("/meetings/00000000-0000-0000-0000-000000000000/present");
  await expect(page).toHaveURL(/\/sign-in/);
});

// A logged-in host / live-meeting happy path requires seeded magic-link
// sessions and a seeded live meeting. The rest of the suite defers this
// (see e2e/meetings.spec.ts). We leave a skipped placeholder so future
// fixture work has a clear extension point.
test.skip("host reaches present slide from live meeting", async () => {
  /*
   * 1. Sign in as host of a live meeting with a discussion + prompt + picker.
   * 2. Navigate to /meetings/<id>. Click Present →.
   * 3. Expect URL /meetings/<id>/present.
   * 4. Standby renders. Press ArrowRight → discussion.
   * 5. Press ArrowRight → prompt-open. Click 30s. Use
   *    page.clock.fastForward("60s"). Expect prompt-closed.
   * 6. Press ArrowRight → picker. Trigger pick. Expect reveal state.
   * 7. Press ArrowRight → curtain. Expect joke visible. Click End meeting.
   * 8. Expect URL /meetings/<id> and Ended badge.
   */
});
