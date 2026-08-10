-- 0037_agenda_participant_adds.sql
-- Any participant may add an agenda item before the meeting goes live; once
-- live, adds are host-or-admin only.
--
-- This is an additive, insert-only permissive policy. Postgres OR's permissive
-- policies, so agenda_items_write_host is untouched and still covers every
-- verb and status for hosts and admins. Declaring `for insert` means there is
-- no `using` clause, so update and delete cannot widen.

create policy agenda_items_insert_participant on public.agenda_items
  for insert with check (
    kind <> 'game'
    and exists (
      select 1 from public.meetings m
      where m.id = meeting_id
        and auth.uid() is not null
        and m.status in ('scheduled','postponed')
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
