create type public.agenda_kind as enum ('discussion','prompt','picker');

create table public.agenda_items (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null references public.meetings(id) on delete cascade,
  ordinal       int  not null,
  title         text not null check (char_length(title) between 1 and 120),
  kind          public.agenda_kind not null,
  prompt_id     uuid references public.prompts(id) on delete set null,
  picker_config jsonb,
  picker_result jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (meeting_id, ordinal),
  check ((kind = 'prompt')  = (prompt_id     is not null)),
  check ((kind = 'picker')  = (picker_config is not null))
);

create index agenda_items_meeting_idx on public.agenda_items(meeting_id);

alter table public.agenda_items enable row level security;

create policy agenda_items_read on public.agenda_items
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
          or m.created_by = auth.uid()
        )
    )
  );

create policy agenda_items_write_host on public.agenda_items
  for all
  using (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_id
        and (m.host_user_id = auth.uid() or public.atlas_is_admin(auth.uid()))
    )
  )
  with check (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_id
        and (m.host_user_id = auth.uid() or public.atlas_is_admin(auth.uid()))
    )
  );

create trigger agenda_items_touch before update on public.agenda_items
  for each row execute function public.atlas_touch_updated_at();

grant select, insert, update, delete on public.agenda_items to authenticated;
grant select, insert, update, delete on public.agenda_items to service_role;
