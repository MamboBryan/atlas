# Pre-Meeting Games — Design Spec

**Date:** 2026-07-25
**Status:** Draft, awaiting review
**Scope:** Add a lightweight competitive game system that runs in the meeting lobby (before the meeting starts) with per-meeting scoreboards and an instance-wide all-time leaderboard. Two game modes ship in v1.

> **Tenancy note:** Atlas is single-tenant per deployment — there is no workspace concept. "Instance-wide" means all authenticated Atlas users share one leaderboard. Wherever this spec previously referenced `workspace_id`, read it as "no additional scoping column needed."

## Goals

- Turn the awkward "waiting for people to join" minutes into a warm, competitive moment.
- Zero content maintenance — no question banks, no puzzle authoring, no host effort.
- Works for any team size (2 to 200+ players in the same meeting).
- Rounds fit in 45–60 seconds so they never delay the actual meeting.
- Leaderboard creates real, running team rivalry without needing external tools.

## Non-goals (v1)

- Localization of game content (English-only expression display for Target Number is fine).
- Per-series or per-meeting game-length overrides.
- Custom games authored by users.
- Badges, streaks, seasons, tournaments, replays, disputes.
- Mobile-native input polish beyond "works on a phone browser."
- Any presence in the agenda itself — games live only in the lobby.

## Overview

The meeting detail page (`/meetings/[id]`) gets a new **Lobby panel** shown above the agenda whenever the meeting hasn't started yet. When the first player lands in the lobby within 10 minutes of the scheduled start, the server picks one random enabled game and generates the puzzle. Everyone in the lobby sees the same puzzle simultaneously, plays their own round, and results reveal at the end. Points from every round flow into a single instance-wide **all-time leaderboard**.

Two games ship together in v1: **Target Number** (Countdown-style math dash) and **Zero In** (bounded number guess with 3 attempts and hi/lo feedback). Both were chosen because they need zero shipped content — puzzles are pure RNG.

## User experience

### Where the game appears

- Meeting page shows the game panel above the agenda from `scheduled_at − 10 min` until the host presses **Start meeting**.
- If games are disabled for the workspace, the panel is hidden — no visual regression.
- Panel has three states depending on round status:
  - **Idle** (no round yet, waiting for first entrant): shows game name + "Round starts when someone joins."
  - **Active**: shows the round UI (see per-game sections).
  - **Finished**: shows the reveal + this-round scoreboard, with a toggle to view all-time standings.

### Host behaviour

- The host plays alongside everyone else — no separate host UI.
- Pressing **Start meeting** force-closes any active round; players still mid-round get their best result so far scored.
- If a round is already finished, "Start meeting" just proceeds as today.

### Late-joiner rules

- Enter *during* an active round → immediately playable with the reduced remaining time. No prorating — reduced time is its own natural penalty (less time to think for Target Number, fewer usable seconds for their 3 guesses in Zero In).
- Enter *after* the round finished → see the reveal + scoreboard, no play, no points.

### Player privacy during a round

- No player can see another player's guesses, expression, or intermediate results while the round is active.
- The only shared live signal is a "N of M players submitted" counter (reuses the existing `ParticipationCounter` pattern).
- Everyone's final result and expression is revealed after the round ends.

## Game 1 — Target Number (Math Dash)

### Puzzle

- **Target:** random integer 100–999.
- **Base chips:** six numbers = 2 "large" (drawn from `{25, 50, 75, 100}`) + 4 "small" (drawn from `1..10`, with repeats allowed).
- Generated server-side at round creation, stored on the round row.

### Rules

- 60-second round timer.
- Build an expression by tapping chips and operators (guided builder — no free-text parser).
- Each base chip is usable at most once.
- Intermediate results become new chips (e.g. `25 + 50 = 75` becomes a usable chip).
- Intermediate results must be positive integers. Operations that would produce fractions or negatives are visually disabled.
- Undo reverts the last operation and re-enables consumed chips.
- Submit locks in a result. Players may resubmit until the timer expires; the best submission counts.
- Best-of-submissions is scored as "your result," where "best" = closest to target, ties broken by earliest submission time.

### Scoring

| Result | Base points |
|---|---|
| Exact match | 30 |
| Within 5 | 20 |
| Within 10 | 10 |
| Further than 10 | 0 |

Plus a **time bonus of up to 15 points** on top of base points, linearly decreasing from 15 (submitted at 0s elapsed) to 0 (submitted at 60s elapsed). Time bonus is applied only when base points are earned.

**Maximum per round: 45 points.**

## Game 2 — Zero In

### Puzzle

