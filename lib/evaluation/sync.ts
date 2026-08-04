import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeRows } from "@/lib/sheets/parse";
import type { SheetGrid, ImportSummary } from "@/lib/sheets/types";

type Mapping = {
  emailColumn: string; nameColumn: string | null;
  timestampColumn: string | null; questionColumns: string[];
  hiddenColumns?: string[]; hideNames?: boolean;
};

const CANDIDATE_LABEL_RE = /^Candidate (\d+)$/;

export async function syncEvaluation(
  svc: SupabaseClient, evaluationId: string, grid: SheetGrid, mapping: Mapping,
): Promise<ImportSummary & { candidatesDeactivated: number; questionsDeactivated: number }> {
  const hiddenColumns = mapping.hiddenColumns ?? [];
  const hideNames = mapping.hideNames ?? false;
  const allColumns = [...mapping.questionColumns, ...hiddenColumns];
  const hiddenSet = new Set(hiddenColumns);

  const { candidates, summary } = normalizeRows(grid, {
    emailColumn: mapping.emailColumn,
    nameColumn: hideNames ? null : mapping.nameColumn,
    timestampColumn: mapping.timestampColumn,
    questionColumns: allColumns,
  });

  // 1. Questions: upsert active set (shown + hidden), then deactivate any not
  //    in the mapping (fetch-then-deactivate-by-id — same shape as candidates
  //    below; no string-interpolated `.in()` filters).
  const qRows = allColumns.map((column_key, position) => ({
    evaluation_id: evaluationId, column_key, prompt: column_key, position,
    is_active: true, is_hidden: hiddenSet.has(column_key),
  }));
  if (qRows.length)
    await svc.from("evaluation_questions").upsert(qRows, { onConflict: "evaluation_id,column_key" });
  const { data: allQs } = await svc.from("evaluation_questions")
    .select("id,column_key,is_active").eq("evaluation_id", evaluationId);
  const keepKeys = new Set(allColumns);
  const qToDeactivate = (allQs ?? []).filter((q) => !keepKeys.has(q.column_key) && q.is_active);
  if (qToDeactivate.length)
    await svc.from("evaluation_questions").update({ is_active: false })
      .in("id", qToDeactivate.map((q) => q.id));
  const qByKey = new Map((allQs ?? []).map((q) => [q.column_key, q.id]));
  const questionsDeactivated = qToDeactivate.length;

  // 2. Candidates: upsert active set, deactivate absent. When hideNames, assign
  //    stable anonymous "Candidate N" labels instead of the sheet/CSV name.
  let candidatesForUpsert = candidates;
  if (hideNames) {
    const { data: existing } = await svc.from("evaluation_candidates")
      .select("email,display_name").eq("evaluation_id", evaluationId);
    const existingByEmail = new Map((existing ?? []).map((c) => [c.email, c.display_name]));
    let maxN = 0;
    for (const c of existing ?? []) {
      const m = CANDIDATE_LABEL_RE.exec(c.display_name);
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    }
    candidatesForUpsert = candidates.map((c) => {
      const existingName = existingByEmail.get(c.email);
      const m = existingName ? CANDIDATE_LABEL_RE.exec(existingName) : null;
      const label = m ? existingName! : `Candidate ${++maxN}`;
      return { ...c, displayName: label };
    });
  }

  const emails = candidatesForUpsert.map((c) => c.email);
  const candRows = candidatesForUpsert.map((c) => ({
    evaluation_id: evaluationId, email: c.email, display_name: c.displayName,
    submitted_at: c.submittedAt, is_active: true,
  }));
  if (candRows.length)
    await svc.from("evaluation_candidates").upsert(candRows, { onConflict: "evaluation_id,email" });
  const { data: beforeActive } = await svc.from("evaluation_candidates")
    .select("id,email").eq("evaluation_id", evaluationId).eq("is_active", true);
  const toDeactivate = (beforeActive ?? []).filter((c) => !emails.includes(c.email));
  if (toDeactivate.length)
    await svc.from("evaluation_candidates").update({ is_active: false })
      .in("id", toDeactivate.map((c) => c.id));

  const { data: cands } = await svc.from("evaluation_candidates")
    .select("id,email").eq("evaluation_id", evaluationId);
  const cByEmail = new Map((cands ?? []).map((c) => [c.email, c.id]));

  // 3. Answers: upsert (candidate,question) for all imported columns (shown + hidden).
  const answerRows: { evaluation_id: string; candidate_id: string; question_id: string; answer_text: string }[] = [];
  for (const c of candidatesForUpsert) {
    const candidateId = cByEmail.get(c.email);
    if (!candidateId) continue;
    for (const a of c.answers) {
      const questionId = qByKey.get(a.columnKey);
      if (!questionId) continue;
      answerRows.push({ evaluation_id: evaluationId, candidate_id: candidateId, question_id: questionId, answer_text: a.text });
    }
  }
  if (answerRows.length)
    await svc.from("evaluation_answers").upsert(answerRows, { onConflict: "candidate_id,question_id" });

  await svc.from("evaluations").update({ last_synced_at: new Date().toISOString() }).eq("id", evaluationId);

  return { ...summary, candidatesDeactivated: toDeactivate.length, questionsDeactivated: Math.max(0, questionsDeactivated) };
}
