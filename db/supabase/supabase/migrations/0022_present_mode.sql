-- 0022_present_mode.sql
-- Present-mode support: persisted meeting comments + emoji reactions,
-- has_started flag for Standby/Curtain distinction, prompt timer.

-- 1. Extend existing tables ------------------------------------------------

alter table public.meetings
  add column if not exists has_started boolean not null default false;

alter table public.agenda_items
  add column if not exists timer_ends_at timestamptz;

-- 2. meeting_comments ------------------------------------------------------

create table public.meeting_comments (
  id             uuid primary key default gen_random_uuid(),
  meeting_id     uuid not null references public.meetings(id) on delete cascade,
  agenda_item_id uuid references public.agenda_items(id) on delete set null,
  author_user_id uuid not null references public.profiles(id) on delete cascade,
  body           text not null check (char_length(body) between 1 and 500),
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create index meeting_comments_meeting_created_idx
  on public.meeting_comments (meeting_id, created_at desc);

alter table public.meeting_comments enable row level security;

create policy meeting_comments_read on public.meeting_comments
  for select using (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_id
        and auth.uid() is not null
        and (
          m.participants_override is null
          or exists (
            select 1 from jsonb_array_elements_text(m.participants_override) x
            where x.value = auth.uid()::text
          )
          or m.host_user_id = auth.uid()
          or m.created_by  = auth.uid()
        )
    )
  );

create policy meeting_comments_insert on public.meeting_comments
  for insert with check (
    author_user_id = auth.uid()
    and exists (
      select 1 from public.meetings m
      where m.id = meeting_id
        and auth.uid() is not null
        and (
          m.participants_override is null
          or exists (
            select 1 from jsonb_array_elements_text(m.participants_override) x
            where x.value = auth.uid()::text
          )
          or m.host_user_id = auth.uid()
          or m.created_by  = auth.uid()
        )
    )
  );

create policy meeting_comments_soft_delete on public.meeting_comments
  for update
  using       (author_user_id = auth.uid() and deleted_at is null)
  with check  (author_user_id = auth.uid() and deleted_at is not null);

grant select, insert, update on public.meeting_comments to authenticated;
grant select, insert, update, delete on public.meeting_comments to service_role;

-- 3. meeting_comment_reactions --------------------------------------------

create table public.meeting_comment_reactions (
  comment_id uuid not null references public.meeting_comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (emoji in ('👍','❤️','😂','🔥')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);

alter table public.meeting_comment_reactions enable row level security;

create policy meeting_comment_reactions_read on public.meeting_comment_reactions
  for select using (
    exists (
      select 1 from public.meeting_comments c
      join public.meetings m on m.id = c.meeting_id
      where c.id = comment_id
        and auth.uid() is not null
        and (
          m.participants_override is null
          or exists (
            select 1 from jsonb_array_elements_text(m.participants_override) x
            where x.value = auth.uid()::text
          )
          or m.host_user_id = auth.uid()
          or m.created_by  = auth.uid()
        )
    )
  );

create policy meeting_comment_reactions_write on public.meeting_comment_reactions
  for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, delete on public.meeting_comment_reactions to authenticated;
grant select, insert, update, delete on public.meeting_comment_reactions to service_role;