- **Secret number:** random integer 1–1000.
- Generated and stored server-side; never sent to clients until reveal.

### Rules

- 45-second round timer.
- Each player has exactly 3 guesses.
- After each guess the server responds `higher` or `lower` — no distance revealed.
- Guesses can be submitted anytime within the timer, sequentially.
- If the timer expires with unspent guesses, the round ends immediately for that player.
- The *closest of the player's submitted guesses* counts as their result (not their final guess).

### Scoring

Scores stack — a player can earn multiple tiers in the same round.

| Condition | Points |
|---|---|
| Any guess exactly matches the secret | 25 |
| Closest player in the round | 12 |
| Best guess within 1% of secret (±10) | 5 |
| Best guess within 5% of secret (±50) | 3 |
| Submitted at least one guess | 1 |

**Maximum per round: 46 points** (exact + closest + within 1% + within 5% + submitted).

Tiebreak for "closest player": earliest submission time of the winning guess.

## System-level rules

### Game selection

- Each round, the server picks one game uniformly at random from the pool of enabled games.
- The enabled pool is a plain constant list in `lib/games/select.ts` for v1 — both games are always on. No admin UI, no per-instance toggle. If we later want an admin toggle, it slots in without changing the round shape.
- No host override in v1 — random keeps things fresh and removes a decision from the host.

### Leaderboards

- **Per-round scoreboard:** shown in the lobby immediately after the round finishes; lists every player, their result, points earned, and rank.
- **All-time leaderboard:** shown as a toggle in the post-round panel and also at a dedicated `/leaderboard` route. Sum of all points ever earned by each player across the whole Atlas instance, sorted descending.
- Both games contribute to the same all-time leaderboard — points are points.
- Score caps are balanced (~45 both games) so neither game dominates the leaderboard by playing more often.

### Anti-cheat

- Puzzles generated server-side and stored — clients never generate their own puzzle.
- Submissions validated server-side (expression evaluator for Target Number; range + guess-history check for Zero In).
- Points recomputed server-side from the stored `payload` at round finalization; client-provided scores are ignored.
- Zero In's hi/lo feedback is server-computed on each guess submission.

## Data model

Two new tables. No `workspace_id` — Atlas is single-tenant.

```
game_rounds
  id              uuid pk
  meeting_id      uuid fk → meetings          (UNIQUE — one round per meeting)
  kind            text ('target_number' | 'zero_in')
  puzzle          jsonb                        (schema depends on kind, see below)
  started_at      timestamptz not null
  ends_at         timestamptz not null         (started_at + game duration)
  status          text ('active' | 'finished')
  finalized_at    timestamptz                  (nullable, set on status → finished)
  created_at      timestamptz default now()

game_submissions
  id              uuid pk
  round_id        uuid fk → game_rounds
  player_id       uuid fk → profiles
  payload         jsonb                        (schema depends on round.kind)
  submitted_at    timestamptz                  (last-updated timestamp)
  points          int                          (nullable until finalized_at is set)
  UNIQUE (round_id, player_id)                 (one row per player per round; upserted)
```

**`puzzle` JSON shapes:**

```jsonc
// kind = 'target_number'
{ "target": 347, "bases": [2, 4, 7, 25, 50, 75] }

// kind = 'zero_in'
{ "secret": 673 }   // never sent to clients until finalization
```

**`payload` JSON shapes:**

```jsonc
// kind = 'target_number'
{
  "best_result": 348,
  "expression": [
    { "op": "*", "left": 50, "right": 7, "result": 350 },
    { "op": "-", "left": 350, "right": 2, "result": 348 }
  ],
  "best_submitted_at": "2026-07-25T13:37:42.123Z"
}

// kind = 'zero_in'
{
  "guesses": [
    { "value": 500, "at": "…", "feedback": "higher" },
    { "value": 750, "at": "…", "feedback": "lower" },
    { "value": 675, "at": "…", "feedback": "lower" }
  ],
  "best_guess": 675
}
```

### Leaderboard query

Start with an on-the-fly aggregate:

```sql
select s.player_id, sum(s.points) as total_points, count(*) as rounds_played, max(r.finalized_at) as last_played_at
from game_submissions s
join game_rounds r on r.id = s.round_id
where r.status = 'finished' and s.points is not null
group by s.player_id
order by total_points desc;
```

Promote to a materialized view only if this becomes a hot path.

### RLS

Meeting visibility already gates access to related rows via the meetings table's participants/host/creator predicates (see `0014_agenda_items.sql` for the reference pattern). Games apply the same gate.

