import { test, expect } from "@playwright/test";
test("sign-in page renders", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(
    page.getByRole("heading", { name: "Welcome to Atlas" }),
  ).toBeVisible();
});
