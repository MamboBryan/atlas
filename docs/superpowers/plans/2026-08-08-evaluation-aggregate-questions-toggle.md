# Evaluation Aggregate-Questions Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-evaluation "Aggregate questions" toggle that switches the closed-evaluation candidate score between a summed-total model (default) and an averaged model, computed as the mean across only fully-completed evaluators.

**Architecture:** The authoritative closed score is compute-on-read in the `evaluation_results` Postgres RPC — recreate it to read a new `evaluations.aggregate_questions` flag and compute `overall` from each evaluator's total (sum) or average, counting only evaluators who rated every active question. Mirror the same sum/avg switch in the TS preview/breakdown helpers, add a locked-once-closed toggle in the Manage panel, and fix the evaluator-badge color clamp that assumed a 1–5 scale.

**Tech Stack:** Next.js (App Router, server actions), TypeScript, Supabase/Postgres (plpgsql, SQL migrations), Zod, Vitest.

## Global Constraints

- Package manager is **pnpm**. Commands: `pnpm test` (vitest), `pnpm typecheck` (`tsc --noEmit`), `pnpm lint` (`next lint`), `pnpm supabase ...` (Supabase CLI, `--workdir db`).
- Work on branch `feat/evaluation-aggregate-toggle` (already created).
- **No `Co-Authored-By: Claude` trailer and no Claude-branding lines** in any commit message. Commit messages describe the change only.
- Column: `public.evaluations.aggregate_questions boolean not null default false`.
- **OFF (false, default)** = evaluator value is the **sum** of their per-question scores. **ON (true)** = the **average**.
- Candidate `overall` = mean of evaluator values across **only** evaluators who rated **every active, non-hidden question** for that candidate.
- Privacy floor: reveal `overall` only when completed-evaluator count `>= evaluation_min_raters()`, else `null`.
- Toggle is **locked once `status = 'closed'`** (UI-disabled AND server-rejected).
- Existing evaluations auto-adopt the new model at OFF; **no backfill**.
- Migrations are append-only, numbered files in `db/supabase/migrations/`. Next number is `0031`.
- Spec: `docs/superpowers/specs/2026-08-08-evaluation-aggregate-questions-toggle-design.md`.

---

## File Structure

- **Create** `db/supabase/migrations/0031_evaluation_aggregate_questions.sql` — column add + `evaluation_results` recreate.
- **Modify** `lib/evaluation/aggregate.ts` — add `aggregateQuestions` param to both functions; rename field `average → value`.
- **Modify** `tests/evaluation/aggregate.test.ts` — update existing tests to new signature/field; add sum-mode + partial-rater cases.
- **Modify** `lib/zod/evaluation.ts` — add `setAggregateQuestionsInput`.
- **Modify** `lib/actions/evaluation.ts` — add `setAggregateQuestionsAction`.
- **Modify** `lib/evaluation/queries.ts` — select `aggregate_questions`, thread into both aggregate calls, add `ratedCount` to the breakdown payload, return `aggregateQuestions`.
- **Modify** `app/(app)/hiring/[id]/_ui/rank-list.tsx` — `.average → .value`.
- **Modify** `app/(app)/hiring/[id]/_ui/results-view.tsx` — color evaluator badge by average (`overall / ratedCount`), not raw sum.
- **Modify** `app/(app)/hiring/[id]/_ui/admin-controls.tsx` — Manage-tab toggle wired to the new action.
- **Modify** `app/(app)/hiring/[id]/page.tsx` — pass `aggregateQuestions` into `AdminControls`.

---

## Task 1: TS aggregation — sum/avg switch + field rename

**Files:**
- Modify: `lib/evaluation/aggregate.ts`
- Test: `tests/evaluation/aggregate.test.ts`