- `game_rounds`: readable by any authenticated user who can already read the parent meeting (same predicate as agenda_items). Insert/update via server actions run with the caller's session; the RLS write policy accepts inserts from anyone who can read the meeting (so the first player through the lobby can ensure the round). Direct client updates to `status` are blocked by policy — only the `atlas_finalize_game_round` SQL function (SECURITY DEFINER) can flip it.
- `game_submissions`: readable by anyone who can read the parent round. Insert/update allowed only when `player_id = auth.uid()`, `round.status = 'active'`, and `now() < round.ends_at`. The `points` column is not writable through the API — it's only set by `atlas_finalize_game_round`.

## Round lifecycle

```
Not created ──(first player enters lobby, ≤10min before meeting.scheduled_at)──▶ Active
Active ──(now ≥ ends_at ─OR─ host presses "Start meeting")──▶ Finished
```

- **Ensure round** (idempotent): called client-side when the lobby panel mounts. If a `game_rounds` row for this meeting exists → return it. Otherwise, pick a random enabled game, generate its puzzle, insert the row with `ends_at = now() + game_duration`, return it. Concurrent callers race on the `UNIQUE (meeting_id)` constraint and the loser reads back the winner's row.
- **Submit** (Target Number): upsert the player's `game_submissions` row; server evaluates the expression and stores the result in `payload`; rejects if `now() ≥ ends_at` or `status = 'finished'`.
- **Guess** (Zero In): server appends to `payload.guesses`, computes hi/lo, returns the feedback; rejects on stale round; enforces max 3 guesses per player.
- **Finalize:** server action that flips `status → 'finished'`, sets `finalized_at`, computes and writes each submission's `points`, broadcasts the full scoreboard over the realtime channel. Triggered by either (a) the host's "Start meeting" flow calling it inline, or (b) a lightweight edge-function cron that sweeps rounds where `ends_at < now() and status = 'active'`.

## Realtime

- One Supabase channel per round, keyed `round:{round_id}`.
- Message types:
  - `submission-count` — throttled to 1/sec, carries `{ count, total }` for the participation indicator.
  - `round-finished` — carries the finalized scoreboard and (for Zero In) the revealed secret.
- Clients subscribe on mount, unsubscribe on unmount. Reuse the `ParticipationCounter` `instanceId` dependency pattern to avoid multi-instance channel collisions when the panel is mounted alongside other realtime components on the same page.
- No per-guess broadcasts — keeping guesses private preserves fairness. The finished message reveals everything at once.

## Files touched

New:

- `supabase/migrations/<timestamp>_pre_meeting_games.sql` — tables, indexes, RLS policies.
- `lib/zod/game.ts` — Zod schemas for puzzles, submissions, and per-kind payloads.
- `lib/actions/game.ts` — server actions: `ensureRound`, `submitTargetNumber`, `submitZeroInGuess`, `finalizeRound`, `getLeaderboard`.
- `lib/games/target-number.ts` — puzzle generator + expression evaluator + scorer.
- `lib/games/zero-in.ts` — puzzle generator + guess validator + scorer.
- `components/games/game-lobby-panel.tsx` — server component; fetches round, dispatches to per-kind client component.
- `components/games/target-number-round.tsx` — client component; expression builder, chips, operators, undo, submit.
- `components/games/zero-in-round.tsx` — client component; guess input, hi/lo history, guess counter.
- `components/games/round-countdown.tsx` — shared draining progress bar; amber at 15s, red at 5s.
- `components/games/round-scoreboard.tsx` — shared post-round reveal with per-round + all-time toggle.
- `app/(app)/leaderboard/page.tsx` — workspace all-time leaderboard route.

Modified:

- `app/(app)/meetings/[id]/page.tsx` — mount `<GameLobbyPanel meetingId={...} />` above the agenda when the meeting hasn't started.
- `components/meetings/meeting-live-view.tsx` — ensure "Start meeting" flow calls `finalizeRound` before transitioning.
- No settings UI in v1. Both games are always enabled; the enabled pool is a hardcoded array in `lib/games/select.ts`.

Untouched:

- `lib/zod/meeting.ts` `addAgendaItem` discriminated union — games are **not** agenda items.
- All existing agenda-item rendering.

## Rollout

- Ship both games together — no feature flag in v1. If either game shows problems, remove it from the enabled array in `lib/games/select.ts` and ship a patch.
- No migration of historical data needed — leaderboard is empty at launch.

## Open questions

None blocking. Explicitly decided:

- Games do not live in `agenda_items` — the meeting page owns the lobby panel as a sibling.
- Points across games flow into one leaderboard, not per-game.
- Game selection is random per round with no host override.
- Score caps are rebalanced to ~45 for both games.
