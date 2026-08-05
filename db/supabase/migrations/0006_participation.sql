create table public.participation (
  id           uuid primary key default gen_random_uuid(),
  prompt_id    uuid not null references public.prompts(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  responded_at timestamptz not null default now(),
  unique (prompt_id, user_id)
);

create index participation_prompt_idx on public.participation(prompt_id);

alter table public.participation enable row level security;

create policy part_read_self on public.participation
  for select using (auth.uid() = user_id);

create policy part_write_self on public.participation
  for insert with check (auth.uid() = user_id);

grant select, insert on public.participation to authenticated;
grant select, insert, update, delete on public.participation to service_role;
