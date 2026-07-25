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
- Handles the `Esc` key: navigates back to `/meetings/[id]`.

### Slide state derivation

```
if meeting.status !== "live" → shell redirects (should not render)
if current_agenda_item_id === null AND no items completed → "standby"
if current_agenda_item_id === null AND at least one item completed → "curtain"
otherwise let item = items.find(id === current_agenda_item_id)
  match item.kind:
    "discussion"                        → "discussion"
    "prompt" + prompt.status === "open" → "prompt-open"
    "prompt" + prompt.status === "closed" → "prompt-closed"
    "picker" + picker_config.mode === "oneshot":
      picker_result == null → "picker-oneshot-idle"
      else                  → "picker-oneshot-revealed"
    "picker" + picker_config.mode === "shuffle":
      picker_result == null → "picker-shuffle-idle"
      else                  → "picker-shuffle-revealed"
```

The "curtain" trigger is: host clicked Next on the last item, which sets
`current_agenda_item_id = null` (existing `advanceMeetingAgenda` behaviour). We
distinguish standby-vs-curtain by whether any items have been visited. We track
this via a `has_started` flag on the meeting row (default false, set true by
`advanceMeetingAgenda` on first advance, never reset). Adding this column is
cheaper than replaying the agenda history.

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

**Open state:**

- Top row: item counter + "Prompt · open" chip.
- Center: title on left, timer ring on right showing `mm:ss` counting down
  from `timer_ends_at` (or `--:--` if no timer set).
- Bottom-left: timer chooser (30s / 1m / 2m / 5m). Clicking one sets
  `timer_ends_at = now() + duration` via
  `startPromptTimer({ agenda_item_id, seconds })`.
- Bottom-right: **Close now** button →
  `closePrompt({ agenda_item_id, prompt_id })`.
- Auto-close: when the client observes `Date.now() >= timer_ends_at`, it calls
  `closePrompt` idempotently. If two clients race, the DB-side `updated_at`
  check no-ops the second call.

**Closed state:**

- Top row: item counter + "Prompt · closed" chip.
- Top-center: question (smaller than in open state, ~40px).
- Bottom-center: response tallies rendered by a `PromptResponses` component
  that reuses the existing prompt reveal UI (`components/prompts/reveal-view.tsx`)
  in a compact variant that fits the slide. If the reveal UI doesn't fit, we
  render a minimal inline tally list (top 5 counts + total responses).
- Bottom-right: **Next item →** button.

### `picker-slide.tsx`

Handles both oneshot and shuffle, idle and revealed.

**Oneshot idle:**

- Center: "Ready to pick" + big **Pick** button
  (`oneShotPick(meetingId) → setAgendaPickerResult`).

**Oneshot revealed:**

- Center: pick-card with picked user's `display_name` at ~64px.
- Confetti burst on first render of the revealed state (mount trigger).
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
  MeetingCommentBox as a secondary panel below the agenda add form (so the
  host on the detail page can also see the live conversation before they
  present).
- When the meeting is `scheduled` / `ended` / `postponed` / `cancelled`, the
  comment box is not shown (agenda add form or existing empty state remains).

## Data model

### New table: `meeting_comments`

```sql
create table meeting_comments (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  agenda_item_id uuid null references agenda_items(id) on delete set null,
  author_user_id uuid not null references profiles(id),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  deleted_at timestamptz null
);
create index meeting_comments_meeting_created_idx
  on meeting_comments (meeting_id, created_at);
```

- `agenda_item_id` is nullable so comments posted on the Standby / Curtain
  screens (or before any item is current) still bind to the meeting.
- `deleted_at` soft-delete: the row remains for audit / count integrity, but
  rail render filters `deleted_at is null`. Reactions on a deleted comment are
  hidden client-side.

### New table: `meeting_comment_reactions`

```sql
create table meeting_comment_reactions (
  comment_id uuid not null references meeting_comments(id) on delete cascade,
  user_id uuid not null references profiles(id),
  emoji text not null check (emoji in ('👍','❤️','😂','🔥')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);
```

- Composite PK guarantees one row per (comment, user, emoji). Toggle logic is
  INSERT-or-DELETE.

