import { requireUser } from "@/lib/auth/require";
import { atlasServiceClient } from "@/lib/supabase/service";
import {
  computeEvaluatorBreakdown,
  computePersonalScores,
} from "@/lib/evaluation/aggregate";

export async function listEvaluations() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("evaluations")
    .select("id,name,status,last_synced_at")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export type PendingEvaluation = {
  id: string;
  name: string;
  candidatesRated: number;
  totalCandidates: number;
};

/**
 * Open evaluations where the current user is a panelist and still has rating
 * work to do — at least one active candidate isn't yet scored on every active,
 * visible question. Powers the home rail's Evaluations section, so it mirrors
 * the evaluate screen's "candidatesRated / candidates" completion rule.
 *
 * Returns only evaluations with outstanding work, newest first. Uses the
 * service client (like the rest of this module) so panelist/rating reads don't
 * depend on RLS; every query is explicitly scoped to the current user.
 */
export async function listPendingEvaluationsForViewer(): Promise<
  PendingEvaluation[]
> {
  const { user } = await requireUser();
  const svc = atlasServiceClient();

  const { data: panelRows } = await svc
    .from("evaluation_panelists")
    .select("evaluation_id")
    .eq("profile_id", user.id);
  const panelIds = (panelRows ?? []).map((r) => r.evaluation_id as string);
  if (panelIds.length === 0) return [];

  const { data: evalRows } = await svc
    .from("evaluations")
    .select("id,name,created_at")
    .in("id", panelIds)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  const evals = (evalRows ?? []) as {
    id: string;
    name: string;
    created_at: string;
  }[];
  if (evals.length === 0) return [];
  const ids = evals.map((e) => e.id);

  const [{ data: candRows }, { data: qRows }, { data: rateRows }] =
    await Promise.all([
      svc
        .from("evaluation_candidates")
        .select("id,evaluation_id")
        .in("evaluation_id", ids)
        .eq("is_active", true),
      svc
        .from("evaluation_questions")
        .select("id,evaluation_id")
        .in("evaluation_id", ids)
        .eq("is_active", true)
        .eq("is_hidden", false),
      svc
        .from("evaluation_ratings")
        .select("evaluation_id,candidate_id,question_id")
        .in("evaluation_id", ids)
        .eq("rater_id", user.id),
    ]);

  const candidatesByEval = new Map<string, string[]>();
  for (const c of (candRows ?? []) as {
    id: string;
    evaluation_id: string;
  }[]) {
    const arr = candidatesByEval.get(c.evaluation_id) ?? [];
    arr.push(c.id);
    candidatesByEval.set(c.evaluation_id, arr);
  }

  // The set of questions that actually count toward completion per evaluation.
  const activeQuestionsByEval = new Map<string, Set<string>>();
  for (const q of (qRows ?? []) as { id: string; evaluation_id: string }[]) {
    const set = activeQuestionsByEval.get(q.evaluation_id) ?? new Set<string>();
    set.add(q.id);
    activeQuestionsByEval.set(q.evaluation_id, set);
  }

  // Per (evaluation, candidate): which counting questions the user has scored.
  // Ratings for questions that are now inactive/hidden are ignored so they
  // can't mark a candidate "done".
  const ratedByEvalCandidate = new Map<string, Set<string>>();
  for (const r of (rateRows ?? []) as {
    evaluation_id: string;
    candidate_id: string;
    question_id: string;
  }[]) {
    const activeQ = activeQuestionsByEval.get(r.evaluation_id);
    if (!activeQ || !activeQ.has(r.question_id)) continue;
    const key = `${r.evaluation_id}:${r.candidate_id}`;
    const set = ratedByEvalCandidate.get(key) ?? new Set<string>();
    set.add(r.question_id);
    ratedByEvalCandidate.set(key, set);
  }

  const pending: PendingEvaluation[] = [];
  for (const e of evals) {
    const candidates = candidatesByEval.get(e.id) ?? [];
    const questionCount = activeQuestionsByEval.get(e.id)?.size ?? 0;
    // Nothing to rate yet (no candidates or no questions) isn't "pending".
    if (candidates.length === 0 || questionCount === 0) continue;

    const candidatesRated = candidates.filter((cid) => {
      const scored = ratedByEvalCandidate.get(`${e.id}:${cid}`);
      return scored !== undefined && scored.size >= questionCount;
    }).length;

    if (candidatesRated < candidates.length) {
      pending.push({
        id: e.id,
        name: e.name,
        candidatesRated,
        totalCandidates: candidates.length,
      });
    }
  }
  return pending;
}

