# Evaluation "Aggregate questions" toggle — design

## Problem

The closed-evaluation candidate score is wrong for what stakeholders want. Today
`evaluation_results` computes each candidate's `overall` as the **average of the
per-question cross-evaluator averages**, landing on a 1–5 scale. So a single
evaluator rating a 5-question candidate `5,5,5,5,5` yields `5`, not the expected
total of `25`.

The desired model is an **evaluators' aggregate**: total each evaluator's own
ratings, then average those totals across evaluators —
`sum(evaluator totals) ÷ number of evaluators`. A per-evaluation toggle controls
whether each evaluator's per-question ratings are collapsed by averaging or left
as a raw sum.

## Decisions (agreed)

- **New column** `public.evaluations.aggregate_questions boolean not null default false`.
- **OFF (default) — do NOT aggregate questions:** each evaluator's value = **sum**
  of their scores over the active questions. `[5,5,5,5,5] → 25`.
- **ON — aggregate questions:** each evaluator's value = **average** of their
  scores. `[5,5,5,5,5] → 5`.
- **Candidate overall (both modes):** mean of each evaluator's value across
  evaluators — `sum(values) ÷ count(evaluators)`.
- **Only fully-completed evaluators count:** an evaluator contributes to a
  candidate's overall only if they rated **every active (non-hidden) question**
  for that candidate. Partial raters are excluded entirely.
- **Privacy floor moves to the completed-evaluator count:** a candidate's overall
  is revealed only when the number of completed evaluators `≥ evaluation_min_raters()`;
  otherwise `overall = null` (suppressed).
- **Toggle is locked once the evaluation is `closed`** (same lock rule as the
  Fields tab).
- **Existing evaluations auto-adopt the new model at OFF.** No backfill. The
  overall is compute-on-read via the RPC, so recreating the function switches all
  evaluations — including already-closed ones — to the new math immediately.

### Worked examples (5 active questions)

| Scenario | Mode | Result |
|---|---|---|
| 1 evaluator: `5,5,5,5,5` | OFF | `25 / 1 = 25` |
| 1 evaluator: `5,5,5,5,5` | ON | `5 / 1 = 5` |
| 2 evaluators, sums `25` and `20` | OFF | `(25 + 20) / 2 = 22.5` |
| Evaluator rated only 3 of 5 questions | either | excluded (not fully-completed) |
| Only 1 completed evaluator, `min_raters = 2` | either | `null` (suppressed) |

## Scope of change

Four layers plus the toggle UI, all consistent with the toggle:

1. **SQL RPC `evaluation_results`** — the authoritative closed aggregate everyone sees.
2. **`lib/evaluation/aggregate.ts`** — `computePersonalScores` (panelist self-preview)
   and `computeEvaluatorBreakdown` (owner-only per-evaluator view).
3. **Server action + query plumbing** — persist and read `aggregate_questions`.
4. **Manage-panel toggle** in `admin-controls.tsx`.

The per-question `cells` array (per-question cross-evaluator average with per-cell
suppression) is **unchanged** — the toggle only affects the candidate `overall`.
A single question's sum and average are identical, so cells need no mode handling.

## 1. Migration — `db/supabase/migrations/0031_evaluation_aggregate_questions.sql`

```sql
alter table public.evaluations
  add column aggregate_questions boolean not null default false;
```

Then `create or replace function public.evaluation_results(uuid)` — identical to
`0030` except:

- Read the flag alongside status:
  `select status, aggregate_questions into v_status, v_aggregate ...`
  (new `declare v_aggregate boolean;`).
- Add `v_active_q int` and compute the active/non-hidden question count.
- Keep the `cell` / `qualified` CTEs (per-question cells) exactly as today.
- **Replace `candidate_overall`** with a completed-evaluator computation:

```sql
-- active, non-hidden question count for this evaluation
select count(*) into v_active_q
from public.evaluation_questions q
where q.evaluation_id = p_evaluation_id and q.is_active and q.is_hidden = false;

with cell as ( ...unchanged... ),
qualified as ( ...unchanged (per-question cells)... ),
rater_totals as (
  select r.candidate_id, r.rater_id,
         count(*)               as rated_q,
         sum(r.score)::numeric  as rater_sum,
         avg(r.score)::numeric  as rater_avg
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
  -- only evaluators who rated every active question for the candidate
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
```

- The evaluation-level floor (`v_raters < v_min → suppress everything`) and all
  auth/status gates are unchanged.
- `count(cr.rater_id)` over a `LEFT JOIN` is `0` when no evaluator completed the
  candidate → `overall_raw` null → suppressed. The `v_active_q > 0` guard makes a
  question-less evaluation suppress cleanly.
- **Rank ordering note:** the original `0030` ranks over the unrounded
  `candidate_overall.overall`; here `ranked2` ranks over the already-rounded,
  null-gated `overall`. Deterministic (display_name tiebreak, `nulls last`) and
  not a bug, but a minor behavior change from rounding-before-ranking.
- Grants unchanged (`revoke all ... ; grant execute ... to authenticated`).

`evaluation_panel_progress` is **not** touched.

## 2. `lib/evaluation/aggregate.ts`

Thread `aggregateQuestions: boolean` through both functions and rename the
mode-dependent field `average → value` (it is no longer always an average).

