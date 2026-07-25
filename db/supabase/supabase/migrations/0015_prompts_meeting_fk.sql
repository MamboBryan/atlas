alter table public.prompts
  add constraint prompts_meeting_fk
  foreign key (meeting_id) references public.meetings(id) on delete set null;

drop policy prompts_read_all on public.prompts;

create policy prompts_read on public.prompts
  for select using (
    auth.uid() is not null
    and (
      meeting_id is null
      or exists (
        select 1 from public.meetings m
        where m.id = meeting_id
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
    )
  );
