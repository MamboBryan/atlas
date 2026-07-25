create or replace function public.atlas_on_auth_user_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  select count(*) into v_count from public.profiles where is_active;
  insert into public.profiles (id, email, display_name, role, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when v_count = 0 then 'admin'::public.user_role else 'member'::public.user_role end,
    true
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.atlas_on_auth_user_created();