**Interfaces:**
- Produces:
  - `computePersonalScores(rows: RatingRow[], activeCandidateIds: string[], activeQuestionIds: string[], aggregateQuestions: boolean): PersonalScore[]`
  - `computeEvaluatorBreakdown(rows: RaterRatingRow[], activeCandidateIds: string[], activeQuestionIds: string[], aggregateQuestions: boolean): Map<string, EvaluatorScore[]>`
  - `PersonalScore = { candidateId: string; value: number | null; ratedCount: number }`
  - `EvaluatorScore = { raterId: string; value: number; ratedCount: number }`
  - Value semantics: `aggregateQuestions ? mean(scores) : sum(scores)`, rounded to 2dp; `mean`/`sum` over the rater's scores on active questions. `PersonalScore.value` is `null` when `ratedCount === 0`.

- [ ] **Step 1: Update the existing tests to the new signature and field, and add sum-mode + partial cases**

Replace the entire contents of `tests/evaluation/aggregate.test.ts` with:

```ts
import { expect, test } from "vitest";
import {
  computeEvaluatorBreakdown,
  computePersonalScores,
} from "@/lib/evaluation/aggregate";

test("ON (average): mean over rated active questions, sorted desc", () => {
  const rows = [
    { candidateId: "c1", questionId: "q1", score: 4 },
    { candidateId: "c1", questionId: "q2", score: 2 }, // c1 mean = 3
    { candidateId: "c2", questionId: "q1", score: 5 }, // c2 mean = 5
  ];
  const out = computePersonalScores(rows, ["c1", "c2", "c3"], ["q1", "q2"], true);
  expect(out).toEqual([
    { candidateId: "c2", value: 5, ratedCount: 1 },
    { candidateId: "c1", value: 3, ratedCount: 2 },
    { candidateId: "c3", value: null, ratedCount: 0 },
  ]);
});

test("OFF (sum): total over rated active questions", () => {
  const rows = [
    { candidateId: "c1", questionId: "q1", score: 5 },
    { candidateId: "c1", questionId: "q2", score: 5 },
    { candidateId: "c1", questionId: "q3", score: 5 },
    { candidateId: "c1", questionId: "q4", score: 5 },
    { candidateId: "c1", questionId: "q5", score: 5 }, // sum = 25
  ];
  const out = computePersonalScores(
    rows,
    ["c1"],
    ["q1", "q2", "q3", "q4", "q5"],
    false,
  );
  expect(out).toEqual([{ candidateId: "c1", value: 25, ratedCount: 5 }]);
});

test("ignores ratings for inactive candidates/questions", () => {
  const rows = [
    { candidateId: "c1", questionId: "qDead", score: 1 },
    { candidateId: "cDead", questionId: "q1", score: 1 },
  ];
  const out = computePersonalScores(rows, ["c1"], ["q1"], false);
  expect(out).toEqual([{ candidateId: "c1", value: null, ratedCount: 0 }]);
});

test("breakdown ON (average): per-rater mean per candidate, sorted desc", () => {
  const rows = [
    { candidateId: "c1", questionId: "q1", raterId: "r1", score: 5 },
    { candidateId: "c1", questionId: "q2", raterId: "r1", score: 4 }, // r1 -> 4.5
    { candidateId: "c1", questionId: "q1", raterId: "r2", score: 3 }, // r2 -> 3
  ];
  const out = computeEvaluatorBreakdown(rows, ["c1", "c2"], ["q1", "q2"], true);
  expect(out.get("c1")).toEqual([
    { raterId: "r1", value: 4.5, ratedCount: 2 },
    { raterId: "r2", value: 3, ratedCount: 1 },
  ]);
  expect(out.get("c2")).toEqual([]);
});

test("breakdown OFF (sum): per-rater total, includes partial raters", () => {
  const rows = [
    { candidateId: "c1", questionId: "q1", raterId: "r1", score: 5 },
    { candidateId: "c1", questionId: "q2", raterId: "r1", score: 5 }, // r1 sum = 10
    { candidateId: "c1", questionId: "q1", raterId: "r2", score: 4 }, // r2 partial sum = 4
  ];
  const out = computeEvaluatorBreakdown(rows, ["c1"], ["q1", "q2"], false);
  expect(out.get("c1")).toEqual([
    { raterId: "r1", value: 10, ratedCount: 2 },
    { raterId: "r2", value: 4, ratedCount: 1 },
  ]);
});

test("breakdown ignores inactive candidates/questions", () => {
  const rows = [
    { candidateId: "c1", questionId: "qHidden", raterId: "r1", score: 1 },
    { candidateId: "cDead", questionId: "q1", raterId: "r1", score: 1 },
  ];
  const out = computeEvaluatorBreakdown(rows, ["c1"], ["q1"], false);
  expect(out.get("c1")).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/evaluation/aggregate.test.ts`
