# Meeting Present Mode — Design Spec

**Date:** 2026-07-25
**Status:** Draft (awaiting user review)
**Author:** brainstorming session with @mambobryan

## Summary

Add a full-screen presentation mode for live meetings. The host clicks **Present**
after starting a meeting and lands on a fullscreen slide runner that walks the
agenda one item at a time. Each slide paints a vibrant palette (rotated by
ordinal), a dedicated slide component for each agenda kind (discussion, prompt,
picker), and a persistent live comments rail on the right. The presentation is
book-ended by a **Standby** screen (with agenda preview + Start button) and a
**Curtain** screen (with a random quirky joke + End meeting button).

In parallel, the meeting detail page gains a persisted comments subsystem so
non-host viewers can drop comments while the host is presenting; those comments
stream into the presenter's rail in realtime.

## Non-goals

- Sharing the fullscreen present view with non-hosts. They see the normal
  meeting detail page with a comment composer.
- Multi-driver / driver-transfer flows.
- Comment editing (only delete-own).
- Comment threading.
- Comment attachments or images.
- AI-generated jokes. Static curated pool only.
- Persisting sub-second timer state across refresh. Client re-derives from
  `timer_ends_at`.
- Present mode for ended / scheduled / cancelled / postponed meetings. Live only.
- Reordering agenda items from inside present mode. Use the agenda editor
  (existing) before starting.

## Locked decisions (from brainstorming)

- **Comments** are persisted in Postgres (not ephemeral broadcast) with
  attribution, emoji reactions, and delete-own.
- **Present mode is host-only**. Non-hosts see the meeting page.
- **Two-step entry**: host clicks Start (existing) → live → Present button
  appears.
- **Dedicated route** `/meetings/[id]/present`, own layout with no app chrome.
- **Palettes cycle by ordinal**. 6 vibrant palettes + Standby palette + Curtain
  palette.
- **Prompt timer**: host picks duration (30s/1m/2m/5m); auto-closes on the
  server when it elapses; host can also close early.
- **Shuffle picker**: host clicks Next each round; big current-person card with
  confetti, "Up next" card in bottom-right.
- **End-of-meeting joke**: static curated pool of ~20, deterministic per
  meeting id.

## Architecture

### Route & entry

- New route: `app/(app)/meetings/[id]/present/page.tsx`.
- Server component guards:
  1. Meeting exists.
  2. `meeting.status === "live"`.
  3. `viewer.id === meeting.host_user_id`.
     Any failure → `redirect("/meetings/[id]")` with a session-flash toast.
- New layout: `app/(app)/meetings/[id]/present/layout.tsx` that renders a bare
  `<html>`-descendant shell with no app sidebar and no page padding. Uses
  `overflow: hidden` on the body wrapper and `min-h-screen` on the shell so the
  slide fills the viewport.
- Entry button: `components/meetings/meeting-header-actions.tsx` adds a
  **Present →** button conditional on `status === "live"` AND `isHost`. It
  navigates to the present route (no server action).

### Client shell

`components/present/present-shell.tsx` is the single client component that
owns present-mode state.

Responsibilities:

- Holds initial `meeting`, `agenda_items[]`, `comments[]`, `prompts_by_id{}`,
  `picker_results_by_item{}` from the server render.
- Subscribes to two Supabase realtime channels:
  - `meeting:<id>` — postgres_changes on `meetings` (status,
    current_agenda_item_id) and `agenda_items` (picker_result, timer_ends_at,
    ordinal).
  - `meeting-comments:<id>` — postgres_changes on `meeting_comments` and
    `meeting_comment_reactions`.
- Derives the current slide state from meeting + current item + prompt/picker
  state.
- Renders `<PresentStage/>` (the palette-painted left column) and
  `<PresentRail/>` (the comments right column) side-by-side.
