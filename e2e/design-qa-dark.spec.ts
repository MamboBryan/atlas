import { test } from "@playwright/test";
import { admin, canRun, createUser, resetUsers, signIn } from "./fixtures";

/**
 * Dark-mode screenshot sweep.
 *
 * Mirrors design-qa.spec.ts but forces dark mode via localStorage before
 * each navigation.  Opt-in: set DESIGN_QA=1 (same guard as the light suite).
 *
 * Run with:
 *   DESIGN_QA=1 pnpm test:e2e -- --grep "design QA dark"
 *   # add --update-snapshots to refresh baselines
 */
test.describe("design QA dark", () => {
  test.skip(!process.env.DESIGN_QA, "set DESIGN_QA=1 to run");
  test.skip(!canRun, "SUPABASE_SERVICE_ROLE_KEY not set");
  test.setTimeout(180_000);

  test("screenshot every route in dark mode as admin", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("baseURL not configured");

    await resetUsers();
    const adminUser = await createUser("admin@atlas.com", "Admin");
    const u1 = await createUser("user1@atlas.com", "User 1");
    const u2 = await createUser("user2@atlas.com", "User 2");

    const c = admin();
    const now = Date.now();
    const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();

    const { data: openPoll } = await c
      .from("prompts")
      .insert({
        created_by: adminUser.id,
        owner_user_id: adminUser.id,
        question: "Which day works best for the retro?",
        response_type: "single_choice",
        options: [
          { id: "mon", label: "Monday" },
          { id: "wed", label: "Wednesday" },
          { id: "fri", label: "Friday" },
        ],
        anonymity: "attributed",
        timing: "async",
        is_open: true,
      })
      .select("id")
      .single();

    const { data: revealedPoll } = await c
      .from("prompts")
      .insert({
        created_by: adminUser.id,
        owner_user_id: adminUser.id,
        question: "What's the theme for next month's off-site?",
        response_type: "text",
        anonymity: "attributed",
        timing: "async",
        is_open: false,
        is_revealed: true,
        revealed_at: iso(-86_400_000),
      })
      .select("id")
      .single();

    const { data: scheduledMeeting } = await c
      .from("meetings")
      .insert({
        title: "Weekly team sync",
        scheduled_start: iso(2 * 60 * 60 * 1000),
        timezone: "UTC",
        host_user_id: adminUser.id,
        created_by: adminUser.id,
        status: "scheduled",
      })
      .select("id")
      .single();

    const { data: liveMeeting } = await c
      .from("meetings")
      .insert({
        title: "Design review — Q3 roadmap",
        scheduled_start: iso(-5 * 60 * 1000),
        timezone: "UTC",
        host_user_id: adminUser.id,
        created_by: adminUser.id,
        status: "live",
        started_at: iso(-4 * 60 * 1000),
      })
      .select("id")
      .single();

    const { data: endedMeeting } = await c
      .from("meetings")
      .insert({
        title: "Kickoff retrospective",
        scheduled_start: iso(-7 * 86_400_000),
        timezone: "UTC",
        host_user_id: adminUser.id,
        created_by: adminUser.id,
        status: "ended",
        started_at: iso(-7 * 86_400_000 + 60_000),
        ended_at: iso(-7 * 86_400_000 + 45 * 60_000),
      })
      .select("id")
      .single();

    if (scheduledMeeting) {
      await c.from("agenda_items").insert([
        {
          meeting_id: scheduledMeeting.id,
          ordinal: 0,
          title: "Wins & blockers",
          kind: "discussion",
        },
      ]);
    }
    if (liveMeeting) {
      const { data: firstItem } = await c
        .from("agenda_items")
        .insert({
          meeting_id: liveMeeting.id,
          ordinal: 0,
          title: "Roadmap walkthrough",
          kind: "discussion",
        })
        .select("id")
        .single();
      if (firstItem) {
        await c
          .from("meetings")
          .update({ current_agenda_item_id: firstItem.id })
          .eq("id", liveMeeting.id);
      }
    }

    await c.from("meeting_series").insert({
      name: "Engineering weekly",
      created_by: adminUser.id,
      owner_user_id: adminUser.id,
      rrule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=15;BYMINUTE=0;COUNT=8",
      timezone: "UTC",
      rotation_user_ids: [adminUser.id, u1.id, u2.id],
      rotation_cursor: 0,
      agenda_template: [{ title: "Round-table", kind: "discussion" }],
    });

    const routes: [string, string][] = [
      ["/sign-in", "01-signin"],
      ["/", "02-home"],
      ["/roster", "03-roster"],
      ["/roster/" + u1.id, "04-roster-detail"],
      ["/meetings", "05-meetings"],
      ["/meetings/new", "06-meetings-new"],
      ["/meetings/" + scheduledMeeting!.id, "07-meeting-scheduled"],
      ["/meetings/" + liveMeeting!.id, "08-meeting-live"],
      ["/meetings/" + endedMeeting!.id, "09-meeting-ended"],
      ["/meetings/past", "10-meetings-past"],
      ["/polls", "11-polls"],
      ["/polls/new", "12-polls-new"],
      ["/polls/" + openPoll!.id, "13-poll-open"],
      ["/polls/" + revealedPoll!.id, "14-poll-revealed"],
      ["/polls/past", "15-polls-past"],
      ["/series", "16-series"],
      ["/series/new", "17-series-new"],
      ["/notifications", "18-notifications"],
      ["/settings", "19-settings"],
      ["/tools/pick", "20-tools-pick"],
      ["/tools/shuffle", "21-tools-shuffle"],
    ];

    const outDir = "qa-screenshots/dark";

    const ctx = await browser.newContext();
    await signIn(ctx, "admin@atlas.com", baseURL);

    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });

    // Force dark mode before any navigation. next-themes reads the
    // "theme" key from localStorage and applies the "dark" class on <html>.
    await page.addInitScript(() => {
      localStorage.setItem("theme", "dark");
    });

    for (const [route, label] of routes) {
      try {
        await page.goto(`${baseURL}${route}`, {
          waitUntil: "networkidle",
          timeout: 15_000,
        });
        // Give next-themes a moment to apply the dark class after hydration.
        await page.waitForTimeout(600);
        await page.screenshot({
          path: `${outDir}/admin-${label}.png`,
          fullPage: true,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`skip dark ${route}: ${msg}`);
      }
    }

    await page.close();
    await ctx.close();
  });
});