Expected: FAIL — the functions take 3 args and return `average`, so calls with a 4th arg return objects with `average` (not `value`).

- [ ] **Step 3: Implement the sum/avg switch and field rename**

Replace the entire contents of `lib/evaluation/aggregate.ts` with:

```ts
export type RatingRow = {
  candidateId: string;
  questionId: string;
  score: number;
};
export type PersonalScore = {
  candidateId: string;
  value: number | null;
  ratedCount: number;
};

export type RaterRatingRow = RatingRow & { raterId: string };
export type EvaluatorScore = {
  raterId: string;
  value: number;
  ratedCount: number;
};

// value = sum of scores (aggregateQuestions=false) or mean (true), 2dp.
function collapse(scores: number[], aggregateQuestions: boolean): number {
  const total = scores.reduce((a, b) => a + b, 0);
  const raw = aggregateQuestions ? total / scores.length : total;
  return Math.round(raw * 100) / 100;
}

export function computePersonalScores(
  rows: RatingRow[],
  activeCandidateIds: string[],
  activeQuestionIds: string[],
  aggregateQuestions: boolean,
): PersonalScore[] {
  const activeQ = new Set(activeQuestionIds);
  const activeC = new Set(activeCandidateIds);
  const byCandidate = new Map<string, number[]>();
  for (const c of activeCandidateIds) byCandidate.set(c, []);
  for (const r of rows) {
    if (!activeC.has(r.candidateId) || !activeQ.has(r.questionId)) continue;
    byCandidate.get(r.candidateId)!.push(r.score);
  }
  const out: PersonalScore[] = activeCandidateIds.map((candidateId) => {
    const scores = byCandidate.get(candidateId)!;
    const value = scores.length ? collapse(scores, aggregateQuestions) : null;
    return { candidateId, value, ratedCount: scores.length };
  });
  out.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  return out;
}

/**
 * Per-candidate breakdown of each evaluator's own value across the active
 * (non-hidden) questions they scored. Owner/admin-only, closed-evaluation view —
 * this deliberately de-anonymizes the aggregate, so no small-panel suppression
 * is applied here (that gate lives at the query/RPC layer). Value is a sum
 * (aggregateQuestions=false) or a 2dp mean (true). Partial raters are included
 * (diagnostic view); the RPC overall separately counts only completed raters.
 * Evaluators are sorted highest-first per candidate; candidates with no ratings
 * map to an empty array.
 */
export function computeEvaluatorBreakdown(
  rows: RaterRatingRow[],
  activeCandidateIds: string[],
  activeQuestionIds: string[],
  aggregateQuestions: boolean,
): Map<string, EvaluatorScore[]> {
  const activeQ = new Set(activeQuestionIds);
  const activeC = new Set(activeCandidateIds);
  // candidateId|raterId -> scores
  const groups = new Map<string, number[]>();
  for (const r of rows) {
    if (!activeC.has(r.candidateId) || !activeQ.has(r.questionId)) continue;
    const key = `${r.candidateId}|${r.raterId}`;
    let scores = groups.get(key);
    if (!scores) groups.set(key, (scores = []));
    scores.push(r.score);
  }
  const byCandidate = new Map<string, EvaluatorScore[]>();
  for (const c of activeCandidateIds) byCandidate.set(c, []);
  for (const [key, scores] of groups) {
    const [candidateId, raterId] = key.split("|");
    byCandidate
      .get(candidateId)!
      .push({
        raterId,
        value: collapse(scores, aggregateQuestions),
        ratedCount: scores.length,
      });
  }
  for (const list of byCandidate.values()) {
    list.sort((a, b) => b.value - a.value);
  }
  return byCandidate;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/evaluation/aggregate.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/evaluation/aggregate.ts tests/evaluation/aggregate.test.ts
git commit -m "feat(evaluation): sum/avg switch in aggregate helpers

Add aggregateQuestions param to computePersonalScores and
computeEvaluatorBreakdown; value is a per-rater sum (off) or mean (on).
Rename the mode-dependent field from average to value."
```