- Handles keyboard shortcuts:
  - `Esc` — navigate back to `/meetings/[id]`.
  - `→` and `Space` — advance (equivalent to clicking the primary
    Start / Next / Next person / Next item button on the current slide).
    Ignored when focus is inside the host composer's textarea.
  - `←` — no-op in v1 (no rewind). Reserved for future use.
- Reload / late-join behavior: on any reload, the server render of
  `/present` is the source of truth for `meeting`, `agenda_items`,
  `prompts`, `picker_results`, and the last N comments. The client
  realtime subscriptions then overlay subsequent changes. This means an
  in-progress timer survives reload — the ring re-derives its countdown
  from the persisted `timer_ends_at`. No client-only ephemeral state is
  lost on reload.

### Slide state derivation

The `prompts` table exposes lifecycle as two booleans (`is_open`,
`is_revealed`) — there is no `status` enum. Present mode maps those to
slide states as follows:

```
if meeting.status !== "live" → shell redirects (should not render)
if current_agenda_item_id === null AND meeting.has_started === false → "standby"
if current_agenda_item_id === null AND meeting.has_started === true  → "curtain"
otherwise let item = items.find(id === current_agenda_item_id)
  match item.kind:
    "discussion"                                     → "discussion"
    "prompt" + prompt.is_open === true               → "prompt-open"
    "prompt" + prompt.is_open === false              → "prompt-closed"
    "picker" + picker_config.mode === "oneshot":
      picker_result == null → "picker-oneshot-idle"
      else                  → "picker-oneshot-revealed"
    "picker" + picker_config.mode === "shuffle":
      picker_result == null → "picker-shuffle-idle"
      else                  → "picker-shuffle-revealed"
```

Notes:

- **"Closed" prompt in present mode.** A `prompt-closed` slide always shows
  tallies. Present mode does not depend on `is_revealed`; if the host closes
  the prompt via the slide button or the timer expires, the slide transitions
  to `prompt-closed` and renders tallies immediately. `is_revealed` remains
  the domain flag for the poll's own detail page and is not written by
  present-mode actions.
- **Curtain trigger.** Host clicking **Next item →** on the last item calls
  `advanceMeetingAgenda({ meeting_id, item_id: null })` (existing behaviour —
  `advanceNext` in `meeting-live-view.tsx` already advances to `null` past the
  last item). To distinguish standby from curtain when
  `current_agenda_item_id === null`, we add a `meetings.has_started boolean not
null default false` column. `advanceMeetingAgenda` sets it to `true`
  unconditionally as part of its existing single UPDATE whenever `item_id`
  is non-null:

  ```sql
  update meetings
     set current_agenda_item_id = :item_id,
         has_started = case when :item_id is not null then true else has_started end,
         updated_at = now()
   where id = :meeting_id;
  ```

  It is never reset. `endMeeting` also does not touch it — after ending, the
  meeting no longer satisfies the shell's `status === "live"` guard, so the
  standby/curtain distinction is moot. If a future flow ever reverts a meeting
  from `ended` back to `live` (no such flow exists today), that flow must also
  reset `has_started = false` if a fresh Standby is desired.

## Slide components

Every slide component receives `{ palette, item, meetingId, isHost: true }` and
some slide-specific props. Every slide fills the left column, positioning its
content with flex. Each slide is a plain `<div>` with the palette applied via
inline style (`backgroundColor`, `color`) — we do NOT extend the global theme
tokens, present mode is intentionally its own visual world.

### `standby-slide.tsx`

- Palette: **Standby** (deep navy `#0B1220`, cream ink, yellow accent).
- Top row: meeting title + "Standby" chip.
- Center: "Ready when you are" headline + agenda list (ordinal, title, kind).
- Bottom-right: **Start agenda →** button (host action:
  `advanceMeetingAgenda({ meeting_id, item_id: items[0].id })`).
- Bottom-left: "Press Esc to exit" hint.

### `discussion-slide.tsx`

- Palette: `palettes[ordinal % 6]`.
- Top row: `Item NN of MM · <meeting title>` + "Discussion" chip.
- Center: huge title (~72px).
- Bottom-right: **Next item →** button.

