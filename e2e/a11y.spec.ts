import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Unauthenticated pages are the only ones we can currently scan without
// seeded sessions. The other pages listed in the plan (/, /roster,
// /polls/new) all redirect to /sign-in, so an unauthed scan of them
// just re-scans the sign-in page. Full authenticated scans land with
// service-role fixtures in a later pass.

test("sign-in has no critical or serious a11y violations", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("heading", { name: "Sign in to Atlas" }).waitFor();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(
    blocking,
    JSON.stringify(blocking, null, 2),
  ).toEqual([]);
});

// Authenticated-page scans depend on session fixtures that we haven't
// wired yet. When those fixtures land, unskip these and remove the
// redirect check — the current bodies confirm the gating, not a11y.

test("home requires auth (a11y scan needs fixtures)", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("roster requires auth (a11y scan needs fixtures)", async ({ page }) => {
  await page.goto("/roster");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("new poll requires auth (a11y scan needs fixtures)", async ({ page }) => {
  await page.goto("/polls/new");
  await expect(page).toHaveURL(/\/sign-in/);
});