### Extensions

- `meetings`: add `has_started boolean not null default false`. Set to true by
  `advanceMeetingAgenda` the first time it advances from a null current item.
  Used to distinguish Standby from Curtain.
- `agenda_items`: add `timer_ends_at timestamptz null`. Set by
  `startPromptTimer`; read by client for the countdown ring; cleared to null
  when the prompt is closed.

### RLS

Both new tables use the same visibility rule as the meeting itself: a viewer
sees the meeting → they see its comments and reactions.

- `meeting_comments`:
  - SELECT: viewer must be in the meeting's roster
    (existing helper — `is_meeting_participant(auth.uid(), meeting_id)` or
    equivalent — extend if not present).
  - INSERT: same + `author_user_id = auth.uid()`.
  - UPDATE: only `author_user_id = auth.uid()` AND the only column changing is
    `deleted_at` from null to now(). Enforced via a policy that references
    `OLD.deleted_at IS NULL`.
  - DELETE: never (soft-delete only).
- `meeting_comment_reactions`:
  - SELECT: viewer in roster.
  - INSERT / DELETE: `user_id = auth.uid()`.

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
  bg: string;     // stage background
  ink: string;    // primary text on stage
  accent: string; // chips, dots, timer ring
  accentInk: string; // text on accent buttons
};

export const stagePalettes: readonly Palette[] = [
  { key: "electric", bg: "#E5006A", ink: "#FFFFFF", accent: "#FFE84D", accentInk: "#111111" },
  { key: "sunburst", bg: "#FF7A1A", ink: "#1A0A00", accent: "#E5006A", accentInk: "#FFFFFF" },
  { key: "aqua",     bg: "#007A82", ink: "#FFFFFF", accent: "#C6FF3D", accentInk: "#0B1F1A" },
  { key: "grape",    bg: "#6B21A8", ink: "#FFFFFF", accent: "#FFE84D", accentInk: "#111111" },
  { key: "fire",     bg: "#DC2626", ink: "#FFF6E5", accent: "#FFE84D", accentInk: "#111111" },
  { key: "meadow",   bg: "#A3E635", ink: "#0B1F1A", accent: "#0B1F1A", accentInk: "#A3E635" },
];

export const standbyPalette: Palette = {
  key: "standby", bg: "#0B1220", ink: "#F6F4EE", accent: "#FFE84D", accentInk: "#111111",
};

export const curtainPalette: Palette = {
  key: "curtain",
  bg: "linear-gradient(135deg,#E5006A 0%,#FF7A1A 60%,#FFE84D 100%)",
  ink: "#1A0A00", accent: "#111111", accentInk: "#FFE84D",
};

export function paletteForOrdinal(ordinal: number): Palette {
  return stagePalettes[((ordinal - 1) % stagePalettes.length + stagePalettes.length) % stagePalettes.length];
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

- `startPromptTimer({ agenda_item_id, seconds })` → validates host, sets
  `agenda_items.timer_ends_at = now() + seconds * interval '1 second'`.
- `closePrompt({ agenda_item_id, prompt_id })` → validates host or "elapsed
  timer" (i.e. `timer_ends_at <= now()`); updates
  `prompts.status = 'closed'`, clears `agenda_items.timer_ends_at`. Idempotent
  when the prompt is already closed.

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

supabase/migrations/
└── <timestamp>_present_mode.sql
```

Modified:

- `components/meetings/meeting-header-actions.tsx` — add **Present →** button
  (host + live only).
- `app/(app)/@right/meetings/[id]/page.tsx` — render `MeetingCommentBox` when
  meeting is live.

## Testing

- Unit-level: `paletteForOrdinal` boundary cases (0, 1, 6, 7, negatives). Joke
  hash is deterministic (same id → same joke). Slide-state derivation covers
  every combination in the table above.
- Integration (Playwright):
  1. Host starts meeting → Present button appears → clicking navigates to
     `/present`.
  2. Non-host visits `/present` → redirected.
  3. Standby → Start agenda → Discussion slide renders with palette 1.
  4. Advance to prompt → open state → set 30s timer → wait → prompt auto-closes
     and slide switches to closed state.
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
