import { expect, test, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url =
  process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc =
  process.env.SUPABASE_TEST_SERVICE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const canRun = !!url && !!svc && !!anon;
const admin = canRun ? createClient(url!, svc!) : null;

async function userClient(email: string, role: "admin" | "member" = "member") {
  const { data } = await admin!.auth.admin.createUser({
    email,
    password: "passw0rd!",
    email_confirm: true,
  });
  await admin!.from("profiles").update({ role }).eq("id", data.user!.id); // pin role (first user would else be admin)
  const c = createClient(url!, anon!);
  await c.auth.signInWithPassword({ email, password: "passw0rd!" });
  return c;
}

beforeEach(async () => {
  if (!admin) return;
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data.users ?? []) await admin.auth.admin.deleteUser(u.id);
});

test.runIf(canRun)(
  "panelist rates; other panelist cannot read it; closed reveals aggregate",
  async () => {
    const c = admin!;
    const A = await userClient("hiring-rate-a@atlas.com");
    const B = await userClient("hiring-rate-b@atlas.com");
    const aId = (await A.auth.getUser()).data.user!.id;
    const bId = (await B.auth.getUser()).data.user!.id;

    const { data: ev } = await c
      .from("evaluations")
      .insert({ name: "T", status: "open", created_by: aId })
      .select("id")
      .single();
    const { data: q } = await c
      .from("evaluation_questions")
      .insert({
        evaluation_id: ev!.id,
        column_key: "Q1",
        prompt: "Q1",
        position: 0,
      })
      .select("id")
      .single();
    const { data: cand } = await c
      .from("evaluation_candidates")
      .insert({
        evaluation_id: ev!.id,
        email: "cand@x.com",
        display_name: "Cand",
      })
      .select("id")
      .single();
    await c.from("evaluation_panelists").insert([
      { evaluation_id: ev!.id, profile_id: aId },
      { evaluation_id: ev!.id, profile_id: bId },
    ]);

    // A rates 4 (own client, RLS).
    const insA = await A.from("evaluation_ratings").insert({
      evaluation_id: ev!.id,
      candidate_id: cand!.id,
      question_id: q!.id,
      rater_id: aId,
      score: 4,
    });
    expect(insA.error).toBeNull();

    // B cannot see A's rating.
    const bSees = await B.from("evaluation_ratings")
      .select("*")
      .eq("evaluation_id", ev!.id);
    expect(bSees.data).toEqual([]);

    // Below-floor results are suppressed even after close.
    await c.from("evaluations").update({ status: "closed" }).eq("id", ev!.id);
    const { data: res } = await A.rpc("evaluation_results", {
      p_evaluation_id: ev!.id,
    });
    expect(res.suppressed).toBe(true);
    expect(res.rater_bucket).toBe("<3");
  },
);

