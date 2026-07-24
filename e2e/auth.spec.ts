import { test, expect } from "@playwright/test";

test("unauthenticated → sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    page.getByRole("heading", { name: "Sign in to Atlas" }),
  ).toBeVisible();
});
