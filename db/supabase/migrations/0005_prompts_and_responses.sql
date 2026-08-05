create type public.response_type as enum ('text','single_choice','multi_choice','yes_no','rating');
create type public.anonymity_mode as enum ('attributed','hard_anonymous');
create type public.prompt_timing as enum ('async','live');

create table public.prompts (
  id             uuid primary key default gen_random_uuid(),
  meeting_id     uuid,
  created_by     uuid not null references public.profiles(id) on delete restrict,
  owner_user_id  uuid not null references public.profiles(id) on delete restrict,
  question       text not null check (char_length(question) between 1 and 500),
  response_type  public.response_type not null,
  options        jsonb,
  rating_min     int,
  rating_max     int,
  anonymity      public.anonymity_mode not null,
  timing         public.prompt_timing not null,
  opens_at       timestamptz,
  closes_at      timestamptz,
  is_open        boolean not null default false,
  is_revealed    boolean not null default false,
  revealed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ((response_type = 'rating') = (rating_min is not null and rating_max is not null and rating_min < rating_max)),
  check ((response_type in ('single_choice','multi_choice','yes_no')) = (options is not null))
);

create index prompts_meeting_idx on public.prompts(meeting_id);
create index prompts_owner_idx   on public.prompts(owner_user_id);
create index prompts_creator_idx on public.prompts(created_by);

create table public.responses_attributed (
  id         uuid primary key default gen_random_uuid(),
  prompt_id  uuid not null references public.prompts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  response   jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prompt_id, user_id)
);

alter table public.prompts              enable row level security;
alter table public.responses_attributed enable row level security;

create policy prompts_read_all on public.prompts
  for select using (auth.uid() is not null);

create policy prompts_insert_self on public.prompts
  for insert
  with check (auth.uid() = created_by and auth.uid() = owner_user_id);

create policy prompts_update_owner on public.prompts
  for update
  using      (auth.uid() = owner_user_id or public.atlas_is_admin(auth.uid()))
  with check (auth.uid() = owner_user_id or public.atlas_is_admin(auth.uid()));

create policy ra_read_self on public.responses_attributed
  for select using (auth.uid() = user_id);

create policy ra_read_after_reveal on public.responses_attributed
  for select using (
    exists (
      select 1 from public.prompts p
      where p.id = prompt_id and p.anonymity = 'attributed' and p.is_revealed
    )
  );

create policy ra_write_self on public.responses_attributed
  for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.prompts p
      where p.id = prompt_id and p.anonymity = 'attributed' and not p.is_revealed
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.prompts p
      where p.id = prompt_id and p.anonymity = 'attributed' and not p.is_revealed
    )
  );

create trigger prompts_touch before update on public.prompts
  for each row execute function public.atlas_touch_updated_at();

create trigger ra_touch before update on public.responses_attributed
  for each row execute function public.atlas_touch_updated_at();

grant select, insert, update, delete on public.prompts              to authenticated;
grant select, insert, update, delete on public.prompts              to service_role;
grant select, insert, update, delete on public.responses_attributed to authenticated;
grant select, insert, update, delete on public.responses_attributed to service_role;