---

## Task 2: Migration — column + recreate evaluation_results RPC

**Files:**
- Create: `db/supabase/migrations/0031_evaluation_aggregate_questions.sql`

**Interfaces:**
- Consumes: existing `public.evaluation_min_raters()`, `public.evaluations`, `public.evaluation_ratings`, `public.evaluation_candidates`, `public.evaluation_questions`.
- Produces: `public.evaluations.aggregate_questions boolean not null default false`; recreated `public.evaluation_results(uuid)` whose candidate `overall` follows the new model. Return JSON shape is byte-for-byte the same keys as `0030`.

- [ ] **Step 1: Write the migration**

Create `db/supabase/migrations/0031_evaluation_aggregate_questions.sql` with:

```sql
-- Per-evaluation "aggregate questions" toggle.
-- OFF (default): candidate overall = mean of each evaluator's SUM of scores.
-- ON: mean of each evaluator's AVERAGE. Both count only evaluators who rated
-- every active, non-hidden question for the candidate; reveal only when that
-- completed-evaluator count >= evaluation_min_raters(), else null.

alter table public.evaluations
  add column aggregate_questions boolean not null default false;

-- Recreate evaluation_results: identical to 0030 except the candidate overall
-- is now the mean across completed evaluators of their sum/avg. Per-question
-- cells are unchanged.
create or replace function public.evaluation_results(p_evaluation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_status    public.evaluation_status;
  v_min       int := public.evaluation_min_raters();
  v_raters    int;
  v_aggregate boolean;
  v_active_q  int;
  v_result    jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('status','forbidden','suppressed',true,
      'rater_count',null,'rater_bucket','<' || v_min,'candidates','[]'::jsonb);
  end if;

  select status, aggregate_questions into v_status, v_aggregate
  from public.evaluations where id = p_evaluation_id;
  if v_status is null then
    return jsonb_build_object('status','not_found','suppressed',true,
      'rater_count',null,'rater_bucket','<' || v_min,'candidates','[]'::jsonb);
  end if;

  if v_status = 'draft' and not public.atlas_is_admin(auth.uid()) then
    return jsonb_build_object('status','not_found','suppressed',true,
      'rater_count',null,'rater_bucket','<' || v_min,'candidates','[]'::jsonb);
  end if;

  if v_status <> 'closed' then
    return jsonb_build_object('status',v_status,'suppressed',true,
      'rater_count',null,'rater_bucket','<' || v_min,'candidates','[]'::jsonb);
  end if;

  -- Evaluation-level floor: distinct raters over active cells.
  select count(distinct r.rater_id) into v_raters
  from public.evaluation_ratings r
  join public.evaluation_candidates c on c.id = r.candidate_id and c.is_active
  join public.evaluation_questions q on q.id = r.question_id and q.is_active and q.is_hidden = false
  where r.evaluation_id = p_evaluation_id;

  if coalesce(v_raters,0) < v_min then
    return jsonb_build_object('status','closed','suppressed',true,
      'rater_count',null,'rater_bucket','<' || v_min,'candidates','[]'::jsonb);
  end if;

  -- Active, non-hidden question count for the "rated every question" test.
  select count(*) into v_active_q
  from public.evaluation_questions q
  where q.evaluation_id = p_evaluation_id and q.is_active and q.is_hidden = false;

  with cell as (
    select c.id as candidate_id, c.display_name, q.id as question_id, q.prompt,
           q.position,
           count(distinct r.rater_id) as cell_raters,
           avg(r.score)::numeric as cell_avg
    from public.evaluation_candidates c
    cross join public.evaluation_questions q
    left join public.evaluation_ratings r
      on r.candidate_id = c.id and r.question_id = q.id
     and r.evaluation_id = p_evaluation_id
    where c.evaluation_id = p_evaluation_id and c.is_active
      and q.evaluation_id = p_evaluation_id and q.is_active and q.is_hidden = false
    group by c.id, c.display_name, q.id, q.prompt, q.position
  ),
  qualified as (
    select candidate_id, display_name, question_id, prompt, position,
           case when cell_raters >= v_min then round(cell_avg,2) end as avg
    from cell
  ),
  rater_totals as (
    select r.candidate_id, r.rater_id,
           count(*)              as rated_q,
           sum(r.score)::numeric as rater_sum,
           avg(r.score)::numeric as rater_avg
    from public.evaluation_ratings r
    join public.evaluation_candidates c
      on c.id = r.candidate_id and c.is_active
    join public.evaluation_questions q
      on q.id = r.question_id and q.is_active and q.is_hidden = false
     and q.evaluation_id = p_evaluation_id
    where r.evaluation_id = p_evaluation_id
    group by r.candidate_id, r.rater_id
  ),
  completed as (
    select candidate_id, rater_id,
           case when v_aggregate then rater_avg else rater_sum end as value
    from rater_totals
    where v_active_q > 0 and rated_q = v_active_q
  ),
  candidate_overall as (
    select c.id as candidate_id, c.display_name,
           count(cr.rater_id) as complete_raters,
           avg(cr.value)      as overall_raw
    from public.evaluation_candidates c
    left join completed cr on cr.candidate_id = c.id
    where c.evaluation_id = p_evaluation_id and c.is_active
    group by c.id, c.display_name
  ),
  ranked as (
    select candidate_id, display_name,
           case when complete_raters >= v_min then round(overall_raw, 2) end as overall
    from candidate_overall
  ),
  ranked2 as (
    select candidate_id, display_name, overall,
           rank() over (order by overall desc nulls last, display_name) as rank
    from ranked
  )
  select jsonb_build_object(
    'status','closed','suppressed',false,
    'rater_count',v_raters,'rater_bucket',v_raters::text,
    'candidates', coalesce(jsonb_agg(
       jsonb_build_object(
         'candidate_id', rk.candidate_id,
         'display_name', rk.display_name,
         'overall', rk.overall,
         'rank', rk.rank,
         'cells', (select jsonb_agg(jsonb_build_object(
                     'question_id', ql.question_id,
                     'prompt', ql.prompt,
                     'avg', ql.avg) order by ql.position)
                   from qualified ql where ql.candidate_id = rk.candidate_id)
       ) order by rk.rank), '[]'::jsonb)
  ) into v_result
  from ranked2 rk;

  return v_result;
end $$;

revoke all on function public.evaluation_results(uuid) from public;
grant execute on function public.evaluation_results(uuid) to authenticated;
```

