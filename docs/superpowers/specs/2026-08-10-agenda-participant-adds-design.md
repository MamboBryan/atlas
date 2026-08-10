# Participant agenda adds before live, host-only during live

**Date:** 2026-08-10
**Status:** Approved

## Problem

The app layer and the database disagree about who may add agenda items, and the
database wins.

`lib/actions/agenda.ts:38-40` intends "any participant may add an item while the
meeting is live; otherwise host-only", and `components/meetings/meeting-rail.tsx:28`
renders the add form on that same rule. But the only write policy on the table,
`agenda_items_write_host` (`db/supabase/migrations/0014_agenda_items.sql:41`),
grants insert/update/delete solely to `m.host_user_id = auth.uid()` or
`public.atlas_is_admin(auth.uid())`. `requireUser()` returns the cookie-scoped
client, so RLS applies to the insert.

A non-host participant in a live meeting therefore sees the form, fills it in,
and gets a generic `db_error` from `agenda.ts:66`.

The intended rule is also the inverse of what the code attempts:

- **Before the meeting is live** — any participant may add an agenda item.
- **Once the meeting is live** — only the host or an atlas admin may add.

## Decisions

| Question | Decision |
| --- | --- |
| Who may add during a live meeting | Meeting host **or** atlas admin — the existing `agenda_items_write_host` condition, unchanged |
| Who counts as a participant pre-live | Anyone who can read the meeting: `participants_override is null`, or listed in it, or host, or creator |
| Which non-live statuses allow participant adds | `scheduled` and `postponed`. `ended` and `cancelled` stay locked for everyone |
| May a participant edit/delete their own item | No. Add is the only widened verb; update/delete/reorder stay host+admin |
| Which kinds may a participant add | `discussion`, `prompt`, `picker`. Not `game` — games are presenter-run segments the host starts and finalizes |

## Approach

Add a second, insert-only permissive RLS policy rather than rewriting the
existing one. Postgres OR's permissive policies, so the host/admin path is
untouched, and a policy declared `for insert` has no `using` clause — it cannot
widen update or delete.

Rejected alternatives:

- **Rewrite `agenda_items_write_host` as one status-aware `for all` policy.**
  Fewer objects, but it rewrites the host path (regression risk across
  update/delete/reorder), and a `using` clause mentioning participants would also
  widen delete.
- **Handle participant inserts in the server action via the service client.**
  Moves authorization out of the database, against the pattern used everywhere
  else in this codebase.

## Changes

### 1. Migration `0037_agenda_participant_adds.sql`

```sql
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
```

The participant predicate matches the shape already used by
`meetings_read_participants` (`0013_meetings.sql:29`) and
`meeting_comments_insert` (`0022_present_mode.sql:52`).

`agenda_items_write_host` is left in place and still covers every status and
every verb for hosts and admins.

### 2. Server action — `lib/actions/agenda.ts`

Replace the `canAdd` computation in `addAgendaItemAction` so it mirrors the
policy:

```ts
const isHostOrAdmin =
  meeting.host_user_id === user.id || (await isCurrentUserAdmin());
const preLive =
  meeting.status === "scheduled" || meeting.status === "postponed";
const canAdd = isHostOrAdmin || (preLive && parsed.data.kind !== "game");
```

Uses the existing `isCurrentUserAdmin()` from `lib/auth/is-admin.ts`. Return
distinct `forbidden` details for the two participant-denial cases — live meeting
vs. game kind — so a rejection reads as an authorization failure rather than the
generic `db_error` it produces today.

`updateAgendaItemAction`, `deleteAgendaItemAction` and `reorderAgendaAction` are
unchanged: they keep the `assertHost` gate.

### 3. UI — `meeting-rail.tsx` and `agenda-add-item.tsx`

`MeetingRail` computes the same predicate it passes to the action. Its current
copy inverts: "Only the host can edit the agenda before it starts" becomes wrong
under the new rule and is replaced by a live-meeting message ("Only the host can
add agenda items once the meeting is live"). The `ended`/`cancelled` early
return stays as-is.

`AgendaAddItem` takes an `allowGame: boolean` prop and filters `game` out of
`KINDS` when false, so the form never offers a kind the database will reject.
The host's prompt list query stays gated on the same `canAdd`.

## Data flow

1. `MeetingRail` reads the meeting, derives `canAdd` and `allowGame`, and either
   renders `AgendaAddItem` or the explanatory message.
2. `AgendaAddItem` posts to `addAgendaItemAction`, which re-derives the same
   predicate server-side — the UI gate is a convenience, not the control.
3. The insert runs on the user-scoped client and is checked a third time by RLS.
   The action gate and the policy are deliberately redundant: the policy is the
   real boundary, and the action exists to return a clean error code.

## Error handling

- Participant adding during a live meeting → `forbidden`, "host only once live".
- Participant adding a `game` kind → `forbidden`, "host only".
- `ended`/`cancelled` meeting → unchanged; the rail short-circuits and the
  host-only policy governs any direct call.
- Any insert that still trips RLS → existing `db_error` path, which should now
  be unreachable through the UI.

## Testing

- `db/supabase/tests/meetings_rls.sql:23` asserts `agenda_items` has exactly 2
  policies; update to 3 and name the new one in the assertion message.
- New RLS integration test under `tests/actions/`, using the existing
  `userClient`/`makeMeeting` harness from `tests/actions/game-test-helpers.ts`:
  - participant insert into a `scheduled` meeting → allowed
  - participant insert into a `postponed` meeting → allowed
  - participant insert into a `live` meeting → denied
  - participant insert of `kind = 'game'` pre-live → denied
  - participant `update` and `delete` of an existing item pre-live → denied
  - host insert while live → allowed
  - atlas admin insert while live → allowed

## Out of scope

- Participants editing or deleting items they added. `agenda_items` has no
  `created_by` column, so this needs a schema change and a backfill.
- Reordering by participants.
- Any change to the read policy, which already grants agenda visibility to every
  signed-in user on meetings with `participants_override is null`.
