create or replace function public.atlas_prompt_denominator(p_prompt uuid) returns int
language plpgsql stable as $$
declare
  v_meeting  uuid;
  v_override jsonb;
  v_count    int;
begin
  select meeting_id into v_meeting from public.prompts where id = p_prompt;

  if v_meeting is null then
    select count(*)::int
      into v_count
      from public.profiles p
     where p.is_active
       and not public.atlas_is_unavailable_on(p.id, current_date);
    return v_count;
  end if;

  select participants_override into v_override
    from public.meetings where id = v_meeting;

  if v_override is null then
    select count(*)::int
      into v_count
      from public.profiles p
     where p.is_active
       and not public.atlas_is_unavailable_on(p.id, current_date);
    return v_count;
  end if;

  return jsonb_array_length(v_override);
end
$$;
