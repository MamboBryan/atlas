import { test } from "@playwright/test";
import { admin, canRun, createUser, resetUsers, signIn } from "./fixtures";

// Screenshot every major surface as both admin and non-admin users.
// Opt-in via DESIGN_QA=1 so this doesn't fire in normal CI runs.
test.describe("design QA", () => {
  test.skip(!process.env.DESIGN_QA, "set DESIGN_QA=1 to run");
  test.skip(!canRun, "SUPABASE_SERVICE_ROLE_KEY not set");
  test.setTimeout(180_000);

  test("screenshot every route as admin + test user", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("baseURL not configured");

    await resetUsers();
    const adminUser = await createUser("admin@atlas.com", "Admin");
    const testUser = await createUser("test@atlas.com", "Test");
    const u1 = await createUser("user1@atlas.com", "User 1");
    const u2 = await createUser("user2@atlas.com", "User 2");

    const c = admin();
    const now = Date.now();
    const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();

    // ---- Seed prompts (standalone + revealed) ----
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

    const { data: anonPoll } = await c
      .from("prompts")
      .insert({
        created_by: adminUser.id,
        owner_user_id: adminUser.id,
        question: "How's your energy today? (1-5)",
        response_type: "rating",
        rating_min: 1,
        rating_max: 5,
        anonymity: "hard_anonymous",
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

    // A text response on the revealed poll (from user 1)
    if (revealedPoll) {
      await c.from("responses_attributed").insert({
        prompt_id: revealedPoll.id,
        user_id: u1.id,
        response: { text: "Building something we actually ship." },
      });
    }
    // Test user has answered anonPoll (participation row + anon response)
    if (anonPoll) {
      await c.rpc("atlas_submit_anonymous", {
        p_prompt: anonPoll.id,
        p_response: { value: 4 },
      });
    }

    // ---- Seed meetings ----
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

    // Agenda for scheduled meeting: discussion + prompt + picker
    if (scheduledMeeting) {
      const { data: mPrompt } = await c
        .from("prompts")
        .insert({
          meeting_id: scheduledMeeting.id,
          created_by: adminUser.id,
          owner_user_id: adminUser.id,
          question: "One word for last week?",
          response_type: "text",
          anonymity: "attributed",
          timing: "live",
          is_open: false,
        })
        .select("id")
        .single();
      await c.from("agenda_items").insert([
        {
          meeting_id: scheduledMeeting.id,
          ordinal: 0,
          title: "Wins & blockers",
          kind: "discussion",
        },
        {
          meeting_id: scheduledMeeting.id,
          ordinal: 1,
          title: "One-word check-in",
          kind: "prompt",
          prompt_id: mPrompt?.id ?? null,
        },
        {
          meeting_id: scheduledMeeting.id,
          ordinal: 2,
          title: "Who runs the retro?",
          kind: "picker",
          picker_config: { mode: "oneshot", exclude_recent: 0 },
        },
      ]);
    }
    // Agenda for live meeting
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
      await c.from("agenda_items").insert({
        meeting_id: liveMeeting.id,
        ordinal: 1,
        title: "Vote: launch date",
        kind: "prompt",
        prompt_id: openPoll?.id ?? null,
      });
      if (firstItem) {
        await c
          .from("meetings")
          .update({ current_agenda_item_id: firstItem.id })
          .eq("id", liveMeeting.id);
      }
    }
    // Agenda for ended meeting (with revealed poll)
    if (endedMeeting) {
      await c.from("agenda_items").insert([
        {
          meeting_id: endedMeeting.id,
          ordinal: 0,
          title: "How did the launch go?",
          kind: "prompt",
          prompt_id: revealedPoll?.id ?? null,
        },
        {
          meeting_id: endedMeeting.id,
          ordinal: 1,
          title: "Action items",
          kind: "discussion",
        },
      ]);
    }

    // ---- Seed a series ----
    const { data: series } = await c
      .from("meeting_series")
      .insert({
        name: "Engineering weekly",
        created_by: adminUser.id,
        owner_user_id: adminUser.id,
        rrule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=15;BYMINUTE=0;COUNT=8",
        timezone: "UTC",
        rotation_user_ids: [adminUser.id, u1.id, u2.id],
        rotation_cursor: 0,
        agenda_template: [
          { title: "Round-table", kind: "discussion" },
          { title: "Blockers", kind: "discussion" },
        ],
      })
      .select("id")
      .single();
    void series;

    // ---- Seed notifications for the test user ----
    await c.from("notifications").insert([
      {
        user_id: testUser.id,
        kind: "meeting_invited",
        payload: {
          meeting_id: scheduledMeeting?.id,
          meeting_title: "Weekly team sync",
        },
      },
      {
        user_id: testUser.id,
        kind: "prompt_opened",
        payload: {
          prompt_id: openPoll?.id,
          question: "Which day works best for the retro?",
        },
        read_at: iso(-3600_000),
      },
    ]);

    const routesForAdmin: [string, string][] = [
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
      ["/polls/" + anonPoll!.id, "14-poll-anon"],
      ["/polls/" + revealedPoll!.id, "15-poll-revealed"],
      ["/polls/past", "16-polls-past"],
      ["/series", "17-series"],
      ["/series/new", "18-series-new"],
      ["/notifications", "19-notifications"],
      ["/settings", "20-settings"],
      ["/tools/pick", "21-tools-pick"],
      ["/tools/shuffle", "22-tools-shuffle"],
    ];

    const outDir = "qa-screenshots";
    const shoot = async (
      ctx: import("@playwright/test").BrowserContext,
      role: "admin" | "test",
      routes: [string, string][],
    ) => {
      const page = await ctx.newPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      for (const [route, label] of routes) {
        try {
          await page.goto(`${baseURL}${route}`, {
            waitUntil: "networkidle",
            timeout: 15_000,
          });
          await page.waitForTimeout(400);
          await page.screenshot({
            path: `${outDir}/${role}-${label}.png`,
            fullPage: true,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(`skip ${role} ${route}: ${msg}`);
        }
      }
      await page.close();
    };

    const ctxAdmin = await browser.newContext();
    await signIn(ctxAdmin, "admin@atlas.com", baseURL);
    await shoot(ctxAdmin, "admin", routesForAdmin);
    await ctxAdmin.close();

    const routesForTest: [string, string][] = routesForAdmin.filter(
      ([r]) => !r.startsWith("/roster/"),
    );
    const ctxTest = await browser.newContext();
    await signIn(ctxTest, "test@atlas.com", baseURL);
    await shoot(ctxTest, "test", routesForTest);
    await ctxTest.close();
  });
});
