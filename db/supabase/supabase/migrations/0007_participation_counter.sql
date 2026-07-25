create or replace function public.atlas_prompt_counter(p_prompt uuid) returns int
language sql stable as $$
  select count(*)::int from public.participation where prompt_id = p_prompt;
$$;

grant execute on function public.atlas_prompt_counter(uuid) to authenticated;
