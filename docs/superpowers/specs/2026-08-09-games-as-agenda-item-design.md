# Games as an Agenda Item — Design Spec

**Date:** 2026-08-09
**Status:** Approved, ready for implementation planning
**Supersedes:** the lobby-panel delivery model in `2026-07-25-pre-meeting-games-design.md`. That spec's game rules, scoring, and puzzle generation stay in force unchanged — only *where and how a round runs* changes.

## Problem

Games currently live in a **lobby panel** on `/meetings/[id]`, auto-starting when the first player lands within 10 minutes of `scheduled_start`. That model has no host control, no shared big-screen moment, and no relationship to the agenda. The game happens off to the side of the meeting instead of inside it.

## Goals

- A game is an agenda item like any other — the host places it where they want it.
- The presenter runs it: they reach the game slide, then **Start** or **Skip**, and can **Finish** whenever they like.
- Fullscreen presentation, same visual language as the rest of present mode.
- Non-presenters get a persistent nudge to play that clears itself the moment it stops being relevant.

## Non-goals

- Any change to game rules, scoring, or puzzle generation. `lib/games/target-number.ts` and `lib/games/zero-in.ts` are untouched.
- Host choosing *which* game runs — selection stays random at Start time.
- Recording that an item was skipped.
- The presenter playing along.

## Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Round clock | Default countdown, presenter may Finish early | Keeps existing time-bonus scoring intact; a round that never ends is a room-management hazard |
| Getting a game on the agenda | Host adds it manually, like discussion/prompt/picker | No surprise items, no backfill rules for existing meetings |
| Lobby panel | Removed entirely | One coherent story: games are presenter-run |
| Play card | Sticky on `/meetings/[id]`, opens a fullscreen overlay | Immersive without a global cross-page provider |
| Presenter plays? | No | Their screen is the shared display; puzzle + scoreboard + room control is enough |
| Skip | Writes nothing, just advances | A skipped game stays startable if the presenter returns to the item |

## Data model

### `agenda_kind`

```sql
alter type public.agenda_kind add value 'game';
```

**Implementation gotcha:** Postgres forbids *using* a newly added enum value in the same transaction that adds it. This migration only adds the value — no statement in `0033` writes or compares `'game'` — so a single migration file is safe. Any future migration that needs to reference `'game'` in a predicate must be a separate file.

The existing `agenda_items` check constraints hold unchanged:

- `(kind = 'prompt') = (prompt_id is not null)` — a game item has no `prompt_id`. ✓
- `(kind = 'picker') = (picker_config is not null)` — a game item has no `picker_config`. ✓

No new columns on `agenda_items`.

### `game_rounds` re-anchors to the agenda item

```sql
alter table public.game_rounds
  drop constraint game_rounds_meeting_id_key,          -- the unique (meeting_id)
  add  column agenda_item_id uuid not null
       references public.agenda_items(id) on delete cascade,
  add  constraint game_rounds_agenda_item_key unique (agenda_item_id);

create index game_rounds_agenda_item_idx on public.game_rounds(agenda_item_id);
```

`meeting_id` stays — the RLS predicates and the realtime filter both key off it.

Consequences:

- A meeting may contain several game items; each holds its own independent round and scoreboard.
- One round per item, forever. Revisiting a finished item shows its scoreboard rather than re-rolling a new puzzle.

**Existing rows:** the column is `not null`, so the migration must handle any `game_rounds` rows created under the lobby model. There is no agenda item to attach them to. Delete them — they are throwaway pre-meeting rounds and the feature has not shipped to production as an agenda flow.

```sql
delete from public.game_rounds;  -- lobby-era rounds have no agenda item to anchor to
```

This cascades to `game_submissions`, which zeroes the leaderboard. Acceptable: the leaderboard is not yet meaningful.

### `ends_at` and finalization

`ends_at` keeps its per-game default (`TARGET_NUMBER_DURATION_MS` 60s, `ZERO_IN_DURATION_MS` 45s), set at Start.

Presenter **Finish now** calls the same `finalizeRoundAction` the countdown expiry calls. `atlas_finalize_game_round` already returns early when `status = 'finished'`, so concurrent finalize calls are idempotent — no locking work needed.

