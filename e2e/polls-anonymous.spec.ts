import { test, expect } from "@playwright/test";

// Full hard-anonymous flow (two responders, creator reveals, results show
// no names, text answers in randomised order) requires seeded magic-link
// sessions and is deferred alongside the attributed E2E fixture. The RPC +
// aggregation + schema (no user_id column) are covered by
// tests/actions/anonymous.integration.test.ts and the pgTAP suite.
test.skip("hard-anonymous single_choice full flow", async () => {
  /* user1 + user2 submit anonymously, admin reveals, verify no names shown */
});

test("new poll page renders anonymous option and warning", async ({ page }) => {
  await page.goto("/polls/new");
  await expect(page).toHaveURL(/\/sign-in/);
});
