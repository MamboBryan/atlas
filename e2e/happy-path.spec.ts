import { test, expect } from "@playwright/test";
import { admin, canRun, createUser, resetUsers, signIn } from "./fixtures";

// Full two-user happy path: hard-anonymous rating prompt inside a meeting.
// Setup is seeded via service-role (users, meeting, agenda, prompt) so the
// test focuses on the actual UI interactions we care about — B submitting a
// rating, A revealing, both seeing the histogram.
test.describe("happy path", () => {
  test.skip(!canRun, "SUPABASE_SERVICE_ROLE_KEY not set");

  test("hard-anonymous rating → reveal shows a bar at 4", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("baseURL not configured");

    await resetUsers();
    const a = await createUser("admin@atlas.com", "Admin");
    const b = await createUser("user1@atlas.com", "User 1");

    const c = admin();

    const { data: meeting, error: mErr } = await c
      .from("meetings")
      .insert({
        title: "Happy path check-in",
        scheduled_start: new Date(Date.now() + 60_000).toISOString(),
        timezone: "UTC",
        host_user_id: a.id,
        created_by: a.id,
        status: "scheduled",
      })
      .select("id")
      .single();
    if (mErr || !meeting) throw mErr ?? new Error("meeting insert failed");

    const { data: prompt, error: pErr } = await c
      .from("prompts")
      .insert({
        meeting_id: meeting.id,
        created_by: a.id,
        owner_user_id: a.id,
        question: "How energised are you today?",
        response_type: "rating",
        rating_min: 1,
        rating_max: 5,
        anonymity: "hard_anonymous",
        timing: "async",
        is_open: true,
      })
      .select("id")
      .single();
    if (pErr || !prompt) throw pErr ?? new Error("prompt insert failed");

    const { error: aErr } = await c.from("agenda_items").insert({
      meeting_id: meeting.id,
      ordinal: 0,
      title: "Energy check",
      kind: "prompt",
      prompt_id: prompt.id,
    });
    if (aErr) throw aErr;

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    try {
      await signIn(ctxA, "admin@atlas.com", baseURL);
      await signIn(ctxB, "user1@atlas.com", baseURL);

      const pageB = await ctxB.newPage();
      await pageB.goto(`/polls/${prompt.id}`);
      await pageB.getByRole("button", { name: "4", exact: true }).click();
      await pageB
        .getByRole("button", { name: "Submit anonymously", exact: true })
        .click();
      const confirm = pageB
        .getByRole("dialog")
        .getByRole("button", { name: "Submit anonymously" });
      await confirm.click();
      await expect(pageB.getByText(/You.*ve responded/)).toBeVisible();
      await pageB.close();

      const pageA = await ctxA.newPage();
      await pageA.goto(`/polls/${prompt.id}`);
      await pageA.getByRole("button", { name: "Reveal", exact: true }).click();
      await expect(pageA.getByText(/Mean:/)).toBeVisible();
      await expect(pageA.getByText(/1 responses/)).toBeVisible();

      const bar4 = pageA
        .locator("div.space-y-1")
        .filter({ hasText: /^4/ })
        .filter({ hasText: /^\s*4\s*1\s*$/ });
      await expect(bar4.first()).toBeVisible();
      await pageA.close();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
