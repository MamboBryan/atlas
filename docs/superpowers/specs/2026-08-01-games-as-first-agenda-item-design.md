# Games as the pinned first agenda item — design

Date: 2026-08-01
Status: Approved (brainstorm), pending spec review

## Problem

The pre-meeting games feature currently mounts a `GameLobbyPanel` on the
scheduled meeting page that **auto-creates and starts a game round on render**.
This is unwanted: opening a meeting should not start a game. The desired model
is that the game is an explicit, opt-in part of the meeting agenda that starts
under the presenter's control during the meeting.

## Goals

- Opening a meeting never starts a game round.
- When the host opts in, the game appears as the **first agenda item**, pinned
  and locked — it cannot be moved up/down or deleted, and no item can sit above
  it.
- The game round starts **only when the presenter advances to the game item**
  during live present mode.
- Participants play on their own devices; the presenter's screen shows the
  countdown, live submission count, then the scoreboard; the presenter clicks
  **Next** to continue.
- The pre-meeting lobby is kept but becomes a passive waiting room.

## Non-goals

- No backfill of existing meetings (new meetings only).
- No auto-advance after the game (presenter advances manually).
- No general "locked agenda item" concept — locking is specific to `kind='game'`.
- No change to game scoring/puzzle logic or the `game_rounds`/`game_submissions`
  schema.

## Confirmed decisions

| Question              | Decision                                                           |
| --------------------- | ------------------------------------------------------------------ |
| Old pre-meeting lobby | Keep it, but as a passive waiting room (no round created on open)  |
| Scope                 | Host opt-in toggle at meeting/series creation                      |
| Backfill              | New meetings only                                                  |
| Round-start trigger   | Presenter advancing to the game item (live); lobby never starts it |
| Play & finish         | Participants play on own devices; presenter advances manually      |
| Locking mechanism     | Identify/lock by `kind='game'`, no new column                      |

## Data model

### Migration `0028_agenda_kind_game.sql`

```sql
alter type public.agenda_kind add value 'game';
```

- `agenda_items` existing check constraints already allow a kind with neither
  `prompt_id` nor `picker_config` (the same shape as `discussion`), so a game
  item is valid with no further schema change.
- `game_rounds` stays **1:1 per meeting** (`meeting_id` unique) — unchanged. The
  game agenda item and the round correspond implicitly (both one-per-meeting).
  The item carries no FK to the round; `kind='game'` is the only marker.

Note: `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block in
Postgres. The migration must contain only this statement (Supabase runs each
migration file appropriately).

## Seeding (opt-in)

- The meeting-creation form gains an **"Include pre-meeting game"** checkbox.
- `createMeetingAction` / `createOneOff` inserts a game agenda item at
  `ordinal = 0` when the box is checked. Default title: e.g. "Pre-meeting game".
- Subsequently added items keep using `max(ordinal) + 1`, so they always land
  after the game item.
- **Series:** meetings generated from a series inherit the game item if the
  series' agenda template contains one — the existing agenda-copy logic in
  `lib/actions/meeting.ts` handles this with no extra work. Enabling the toggle
  at series level means adding the game item to the series template.

## Locking (cannot move or delete)

- `reorderAgendaAction`: server-side guard normalizes the game item to
  `ordinal = 0` and rejects any requested order that places another item above
  it.
- `AgendaEditor` (client): for the game item, hide the move-up / move-down and
  delete controls, render a small "Plays first · locked" badge, and prevent
  dropping other items above it.
- `addAgendaItemAction` already appends (`max+1`), so new items never precede the
  game item.

## Removing autostart → waiting room

- `GameLobbyPanel`: stop calling `ensureRoundAction` on render. Render only the
  waiting-room message, shown only when the meeting opted in (has a game item)
  and is `scheduled`:
  > "🎮 The game starts when the host begins the meeting."
- `ensureRoundAction` guards change from _scheduled + 10-minute lobby window_ to
  _meeting is `live` + caller is host + a game item exists_. It is now called
  exclusively from the present flow.

## Round start on presenter advance

- `advanceMeetingAgenda`: when the target item's `kind = 'game'`, ensure the
  round exists (create with `ends_at = now + duration`) as part of setting it as
  the current item. Host-only (advance already is). Idempotent — re-advancing to
  the game item returns the existing round.

## Present slide + participant surface

Both reuse the existing game components (`TargetNumberRound`, `ZeroInRound`,
`SubmissionCounter`, `RoundScoreboard`).

- `lib/present/slide-state.ts`:
  - add `'game'` to `AgendaItemLite.kind`;
  - add slide state `{ kind: 'game'; item: AgendaItemLite }`;
  - `deriveSlideState` returns it when the current item is a game item. Round
    status (active vs finished) is resolved inside the slide component via
    realtime, matching how the other realtime components already work.
- New `components/present/slides/game-slide.tsx`: subscribes to the round, shows
  puzzle/target, countdown, and live `SubmissionCounter`; when the timer ends it
  shows `RoundScoreboard`. Wired into the present-shell slide renderer.
- **Finalize trigger:** when the countdown reaches 0, the **presenter's** client
  calls `finalizeRoundAction` (authoritative server-side scoring; flips status to
  `finished`). The scoreboard then propagates to all participants via realtime.
- Participants' `MeetingLiveView` / `AgendaRunner`: when the current item is the
  game and the round is active, render the play components + `SubmissionCounter`;
  when finished, render `RoundScoreboard`.

## Testing

- **Unit**
  - `reorderAgendaAction` guard keeps the game item at ordinal 0 and rejects
    orders that move another item above it.
  - Seeding inserts a game item at ordinal 0 only when opted in.
  - `deriveSlideState` returns `game` for a game item.
- **Present flow**
  - Advancing to the game item creates the round (idempotent on re-advance).
  - Timer → `finalizeRoundAction` → scoreboard.
- **RLS** unchanged — `game_rounds` / `game_submissions` already covered by
  `games_rls.sql`.

## Files touched (implementation map)

- `db/supabase/supabase/migrations/0028_agenda_kind_game.sql` (new)
- `lib/actions/meeting.ts` — seed game item; ensure round on advance to game item
- `app/(app)/meetings/actions.ts` + creation form — opt-in toggle
- `lib/actions/agenda.ts` — reorder guard
- `lib/actions/game.ts` — `ensureRoundAction` guard change
- `components/games/game-lobby-panel.tsx` — waiting room only
- `components/meetings/agenda-editor.tsx` — lock UI for game item
- `lib/present/slide-state.ts` — `game` slide state
- `components/present/slides/game-slide.tsx` (new) + present-shell wiring
- `components/meetings/meeting-live-view.tsx` / `agenda-runner.tsx` — play surface
- Tests under `tests/`