### RLS change

`game_rounds_insert` currently accepts an insert from anyone who can read the meeting — correct under the lobby model, wrong now. Tighten to host-or-admin, matching `agenda_items_write_host`:

```sql
drop policy game_rounds_insert on public.game_rounds;

create policy game_rounds_insert_host on public.game_rounds
  for insert with check (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_id
        and (m.host_user_id = auth.uid() or public.atlas_is_admin(auth.uid()))
    )
  );
```

`game_rounds_read`, both `game_submissions` policies, and the realtime publication from `0027` are unchanged.

## Presenter experience

`/meetings/[id]/present` is already host-gated (`m.host_user_id !== user.id → redirect`), so **presenter == host** throughout this spec.

### Slide state

`lib/present/slide-state.ts` gains three states:

```ts
| { kind: "game-idle";     item: AgendaItemLite }
| { kind: "game-active";   item: AgendaItemLite; round: RoundLite }
| { kind: "game-finished"; item: AgendaItemLite; round: RoundLite }
```

`deriveSlideState` takes a fourth argument, `roundsByItemId: Record<string, RoundLite>`, and stays a pure function so it remains unit-testable. Derivation for `kind === "game"`:

- no round for the item → `game-idle`
- round `status === 'active'` → `game-active`
- round `status === 'finished'` → `game-finished`

`AgendaItemLite["kind"]` widens to `"discussion" | "prompt" | "picker" | "game"`.

### `components/present/slides/game-slide.tsx`

**Idle.** Item title, "A quick game — the game is picked at random when you start", and two buttons:

- **Start round** → `startRoundAction({ agenda_item_id })`, then the realtime insert flips the slide to active.
- **Skip** → `advanceNext()`. Nothing is written.

**Active.** Rendered for the room:

- Target Number: the target and the six base chips, large.
- Zero In: "Guess the secret number, 1–1000. Three tries." — there is nothing to show.
- Both: a draining countdown to `ends_at` (reuse `components/games/round-countdown.tsx`), a live "N of M submitted" counter (reuse `components/games/submission-counter.tsx`), and **Finish now**.

`SubmissionCounter` needs an `eligibleCount`. That figure was computed inside the deleted `GameLobbyPanel` — participants_override length, else the `profiles` row count. That computation moves to `present/page.tsx`, which passes `eligibleCount` down through `PresentShell` to `GameSlide`. Since the presenter does not play, the count excludes them: `eligibleCount - 1`.

When the countdown reaches zero the presenter's client calls `finalizeRoundAction` itself. If the presenter has disconnected, the round stays `active` in the DB — but RLS already blocks submissions past `ends_at`, so nothing is scored incorrectly, and the next visit to the slide finalizes it.

**Finished.** `RoundScoreboard` reveal, plus the secret for Zero In, then Next.

Palette comes from `paletteForOrdinal(item.ordinal)` like every other item slide.

### Shell plumbing

`present-shell.tsx`:

- New `roundsByItemId` state, seeded from the server by `present/page.tsx`.
- A `refreshRounds` callback mirroring `refreshItems`, wired into the existing meeting channel with a `game_rounds` postgres_changes subscription filtered on `meeting_id=eq.{id}`.
- `deriveSlideState` call passes the new argument.
- `GameSlide` added to the slide switch.

`present/page.tsx` fetches `game_rounds` for the meeting alongside its existing agenda/prompt/comment queries and passes them down.

## Non-presenter experience

### Removed

`components/games/game-lobby-panel.tsx` is deleted, along with its mount in `app/(app)/meetings/[id]/page.tsx` and the `LOBBY_OPEN_WINDOW_MS` window logic in `lib/actions/game.ts`.

### Sticky play card

`components/games/game-play-card.tsx` pins to the bottom of `/meetings/[id]`. Visible when **all** of:

1. an `active` round exists for this meeting,
2. the viewer is not the host,
3. the viewer has no `game_submissions` row for that round.

It disappears when any of those stops holding:

| Trigger | Signal |
| --- | --- |
| Viewer submits | `game_submissions` INSERT for `(round, viewer)` over realtime |
| Presenter finishes | `game_rounds` UPDATE `status → finished` |
| Countdown expires | Local timer against `ends_at` |

