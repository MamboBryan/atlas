create or replace function public.atlas_submit_attributed(p_prompt uuid, p_response jsonb)
returns void
language plpgsql security invoker as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'unauth';
  end if;

  insert into public.responses_attributed (prompt_id, user_id, response)
    values (p_prompt, v_uid, p_response)
    on conflict (prompt_id, user_id) do update
      set response = excluded.response,
          updated_at = now();

  insert into public.participation (prompt_id, user_id)
    values (p_prompt, v_uid)
    on conflict (prompt_id, user_id) do nothing;
end
$$;

grant execute on function public.atlas_submit_attributed(uuid, jsonb) to authenticated;