test.runIf(canRun)(
  "closed with >=3 raters reveals; single-rater cell suppressed to null",
  async () => {
    const c = admin!;
    const A = await userClient("hiring-rate-a@atlas.com");
    const B = await userClient("hiring-rate-b@atlas.com");
    const D = await userClient("hiring-rate-d@atlas.com");
    const ids = await Promise.all(
      [A, B, D].map(async (x) => (await x.auth.getUser()).data.user!.id),
    );
    const [aId] = ids;

    const { data: ev } = await c
      .from("evaluations")
      .insert({ name: "T", status: "open", created_by: aId })
      .select("id")
      .single();
    const { data: q1 } = await c
      .from("evaluation_questions")
      .insert({
        evaluation_id: ev!.id,
        column_key: "Q1",
        prompt: "Q1",
        position: 0,
      })
      .select("id")
      .single();
    const { data: q2 } = await c
      .from("evaluation_questions")
      .insert({
        evaluation_id: ev!.id,
        column_key: "Q2",
        prompt: "Q2",
        position: 1,
      })
      .select("id")
      .single();
    const { data: cand } = await c
      .from("evaluation_candidates")
      .insert({
        evaluation_id: ev!.id,
        email: "cand@x.com",
        display_name: "Cand",
      })
      .select("id")
      .single();
    await c
      .from("evaluation_panelists")
      .insert(ids.map((id) => ({ evaluation_id: ev!.id, profile_id: id })));

    // All 3 rate Q1 (cell qualifies); only A rates Q2 (cell must be suppressed).
    const clients = [A, B, D];
    for (let i = 0; i < 3; i++) {
      await clients[i].from("evaluation_ratings").insert({
        evaluation_id: ev!.id,
        candidate_id: cand!.id,
        question_id: q1!.id,
        rater_id: ids[i],
        score: i + 3, // 3,4,5 => avg 4
      });
    }
    await A.from("evaluation_ratings").insert({
      evaluation_id: ev!.id,
      candidate_id: cand!.id,
      question_id: q2!.id,
      rater_id: aId,
      score: 1,
    });

    await c.from("evaluations").update({ status: "closed" }).eq("id", ev!.id);
    const { data: res } = await A.rpc("evaluation_results", {
      p_evaluation_id: ev!.id,
    });
    expect(res.suppressed).toBe(false);
    expect(res.rater_count).toBe(3);
    const candOut = res.candidates[0];
    const q1cell = candOut.cells.find((x: any) => x.question_id === q1!.id);
    const q2cell = candOut.cells.find((x: any) => x.question_id === q2!.id);
    expect(Number(q1cell.avg)).toBe(4); // 3 raters => revealed
    expect(q2cell.avg).toBeNull(); // single-rater cell => suppressed
    // Since 0032, overall is the mean across evaluators who rated EVERY active
    // question — not a mean-of-means over qualifying cells. Only A rated both
    // Q1 and Q2, so one evaluator completed, which is below min_raters (3).
    expect(candOut.overall).toBeNull();
  },
);

test.runIf(canRun)(
  "aggregate_questions switches overall between mean-of-sums and mean-of-averages",
  async () => {
    const c = admin!;
    const A = await userClient("hiring-agg-a@atlas.com");
    const B = await userClient("hiring-agg-b@atlas.com");
    const D = await userClient("hiring-agg-d@atlas.com");
    const clients = [A, B, D];
    const ids = await Promise.all(
      clients.map(async (x) => (await x.auth.getUser()).data.user!.id),
    );

    const { data: ev } = await c
      .from("evaluations")
      .insert({ name: "Agg", status: "open", created_by: ids[0] })
      .select("id")
      .single();
    const questions = [];
    for (const [position, key] of [
      [0, "Q1"],
      [1, "Q2"],
    ] as const) {
      const { data: q } = await c
        .from("evaluation_questions")
        .insert({
          evaluation_id: ev!.id,
          column_key: key,
          prompt: key,
          position,
        })
        .select("id")
        .single();
      questions.push(q!.id);
    }
    const { data: cand } = await c
      .from("evaluation_candidates")
      .insert({
        evaluation_id: ev!.id,
        email: "agg-cand@x.com",
        display_name: "Agg Cand",
      })
      .select("id")
      .single();
    await c
      .from("evaluation_panelists")
      .insert(ids.map((id) => ({ evaluation_id: ev!.id, profile_id: id })));

    // Every rater answers EVERY question, so all three count as completed.
    // Q1 scores 3,4,5 and Q2 scores 1,2,3 give per-rater sums 4,6,8 (mean 6)
    // and per-rater averages 2,3,4 (mean 3) — two distinct, checkable numbers.
    for (let i = 0; i < 3; i++) {
      await clients[i].from("evaluation_ratings").insert([
        {
          evaluation_id: ev!.id,
          candidate_id: cand!.id,
          question_id: questions[0],
          rater_id: ids[i],
          score: i + 3,
        },
        {
          evaluation_id: ev!.id,
          candidate_id: cand!.id,
          question_id: questions[1],
          rater_id: ids[i],
          score: i + 1,
        },
      ]);
    }
    await c.from("evaluations").update({ status: "closed" }).eq("id", ev!.id);

    // OFF (default): mean of each completed evaluator's SUM.
    const { data: offRes } = await A.rpc("evaluation_results", {
      p_evaluation_id: ev!.id,
    });
    expect(offRes.suppressed).toBe(false);
    expect(Number(offRes.candidates[0].overall)).toBe(6);

    // ON: mean of each completed evaluator's AVERAGE.
    await c
      .from("evaluations")
      .update({ aggregate_questions: true })
      .eq("id", ev!.id);
    const { data: onRes } = await A.rpc("evaluation_results", {
      p_evaluation_id: ev!.id,
    });
    expect(Number(onRes.candidates[0].overall)).toBe(3);
  },
);

