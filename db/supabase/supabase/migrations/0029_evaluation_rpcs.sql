-- Closed-aggregate exposure with two-grain small-panel suppression.
-- security definer: aggregates across raters without exposing individual rows;
-- emits only averages + bucketed counts.

create or replace function public.evaluation_results(p_evaluation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_status public.evaluation_status;
  v_min    int := public.evaluation_min_raters();
  v_raters int;
  v_result jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('status','forbidden','suppressed',true,
      'rater_count',null,'rater_bucket','<' || v_min,'candidates','[]'::jsonb);
  end if;

  select status into v_status from public.evaluations where id = p_evaluation_id;
  if v_status is null then
    return jsonb_build_object('status','not_found','suppressed',true,
      'rater_count',null,'rater_bucket','<' || v_min,'candidates','[]'::jsonb);
  end if;

  -- Status gate: nothing until closed.
  if v_status <> 'closed' then
    return jsonb_build_object('status',v_status,'suppressed',true,
      'rater_count',null,'rater_bucket','<' || v_min,'candidates','[]'::jsonb);
  end if;

  -- Evaluation-level floor: distinct raters over active cells.
  select count(distinct r.rater_id) into v_raters
  from public.evaluation_ratings r
  join public.evaluation_candidates c on c.id = r.candidate_id and c.is_active
  join public.evaluation_questions q on q.id = r.question_id and q.is_active
  where r.evaluation_id = p_evaluation_id;

  if coalesce(v_raters,0) < v_min then
    return jsonb_build_object('status','closed','suppressed',true,
      'rater_count',null,'rater_bucket','<' || v_min,'candidates','[]'::jsonb);
  end if;

  -- Per-cell averages, suppressing cells below the floor (avg => null).
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
      and q.evaluation_id = p_evaluation_id and q.is_active
    group by c.id, c.display_name, q.id, q.prompt, q.position
  ),
  qualified as (
    select candidate_id, display_name, question_id, prompt, position,
           case when cell_raters >= v_min then round(cell_avg,2) end as avg
    from cell
  ),
  candidate_overall as (
    select candidate_id, display_name,
           avg(avg) filter (where avg is not null) as overall
    from qualified group by candidate_id, display_name
  ),
  ranked as (
    select candidate_id, display_name, round(overall,2) as overall,
           rank() over (order by overall desc nulls last, display_name) as rank
    from candidate_overall
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
  from ranked rk;

  return v_result;
end $$;

revoke all on function public.evaluation_results(uuid) from public;
grant execute on function public.evaluation_results(uuid) to authenticated;

-- Admin-only panel progress (counts, never scores).
create or replace function public.evaluation_panel_progress(p_evaluation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_total int; v_result jsonb;
begin
  if not public.atlas_is_admin(auth.uid()) then
    return '[]'::jsonb;
  end if;
  select count(*) into v_total
  from public.evaluation_candidates c
  cross join public.evaluation_questions q
  where c.evaluation_id = p_evaluation_id and c.is_active
    and q.evaluation_id = p_evaluation_id and q.is_active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'profile_id', p.id, 'display_name', p.display_name,
    'rated', coalesce(cnt.n,0), 'total', v_total) order by p.display_name), '[]'::jsonb)
  into v_result
  from public.evaluation_panelists ep
  join public.profiles p on p.id = ep.profile_id
  left join (
    select rater_id, count(*) as n from public.evaluation_ratings
    where evaluation_id = p_evaluation_id group by rater_id
  ) cnt on cnt.rater_id = p.id
  where ep.evaluation_id = p_evaluation_id;
  return v_result;
end $$;

revoke all on function public.evaluation_panel_progress(uuid) from public;
grant execute on function public.evaluation_panel_progress(uuid) to authenticated;
