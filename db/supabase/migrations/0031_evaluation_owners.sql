-- Creator-owned evaluations: management authority moves from "any admin" to
-- the evaluation's owners. The original creator (evaluations.created_by) is a
-- permanent owner; owners have equal powers — manage the evaluation, close it,
-- and add/remove other owners. Admins who don't own an evaluation keep read /
-- results visibility but can no longer edit or close it.

-- Pure junction table + immutable added_at (never updated): no touch trigger.
create table public.evaluation_owners (
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (evaluation_id, profile_id)
);

create index on public.evaluation_owners (profile_id);

-- Backfill: every existing evaluation's creator becomes its first owner.
insert into public.evaluation_owners (evaluation_id, profile_id)
select id, created_by from public.evaluations
where created_by is not null
on conflict do nothing;

-- Owner check (security definer avoids recursive RLS on owners), mirrors
-- atlas_is_panelist.
create or replace function public.atlas_is_evaluation_owner(uid uuid, eval_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.evaluation_owners eo
    join public.profiles p on p.id = eo.profile_id
    where eo.evaluation_id = eval_id and eo.profile_id = uid and p.is_active
  );
$$;

alter table public.evaluation_owners enable row level security;

-- owners: any owner (or admin) may read the owner list; owners manage it.
-- (Writes flow through the service client after an owner check in the action
--  layer; these policies are defense-in-depth.)
create policy owners_read on public.evaluation_owners for select using (
  public.atlas_is_admin(auth.uid())
  or public.atlas_is_evaluation_owner(auth.uid(), evaluation_id)
);
create policy owners_write on public.evaluation_owners for all
  using (public.atlas_is_evaluation_owner(auth.uid(), evaluation_id))
  with check (public.atlas_is_evaluation_owner(auth.uid(), evaluation_id));

grant select, insert, update, delete on public.evaluation_owners to authenticated, service_role;

-- Management authority: replace admin-write with owner-write across the
-- evaluation tables. Read policies are untouched — admins and panelists keep
-- exactly the visibility they had.
-- Owners can always read their own evaluation, even while it's still a draft.
drop policy evaluations_read on public.evaluations;
create policy evaluations_read on public.evaluations for select using (
  public.atlas_is_admin(auth.uid())
  or public.atlas_is_evaluation_owner(auth.uid(), id)
  or status <> 'draft'
);

drop policy evaluations_admin_write on public.evaluations;
create policy evaluations_owner_write on public.evaluations for all
  using (public.atlas_is_evaluation_owner(auth.uid(), id))
  with check (public.atlas_is_evaluation_owner(auth.uid(), id));

drop policy questions_admin_write on public.evaluation_questions;
create policy questions_owner_write on public.evaluation_questions for all
  using (public.atlas_is_evaluation_owner(auth.uid(), evaluation_id))
  with check (public.atlas_is_evaluation_owner(auth.uid(), evaluation_id));

drop policy candidates_admin_write on public.evaluation_candidates;
create policy candidates_owner_write on public.evaluation_candidates for all
  using (public.atlas_is_evaluation_owner(auth.uid(), evaluation_id))
  with check (public.atlas_is_evaluation_owner(auth.uid(), evaluation_id));

drop policy answers_admin_write on public.evaluation_answers;
create policy answers_owner_write on public.evaluation_answers for all
  using (public.atlas_is_evaluation_owner(auth.uid(), evaluation_id))
  with check (public.atlas_is_evaluation_owner(auth.uid(), evaluation_id));

drop policy panelists_admin_write on public.evaluation_panelists;
create policy panelists_owner_write on public.evaluation_panelists for all
  using (public.atlas_is_evaluation_owner(auth.uid(), evaluation_id))
  with check (public.atlas_is_evaluation_owner(auth.uid(), evaluation_id));
