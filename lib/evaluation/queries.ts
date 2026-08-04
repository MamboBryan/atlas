import { requireUser } from "@/lib/auth/require";
import { computePersonalScores } from "@/lib/evaluation/aggregate";

export async function listEvaluations() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("evaluations")
    .select("id,name,status,last_synced_at").order("created_at", { ascending: false });
  return data ?? [];
}

export async function getEvaluationForViewer(id: string) {
  const { user, supabase } = await requireUser();
  const { data: ev } = await supabase.from("evaluations")
    .select("id,name,status,sheet_id,mapping_confirmed,last_synced_at").eq("id", id).single();
  if (!ev) return null;

  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isAdmin = prof?.role === "admin";
  const { data: panelRow } = await supabase.from("evaluation_panelists")
    .select("profile_id").eq("evaluation_id", id).eq("profile_id", user.id).maybeSingle();
  const isPanelist = !!panelRow;

  // Panelists/admins can read raw rows (RLS permits).
  let questions: { id: string; prompt: string; position: number }[] = [];
  let candidates: { id: string; display_name: string }[] = [];
  let answers: { candidate_id: string; question_id: string; answer_text: string | null }[] = [];
  let personal: ReturnType<typeof computePersonalScores> = [];
  let myRatings: { candidateId: string; questionId: string; score: number }[] = [];
  if (isPanelist || isAdmin) {
    questions = (await supabase.from("evaluation_questions")
      .select("id,prompt,position").eq("evaluation_id", id).eq("is_active", true)
      .eq("is_hidden", false)
      .order("position")).data ?? [];
    candidates = (await supabase.from("evaluation_candidates")
      .select("id,display_name").eq("evaluation_id", id).eq("is_active", true)
      .order("display_name")).data ?? [];
    // Restrict to the already-filtered visible (non-hidden) questions so
    // hidden-question answer text never reaches the page payload.
    const qIds = questions.map((q) => q.id);
    answers = qIds.length
      ? (await supabase.from("evaluation_answers")
          .select("candidate_id,question_id,answer_text")
          .eq("evaluation_id", id).in("question_id", qIds)).data ?? []
      : [];
    if (isPanelist && ev.status === "open") {
      const my = (await supabase.from("evaluation_ratings")
        .select("candidate_id,question_id,score").eq("evaluation_id", id)).data ?? [];
      myRatings = my.map((r) => ({
        candidateId: r.candidate_id, questionId: r.question_id, score: r.score,
      }));
      personal = computePersonalScores(
        myRatings, candidates.map((c) => c.id), questions.map((q) => q.id),
      );
    }
  }

  // Closed aggregate (everyone) via RPC.
  let results: unknown = null;
  if (ev.status === "closed") {
    results = (await supabase.rpc("evaluation_results", { p_evaluation_id: id })).data;
  }

  // Admin-only: roster for the panel selector + current panel membership.
  let roster: { id: string; display_name: string }[] = [];
  let panel: string[] = [];
  if (isAdmin) {
    roster = (await supabase.from("profiles")
      .select("id,display_name").eq("is_active", true).order("display_name")).data ?? [];
    panel = ((await supabase.from("evaluation_panelists")
      .select("profile_id").eq("evaluation_id", id)).data ?? []).map((p) => p.profile_id);
  }

  return { ev, isAdmin, isPanelist, questions, candidates, answers, personal, myRatings, results, roster, panel };
}
