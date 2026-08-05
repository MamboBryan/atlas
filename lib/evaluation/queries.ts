import { requireUser } from "@/lib/auth/require";
import { atlasServiceClient } from "@/lib/supabase/service";
import { computeEvaluatorBreakdown, computePersonalScores } from "@/lib/evaluation/aggregate";

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

  // Ownership — not admin role — grants management authority. Checked via the
  // service client so it's independent of the caller's RLS visibility.
  const svc = atlasServiceClient();
  const { data: ownerRow } = await svc.from("evaluation_owners")
    .select("profile_id").eq("evaluation_id", id).eq("profile_id", user.id).maybeSingle();
  const isOwner = !!ownerRow;

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

  // Owner/admin-only, closed-only: de-anonymized per-evaluator breakdown for the
  // results view. Deliberately bypasses the anonymized aggregate — read via the
  // service client because ratings_read_self RLS only exposes the caller's own
  // ratings. Withheld entirely from everyone else (empty map serialized as {}).
  let evaluatorBreakdown: Record<string, { name: string; overall: number }[]> = {};
  if (ev.status === "closed" && (isAdmin || isOwner)) {
    const activeCandIds = ((await svc.from("evaluation_candidates")
      .select("id").eq("evaluation_id", id).eq("is_active", true)).data ?? [])
      .map((c) => c.id);
    const activeQIds = ((await svc.from("evaluation_questions")
      .select("id").eq("evaluation_id", id).eq("is_active", true).eq("is_hidden", false)).data ?? [])
      .map((q) => q.id);
    const ratingRows = (await svc.from("evaluation_ratings")
      .select("candidate_id,question_id,score,rater_id").eq("evaluation_id", id)).data ?? [];
    const raterIds = [...new Set(ratingRows.map((r) => r.rater_id))];
    const raterProfiles = raterIds.length
      ? (await svc.from("profiles").select("id,display_name").in("id", raterIds)).data ?? []
      : [];
    const nameByRater = new Map(raterProfiles.map((p) => [p.id, p.display_name]));
    const breakdown = computeEvaluatorBreakdown(
      ratingRows.map((r) => ({
        candidateId: r.candidate_id, questionId: r.question_id,
        raterId: r.rater_id, score: r.score,
      })),
      activeCandIds, activeQIds,
    );
    for (const [candidateId, scores] of breakdown) {
      if (!scores.length) continue;
      evaluatorBreakdown[candidateId] = scores.map((s) => ({
        name: nameByRater.get(s.raterId) ?? "Unknown", overall: s.average,
      }));
    }
  }

  // Hidden fields become read-only context in closed results. Read via the
  // service client because answers_read RLS blocks non-admin panelists from
  // hidden-question answer text. Strictly gated to closed + panelist/admin.
  let contextFields: {
    questions: { question_id: string; prompt: string }[];
    answers: { candidate_id: string; question_id: string; answer_text: string | null }[];
  } = { questions: [], answers: [] };
  if (ev.status === "closed" && (isPanelist || isAdmin)) {
    const hiddenQs = (await svc.from("evaluation_questions")
      .select("id,prompt,position").eq("evaluation_id", id)
      .eq("is_active", true).eq("is_hidden", true).order("position")).data ?? [];
    if (hiddenQs.length) {
      const hqIds = hiddenQs.map((q) => q.id);
      const hAns = (await svc.from("evaluation_answers")
        .select("candidate_id,question_id,answer_text")
        .eq("evaluation_id", id).in("question_id", hqIds)).data ?? [];
      contextFields = {
        questions: hiddenQs.map((q) => ({ question_id: q.id, prompt: q.prompt })),
        answers: hAns,
      };
    }
  }

  // Owner-only: roster for the panel/owner pickers, current panel & owners.
  // Fetched via the service client because a non-admin owner can't read the
  // full panelist/owner lists under RLS.
  let roster: { id: string; display_name: string }[] = [];
  let panel: string[] = [];
  let owners: { id: string; display_name: string }[] = [];
  let createdBy: string | null = null;
  let fields: { id: string; prompt: string; position: number; is_active: boolean; is_hidden: boolean }[] = [];
  if (isOwner) {
    roster = (await svc.from("profiles")
      .select("id,display_name").eq("is_active", true).order("display_name")).data ?? [];
    panel = ((await svc.from("evaluation_panelists")
      .select("profile_id").eq("evaluation_id", id)).data ?? []).map((p) => p.profile_id);
    const ownerIds = ((await svc.from("evaluation_owners")
      .select("profile_id").eq("evaluation_id", id)).data ?? []).map((o) => o.profile_id);
    const nameById = new Map(roster.map((r) => [r.id, r.display_name]));
    owners = ownerIds.map((oid) => ({ id: oid, display_name: nameById.get(oid) ?? "Unknown" }));
    createdBy = (await svc.from("evaluations")
      .select("created_by").eq("id", id).single()).data?.created_by ?? null;
    fields = (await svc.from("evaluation_questions")
      .select("id,prompt,position,is_active,is_hidden")
      .eq("evaluation_id", id).order("position")).data ?? [];
  }

  return {
    ev, isAdmin, isPanelist, isOwner, questions, candidates, answers,
    personal, myRatings, results, evaluatorBreakdown, roster, panel, owners, createdBy,
    fields, contextFields,
  };
}