- **`computePersonalScores(rows, activeCandidateIds, activeQuestionIds, aggregateQuestions)`**
  — a single panelist previewing their own ratings while `open`. Per candidate,
  `value = aggregateQuestions ? mean(scores) : sum(scores)` over the questions
  they rated. This is a live self-preview, so it is **not** gated on completion;
  `ratedCount` stays for context. `PersonalScore.average → PersonalScore.value`.
  Sorting stays highest-first (`null` last). *Accepted UX wrinkle:* in OFF/sum
  mode a candidate rated on only some questions shows a smaller partial sum that
  sorts directly against fully-rated candidates in the same list — a comparability
  quirk that did not exist under the old average model. Acceptable for a private
  self-preview; the authoritative closed overall still excludes partial raters.
- **`computeEvaluatorBreakdown(...)`** — owner-only diagnostic. Each evaluator's
  `value = aggregateQuestions ? mean : sum` of their scores on active questions.
  Keeps **all** raters (including partial ones) for transparency —
  `EvaluatorScore.average → EvaluatorScore.value`. Note the intended divergence:
  the breakdown lists every rater, while the RPC `overall` counts only completed
  raters; this is a diagnostic view, not the headline number.

Concrete consumers to update:
- `queries.ts:305` — `overall: s.average` → `s.value`.
- `queries.ts` self-preview (~line 230) and owner-breakdown (~line 291) calls —
  pass the new `aggregateQuestions` arg.
- **`rank-list.tsx`** — the `PersonalScore` consumer: type `Ranked` and reads at
  `.average` / `.ratedCount` (~lines 19-23, 78, 141, 144) → rename to `.value`.
- **`results-view.tsx`** — reads evaluator-breakdown `.overall` (from
  `computeEvaluatorBreakdown.value`); see the color-clamp fix in §4.

## 3. Server action + query plumbing

- **`lib/actions/evaluation.ts`** — new `setAggregateQuestionsAction({ evaluationId,
  aggregateQuestions })`, admin/owner-gated exactly like the other evaluation
  mutations. **Reject when the evaluation is `closed`** (mirrors the UI lock, so
  the server is authoritative). Updates `evaluations.aggregate_questions`,
  revalidates the hiring path. Add the input to `lib/zod/evaluation.ts` if the
  other actions validate there.
- **`lib/evaluation/queries.ts`** — select `aggregate_questions` in the metadata
  read, pass it into `computePersonalScores` and `computeEvaluatorBreakdown`, and
  return it in the viewer payload so the page can seed the toggle.

## 4. Manage-panel toggle — `admin-controls.tsx` + `page.tsx`

- Add an "Aggregate questions" toggle to the **Manage** tab (near the lifecycle
  actions block). Helper text: *On = averaged 1–5 score. Off = summed total.*
- Wire it through the existing `run()` helper to `setAggregateQuestionsAction`.
- **Disabled when `evaluation.status === "closed"`** (same lock the Fields tab
  uses), with a short note that scoring is locked once closed.
- `page.tsx` passes `aggregateQuestions={data.aggregateQuestions}` into
  `AdminControls`; add `aggregate_questions` to the `Ev` type in `admin-controls.tsx`
  (or pass as a sibling prop — match the `hideNames` prop pattern).
- **Results display — color clamp (was missed in the first pass):**
  `results-view.tsx` has `scoreBandColor` (~lines 51-54) that clamps a score to
  bands 1–5 (`Math.min(5, Math.max(1, Math.round(score)))`) and applies it to each
  evaluator badge's `overall` (~line 164). In OFF/sum mode those values run up to
  `#questions × 5`, so every badge would clamp to band 5. Make the badge coloring
  mode-aware — e.g. normalize the value back to a 1–5 band before `scoreBandColor`
  (divide sums by the active-question count), or pass `aggregateQuestions` down and
  skip/adjust the band in sum mode. There is **no** hardcoded "/5" suffix on the
  candidate `overall` (`results-view.tsx:172` renders `{c.overall ?? "—"}`) or the
  personal score (`rank-list.tsx:144`), so nothing to strip there.

## 5. Existing-data impact (accepted)

Because the overall is compute-on-read, recreating the RPC switches every
evaluation — including already-closed ones — to the new OFF/sum math on deploy.
Consequences accepted by the owner:

- Closed evals' `overall` changes scale (≈1–5 → sum up to `#questions × 5`).
- The completed-only rule drops partial raters, which can reorder candidates and
  can push a candidate below `min_raters`, newly suppressing their overall.

No data backfill; the column default (`false`) applies to all existing rows.

## Testing

- **Unit — `tests/evaluation/aggregate.test.ts` (existing, vitest, `pnpm test`).**
  This file already tests both functions and asserts `.average` with the current
  3-arg signatures, so it **must be updated, not added** — rename `.average →
  .value` and add the `aggregateQuestions` arg to every call. Then extend it:
  - OFF: `[5,5,5,5,5] → 25`; ON: `→ 5`.
  - Multi-evaluator mean of values.
  - `computeEvaluatorBreakdown` includes partial raters; verify per-rater `value`.
  - Empty input → all-zero/`null` rows unchanged.
- **RPC** — migration dry-run (repo's existing migration check), then manual verify
  against a seeded closed evaluation: OFF sum, ON average, partial-rater exclusion,
  and suppression when completed-raters `< min_raters`.
- **Manual** — toggle in Manage flips the closed results between sum and average;
  toggle is disabled once closed.

## Out of scope

- Per-question `cells` math and `evaluation_panel_progress`.
- Any change to `evaluation_min_raters()` or the evaluation-level suppression gate.
- Historical preservation / backfill of pre-change closed numbers.