"Played" means a `game_submissions` row exists — one expression for Target Number, one guess for Zero In. Both games create that row on first submit, so the rule is uniform.

### Fullscreen play overlay

`components/games/game-play-overlay.tsx` wraps the existing `TargetNumberRound` / `ZeroInRound` clients in a fullscreen surface using present-mode palettes. Escape or a close button returns to the meeting page.

If the presenter finishes while the overlay is open, the overlay swaps to the scoreboard rather than closing itself — yanking a fullscreen surface out from under someone mid-interaction is hostile.

### Agenda runner

`components/meetings/agenda-runner.tsx` handles `kind === "game"` in the "Now" section: waiting / play button / results, mirroring the card's state. The sticky card is a nudge, not the only way in.

## Server actions

`lib/actions/game.ts`:

- **`ensureRoundAction` → `startRoundAction({ agenda_item_id })`.** Loads the item and its meeting. Requires `meeting.status === 'live'` and caller is host or admin. Drops the `status === 'scheduled'` and 10-minute-window guards. Picks a game via `pickGame()`, generates the puzzle, inserts with `ends_at = now + duration`. On unique-violation (double-click race) reads back the winner's row.
- **`finalizeRoundAction`** — unchanged in shape; gains a host-or-admin check, since only the presenter or the expiry timer should end a round.
- **`submitTargetNumberAction`, `submitZeroInGuessAction`, `getLeaderboardAction`** — unchanged.

`lib/zod/game.ts`: `ensureRoundInput` (keyed on `meeting_id`) becomes `startRoundInput` (keyed on `agenda_item_id`).

`lib/zod/meeting.ts`: the `addAgendaItem` discriminated union gains

```ts
z.object({
  meeting_id: z.string().uuid(),
  kind: z.literal("game"),
  title: z.string().min(1).max(120),
});
```

## Files touched

**New**

- `db/supabase/migrations/0033_game_agenda_items.sql`
- `components/present/slides/game-slide.tsx`
- `components/games/game-play-card.tsx`
- `components/games/game-play-overlay.tsx`

**Modified**

- `lib/actions/game.ts` — `startRoundAction`, host checks, lobby-window removal
- `lib/zod/game.ts` — `startRoundInput`
- `lib/zod/meeting.ts` — `game` variant in `addAgendaItem`
- `lib/present/slide-state.ts` — three game states, `roundsByItemId`, widened `kind`
- `components/present/present-shell.tsx` — rounds state, realtime, slide switch
- `app/(app)/meetings/[id]/present/page.tsx` — fetch rounds
- `app/(app)/meetings/[id]/page.tsx` — drop lobby panel, mount sticky card
- `components/meetings/agenda-add-item.tsx` — Game tab
- `components/meetings/agenda-editor.tsx` — widened `AgendaItem["kind"]`
- `components/meetings/agenda-runner.tsx` — game branch

**Deleted**

- `components/games/game-lobby-panel.tsx`

**Untouched**

- `lib/games/target-number.ts`, `lib/games/zero-in.ts`, `lib/games/select.ts` — rules and scoring don't change
- `components/games/round-countdown.tsx`, `submission-counter.tsx`, `round-scoreboard.tsx`, `target-number-round.tsx`, `zero-in-round.tsx` — reused as-is
- `app/(app)/leaderboard/page.tsx`

## Testing

- `tests/lib/present-slide-state.test.ts` — add `game-idle` / `game-active` / `game-finished` derivation cases, including a game item with a stale or missing round.
- `tests/actions/game.integration.test.ts` — replace lobby-window cases with: host starts a round on a live meeting; non-host start is rejected; start on a non-live meeting is rejected; presenter finishes early and points are written; double finalize is a no-op.
- `tests/games/target-number.test.ts`, `tests/games/zero-in.test.ts` — unchanged.

## Rollout

Migration is destructive to `game_rounds` (see Data model). It must run before the code deploy, in the established order: schema first, then push. No feature flag — the lobby model is removed in the same change, so there is no coexisting old path to fall back to.
