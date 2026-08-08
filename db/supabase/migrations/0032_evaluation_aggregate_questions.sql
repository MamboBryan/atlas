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
