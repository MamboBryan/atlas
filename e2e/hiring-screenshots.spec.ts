import { test, expect } from "@playwright/test";
import { admin, canRun, createUser, resetUsers, signIn } from "./fixtures";

// Seeds every UI-relevant state of the hiring evaluations feature (draft,
// open with an in-progress panel, closed with a revealed ranking) and
// captures one full-page screenshot per surface into qa-screenshots/hiring/.
// Not a behavioural test — see lib/evaluation/*.test.ts and the pgTAP suite
// under db/supabase for correctness coverage of RLS, aggregation, and the
// suppression floor.
test.describe.configure({ mode: "serial" });

test.describe("hiring evaluations screenshots", () => {
  test.skip(!canRun, "SUPABASE_SERVICE_ROLE_KEY not set");

  let draftId: string;
  let openId: string;
  let closedId: string;

  test.beforeAll(async () => {
    await resetUsers();
    const c = admin();
    await c.from("evaluations").delete().not("id", "is", null);

    // First user after reset auto-becomes admin via the on_auth_user_created
    // trigger; set roles explicitly anyway so this doesn't depend on that.
    const adminUser = await createUser("hiring-shot-admin@atlas.com", "Amina Okoro");
    await c.from("profiles").update({ role: "admin" }).eq("id", adminUser.id);

    const p1 = await createUser("hiring-shot-p1@atlas.com", "Brian Kim");
    await c.from("profiles").update({ role: "member" }).eq("id", p1.id);
    const p2 = await createUser("hiring-shot-p2@atlas.com", "Cynthia Wanjiru");
    await c.from("profiles").update({ role: "member" }).eq("id", p2.id);
    const p3 = await createUser("hiring-shot-p3@atlas.com", "David Otieno");
    await c.from("profiles").update({ role: "member" }).eq("id", p3.id);

    // --- DRAFT: no sheet, no questions, no candidates. -------------------
    const { data: draft, error: draftErr } = await c
      .from("evaluations")
      .insert({ name: "Backend Engineer — Sept 2026", status: "draft", created_by: adminUser.id })
      .select()
      .single();
    if (draftErr || !draft) throw draftErr ?? new Error("draft insert failed");
    draftId = draft.id;

    // --- OPEN: questions + candidates + answers + panel, no ratings. -----
    const { data: open, error: openErr } = await c
      .from("evaluations")
      .insert({ name: "Product Designer — Sept 2026", status: "open", created_by: adminUser.id })
      .select()
      .single();
    if (openErr || !open) throw openErr ?? new Error("open insert failed");
    openId = open.id;

    const openQuestions = await insertQuestions(c, open.id, [
      ["q_why", "Why do you want this role?"],
      ["q_proud", "Describe a project you're proud of"],
      ["q_tools", "Which design tools do you use daily?"],
    ]);
    const openCandidates = await insertCandidates(c, open.id, [
      ["ada@example.com", "Ada Nakamura"],
      ["leo@example.com", "Leo Mensah"],
      ["mira@example.com", "Mira Patel"],
    ]);
    await insertAnswers(c, open.id, openCandidates, openQuestions, {
      "ada@example.com|q_why":
        "I love turning fuzzy problems into interfaces people actually enjoy using.",
      "ada@example.com|q_proud":
        "Led the redesign of our onboarding flow, cutting drop-off by a third.",
      "ada@example.com|q_tools": "Figma daily, with FigJam for workshops and Linear for tracking work.",
      "leo@example.com|q_why": "Product design at this stage of a company is where I do my best work.",
      "leo@example.com|q_proud":
        "Built a design system from scratch that three squads now share.",
      "leo@example.com|q_tools": "Figma, Framer for prototypes, and Notion for documentation.",
      "mira@example.com|q_why": "I want to work somewhere design decisions are backed by real research.",
      "mira@example.com|q_proud":
        "Ran a generative research study that reshaped our checkout flow.",
      "mira@example.com|q_tools": "Figma, Maze for usability testing, and Miro for synthesis.",
    });
    await setPanel(c, open.id, [p1.id, p2.id, p3.id]);

    // --- CLOSED: same shape, plus ratings from all three panelists. ------
    const { data: closed, error: closedErr } = await c
      .from("evaluations")
      .insert({ name: "Frontend Engineer — Aug 2026", status: "closed", created_by: adminUser.id })
      .select()
      .single();
    if (closedErr || !closed) throw closedErr ?? new Error("closed insert failed");
    closedId = closed.id;

    const closedQuestions = await insertQuestions(c, closed.id, [
      ["q_why", "Why do you want this role?"],
      ["q_proud", "Describe a project you're proud of"],
      ["q_stack", "Which frontend stack do you know best?"],
    ]);
    const closedCandidates = await insertCandidates(c, closed.id, [
      ["noah@example.com", "Noah Kimani"],
      ["sara@example.com", "Sara Devi"],
      ["omar@example.com", "Omar Farah"],
    ]);
    await insertAnswers(c, closed.id, closedCandidates, closedQuestions, {
      "noah@example.com|q_why": "I want to build interfaces that hold up under real production load.",
      "noah@example.com|q_proud":
        "Rebuilt our checkout in React and cut time-to-interactive in half.",
      "noah@example.com|q_stack": "React, TypeScript, and Tailwind, with some Remix on the side.",
      "sara@example.com|q_why": "I care most about accessibility and want a team that shares that bar.",
      "sara@example.com|q_proud":
        "Shipped a fully keyboard-navigable data table used across five products.",
      "sara@example.com|q_stack": "Vue and TypeScript, plus a fair amount of vanilla web components.",
      "omar@example.com|q_why": "Frontend performance work is what gets me out of bed.",
      "omar@example.com|q_proud":
        "Cut our largest bundle by 40% through route-level code splitting.",
      "omar@example.com|q_stack": "React, Next.js, and a lot of time in the Chrome performance panel.",
    });
    await setPanel(c, closed.id, [p1.id, p2.id, p3.id]);

    // Scores chosen so overalls clearly differ: Sara > Noah > Omar.
    const scores: Record<string, number> = {
      "noah@example.com|q_why": 4,
      "noah@example.com|q_proud": 4,
      "noah@example.com|q_stack": 3,
      "sara@example.com|q_why": 5,
      "sara@example.com|q_proud": 5,
      "sara@example.com|q_stack": 4,
      "omar@example.com|q_why": 3,
      "omar@example.com|q_proud": 3,
      "omar@example.com|q_stack": 2,
    };
    const raters = [p1.id, p2.id, p3.id];
    const ratingRows: {
      evaluation_id: string;
      candidate_id: string;
      question_id: string;
      rater_id: string;
      score: number;
    }[] = [];
    for (const cand of closedCandidates) {
      for (const q of closedQuestions) {
        const base = scores[`${cand.email}|${q.column_key}`];
        raters.forEach((raterId, i) => {
          // Small per-rater jitter, clamped to 1..5, keeps averages close to
          // `base` while giving each rater a distinct value.
          const jitter = [0, 1, -1][i];
          const score = Math.min(5, Math.max(1, base + jitter));
          ratingRows.push({
            evaluation_id: closed.id,
            candidate_id: cand.id,
            question_id: q.id,
            rater_id: raterId,
            score,
          });
        });
      }
    }
    const { error: ratingsErr } = await c.from("evaluation_ratings").insert(ratingRows);
    if (ratingsErr) throw ratingsErr;
  });

  test("list (admin)", async ({ browser, baseURL }) => {
    if (!baseURL) throw new Error("baseURL not configured");
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    try {
      await signIn(ctx, "hiring-shot-admin@atlas.com", baseURL);
      const page = await ctx.newPage();
      await page.goto("/hiring");
      await expect(page.getByRole("heading", { name: "Hiring" })).toBeVisible();
      await expect(page.getByText("Backend Engineer — Sept 2026")).toBeVisible();
      await expect(page.getByText("Product Designer — Sept 2026")).toBeVisible();
      await expect(page.getByText("Frontend Engineer — Aug 2026")).toBeVisible();
      await page.screenshot({ path: "qa-screenshots/hiring/01-list.png", fullPage: true });
    } finally {
      await ctx.close();
    }
  });

  test("create form (admin)", async ({ browser, baseURL }) => {
    if (!baseURL) throw new Error("baseURL not configured");
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    try {
      await signIn(ctx, "hiring-shot-admin@atlas.com", baseURL);
      const page = await ctx.newPage();
      await page.goto("/hiring");
      await page.getByPlaceholder("Evaluation name").fill("Data Scientist — Oct 2026");
      await page.screenshot({ path: "qa-screenshots/hiring/02-create-form.png", fullPage: true });
    } finally {
      await ctx.close();
    }
  });

  test("draft detail — admin controls", async ({ browser, baseURL }) => {
    if (!baseURL) throw new Error("baseURL not configured");
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    try {
      await signIn(ctx, "hiring-shot-admin@atlas.com", baseURL);
      const page = await ctx.newPage();
      await page.goto(`/hiring/${draftId}`);
      await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
      await page.screenshot({
        path: "qa-screenshots/hiring/03-detail-draft-admin.png",
        fullPage: true,
      });
    } finally {
      await ctx.close();
    }
  });

  test("open detail — rating panel (panelist)", async ({ browser, baseURL }) => {
    if (!baseURL) throw new Error("baseURL not configured");
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    try {
      await signIn(ctx, "hiring-shot-p1@atlas.com", baseURL);
      const page = await ctx.newPage();
      await page.goto(`/hiring/${openId}`);
      await expect(page.getByText("Ada Nakamura")).toBeVisible();
      await expect(page.getByRole("button", { name: "1", exact: true }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "5", exact: true }).first()).toBeVisible();
      await page.screenshot({
        path: "qa-screenshots/hiring/04-detail-open-rating.png",
        fullPage: true,
      });
    } finally {
      await ctx.close();
    }
  });

  test("closed detail — results", async ({ browser, baseURL }) => {
    if (!baseURL) throw new Error("baseURL not configured");
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    try {
      await signIn(ctx, "hiring-shot-admin@atlas.com", baseURL);
      const page = await ctx.newPage();
      await page.goto(`/hiring/${closedId}`);
      await expect(page.getByText(/evaluators/)).toBeVisible();
      await expect(page.getByText(/#1/)).toBeVisible();
      await page.screenshot({
        path: "qa-screenshots/hiring/05-detail-closed-results.png",
        fullPage: true,
      });
    } finally {
      await ctx.close();
    }
  });
});

// --- seed helpers --------------------------------------------------------

type SupabaseAdmin = ReturnType<typeof admin>;

async function insertQuestions(
  c: SupabaseAdmin,
  evaluationId: string,
  rows: [string, string][],
) {
  const { data, error } = await c
    .from("evaluation_questions")
    .insert(
      rows.map(([column_key, prompt], position) => ({
        evaluation_id: evaluationId,
        column_key,
        prompt,
        position,
        is_active: true,
      })),
    )
    .select();
  if (error || !data) throw error ?? new Error("question insert failed");
  return data as { id: string; column_key: string }[];
}

async function insertCandidates(c: SupabaseAdmin, evaluationId: string, rows: [string, string][]) {
  const { data, error } = await c
    .from("evaluation_candidates")
    .insert(
      rows.map(([email, display_name]) => ({
        evaluation_id: evaluationId,
        email,
        display_name,
        is_active: true,
      })),
    )
    .select();
  if (error || !data) throw error ?? new Error("candidate insert failed");
  return data as { id: string; email: string; display_name: string }[];
}

async function insertAnswers(
  c: SupabaseAdmin,
  evaluationId: string,
  candidates: { id: string; email: string }[],
  questions: { id: string; column_key: string }[],
  answersByKey: Record<string, string>,
) {
  const rows = candidates.flatMap((cand) =>
    questions.map((q) => ({
      evaluation_id: evaluationId,
      candidate_id: cand.id,
      question_id: q.id,
      answer_text: answersByKey[`${cand.email}|${q.column_key}`] ?? "",
    })),
  );
  const { error } = await c.from("evaluation_answers").insert(rows);
  if (error) throw error;
}

async function setPanel(c: SupabaseAdmin, evaluationId: string, profileIds: string[]) {
  const { error } = await c
    .from("evaluation_panelists")
    .insert(profileIds.map((profile_id) => ({ evaluation_id: evaluationId, profile_id })));
  if (error) throw error;
}
