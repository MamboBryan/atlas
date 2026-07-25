create table public.responses_anonymous (
  id         uuid primary key default gen_random_uuid(),
  prompt_id  uuid not null references public.prompts(id) on delete cascade,
  response   jsonb not null,
  created_at timestamptz not null default now()
);

create index responses_anonymous_prompt_idx on public.responses_anonymous(prompt_id);

alter table public.responses_anonymous enable row level security;

-- Deliberately zero policies and zero grants to authenticated.
-- All reads flow through atlas_get_prompt_results (aggregated only).
-- All writes flow through atlas_submit_anonymous (security-definer).

grant select, insert, update, delete on public.responses_anonymous to service_role;

comment on table public.responses_anonymous is
  'Hard-anonymous responses. Deliberately has no user_id column. Reads: aggregated only via atlas_get_prompt_results. Writes: only via atlas_submit_anonymous.';