### `prompt-slide.tsx`

Handles both open and closed states.

**Open state (`prompt.is_open === true`):**

- Top row: item counter + "Prompt · open" chip.
- Center: title on left, timer ring on right showing `mm:ss` counting down
  from `agenda_items.timer_ends_at` (or `--:--` if no timer set).
- Bottom-left: timer chooser (30s / 1m / 2m / 5m). Clicking one sets
  `timer_ends_at = now() + duration` via
  `startPromptTimer({ agenda_item_id, seconds })`.
- Bottom-right: **Close now** button →
  `expirePromptTimer({ agenda_item_id })`.
- Auto-close: when the client observes `Date.now() >= timer_ends_at`, it calls
  `expirePromptTimer` once. `expirePromptTimer` is idempotent — calling it
  when the prompt is already closed is a no-op that still returns `ok(null)`.

**Closed state (`prompt.is_open === false`):**

- Top row: item counter + "Prompt · closed" chip.
- Top-center: question (smaller than in open state, ~40px).
- Bottom-center: an inline `PromptResponsesInline` component (new,
  `components/present/slides/prompt-responses-inline.tsx`) that renders a
  compact tally:
  - Text prompt: total responses count only (no bodies — those live on the
    poll page).
  - Single/multi-choice / yes-no: bar list of options with counts and
    percentages, sorted by count desc, capped at top 6.
  - Rating: average as big number + a small histogram of the distribution.
    The existing `reveal-view.tsx` is not reused — it assumes a full-page
    context and its layout won't fit the slide.
- Bottom-right: **Next item →** button.

### `picker-slide.tsx`

Handles both oneshot and shuffle, idle and revealed.

**Oneshot idle:**

- Center: "Ready to pick" + big **Pick** button
  (`oneShotPick(meetingId) → setAgendaPickerResult`).

**Oneshot revealed:**

- Center: pick-card with picked user's `display_name` at ~64px.
- Confetti burst is fired exactly once per `picker_result.user_id` value —
  a `useEffect` keyed on the id triggers the animation. If realtime
  redelivers the same UPDATE, the effect no-ops (same key). If the host
  clicks Pick again, the new user_id triggers a fresh burst.
- Bottom-left: **Pick again** button (host may redo).
- Bottom-right: **Next item →** button.

**Shuffle idle:**

- Center: **Start shuffle** button (`startShuffle → setAgendaPickerResult` with
  the returned session id).

**Shuffle revealed (using existing `shuffle_sessions`):**

- Center: pick-card with current person + confetti burst on transition.
- Bottom-right area: `<NextUpCard>` showing the queue's next display_name.
- Bottom-right: **Next person →** button (advance the shuffle session).
- When shuffle session is exhausted: **Next item →** appears instead.

### `curtain-slide.tsx`

- Palette: **Curtain** (magenta→orange→yellow gradient, near-black ink).
- Top row: meeting title + "Fin" chip.
- Center: giant quotation-marked joke (~48px). Joke picked by
  `jokes[hash(meetingId) % jokes.length]`.
- Bottom-right: **End meeting** button (`endMeeting(meetingId)` — existing).
  On success, redirects to `/meetings/[id]` (now ended).

## Present rail (comments)

`components/present/present-rail.tsx` is a client component always mounted in
the right 320px column of every slide.

- **Header**: "Comments · live" label.
- **Feed**: reverse-chronological, virtualized isn't necessary for v1 (cap
  render to newest 100). Each entry:
  - Author display name (bold, ink)
  - Body text
  - Reaction row: shows any emoji with count; tap-to-toggle-own reaction
  - Delete × visible only to `author.id === viewer.id`
- **New-comment pulse**: when a new comment arrives via realtime, it fades in
  from the bottom and briefly (~300ms) tints its background with the current
  palette's accent color.
- **Emoji picker**: a 4-emoji strip (`👍 ❤️ 😂 🔥`) appears on comment hover
  (desktop) or via a small "..." on tap (mobile).
