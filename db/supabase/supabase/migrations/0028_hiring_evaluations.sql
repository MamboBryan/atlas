-- Hiring evaluations: import candidate responses, panel rates 1-5,
-- per-evaluator privacy until an admin closes and an aggregate is revealed.

create type public.evaluation_status as enum ('draft','open','closed');

create table public.evaluations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  status            public.evaluation_status not null default 'draft',
  sheet_id          text,
  sheet_tab         text,
  email_column      text,
  name_column       text,
  timestamp_column  text,
  mapping_confirmed boolean not null default false,
  created_by        uuid references public.profiles(id) on delete set null,
  last_synced_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.evaluation_questions (
  id            uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  column_key    text not null,
  prompt        text not null,
  position      int  not null,
  is_active     boolean not null default true,
  updated_at    timestamptz not null default now(),
  unique (evaluation_id, column_key)
);

create table public.evaluation_candidates (
  id            uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  email         citext not null,
  display_name  text not null,
  submitted_at  timestamptz,
  is_active     boolean not null default true,
  updated_at    timestamptz not null default now(),
  unique (evaluation_id, email)
);

create table public.evaluation_answers (
  id            uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  candidate_id  uuid not null references public.evaluation_candidates(id) on delete cascade,
  question_id   uuid not null references public.evaluation_questions(id) on delete cascade,
  answer_text   text,
  updated_at    timestamptz not null default now(),
  unique (candidate_id, question_id)
);

-- Pure junction table (composite PK only, no non-key columns, insert/delete-only): no updated_at/touch trigger.
create table public.evaluation_panelists (
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  primary key (evaluation_id, profile_id)
);

create table public.evaluation_ratings (
  id            uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  candidate_id  uuid not null references public.evaluation_candidates(id) on delete cascade,
  question_id   uuid not null references public.evaluation_questions(id) on delete cascade,
  rater_id      uuid not null references public.profiles(id) on delete cascade,
  score         smallint not null check (score between 1 and 5),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (evaluation_id, rater_id, candidate_id, question_id)
);

create index on public.evaluation_questions (evaluation_id);
create index on public.evaluation_candidates (evaluation_id);
create index on public.evaluation_answers (candidate_id);
create index on public.evaluation_answers (question_id);
create index on public.evaluation_ratings (evaluation_id, candidate_id, question_id);
create index on public.evaluation_ratings (rater_id);

create trigger evaluations_touch before update on public.evaluations
  for each row execute function public.atlas_touch_updated_at();
create trigger evaluation_questions_touch before update on public.evaluation_questions
  for each row execute function public.atlas_touch_updated_at();
create trigger evaluation_candidates_touch before update on public.evaluation_candidates
  for each row execute function public.atlas_touch_updated_at();
create trigger evaluation_answers_touch before update on public.evaluation_answers
  for each row execute function public.atlas_touch_updated_at();
create trigger evaluation_ratings_touch before update on public.evaluation_ratings
  for each row execute function public.atlas_touch_updated_at();

-- Suppression floor, single source of truth.
create or replace function public.evaluation_min_raters() returns int
language sql immutable as $$ select 3 $$;

-- Panelist check (security definer avoids recursive RLS on panelists).
create or replace function public.atlas_is_panelist(uid uuid, eval_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.evaluation_panelists ep
    join public.profiles p on p.id = ep.profile_id
    where ep.evaluation_id = eval_id and ep.profile_id = uid and p.is_active
  );
$$;

-- Enable RLS
alter table public.evaluations          enable row level security;
alter table public.evaluation_questions enable row level security;
alter table public.evaluation_candidates enable row level security;
alter table public.evaluation_answers   enable row level security;
alter table public.evaluation_panelists enable row level security;
alter table public.evaluation_ratings   enable row level security;

-- evaluations: admins full; non-admins may see non-draft rows exist.
create policy evaluations_read on public.evaluations for select using (
  public.atlas_is_admin(auth.uid()) or status <> 'draft'
);
create policy evaluations_admin_write on public.evaluations for all
  using (public.atlas_is_admin(auth.uid()))
  with check (public.atlas_is_admin(auth.uid()));

-- panelists: admins write; user may see their own membership rows.
create policy panelists_read on public.evaluation_panelists for select using (
  public.atlas_is_admin(auth.uid()) or profile_id = auth.uid()
);
create policy panelists_admin_write on public.evaluation_panelists for all
  using (public.atlas_is_admin(auth.uid()))
  with check (public.atlas_is_admin(auth.uid()));

-- questions: panelists + admins read; admins write.
create policy questions_read on public.evaluation_questions for select using (
  public.atlas_is_admin(auth.uid())
  or public.atlas_is_panelist(auth.uid(), evaluation_id)
);
create policy questions_admin_write on public.evaluation_questions for all
  using (public.atlas_is_admin(auth.uid()))
  with check (public.atlas_is_admin(auth.uid()));

-- candidates: panelists + admins read; admins write.
create policy candidates_read on public.evaluation_candidates for select using (
  public.atlas_is_admin(auth.uid())
  or public.atlas_is_panelist(auth.uid(), evaluation_id)
);
create policy candidates_admin_write on public.evaluation_candidates for all
  using (public.atlas_is_admin(auth.uid()))
  with check (public.atlas_is_admin(auth.uid()));

-- answers: panelists + admins read; admins write.
create policy answers_read on public.evaluation_answers for select using (
  public.atlas_is_admin(auth.uid())
  or public.atlas_is_panelist(auth.uid(), evaluation_id)
);
create policy answers_admin_write on public.evaluation_answers for all
  using (public.atlas_is_admin(auth.uid()))
  with check (public.atlas_is_admin(auth.uid()));

-- ratings: read ONLY your own; write your own while open + panelist.
create policy ratings_read_self on public.evaluation_ratings for select
  using (rater_id = auth.uid());
create policy ratings_write_self on public.evaluation_ratings for all
  using (
    rater_id = auth.uid()
    and public.atlas_is_panelist(auth.uid(), evaluation_id)
    and (select status from public.evaluations e where e.id = evaluation_id) = 'open'
  )
  with check (
    rater_id = auth.uid()
    and public.atlas_is_panelist(auth.uid(), evaluation_id)
    and (select status from public.evaluations e where e.id = evaluation_id) = 'open'
  );

-- Grants
grant select, insert, update, delete on public.evaluations          to authenticated, service_role;
grant select, insert, update, delete on public.evaluation_questions to authenticated, service_role;
grant select, insert, update, delete on public.evaluation_candidates to authenticated, service_role;
grant select, insert, update, delete on public.evaluation_answers   to authenticated, service_role;
grant select, insert, update, delete on public.evaluation_panelists to authenticated, service_role;
grant select, insert, update, delete on public.evaluation_ratings   to authenticated, service_role;
