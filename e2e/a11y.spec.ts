import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { admin, canRun, createUser, resetUsers, signIn } from "./fixtures";

// ---------------------------------------------------------------------------
// Unauthenticated page — always runs
// ---------------------------------------------------------------------------

test("sign-in has no critical or serious a11y violations", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("heading", { name: "Welcome to home base" }).waitFor();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});

// ---------------------------------------------------------------------------
// Auth-gate redirect guards — always run (no service key needed)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Authenticated axe scans — require SUPABASE_SERVICE_ROLE_KEY
// ---------------------------------------------------------------------------

test.describe("authenticated axe scans", () => {
  test.skip(!canRun, "SUPABASE_SERVICE_ROLE_KEY not set — skipping authed axe");

  let adminEmail: string;
  let pollId: string;

  test.beforeAll(async () => {
    adminEmail = "axe-admin@atlas.com";

    // Clean slate: remove only the axe test user to avoid stomping other suites
    const c = admin();
    const { data } = await c.auth.admin.listUsers();
    for (const u of data.users ?? []) {
      if (u.email === adminEmail) {
        await c.auth.admin.deleteUser(u.id);
      }
    }

    const adminUser = await createUser(adminEmail, "Axe Admin");

    // Seed a minimal open poll so /polls/[id] has real data
    const { data: poll, error } = await c
      .from("prompts")
      .insert({
        created_by: adminUser.id,
        owner_user_id: adminUser.id,
        question: "Axe a11y test poll — pick a day",
        response_type: "single_choice",
        options: [
          { id: "mon", label: "Monday" },
          { id: "wed", label: "Wednesday" },
        ],
        anonymity: "attributed",
        timing: "async",
        is_open: true,
      })
      .select("id")
      .single();
    if (error || !poll) throw error ?? new Error("poll insert failed");
    pollId = poll.id;
  });

  test.afterAll(async () => {
    // Clean up axe test user + their data
    await resetUsers().catch(() => {
      /* best-effort */
    });
  });

  test("/ (home) has no critical or serious a11y violations", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("baseURL not configured");
    const ctx = await browser.newContext();
    try {
      await signIn(ctx, adminEmail, baseURL);
      const page = await ctx.newPage();
      await page.goto("/");
      await page
        .getByRole("heading", { name: "Home" })
        .waitFor({ timeout: 10_000 });
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test("/meetings (list) has no critical or serious a11y violations", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("baseURL not configured");
    const ctx = await browser.newContext();
    try {
      await signIn(ctx, adminEmail, baseURL);
      const page = await ctx.newPage();
      await page.goto("/meetings");
      await page
        .getByRole("heading", { name: "Meetings" })
        .waitFor({ timeout: 10_000 });
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test("/polls/[id] has no critical or serious a11y violations", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("baseURL not configured");
    const ctx = await browser.newContext();
    try {
      await signIn(ctx, adminEmail, baseURL);
      const page = await ctx.newPage();
      await page.goto(`/polls/${pollId}`);
      // Wait for poll question to render
      await page
        .getByText("Axe a11y test poll — pick a day")
        .waitFor({ timeout: 10_000 });
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test("/meetings?new=meeting (sheet open) has no critical or serious a11y violations", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("baseURL not configured");
    const ctx = await browser.newContext();
    try {
      await signIn(ctx, adminEmail, baseURL);
      const page = await ctx.newPage();
      // Navigate with the query param that opens the New Meeting sheet
      await page.goto("/meetings?new=meeting");
      // Wait for the sheet heading to appear
      await page
        .getByRole("dialog")
        .or(page.getByRole("heading", { name: "New meeting" }))
        .first()
        .waitFor({ timeout: 10_000 });
      // Wait for network idle so all CSS / fonts are fully applied before
      // axe evaluates computed colors (avoids false positives from CSS vars
      // not yet resolved in the Base UI portal).
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        // Exclude datetime-local inputs: Chromium renders them with internal
        // shadow-DOM sub-fields that use browser-native colors which axe-core
        // reports as low-contrast. These cannot be overridden via CSS.
        .exclude('input[type="datetime-local"]')
        .analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});