- **Host composer**: bottom-anchored text input + Send. Submits via
  `postComment({ meeting_id, agenda_item_id: current, body })`. Uses optimistic
  insert.

## Non-host meeting page — comment composer

The existing parallel-route slot `app/(app)/@right/meetings/[id]/page.tsx`
(created in a recent commit) currently shows the agenda add form. We extend it:

- When the meeting is `live` AND viewer is NOT the host, replace (or add above)
  the agenda add form with a `MeetingCommentBox` client component:
  - Live-updating feed of newest ~20 comments
  - Composer textarea + Send button
  - Same emoji reactions + delete-own affordances as the present rail
- When the meeting is `live` AND viewer IS the host, show the same
  MeetingCommentBox as a secondary panel below the agenda add form. Because
  the `@right` column has a constrained vertical budget (see the shell
  layout, commit `a844868`), the comment feed here is capped at the newest
  8 entries with a "See all in Present →" link that opens the present
  route; the composer stays visible without needing to scroll.
- When the meeting is `scheduled` / `ended` / `postponed` / `cancelled`, the
  comment box is not shown (agenda add form or existing empty state remains).

## Data model

### New table: `meeting_comments`

```sql
create table public.meeting_comments (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  agenda_item_id uuid null references public.agenda_items(id) on delete set null,
  author_user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  deleted_at timestamptz null
);
create index meeting_comments_meeting_created_idx
  on public.meeting_comments (meeting_id, created_at desc);
```

- `agenda_item_id` is nullable so comments posted on Standby / Curtain (or
  before any item is current) still bind to the meeting.
- `author_user_id` uses `on delete cascade` (matches `responses_attributed`
  in migration 0005) — if a profile is deleted, their comments go with them.
- `deleted_at` soft-delete: the row remains but the rail filters
  `deleted_at is null`. Reactions on a soft-deleted comment are hidden
  client-side.

### New table: `meeting_comment_reactions`

```sql
create table public.meeting_comment_reactions (
  comment_id uuid not null references public.meeting_comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (emoji in ('👍','❤️','😂','🔥')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);
```

- Composite PK guarantees one row per (comment, user, emoji). Toggle logic is
  INSERT-or-DELETE from the client.

### Extensions

- `public.meetings`: add `has_started boolean not null default false`. Set by
  the modified `advanceMeetingAgenda` UPDATE (see slide-state section).
- `public.agenda_items`: add `timer_ends_at timestamptz null`. Set by
  `startPromptTimer`; read by client for the countdown ring; cleared to null
  by `expirePromptTimer` when the prompt is closed.

### RLS

There is no `is_meeting_participant` helper in the codebase — the existing
meeting-scoped tables (see `0014_agenda_items.sql`, `0017_shuffle_sessions.sql`)
inline the predicate. Present mode does the same. The canonical predicate:

```sql
-- READ / participant predicate
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
```

Policies:

- `meeting_comments_read` (SELECT): the predicate above.
- `meeting_comments_insert` (INSERT): the predicate above AND
  `author_user_id = auth.uid()`.
- `meeting_comments_soft_delete` (UPDATE): Postgres RLS cannot reference
  `OLD` in USING/WITH CHECK — we express the null→timestamp transition using
  paired USING/WITH CHECK clauses.

  ```sql
  create policy meeting_comments_soft_delete on public.meeting_comments
    for update
    using       (author_user_id = auth.uid() and deleted_at is null)
    with check  (author_user_id = auth.uid() and deleted_at is not null);
  ```

  USING restricts _which rows_ can be updated (only my own, not yet deleted).
  WITH CHECK restricts _what the row can become_ (still mine, deleted_at
  set). Together they permit exactly `deleted_at: null → not null` on rows
  the author owns. Any other column change trivially fails WITH CHECK because
  it would also require `author_user_id = auth.uid()` which is already true —
  so we additionally rely on the server action to only send
  `{ deleted_at: <now> }` in its update payload. If tighter enforcement is
  needed later, add a `BEFORE UPDATE` trigger that raises unless only
  `deleted_at` changed.

