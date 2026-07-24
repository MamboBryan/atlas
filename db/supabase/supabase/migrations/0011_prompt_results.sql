create or replace function public.atlas_get_prompt_results(p_prompt uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_prompt public.prompts%rowtype;
  v_body   jsonb;
begin
  select * into v_prompt from public.prompts where id = p_prompt;
  if v_prompt.id is null then
    raise exception 'not_found';
  end if;
  if not v_prompt.is_revealed then
    raise exception 'not_revealed';
  end if;

  case v_prompt.response_type
    when 'text' then
      if v_prompt.anonymity = 'attributed' then
        select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'text', r.response->>'text'))
          into v_body
          from public.responses_attributed r
         where r.prompt_id = p_prompt;
      else
        select jsonb_agg(r.response->>'text' order by random())
          into v_body
          from public.responses_anonymous r
         where r.prompt_id = p_prompt;
      end if;
      return jsonb_build_object('kind', 'text', 'items', coalesce(v_body, '[]'::jsonb));

    when 'single_choice', 'yes_no' then
      if v_prompt.anonymity = 'attributed' then
        select jsonb_object_agg(x.opt, x.n) into v_body from (
          select response->>'option_id' as opt, count(*) as n
            from public.responses_attributed
           where prompt_id = p_prompt
           group by 1
        ) x;
      else
        select jsonb_object_agg(x.opt, x.n) into v_body from (
          select response->>'option_id' as opt, count(*) as n
            from public.responses_anonymous
           where prompt_id = p_prompt
           group by 1
        ) x;
      end if;
      return jsonb_build_object(
        'kind', 'choice',
        'counts', coalesce(v_body, '{}'::jsonb),
        'options', v_prompt.options
      );

    when 'multi_choice' then
      if v_prompt.anonymity = 'attributed' then
        select jsonb_object_agg(x.opt, x.n) into v_body from (
          select jsonb_array_elements_text(response->'option_ids') as opt, count(*) as n
            from public.responses_attributed
           where prompt_id = p_prompt
           group by 1
        ) x;
      else
        select jsonb_object_agg(x.opt, x.n) into v_body from (
          select jsonb_array_elements_text(response->'option_ids') as opt, count(*) as n
            from public.responses_anonymous
           where prompt_id = p_prompt
           group by 1
        ) x;
      end if;
      return jsonb_build_object(
        'kind', 'multi',
        'counts', coalesce(v_body, '{}'::jsonb),
        'options', v_prompt.options
      );

    when 'rating' then
      if v_prompt.anonymity = 'attributed' then
        select jsonb_build_object(
          'kind', 'rating',
          'avg',  (select avg((response->>'value')::int)
                     from public.responses_attributed where prompt_id = p_prompt),
          'dist', coalesce((
            select jsonb_object_agg(x.v, x.n) from (
              select (response->>'value') as v, count(*) as n
                from public.responses_attributed
               where prompt_id = p_prompt
               group by 1
            ) x
          ), '{}'::jsonb)
        ) into v_body;
      else
        select jsonb_build_object(
          'kind', 'rating',
          'avg',  (select avg((response->>'value')::int)
                     from public.responses_anonymous where prompt_id = p_prompt),
          'dist', coalesce((
            select jsonb_object_agg(x.v, x.n) from (
              select (response->>'value') as v, count(*) as n
                from public.responses_anonymous
               where prompt_id = p_prompt
               group by 1
            ) x
          ), '{}'::jsonb)
        ) into v_body;
      end if;
      return v_body;
  end case;
end
$$;

revoke all on function public.atlas_get_prompt_results(uuid) from public;
grant execute on function public.atlas_get_prompt_results(uuid) to authenticated;