export async function getEvaluationForViewer(id: string) {
  const { user, supabase } = await requireUser();
  const { data: ev } = await supabase
    .from("evaluations")
    .select(
      "id,name,status,sheet_id,mapping_confirmed,last_synced_at,aggregate_questions",
    )
    .eq("id", id)
    .single();
  if (!ev) return null;
  const aggregateQuestions = ev?.aggregate_questions ?? false;

  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = prof?.role === "admin";
  const { data: panelRow } = await supabase
    .from("evaluation_panelists")
    .select("profile_id")
    .eq("evaluation_id", id)
    .eq("profile_id", user.id)
    .maybeSingle();
  const isPanelist = !!panelRow;

  // Ownership — not admin role — grants management authority. Checked via the
  // service client so it's independent of the caller's RLS visibility.
  const svc = atlasServiceClient();
  const { data: ownerRow } = await svc
    .from("evaluation_owners")
    .select("profile_id")
    .eq("evaluation_id", id)
    .eq("profile_id", user.id)
    .maybeSingle();
  const isOwner = !!ownerRow;

  // Panelists/admins can read raw rows (RLS permits).
  let questions: { id: string; prompt: string; position: number }[] = [];
  let candidates: { id: string; display_name: string }[] = [];
  let answers: {
    candidate_id: string;
    question_id: string;
    answer_text: string | null;
  }[] = [];
  let personal: ReturnType<typeof computePersonalScores> = [];
  let myRatings: { candidateId: string; questionId: string; score: number }[] =
    [];
  if (isPanelist || isAdmin) {
    questions =
      (
        await supabase
          .from("evaluation_questions")
          .select("id,prompt,position")
          .eq("evaluation_id", id)
          .eq("is_active", true)
          .eq("is_hidden", false)
          .order("position")
      ).data ?? [];
    candidates =
      (
        await supabase
          .from("evaluation_candidates")
          .select("id,display_name")
          .eq("evaluation_id", id)
          .eq("is_active", true)
          .order("display_name")
      ).data ?? [];
    // Restrict to the already-filtered visible (non-hidden) questions so
    // hidden-question answer text never reaches the page payload.
    const qIds = questions.map((q) => q.id);
    answers = qIds.length
      ? ((
          await supabase
            .from("evaluation_answers")
            .select("candidate_id,question_id,answer_text")
            .eq("evaluation_id", id)
            .in("question_id", qIds)
        ).data ?? [])
      : [];
    if (isPanelist && ev.status === "open") {
      const my =
        (
          await supabase
            .from("evaluation_ratings")
            .select("candidate_id,question_id,score")
            .eq("evaluation_id", id)
        ).data ?? [];
      myRatings = my.map((r) => ({
        candidateId: r.candidate_id,
        questionId: r.question_id,
        score: r.score,
      }));
      personal = computePersonalScores(
        myRatings,
        candidates.map((c) => c.id),
        questions.map((q) => q.id),
        aggregateQuestions,
      );
    }
  }

  // Closed aggregate (everyone) via RPC.
  let results: unknown = null;
  if (ev.status === "closed") {
    results = (
      await supabase.rpc("evaluation_results", { p_evaluation_id: id })
    ).data;
  }

  // Owner/admin-only, closed-only: de-anonymized per-evaluator breakdown for the
  // results view. Deliberately bypasses the anonymized aggregate — read via the
  // service client because ratings_read_self RLS only exposes the caller's own
  // ratings. Withheld entirely from everyone else (empty map serialized as {}).
  let evaluatorBreakdown: Record<
    string,
    { name: string; overall: number; ratedCount: number }[]
  > = {};
  if (ev.status === "closed" && (isAdmin || isOwner)) {
    const activeCandIds = (
      (
        await svc
          .from("evaluation_candidates")
          .select("id")
          .eq("evaluation_id", id)
          .eq("is_active", true)
      ).data ?? []
    ).map((c) => c.id);
    const activeQIds = (
      (
        await svc
          .from("evaluation_questions")
          .select("id")
          .eq("evaluation_id", id)
          .eq("is_active", true)
          .eq("is_hidden", false)
      ).data ?? []
    ).map((q) => q.id);
    const ratingRows =
      (
        await svc
          .from("evaluation_ratings")
          .select("candidate_id,question_id,score,rater_id")
          .eq("evaluation_id", id)
      ).data ?? [];
    const raterIds = [...new Set(ratingRows.map((r) => r.rater_id))];
    const raterProfiles = raterIds.length
      ? ((
          await svc
            .from("profiles")
            .select("id,display_name")
            .in("id", raterIds)
        ).data ?? [])
      : [];
    const nameByRater = new Map(
      raterProfiles.map((p) => [p.id, p.display_name]),
    );
    const breakdown = computeEvaluatorBreakdown(
      ratingRows.map((r) => ({
        candidateId: r.candidate_id,
        questionId: r.question_id,
        raterId: r.rater_id,
        score: r.score,
      })),
      activeCandIds,
      activeQIds,
      aggregateQuestions,
    );
    for (const [candidateId, scores] of breakdown) {
      if (!scores.length) continue;
      evaluatorBreakdown[candidateId] = scores.map((s) => ({
        name: nameByRater.get(s.raterId) ?? "Unknown",
        overall: s.value,
        ratedCount: s.ratedCount,
      }));
    }
  }

  // Hidden fields become read-only context in closed results. Read via the
  // service client because answers_read RLS blocks non-admin panelists from
  // hidden-question answer text. Strictly gated to closed + panelist/admin.
  let contextFields: {
    questions: { question_id: string; prompt: string }[];
    answers: {
      candidate_id: string;
      question_id: string;
      answer_text: string | null;
    }[];
  } = { questions: [], answers: [] };
  if (ev.status === "closed" && (isPanelist || isAdmin)) {
    const hiddenQs =
      (
        await svc
          .from("evaluation_questions")
          .select("id,prompt,position")
          .eq("evaluation_id", id)
          .eq("is_active", true)
          .eq("is_hidden", true)
          .order("position")
      ).data ?? [];
    if (hiddenQs.length) {
      const hqIds = hiddenQs.map((q) => q.id);
      const hAns =
        (
          await svc
            .from("evaluation_answers")
            .select("candidate_id,question_id,answer_text")
            .eq("evaluation_id", id)
            .in("question_id", hqIds)
        ).data ?? [];
      contextFields = {
        questions: hiddenQs.map((q) => ({
          question_id: q.id,
          prompt: q.prompt,
        })),
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
  let fields: {
    id: string;
    column_key: string;
    prompt: string;
    position: number;
    is_active: boolean;
    is_hidden: boolean;
  }[] = [];
  let identityFields: {
    role: "email" | "name" | "timestamp";
    column: string;
  }[] = [];
  let hideNames = false;
  let preview: {
    candidates: { id: string; display_name: string }[];
    questions: { id: string; prompt: string; is_hidden: boolean }[];
    answers: {
      candidate_id: string;
      question_id: string;
      answer_text: string | null;
    }[];
  } | null = null;
  if (isOwner) {
    roster =
      (
        await svc
          .from("profiles")
          .select("id,display_name")
          .eq("is_active", true)
          .order("display_name")
      ).data ?? [];
    panel = (
      (
        await svc
          .from("evaluation_panelists")
          .select("profile_id")
          .eq("evaluation_id", id)
      ).data ?? []
    ).map((p) => p.profile_id);
    const ownerIds = (
      (
        await svc
          .from("evaluation_owners")
          .select("profile_id")
          .eq("evaluation_id", id)
      ).data ?? []
    ).map((o) => o.profile_id);
    const nameById = new Map(roster.map((r) => [r.id, r.display_name]));
    owners = ownerIds.map((oid) => ({
      id: oid,
      display_name: nameById.get(oid) ?? "Unknown",
    }));
    const evMeta = (
      await svc
        .from("evaluations")
        .select(
          "created_by,email_column,name_column,timestamp_column,hide_names",
        )
        .eq("id", id)
        .single()
    ).data;
    createdBy = evMeta?.created_by ?? null;
    hideNames = evMeta?.hide_names ?? false;
    // Identity columns from the sheet/CSV mapping, shown alongside questions so
    // the Fields tab reflects every imported column and its role.
    identityFields = [
      evMeta?.email_column && {
        role: "email" as const,
        column: evMeta.email_column,
      },
      evMeta?.name_column && {
        role: "name" as const,
        column: evMeta.name_column,
      },
      evMeta?.timestamp_column && {
        role: "timestamp" as const,
        column: evMeta.timestamp_column,
      },
    ].filter(Boolean) as {
      role: "email" | "name" | "timestamp";
      column: string;
    }[];
    const identityCols = new Set(identityFields.map((f) => f.column));
    // Dedup: a header that's also an identity column (email/name/timestamp)
    // must not double as a question row.
    fields = (
      (
        await svc
          .from("evaluation_questions")
          .select("id,column_key,prompt,position,is_active,is_hidden")
          .eq("evaluation_id", id)
          .order("position")
      ).data ?? []
    ).filter((q) => !identityCols.has(q.column_key));

    // Owner preview of imported data before opening: candidate list + answers,
    // no scores. Skipped once closed (the results view takes over).
    if (ev.status !== "closed") {
      const pCands =
        (
          await svc
            .from("evaluation_candidates")
            .select("id,display_name")
            .eq("evaluation_id", id)
            .eq("is_active", true)
            .order("display_name")
        ).data ?? [];
      const pQs =
        (
          await svc
            .from("evaluation_questions")
            .select("id,prompt,position,is_hidden")
            .eq("evaluation_id", id)
            .eq("is_active", true)
            .order("position")
        ).data ?? [];
      if (pCands.length && pQs.length) {
        const pqIds = pQs.map((q) => q.id);
        const pAns =
          (
            await svc
              .from("evaluation_answers")
              .select("candidate_id,question_id,answer_text")
              .eq("evaluation_id", id)
              .in("question_id", pqIds)
          ).data ?? [];
        preview = {
          candidates: pCands,
          questions: pQs.map((q) => ({
            id: q.id,
            prompt: q.prompt,
            is_hidden: q.is_hidden,
          })),
          answers: pAns,
        };
      }
    }
  }

  return {
    ev,
    isAdmin,
    isPanelist,
    isOwner,
    questions,
    candidates,
    answers,
    personal,
    myRatings,
    results,
    evaluatorBreakdown,
    roster,
    panel,
    owners,
    createdBy,
    fields,
    identityFields,
    hideNames,
    aggregateQuestions,
    preview,
    contextFields,
  };
}