- `meeting_comments_no_delete`: no DELETE policy is created; soft-delete only.
- `meeting_comment_reactions_read` (SELECT): the participant predicate,
  joined via `meeting_comments`:

  ```sql
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
  ```

- `meeting_comment_reactions_write` (INSERT, DELETE): the same predicate
  AND `user_id = auth.uid()`.

### Jokes

`lib/present/jokes.ts` exports a static `const jokes: readonly string[]` of ~20
hand-picked entries. Selection is deterministic:

```ts
export function pickJoke(meetingId: string): string {
  let h = 0;
  for (let i = 0; i < meetingId.length; i++) {
    h = (h * 31 + meetingId.charCodeAt(i)) >>> 0;
  }
  return jokes[h % jokes.length];
}
```

### Palettes

`lib/present/palettes.ts`:

```ts
export type Palette = {
  key: string;
  bg: string; // stage background
  ink: string; // primary text on stage
  accent: string; // chips, dots, timer ring
  accentInk: string; // text on accent buttons
};

export const stagePalettes: readonly Palette[] = [
  {
    key: "electric",
    bg: "#E5006A",
    ink: "#FFFFFF",
    accent: "#FFE84D",
    accentInk: "#111111",
  },
  {
    key: "sunburst",
    bg: "#FF7A1A",
    ink: "#1A0A00",
    accent: "#E5006A",
    accentInk: "#FFFFFF",
  },
  {
    key: "aqua",
    bg: "#007A82",
    ink: "#FFFFFF",
    accent: "#C6FF3D",
    accentInk: "#0B1F1A",
  },
  {
    key: "grape",
    bg: "#6B21A8",
    ink: "#FFFFFF",
    accent: "#FFE84D",
    accentInk: "#111111",
  },
  {
    key: "fire",
    bg: "#DC2626",
    ink: "#FFF6E5",
    accent: "#FFE84D",
    accentInk: "#111111",
  },
  {
    key: "meadow",
    bg: "#A3E635",
    ink: "#0B1F1A",
    accent: "#0B1F1A",
    accentInk: "#A3E635",
  },
];

export const standbyPalette: Palette = {
  key: "standby",
  bg: "#0B1220",
  ink: "#F6F4EE",
  accent: "#FFE84D",
  accentInk: "#111111",
};

export const curtainPalette: Palette = {
  key: "curtain",
  bg: "linear-gradient(135deg,#E5006A 0%,#FF7A1A 60%,#FFE84D 100%)",
  ink: "#1A0A00",
  accent: "#111111",
  accentInk: "#FFE84D",
};

export function paletteForOrdinal(ordinal: number): Palette {
  return stagePalettes[
    (((ordinal - 1) % stagePalettes.length) + stagePalettes.length) %
      stagePalettes.length
  ];
}
```

`ordinal` is 1-indexed in the existing `agenda_items.ordinal` column.

## Server actions

New file `lib/actions/comment.ts`:

- `postComment({ meeting_id, agenda_item_id, body })` → inserts a row; returns
  the created comment.
- `deleteMyComment(comment_id)` → sets `deleted_at = now()` where
  `author_user_id = auth.uid()`.
- `toggleReaction({ comment_id, emoji })` → upsert if not present, delete if
  present; returns the new state (`{ mine: true|false }`).

New file `lib/actions/prompt-timer.ts`:

- `startPromptTimer({ agenda_item_id, seconds })` → validates viewer is the
  meeting's host (looked up via `agenda_items → meetings.host_user_id`), sets
  `agenda_items.timer_ends_at = now() + (seconds || ' seconds')::interval`.