test.runIf(canRun)(
  "hidden question: answer text withheld from panelists via RLS; excluded from results",
  async () => {
    const c = admin!;
    const A = await userClient("hiring-rate-a@atlas.com");
    const B = await userClient("hiring-rate-b@atlas.com");
    const D = await userClient("hiring-rate-d@atlas.com");
    const ids = await Promise.all(
      [A, B, D].map(async (x) => (await x.auth.getUser()).data.user!.id),
    );

    const { data: ev } = await c
      .from("evaluations")
      .insert({ name: "T", status: "open", created_by: ids[0] })
      .select("id")
      .single();
    const { data: q1 } = await c
      .from("evaluation_questions")
      .insert({
        evaluation_id: ev!.id,
        column_key: "Q1",
        prompt: "Q1",
        position: 0,
        is_hidden: false,
      })
      .select("id")
      .single();
    const { data: qHidden } = await c
      .from("evaluation_questions")
      .insert({
        evaluation_id: ev!.id,
        column_key: "Full Name",
        prompt: "Full Name",
        position: 1,
        is_hidden: true,
      })
      .select("id")
      .single();
    const { data: cand } = await c
      .from("evaluation_candidates")
      .insert({
        evaluation_id: ev!.id,
        email: "cand-hidden@x.com",
        display_name: "Candidate 1",
      })
      .select("id")
      .single();
    await c
      .from("evaluation_panelists")
      .insert(ids.map((id) => ({ evaluation_id: ev!.id, profile_id: id })));

    // Seed answers on both the visible and hidden question (as syncEvaluation would).
    await c.from("evaluation_answers").insert([
      {
        evaluation_id: ev!.id,
        candidate_id: cand!.id,
        question_id: q1!.id,
        answer_text: "visible answer",
      },
      {
        evaluation_id: ev!.id,
        candidate_id: cand!.id,
        question_id: qHidden!.id,
        answer_text: "Real Name",
      },
    ]);

    // All 3 rate both questions (>=3 raters on each) — the hidden one must still be
    // excluded from the floor count and the per-cell output.
    const clients = [A, B, D];
    for (let i = 0; i < 3; i++) {
      await clients[i].from("evaluation_ratings").insert({
        evaluation_id: ev!.id,
        candidate_id: cand!.id,
        question_id: q1!.id,
        rater_id: ids[i],
        score: i + 3,
      });
      await clients[i].from("evaluation_ratings").insert({
        evaluation_id: ev!.id,
        candidate_id: cand!.id,
        question_id: qHidden!.id,
        rater_id: ids[i],
        score: 1,
      });
    }

    // (i) RLS: a panelist cannot read the hidden question's answer text directly,
    //     but can still read the visible one.
    const hiddenRead = await A.from("evaluation_answers")
      .select("answer_text")
      .eq("question_id", qHidden!.id);
    expect(hiddenRead.data).toEqual([]);
    const visibleRead = await A.from("evaluation_answers")
      .select("answer_text")
      .eq("question_id", q1!.id);
    expect(visibleRead.data).toEqual([{ answer_text: "visible answer" }]);

    // (ii) evaluation_results has no cell for the hidden question.
    await c.from("evaluations").update({ status: "closed" }).eq("id", ev!.id);
    const { data: res } = await A.rpc("evaluation_results", {
      p_evaluation_id: ev!.id,
    });
    expect(res.suppressed).toBe(false);
    const candOut = res.candidates[0];
    expect(candOut.cells.some((x: any) => x.question_id === qHidden!.id)).toBe(
      false,
    );
    expect(candOut.cells.some((x: any) => x.question_id === q1!.id)).toBe(true);
  },
);
