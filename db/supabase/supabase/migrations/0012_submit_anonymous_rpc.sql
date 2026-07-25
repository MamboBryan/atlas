create or replace function public.atlas_submit_anonymous(p_prompt uuid, p_response jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_prompt public.prompts%rowtype;
begin
  if v_uid is null then
    raise exception 'unauth' using errcode = '42501';
  end if;

  select * into v_prompt from public.prompts where id = p_prompt;
  if v_prompt.id is null then
    raise exception 'not_found';
  end if;
  if v_prompt.anonymity <> 'hard_anonymous' then
    raise exception 'wrong_mode';
  end if;
  if v_prompt.is_revealed or not v_prompt.is_open then
    raise exception 'closed';
  end if;
  if v_prompt.opens_at is not null and now() < v_prompt.opens_at then
    raise exception 'closed';
  end if;
  if v_prompt.closes_at is not null and now() > v_prompt.closes_at then
    raise exception 'closed';
  end if;
  if exists (
    select 1 from public.participation
    where prompt_id = p_prompt and user_id = v_uid
  ) then
    raise exception 'already_responded';
  end if;

  insert into public.responses_anonymous (prompt_id, response)
    values (p_prompt, p_response);
  insert into public.participation (prompt_id, user_id)
    values (p_prompt, v_uid);
end
$$;

revoke all on function public.atlas_submit_anonymous(uuid, jsonb) from public;
grant execute on function public.atlas_submit_anonymous(uuid, jsonb) to authenticated;