- [ ] **Step 2: Apply migrations locally and confirm the file loads without SQL errors**

Run: `pnpm supabase db reset`
Expected: reset completes; `0031_evaluation_aggregate_questions.sql` applies with no error. (If a local Supabase stack isn't running, start it first with `pnpm supabase start`.)

- [ ] **Step 3: Manually verify the new math against a seeded closed evaluation**

Run the local SQL below (via `pnpm supabase db reset` seed data, or the Studio SQL editor / `psql` against the local DB). With a closed evaluation whose min_raters is met:
- OFF (`aggregate_questions=false`): a candidate rated `5,5,5,5,5` by one completed evaluator returns `overall = 25` (when min_raters = 1) — or `null` when fewer than `evaluation_min_raters()` completed evaluators.
- ON (`update public.evaluations set aggregate_questions=true where id=...`): the same candidate returns `overall = 5`.
- A candidate with an evaluator who rated only some questions: that evaluator is excluded from `overall`.

Record the observed values in the commit message body if they differ from expectations (they should not).

- [ ] **Step 4: Commit**

```bash
git add db/supabase/migrations/0031_evaluation_aggregate_questions.sql
git commit -m "feat(evaluation): aggregate_questions column and results RPC

Add evaluations.aggregate_questions (default false) and recreate
evaluation_results so candidate overall is the mean across only
fully-completed evaluators of their sum (off) or average (on), with the
privacy floor on the completed-evaluator count."
```

---

## Task 3: Server action + Zod input

**Files:**
- Modify: `lib/zod/evaluation.ts`
- Modify: `lib/actions/evaluation.ts`

**Interfaces:**
- Consumes: `requireEvaluationOwner`, `atlasServiceClient`, `ok`, `err`, `ActionResult` (already imported/used in `lib/actions/evaluation.ts`).
- Produces: `setAggregateQuestionsAction(input: unknown): Promise<ActionResult<null>>` and `setAggregateQuestionsInput` zod schema `{ evaluationId: uuid, aggregateQuestions: boolean }`.

- [ ] **Step 1: Add the Zod schema**

In `lib/zod/evaluation.ts`, after the `setEvaluationFieldInput` export, add:

```ts
export const setAggregateQuestionsInput = z.object({
  evaluationId: z.string().uuid(),
  aggregateQuestions: z.boolean(),
});
```

- [ ] **Step 2: Add the server action**

In `lib/actions/evaluation.ts`, add `setAggregateQuestionsInput` to the existing import from `@/lib/zod/evaluation`, then add this action (mirrors `setEvaluationFieldAction`'s owner-gate + closed-lock pattern) after `setEvaluationFieldAction`:

```ts
export async function setAggregateQuestionsAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = setAggregateQuestionsInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireEvaluationOwner(parsed.data.evaluationId);
  const svc = atlasServiceClient();
  const { data: ev } = await svc
    .from("evaluations")
    .select("status")
    .eq("id", parsed.data.evaluationId)
    .single();
  if (ev?.status === "closed")
    return err("locked", "scoring is locked after the evaluation is closed");
  const { error } = await svc
    .from("evaluations")
    .update({ aggregate_questions: parsed.data.aggregateQuestions })
    .eq("id", parsed.data.evaluationId);
  if (error) return err("db_error", error.message);
  revalidatePath(`/hiring/${parsed.data.evaluationId}`);
  return ok(null);
}
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm typecheck`
Expected: PASS (no errors). If `atlasServiceClient`/`requireEvaluationOwner` names differ, match the identifiers already used by `setEvaluationFieldAction` in the same file.

- [ ] **Step 4: Commit**

```bash
git add lib/zod/evaluation.ts lib/actions/evaluation.ts
git commit -m "feat(evaluation): setAggregateQuestionsAction

Owner-gated action to toggle evaluations.aggregate_questions, rejected
once the evaluation is closed."
```

---

## Task 4: Query plumbing

**Files:**
- Modify: `lib/evaluation/queries.ts`

**Interfaces:**
- Consumes: `computePersonalScores`/`computeEvaluatorBreakdown` (Task 1, now 4-arg, field `value`); the recreated RPC (Task 2).
- Produces: viewer payload gains `aggregateQuestions: boolean`; each `evaluatorBreakdown[candidateId]` entry gains `ratedCount: number` (kept alongside `name` and `overall`).

- [ ] **Step 1: Select the new column on the main evaluation read**

In `getEvaluationForViewer`, change the first `evaluations` select from:

```ts
    .select("id,name,status,sheet_id,mapping_confirmed,last_synced_at")
```

to:

```ts
    .select(
      "id,name,status,sheet_id,mapping_confirmed,last_synced_at,aggregate_questions",
    )
```

Immediately after `const { data: ev } = ...`/its guard, derive the flag near the other `ev`-derived locals:

```ts
  const aggregateQuestions = ev?.aggregate_questions ?? false;
```

- [ ] **Step 2: Pass the flag into the self-preview call**

Update the `computePersonalScores(...)` call to pass the flag as the 4th arg:

```ts
      personal = computePersonalScores(
        myRatings,
        candidates.map((c) => c.id),
        questions.map((q) => q.id),
        aggregateQuestions,
      );
```

- [ ] **Step 3: Pass the flag into the breakdown call and carry ratedCount + value through the payload**

Update the `computeEvaluatorBreakdown(...)` call to pass `aggregateQuestions` as its 4th arg, then update the payload map (currently `evaluatorBreakdown[candidateId] = scores.map((s) => ({ name: ..., overall: s.average }))`) to:

```ts
      evaluatorBreakdown[candidateId] = scores.map((s) => ({
        name: nameByRater.get(s.raterId) ?? "Unknown",
        overall: s.value,
        ratedCount: s.ratedCount,
      }));
```

Also update the `evaluatorBreakdown` type annotation from `{ name: string; overall: number }[]` to `{ name: string; overall: number; ratedCount: number }[]`.

- [ ] **Step 4: Return the flag in the payload**

Add `aggregateQuestions,` to the returned object (next to `hideNames,`).

- [ ] **Step 5: Verify types compile**

Run: `pnpm typecheck`
Expected: PASS. (The `personal`/`rank-list` field rename surfaces in Task 5; if `page.tsx` already destructures `data.personal` the type flows through — no error expected here.)

- [ ] **Step 6: Commit**

```bash
git add lib/evaluation/queries.ts
git commit -m "feat(evaluation): thread aggregate_questions through viewer query

Select the flag, pass it into the preview/breakdown helpers, expose
ratedCount on the breakdown payload for mode-aware badge coloring, and
return aggregateQuestions to the page."
```

---

## Task 5: UI — rank-list rename, badge color fix, Manage toggle

**Files:**
- Modify: `app/(app)/hiring/[id]/_ui/rank-list.tsx`
- Modify: `app/(app)/hiring/[id]/_ui/results-view.tsx`
- Modify: `app/(app)/hiring/[id]/_ui/admin-controls.tsx`
- Modify: `app/(app)/hiring/[id]/page.tsx`

**Interfaces:**
- Consumes: viewer payload `aggregateQuestions` and `evaluatorBreakdown[].ratedCount` (Task 4); `setAggregateQuestionsAction` (Task 3); the `PersonalScore.value` field (Task 1).

- [ ] **Step 1: Rename `.average → .value` in rank-list**

In `app/(app)/hiring/[id]/_ui/rank-list.tsx`:
- In `type Ranked`, change `average: number | null;` to `value: number | null;`.
- At the className conditional (~line 141), change `r.average == null` to `r.value == null`.
- At the render (~line 144), change `{r.average ?? "—"}` to `{r.value ?? "—"}`.
- Leave `r.ratedCount` usages unchanged.

- [ ] **Step 2: Color the evaluator badge by average, not raw value**

In `app/(app)/hiring/[id]/_ui/results-view.tsx`:
- Extend the evaluator type used for the breakdown badges (the `e` in the map at ~line 164) to include `ratedCount: number` — update whichever local type / prop type describes those entries so it matches the Task 4 payload (`{ name: string; overall: number; ratedCount: number }`).
- Change the badge style from `scoreBandColor(e.overall)` to color by the rater's average so sums don't clamp to band 5:

```tsx
style={{
  backgroundColor: scoreBandColor(
    e.ratedCount ? e.overall / e.ratedCount : e.overall,
  ),
}}
```

- Leave the displayed number `{e.overall}` and the candidate `{c.overall ?? "—"}` unchanged.

- [ ] **Step 3: Add `aggregateQuestions` prop through page.tsx → AdminControls**

In `app/(app)/hiring/[id]/page.tsx`, where `<AdminControls ... hideNames={data.hideNames} />` is rendered, add:

```tsx
aggregateQuestions={data.aggregateQuestions}
```

- [ ] **Step 4: Accept and render the toggle in AdminControls**

In `app/(app)/hiring/[id]/_ui/admin-controls.tsx`:
- Import the action: add `setAggregateQuestionsAction` to the existing import from `@/lib/actions/evaluation`.
- Add the prop: in the destructured props add `aggregateQuestions = false,` and in the props type add `aggregateQuestions?: boolean;` (mirror `hideNames`).
- In the **Manage** tab body (the `activeTab === "manage"` branch, near the lifecycle actions / above the closing of the manage section), add the toggle. It uses the existing `run()` helper and disables when closed:

```tsx
<div className="flex items-center justify-between gap-3 rounded-md border-chunk border-ink bg-surface-raised p-3">
  <div className="flex flex-col">
    <span className="font-medium">Aggregate questions</span>
    <span className="text-xs text-ink-soft">
      On = averaged 1–5 score. Off = summed total.
    </span>
  </div>
  <Button
    variant={aggregateQuestions ? "primary" : "secondary"}
    disabled={pending || evaluation.status === "closed"}
    onClick={() =>
      run(() =>
        setAggregateQuestionsAction({
          evaluationId: evaluation.id,
          aggregateQuestions: !aggregateQuestions,
        }),
      )
    }
  >
    {aggregateQuestions ? "On" : "Off"}
  </Button>
</div>
```

(If the `Button` component has no `"primary"` variant, use its default variant for the on-state and `"secondary"` for off — match how other buttons in this file express an active state. When `status === "closed"` add a short helper note that scoring is locked, consistent with the Fields tab.)

- [ ] **Step 5: Verify the whole app compiles, lints, and tests pass**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all PASS. Fix any `.average`/3-arg call sites the compiler flags (there should be none outside the files in this plan).

- [ ] **Step 6: Manual verification (drive the real flow)**

Use the `verify`/`run` project flow or the dev server: as an owner, open an evaluation's Manage panel — toggle "Aggregate questions" On/Off (confirm it persists across refresh and is disabled once closed). On a closed evaluation with data, confirm the candidate overall reads as a **sum** when Off and an **average** when On, and evaluator badge colors look sane (not all max-green) in sum mode.

- [ ] **Step 7: Commit**

```bash
git add app/\(app\)/hiring/\[id\]/_ui/rank-list.tsx app/\(app\)/hiring/\[id\]/_ui/results-view.tsx app/\(app\)/hiring/\[id\]/_ui/admin-controls.tsx app/\(app\)/hiring/\[id\]/page.tsx
git commit -m "feat(evaluation): Manage toggle for aggregate questions

Add the locked-once-closed Aggregate questions toggle, rename the
personal score field to value, and color evaluator badges by the rater
average so summed totals don't clamp to the top band."
```

---

## Self-Review

**Spec coverage:**
- Column + default → Task 2 Step 1. ✓
- OFF=sum / ON=avg → Task 1 (`collapse`), Task 2 (`completed` CTE). ✓
- Mean across completed evaluators + privacy floor on completed count → Task 2 (`candidate_overall`, `ranked`). ✓
- TS preview/breakdown sum/avg + `average→value` → Task 1. ✓
- `ratedCount` payload + badge color clamp fix → Task 4 Step 3, Task 5 Step 2. ✓
- Server action, owner-gated, locked-when-closed → Task 3. ✓
- Query plumbing (select/pass/return) → Task 4. ✓
- Manage toggle, disabled when closed, page prop → Task 5 Steps 3–4. ✓
- Existing evals auto-adopt OFF (no backfill) → inherent in Task 2 default; no backfill task. ✓
- Existing test file updated (not added) → Task 1 Step 1. ✓
- `rank-list.tsx` consumer renamed → Task 5 Step 1. ✓

**Placeholder scan:** No TBD/TODO; all code steps include full code. The only conditional instructions (Button variant naming, closed-state note) name the exact fallback. ✓

**Type consistency:** `value`/`ratedCount` used identically across Tasks 1, 4, 5; `aggregateQuestions: boolean` 4th-arg signature matches between Task 1 (definition), Task 4 (calls), and the action/zod boolean in Task 3. Payload `{ name, overall, ratedCount }` matches between Task 4 (produce) and Task 5 (consume). ✓