- `expirePromptTimer({ agenda_item_id })` → validates viewer is either the
  meeting's host OR the linked prompt's `owner_user_id` (the latter covers
  any race with the poll-owner's own controls); in a single transaction:
  1. `update prompts set is_open = false where id = <linked prompt_id>`
  2. `update agenda_items set timer_ends_at = null where id = <agenda_item_id>`
     Idempotent — if `is_open` is already false, both statements no-op safely
     and the action returns `ok(null)`.

Note: this is a NEW action, distinct from the existing
`lib/actions/prompt.ts#closePrompt(prompt_id)`. That existing action is
used from the poll-owner detail page and only permits the prompt owner. Its
signature and behaviour are unchanged by this spec.

All actions follow the existing `_result.ts` `Result<T, ActionError>` pattern.

## Realtime channels

- `meeting:<id>` — already exists (used by `MeetingLiveView`). Present shell
  reuses it. No changes needed to the publication; postgres_changes on
  `meetings` and `agenda_items` are already broadcast.
- `meeting-comments:<id>` — new channel. Subscribes to postgres_changes on
  `meeting_comments` (INSERT, UPDATE) and `meeting_comment_reactions` (INSERT,
  DELETE) filtered by `meeting_id`. The rail and the non-host comment box both
  subscribe.

## File structure

New:

```
app/(app)/meetings/[id]/present/
├── layout.tsx
└── page.tsx

components/present/
├── present-shell.tsx
├── present-rail.tsx
├── confetti.tsx
├── next-up-card.tsx
└── slides/
    ├── standby-slide.tsx
    ├── discussion-slide.tsx
    ├── prompt-slide.tsx
    ├── picker-slide.tsx
    └── curtain-slide.tsx

components/meetings/
└── meeting-comment-box.tsx

lib/present/
├── palettes.ts
└── jokes.ts

lib/actions/
├── comment.ts
└── prompt-timer.ts

db/supabase/supabase/migrations/
└── 0022_present_mode.sql
```

The migration path in this repo is `db/supabase/supabase/migrations/`
(not the plain `supabase/migrations/` root-level layout). Existing migrations
are zero-padded and sequential; the next number is `0022`.

Modified:

- `components/meetings/meeting-header-actions.tsx` — add **Present →** button
  (host + live only).
- `app/(app)/@right/meetings/[id]/page.tsx` — render `MeetingCommentBox` when
  meeting is live.
- `lib/actions/meeting.ts` — extend `advanceMeetingAgenda`'s single UPDATE to
  also set `has_started = true` whenever `item_id` is non-null (see slide
  state section for the exact SQL). No signature change.

## Testing

- Unit-level: `paletteForOrdinal` boundary cases (0, 1, 6, 7, negatives). Joke
  hash is deterministic (same id → same joke). Slide-state derivation covers
  every combination in the table above.
- Integration (Playwright):
  1. Host starts meeting → Present button appears → clicking navigates to
     `/present`.
  2. Non-host visits `/present` → redirected.
  3. Standby → Start agenda → Discussion slide renders with palette 1.
  4. Advance to prompt → open state → set a 30s timer → use Playwright's
     `page.clock.fastForward("60s")` to advance past `timer_ends_at` →
     prompt auto-closes and slide switches to closed state showing the
     tally. Do not add test-only URL flags to the app code; use the
     browser's fake clock instead.
  5. Advance to oneshot picker → Pick → confetti + name appears.
  6. Non-host on `/meetings/[id]` posts a comment → appears in host's rail
     within ~1s.
  7. Advance past last item → Curtain slide renders with deterministic joke.
  8. End meeting → redirected to `/meetings/[id]` (now ended, no Present
     button).
- RLS: viewer outside the meeting roster cannot SELECT/INSERT on
  `meeting_comments` for that meeting.

## Migration & rollout

- Single migration adds both tables, RLS policies, `meetings.has_started`, and
  `agenda_items.timer_ends_at`.
- No backfill needed; `has_started` defaults false — safe for existing meetings
  because they're already ended and the column is only consulted when live.
- No feature flag. Ship in one PR.

## Open questions

None blocking. If any surface during implementation, escalate before merging.
