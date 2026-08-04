import { test, expect } from "@playwright/test";
import { admin, canRun, createUser, resetUsers, signIn } from "./fixtures";

// Smoke coverage for the hiring evaluations feature: the auth-gate redirect
// (always runs) plus an admin creating a new evaluation through the UI and
// landing on its detail route. The full draft/open/closed + rating + results
// flow is covered by e2e/hiring-screenshots.spec.ts — this spec stays small
// and focused so it's cheap to run on every change.

test("hiring requires auth", async ({ page }) => {
  await page.goto("/hiring");
  await expect(page).toHaveURL(/\/sign-in/);
});

test.describe("hiring evaluations smoke", () => {
  test.skip(!canRun, "SUPABASE_SERVICE_ROLE_KEY not set");

  test.beforeAll(async () => {
    await resetUsers();
    const c = admin();
    const adminUser = await createUser("hiring-e2e-admin@atlas.com", "Admin E2E");
    await c.from("profiles").update({ role: "admin" }).eq("id", adminUser.id);
  });

  test("create evaluation navigates to its detail route", async ({ browser, baseURL }) => {
    if (!baseURL) throw new Error("baseURL not configured");
    const ctx = await browser.newContext();
    try {
      await signIn(ctx, "hiring-e2e-admin@atlas.com", baseURL);
      const page = await ctx.newPage();
      await page.goto("/hiring");
      await page.getByPlaceholder("Evaluation name").fill("E2E Smoke Role — Aug 2026");
      await page.getByRole("button", { name: "New evaluation" }).click();
      await expect(page).toHaveURL(/\/hiring\/[0-9a-f-]{36}/);
    } finally {
      await ctx.close();
    }
  });
});
