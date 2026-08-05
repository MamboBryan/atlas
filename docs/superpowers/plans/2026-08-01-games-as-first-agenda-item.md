# Games as the Pinned First Agenda Item — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition pre-meeting games from an auto-starting lobby panel into an opt-in, locked, first agenda item whose round starts only when the presenter advances to it during live present mode.

**Architecture:** Add a `game` value to the `agenda_kind` enum and seed one locked game item at ordinal 0 when the host opts in at creation. The round is created lazily when `advanceMeetingAgenda` reaches the game item. The pre-meeting lobby becomes a passive waiting room. A shared client component renders the round for both the presenter (present slide) and participants (live agenda runner), reusing the existing realtime game components.

**Tech Stack:** Next.js 15 (App Router, server actions), Supabase (Postgres + RLS + realtime), Zod, Vitest, Playwright, pnpm.

## Global Constraints

- Package manager: `pnpm` (never `npm`/`yarn`). Supabase CLI via `pnpm supabase` (workdir `db/supabase`).
- Migrations live in `db/supabase/supabase/migrations/`, numbered sequentially. Next free number is **`0028`**.
- Server-action files begin with `"use server";` and may export **only async functions** — no exported consts/types.
- Action results use the `ActionResult<T>` helpers `ok(data)` / `err(code, message)` from `@/lib/actions/_result`.
- Game round is **1:1 per meeting** (`game_rounds.meeting_id` is unique). Do not add a second round per meeting.
- The game agenda item is identified solely by `kind = 'game'`; do not add an `is_locked`/`system` column.
- Default game item title: `"Pre-meeting game"`.
- No commit may include a `Co-Authored-By: Claude` trailer or other Claude-branding lines.
- Run `pnpm typecheck` green before every commit that changes `.ts`/`.tsx`.

---

## File Structure

| File                                                              | Responsibility                                                                 | Task |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---- |
| `db/supabase/supabase/migrations/0028_agenda_kind_game.sql` (new) | Add `game` to `agenda_kind` enum                                               | 1    |
| `lib/zod/meeting.ts`                                              | `createOneOff` gains `include_game`; agenda kind unions gain `game` where read | 2    |
| `lib/agenda/pin-game-first.ts` (new)                              | Pure helper: force the game item id to the front of an ordering                | 3    |
| `lib/actions/agenda.ts`                                           | `reorderAgendaAction` pins the game item at ordinal 0                          | 3    |
| `lib/actions/meeting.ts`                                          | Seed game item on create; start round on advance to game item                  | 4, 6 |
| `app/(app)/meetings/actions.ts`                                   | Pass `include_game` from the form                                              | 4    |
| `components/meetings/new-meeting-form.tsx`                        | "Include pre-meeting game" checkbox                                            | 4    |
| `components/meetings/agenda-editor.tsx`                           | Lock UI (no move/delete) for the game item; `game` kind label                  | 5    |
| `lib/actions/game.ts`                                             | `ensureRoundAction` guard: live + host + game item exists                      | 6    |
| `components/games/game-lobby-panel.tsx`                           | Waiting-room only (no autostart)                                               | 7    |
| `lib/present/slide-state.ts`                                      | `game` kind + `game` slide state                                               | 8    |
| `components/games/game-round-view.tsx` (new)                      | Shared client round renderer: `play` vs `present` mode                         | 9    |
| `components/present/slides/game-slide.tsx` (new)                  | Present slide wrapping `GameRoundView` in `present` mode                       | 9    |
| `components/present/present-shell.tsx`                            | Render `GameSlide` for the `game` slide state                                  | 9    |
| `components/meetings/agenda-runner.tsx`                           | Render `GameRoundView` (`play`) when current item is the game                  | 10   |

---

## Task 1: Migration — add `game` to the `agenda_kind` enum

**Files:**

- Create: `db/supabase/supabase/migrations/0028_agenda_kind_game.sql`

**Interfaces:**

- Produces: the enum value `'game'` on `public.agenda_kind`, usable as `agenda_items.kind`.

- [ ] **Step 1: Write the migration**

`ALTER TYPE ... ADD VALUE` cannot run inside a transaction block, so this file must contain only the single statement (no `begin`/`commit`, nothing else):

```sql
-- 0028_agenda_kind_game.sql
-- Add 'game' to agenda_kind so a meeting can carry a locked pre-meeting game
-- as its first agenda item. A game item has neither prompt_id nor picker_config
-- (same shape as 'discussion'), so the existing agenda_items check constraints
-- already accept it.
alter type public.agenda_kind add value if not exists 'game';
```

- [ ] **Step 2: Apply all migrations from scratch**

Run: `pnpm supabase db reset`
Expected: every migration applies, ending with `Applying migration 0028_agenda_kind_game.sql...` and no error.

- [ ] **Step 3: Verify the enum value exists**

Run:

```bash
docker exec supabase_db_supabase psql -U postgres -d postgres -tAc \
  "select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='agenda_kind' order by 1;"
```

Expected output includes a line `game` alongside `discussion`, `picker`, `prompt`.

- [ ] **Step 4: Commit**

```bash
git add db/supabase/supabase/migrations/0028_agenda_kind_game.sql
git commit -m "feat(db): add 'game' to agenda_kind enum"
```

---

## Task 2: Zod schema — `include_game` flag and `game` kind

**Files:**

- Modify: `lib/zod/meeting.ts`
- Test: `tests/zod/meeting-game.test.ts` (new)

**Interfaces:**

- Consumes: existing `createOneOff` object schema in `lib/zod/meeting.ts:3`.
- Produces: `createOneOff` now parses an optional `include_game: boolean` (default `false`); `CreateOneOffInput` gains `include_game: boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/zod/meeting-game.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createOneOff } from "@/lib/zod/meeting";

describe("createOneOff include_game", () => {
  const base = {
    title: "Standup",
    scheduled_start: "2026-08-01T09:00:00.000Z",
    timezone: "UTC",
  };

  it("defaults include_game to false when omitted", () => {
    const parsed = createOneOff.parse(base);
    expect(parsed.include_game).toBe(false);
  });

  it("accepts include_game true", () => {
    const parsed = createOneOff.parse({ ...base, include_game: true });
    expect(parsed.include_game).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/zod/meeting-game.test.ts`
Expected: FAIL — `include_game` is `undefined` (property not on schema).

- [ ] **Step 3: Add the field**

In `lib/zod/meeting.ts`, inside the `createOneOff = z.object({ ... })` definition (starts at line 3), add this field before the closing `})`:

```ts
  include_game: z.boolean().default(false),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/zod/meeting-game.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm typecheck
git add lib/zod/meeting.ts tests/zod/meeting-game.test.ts
git commit -m "feat(zod): add include_game flag to createOneOff"
```

---

## Task 3: Reorder guard — pin the game item at ordinal 0

**Files:**

- Create: `lib/agenda/pin-game-first.ts`
- Modify: `lib/actions/agenda.ts` (`reorderAgendaAction`, currently at `lib/actions/agenda.ts:126`)
- Test: `tests/agenda/pin-game-first.test.ts` (new)

**Interfaces:**

- Produces: `pinGameFirst(itemIds: string[], gameItemId: string | null): string[]` — returns `itemIds` unchanged when `gameItemId` is null, otherwise returns the game id first followed by the other ids in their original relative order.
- Consumes (in the action): `reorderAgenda` zod schema (`lib/zod/meeting.ts:48`).

- [ ] **Step 1: Write the failing test**

Create `tests/agenda/pin-game-first.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pinGameFirst } from "@/lib/agenda/pin-game-first";

describe("pinGameFirst", () => {
  it("returns input unchanged when there is no game item", () => {
    expect(pinGameFirst(["a", "b", "c"], null)).toEqual(["a", "b", "c"]);
  });

  it("moves the game item to the front, keeping others' order", () => {
    expect(pinGameFirst(["a", "g", "b"], "g")).toEqual(["g", "a", "b"]);
  });

  it("keeps the game item first when already first", () => {
    expect(pinGameFirst(["g", "a", "b"], "g")).toEqual(["g", "a", "b"]);
  });

  it("inserts the game id even if it is missing from the list", () => {
    expect(pinGameFirst(["a", "b"], "g")).toEqual(["g", "a", "b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/agenda/pin-game-first.test.ts`
Expected: FAIL — module `@/lib/agenda/pin-game-first` not found.

- [ ] **Step 3: Implement the helper**

Create `lib/agenda/pin-game-first.ts`:

```ts
/**
 * The game agenda item is locked to ordinal 0. Given the client's requested
 * ordering of item ids, force the game item id to the front (deduplicated),
 * preserving the relative order of the remaining ids. When there is no game
 * item, the ordering is returned unchanged.
 */
export function pinGameFirst(
  itemIds: string[],
  gameItemId: string | null,
): string[] {
  if (!gameItemId) return itemIds;
  return [gameItemId, ...itemIds.filter((id) => id !== gameItemId)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/agenda/pin-game-first.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the helper into `reorderAgendaAction`**

In `lib/actions/agenda.ts`: add the import near the other imports at the top:

```ts
import { pinGameFirst } from "@/lib/agenda/pin-game-first";
```

Then, inside `reorderAgendaAction`, after the existing block that validates `item_ids` match the existing agenda exactly (the `return err("invalid_input", "item_ids must match existing agenda exactly")` guard) and **before** `const offset = existingIds.size + 100;`, insert:

```ts
// The game item is locked to the front regardless of what the client sends.
const { data: gameRow } = await supabase
  .from("agenda_items")
  .select("id")
  .eq("meeting_id", parsed.data.meeting_id)
  .eq("kind", "game")
  .maybeSingle();
const orderedIds = pinGameFirst(parsed.data.item_ids, gameRow?.id ?? null);
```

Then change both `for` loops to iterate `orderedIds` instead of `parsed.data.item_ids`:

```ts
const offset = existingIds.size + 100;
for (let i = 0; i < orderedIds.length; i++) {
  const { error } = await supabase
    .from("agenda_items")
    .update({ ordinal: offset + i })
    .eq("id", orderedIds[i]);
  if (error) return err("db_error", error.message);
}
for (let i = 0; i < orderedIds.length; i++) {
  const { error } = await supabase
    .from("agenda_items")
    .update({ ordinal: i })
    .eq("id", orderedIds[i]);
  if (error) return err("db_error", error.message);
}
```

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm typecheck
git add lib/agenda/pin-game-first.ts tests/agenda/pin-game-first.test.ts lib/actions/agenda.ts
git commit -m "feat(agenda): pin locked game item to ordinal 0 on reorder"
```

---

## Task 4: Seed the game item on opt-in creation

**Files:**

- Modify: `lib/actions/meeting.ts` (`createOneOffMeeting`, starts at `lib/actions/meeting.ts:23`)
- Modify: `app/(app)/meetings/actions.ts` (`createMeetingAction`)
- Modify: `components/meetings/new-meeting-form.tsx` (add checkbox)

**Interfaces:**

- Consumes: `createOneOff` schema with `include_game` (Task 2); `ok`/`err`.
- Produces: when `include_game` is true, the created meeting has one `agenda_items` row `{ ordinal: 0, kind: 'game', title: 'Pre-meeting game' }`.

- [ ] **Step 1: Seed the game item in `createOneOffMeeting`**

In `lib/actions/meeting.ts`, inside `createOneOffMeeting`, immediately after the meeting insert succeeds (after the `if (error || !data) return err(...)` line that guards the `.insert({...}).select("id").single()` call) and before the `serviceClient()` / notification block, insert:

```ts
if (parsed.data.include_game) {
  // Locked first agenda item; the round is created later when the presenter
  // advances to it (see advanceMeetingAgenda).
  await supabase.from("agenda_items").insert({
    meeting_id: data.id,
    ordinal: 0,
    kind: "game",
    title: "Pre-meeting game",
  });
}
```

- [ ] **Step 2: Pass the flag through `createMeetingAction`**

In `app/(app)/meetings/actions.ts`, read the checkbox and forward it. Replace the `createOneOffMeeting({ ... })` call with:

```ts
const includeGame = fd.get("include_game") === "on";

const res = await createOneOffMeeting({
  title,
  scheduled_start: scheduledStart,
  timezone,
  participants_override: null,
  include_game: includeGame,
});
```

- [ ] **Step 3: Add the checkbox to the form**

In `components/meetings/new-meeting-form.tsx`, add a labelled checkbox inside the form, below the existing timezone field and above the submit button. Match the surrounding markup style; a minimal version:

```tsx
<label className="flex items-center gap-2 text-sm text-ink">
  <input
    type="checkbox"
    name="include_game"
    className="size-4 rounded border-line"
  />
  Include a pre-meeting game (locked as the first agenda item)
</label>
```

(Read the file first and place it consistently with the other fields; the `name="include_game"` attribute is what `createMeetingAction` reads.)

- [ ] **Step 4: Verify against the local stack**

Run: `pnpm typecheck`
Then reset the DB and start the dev server if not already running:

```bash
pnpm supabase db reset
```

Create a meeting via the UI with the box checked, then confirm the seeded item:

```bash
docker exec supabase_db_supabase psql -U postgres -d postgres -tAc \
  "select ordinal, kind, title from public.agenda_items where kind='game' order by created_at desc limit 1;"
```

Expected: `0|game|Pre-meeting game`. Create another meeting with the box **unchecked** and confirm no game item is added for it.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/meeting.ts "app/(app)/meetings/actions.ts" components/meetings/new-meeting-form.tsx
git commit -m "feat(meetings): opt-in seeds a locked game agenda item at ordinal 0"
```

---

## Task 5: Agenda editor — lock the game item (no move/delete)

**Files:**

- Modify: `components/meetings/agenda-editor.tsx`

**Interfaces:**

- Consumes: the `AgendaItem` type in this file (currently `kind: "discussion" | "prompt" | "picker"` at `components/meetings/agenda-editor.tsx:24`).
- Produces: game rows render without move-up/move-down/delete controls and show a "Plays first · locked" badge; drag/reorder cannot place another item above the game item.

- [ ] **Step 1: Widen the `kind` union**

In `components/meetings/agenda-editor.tsx`, change the `AgendaItem` `kind` field to include `"game"`:

```ts
kind: "discussion" | "prompt" | "picker" | "game";
```

- [ ] **Step 2: Hide move/delete controls for the game item**

Locate the per-item row render (where `deleteAgendaItemAction(id)` and the move buttons are wired). For a row where `it.kind === "game"`, render a small locked badge instead of the move/delete controls. Concretely, wrap the controls cluster:

```tsx
{it.kind === "game" ? (
  <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-soft">
    Plays first · locked
  </span>
) : (
  // ...existing move-up / move-down / delete controls unchanged...
)}
```

- [ ] **Step 3: Keep the game item first on client reorder**

Wherever this component builds the `item_ids` array passed to `reorderAgendaAction({ meeting_id, item_ids })` (around `components/meetings/agenda-editor.tsx:70`), sort the game item to the front before sending, so the optimistic UI matches the server guard:

```ts
const ordered = [
  ...ids.filter((id) => items.find((x) => x.id === id)?.kind === "game"),
  ...ids.filter((id) => items.find((x) => x.id === id)?.kind !== "game"),
];
const res = await reorderAgendaAction({
  meeting_id: meetingId,
  item_ids: ordered,
});
```

(The server pins it regardless — this only prevents a flicker. If move buttons are index-based, additionally disable "move up" for the item at index 1 when index 0 is a game item.)

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`
In the UI, open a meeting that has a game item as host: confirm the game row shows the locked badge, has no delete/move controls, and that other items cannot be moved above it.

- [ ] **Step 5: Commit**

```bash
git add components/meetings/agenda-editor.tsx
git commit -m "feat(agenda): lock the game item in the agenda editor"
```

---

## Task 6: Start the round on advance; retarget `ensureRoundAction`

**Files:**

- Modify: `lib/actions/game.ts` (`ensureRoundAction`, `lib/actions/game.ts:47`)
- Modify: `lib/actions/meeting.ts` (`advanceMeetingAgenda`, `lib/actions/meeting.ts:249`)

**Interfaces:**

- Consumes: `ensureRoundInput` (`meeting_id`), `requireUser`, `ok`/`err`.
- Produces: `ensureRoundAction` creates/returns the round only when the meeting is `live`, the caller is the host, and a `kind='game'` agenda item exists; `advanceMeetingAgenda` calls it when advancing to a game item.

- [ ] **Step 1: Retarget the `ensureRoundAction` guards**

In `lib/actions/game.ts`, replace the meeting-fetch + guard block (currently selects `id, scheduled_start, status` and checks `status !== "scheduled"` / the `LOBBY_OPEN_WINDOW_MS` window) with a live + host + game-item gate. Replace from the `const { data: meeting } = await supabase.from("meetings")...` block down to the end of the `too_early` check with:

```ts
const { user } = await requireUser();

const { data: meeting } = await supabase
  .from("meetings")
  .select("id, status, host_user_id")
  .eq("id", parsed.data.meeting_id)
  .single();
if (!meeting) return err("not_found", "meeting");
if (meeting.status !== "live") {
  return err("not_live", "the game starts when the host begins the meeting");
}
if (meeting.host_user_id !== user.id) {
  return err("forbidden", "only the host can start the game");
}
const { data: gameItem } = await supabase
  .from("agenda_items")
  .select("id")
  .eq("meeting_id", parsed.data.meeting_id)
  .eq("kind", "game")
  .maybeSingle();
if (!gameItem) return err("not_found", "no game on this meeting");
```

Note: `requireUser()` already runs at the top of `ensureRoundAction` (it destructures `supabase`). Change that line to also capture `user`:

```ts
const { supabase } = await requireUser();
```

becomes

```ts
const { supabase, user } = await requireUser();
```

and delete the now-duplicate `const { user } = await requireUser();` you added above (keep a single call). `LOBBY_OPEN_WINDOW_MS` is now unused — delete its declaration (`lib/actions/game.ts:30-31`).

- [ ] **Step 2: Call `ensureRoundAction` from `advanceMeetingAgenda`**

In `lib/actions/meeting.ts`, add `ensureRoundAction` to the existing game import (currently `import { finalizeRoundAction } from "@/lib/actions/game";` at `lib/actions/meeting.ts:9`):

```ts
import { ensureRoundAction, finalizeRoundAction } from "@/lib/actions/game";
```

Then in `advanceMeetingAgenda`, after the meeting `update(payload)` succeeds (after the `if (error) return err("db_error", error.message);` that follows the update, and before `revalidatePath(...)`), insert:

```ts
if (parsed.data.item_id != null) {
  const { data: item } = await supabase
    .from("agenda_items")
    .select("kind")
    .eq("id", parsed.data.item_id)
    .maybeSingle();
  if (item?.kind === "game") {
    // Lazily create the round the first time the presenter reaches the game.
    await ensureRoundAction({ meeting_id: parsed.data.meeting_id });
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (0 errors). If `not_live` or `forbidden` are not valid `err` codes, note that `err` takes a free-form string code — no enum to update.

- [ ] **Step 4: Verify round creation on advance (local stack)**

With the dev server running, create a meeting with a game item, sign in as host, start the meeting (`live`), and in present mode advance to the game item. Then:

```bash
docker exec supabase_db_supabase psql -U postgres -d postgres -tAc \
  "select kind, status, round(extract(epoch from (ends_at - now()))) as secs_left from public.game_rounds order by created_at desc limit 1;"
```

Expected: one active round with a positive `secs_left`. Advancing to the item again must not create a second round (still 1:1 per meeting).

- [ ] **Step 5: Commit**

```bash
git add lib/actions/game.ts lib/actions/meeting.ts
git commit -m "feat(games): start round when presenter advances to the game item"
```

---

## Task 7: Pre-meeting lobby → passive waiting room

**Files:**

- Modify: `components/games/game-lobby-panel.tsx`
- Modify: `app/(app)/meetings/[id]/page.tsx` (the `GameLobbyPanel` mount, `app/(app)/meetings/[id]/page.tsx:241`)

**Interfaces:**

- Consumes: nothing new. The panel no longer calls `ensureRoundAction`.
- Produces: on a `scheduled` meeting that has a game item, renders a static waiting-room message; renders nothing when there is no game item.

- [ ] **Step 1: Replace the panel body with a waiting room**

Rewrite `components/games/game-lobby-panel.tsx` so it does not import or call `ensureRoundAction` and does not query rounds. It should show the waiting message only when the meeting has a game item:

```tsx
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GameLobbyPanel({
  meetingId,
  status,
}: {
  meetingId: string;
  status: string;
}) {
  if (status !== "scheduled") return null;

  const supabase = await createSupabaseServerClient();
  const { data: gameItem } = await supabase
    .from("agenda_items")
    .select("id")
    .eq("meeting_id", meetingId)
    .eq("kind", "game")
    .maybeSingle();
  if (!gameItem) return null;

  return (
    <section className="rounded-lg border p-4 text-sm text-muted-foreground">
      🎮 The game starts when the host begins the meeting.
    </section>
  );
}
```

- [ ] **Step 2: Update the mount to the new props**

In `app/(app)/meetings/[id]/page.tsx`, the panel no longer needs `scheduledStart`. Update the JSX (`app/(app)/meetings/[id]/page.tsx:241`) to:

```tsx
{
  m.status === "scheduled" && (
    <GameLobbyPanel meetingId={m.id} status={m.status} />
  );
}
```

- [ ] **Step 3: Verify no autostart**

Run: `pnpm typecheck`
Open a scheduled meeting with a game item: the waiting message shows and **no** round row is created:

```bash
docker exec supabase_db_supabase psql -U postgres -d postgres -tAc \
  "select count(*) from public.game_rounds r join public.meetings m on m.id=r.meeting_id where m.status='scheduled';"
```

Expected: `0`.

- [ ] **Step 4: Commit**

```bash
git add components/games/game-lobby-panel.tsx "app/(app)/meetings/[id]/page.tsx"
git commit -m "refactor(games): pre-meeting lobby is a passive waiting room"
```

---

## Task 8: Slide state — the `game` slide

**Files:**

- Modify: `lib/present/slide-state.ts`
- Test: `tests/lib/present-slide-state.test.ts` (existing — add cases)

**Interfaces:**

- Consumes: `MeetingLite`, `AgendaItemLite`, `deriveSlideState`.
- Produces: `AgendaItemLite.kind` includes `"game"`; `SlideState` includes `{ kind: "game"; item: AgendaItemLite }`; `deriveSlideState` returns it when the current item is a game item.

- [ ] **Step 1: Write the failing test**

Add to `tests/lib/present-slide-state.test.ts`:

```ts
it("returns the game slide when the current item is a game item", () => {
  const item = {
    id: "g1",
    ordinal: 0,
    title: "Pre-meeting game",
    kind: "game" as const,
    prompt_id: null,
    picker_config: null,
    picker_result: null,
    timer_ends_at: null,
  };
  const state = deriveSlideState(
    { status: "live", current_agenda_item_id: "g1", has_started: true },
    [item],
    {},
  );
  expect(state).toEqual({ kind: "game", item });
});
```

(Match the import style already used in this test file for `deriveSlideState`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/lib/present-slide-state.test.ts`
Expected: FAIL — `kind: "game"` not assignable / state is `{ kind: "discussion", ... }` or a type error.

- [ ] **Step 3: Extend the types and derivation**

In `lib/present/slide-state.ts`:

Add `"game"` to `AgendaItemLite.kind`:

```ts
kind: "discussion" | "prompt" | "picker" | "game";
```

Add the slide-state variant to the `SlideState` union:

```ts
  | { kind: "game"; item: AgendaItemLite }
```

In `deriveSlideState`, immediately after the `if (!item) return { kind: "standby" };` line and before the `if (item.kind === "discussion")` check, add:

```ts
if (item.kind === "game") return { kind: "game", item };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/lib/present-slide-state.test.ts`
Expected: PASS (including existing cases).

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm typecheck
git add lib/present/slide-state.ts tests/lib/present-slide-state.test.ts
git commit -m "feat(present): add game slide state"
```

---

## Task 9: Shared round view + present slide + present-shell wiring

**Files:**

- Create: `components/games/game-round-view.tsx`
- Create: `components/present/slides/game-slide.tsx`
- Modify: `components/present/present-shell.tsx`

**Interfaces:**

- Consumes: existing client components — `SubmissionCounter` (`roundId`, `eligibleCount`), `TargetNumberRound` (`roundId`, `target`, `bases`, `endsAt`), `ZeroInRound` (`roundId`, `endsAt`), `RoundScoreboard` (`roundId`, `kind`, `initialResults`); `createSupabaseBrowserClient`; `finalizeRoundAction`.
- Produces: `GameRoundView({ meetingId, mode, isHost })` where `mode: "play" | "present"`. In `present` mode, when the round timer reaches 0 and `isHost`, it calls `finalizeRoundAction({ round_id })` once, then shows `RoundScoreboard`. `GameSlide({ meetingId, isHost })` wraps it in `present` mode.

- [ ] **Step 1: Build the shared round view**

Create `components/games/game-round-view.tsx` (client). It subscribes to the meeting's round via the browser Supabase client and renders play controls (`mode="play"`) or a presenter display (`mode="present"`). This centralises the logic previously inlined in `GameLobbyPanel`.

```tsx
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { finalizeRoundAction } from "@/lib/actions/game";
import { TargetNumberRound } from "./target-number-round";
import { ZeroInRound } from "./zero-in-round";
import { SubmissionCounter } from "./submission-counter";
import { RoundScoreboard } from "./round-scoreboard";

type Round = {
  id: string;
  kind: "target_number" | "zero_in";
  puzzle: { kind: string; target?: number; bases?: number[]; secret?: number };
  ends_at: string;
  status: "active" | "finished";
};

export function GameRoundView({
  meetingId,
  mode,
  isHost,
}: {
  meetingId: string;
  mode: "play" | "present";
  isHost: boolean;
}) {
  const [round, setRound] = useState<Round | null>(null);
  const finalizedRef = useRef(false);

  const load = useCallback(async () => {
    const s = createSupabaseBrowserClient();
    const { data } = await s
      .from("game_rounds")
      .select("id, kind, puzzle, ends_at, status")
      .eq("meeting_id", meetingId)
      .maybeSingle();
    if (data) setRound(data as Round);
  }, [meetingId]);

  useEffect(() => {
    void load();
    const s = createSupabaseBrowserClient();
    const ch = s
      .channel(`game-round:${meetingId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "game_rounds",
          filter: `meeting_id=eq.${meetingId}`,
        } as never,
        () => void load(),
      )
      .subscribe();
    return () => {
      void s.removeChannel(ch);
    };
  }, [meetingId, load]);

  // Presenter finalises the round once when the timer elapses.
  useEffect(() => {
    if (mode !== "present" || !isHost || !round) return;
    if (round.status !== "active") return;
    const msLeft = new Date(round.ends_at).getTime() - Date.now();
    const t = setTimeout(
      () => {
        if (finalizedRef.current) return;
        finalizedRef.current = true;
        void finalizeRoundAction({ round_id: round.id }).then(() => load());
      },
      Math.max(0, msLeft),
    );
    return () => clearTimeout(t);
  }, [mode, isHost, round, load]);

  if (!round) {
    return (
      <section className="rounded-lg border p-4 text-sm text-muted-foreground">
        Starting the game…
      </section>
    );
  }

  if (round.status === "finished") {
    return (
      <RoundScoreboard
        roundId={round.id}
        kind={round.kind}
        initialResults={[]}
      />
    );
  }

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pre-meeting game</h2>
        <SubmissionCounter roundId={round.id} eligibleCount={0} />
      </header>
      {mode === "play" ? (
        round.kind === "target_number" ? (
          <TargetNumberRound
            roundId={round.id}
            target={round.puzzle.target ?? 0}
            bases={round.puzzle.bases ?? []}
            endsAt={round.ends_at}
          />
        ) : (
          <ZeroInRound roundId={round.id} endsAt={round.ends_at} />
        )
      ) : (
        <p className="text-sm text-muted-foreground">
          {round.kind === "target_number"
            ? "Players are combining base numbers to hit the target."
            : "Players are guessing the secret number."}
        </p>
      )}
    </section>
  );
}
```

Note: `RoundScoreboard` already loads/subscribes to its own results (it accepts `initialResults` as a seed), so `[]` is a safe initial value. Confirm this by reading `components/games/round-scoreboard.tsx`; if it does **not** self-load, fetch finished submissions here before rendering (same query the old `GameLobbyPanel` used).

- [ ] **Step 2: Build the present slide**

Create `components/present/slides/game-slide.tsx`:

```tsx
"use client";
import { GameRoundView } from "@/components/games/game-round-view";

export function GameSlide({
  meetingId,
  isHost,
}: {
  meetingId: string;
  isHost: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <GameRoundView meetingId={meetingId} mode="present" isHost={isHost} />
    </div>
  );
}
```

- [ ] **Step 3: Wire it into the present shell**

In `components/present/present-shell.tsx`: add the import beside the other slide imports (`components/present/present-shell.tsx:25-29`):

```ts
import { GameSlide } from "@/components/present/slides/game-slide";
```

Then, in the slide render block (near the other `{slideState.kind === "..." && (...)}` blocks around line 331+), add:

```tsx
{
  slideState.kind === "game" && (
    <GameSlide meetingId={props.meetingId} isHost={props.isHost} />
  );
}
```

Confirm `props.meetingId` and `props.isHost` exist in this component (they are used elsewhere in the shell — `props.meetingId` appears in the advance callbacks). If `isHost` is not already a prop, thread it from the page that renders `PresentShell`.

- [ ] **Step 4: Verify present flow**

Run: `pnpm typecheck`
Drive it: host starts the meeting, opens present mode, advances to the game item → the presenter screen shows the game; when the ~60s/45s timer elapses the presenter view flips to the scoreboard. Confirm the round finalised:

```bash
docker exec supabase_db_supabase psql -U postgres -d postgres -tAc \
  "select status from public.game_rounds order by created_at desc limit 1;"
```

Expected: `finished` after the timer.

- [ ] **Step 5: Commit**

```bash
git add components/games/game-round-view.tsx components/present/slides/game-slide.tsx components/present/present-shell.tsx
git commit -m "feat(present): game slide with presenter-driven finalize"
```

---

## Task 10: Participant play surface in the live agenda runner

**Files:**

- Modify: `components/meetings/agenda-runner.tsx`
- Modify: `components/meetings/meeting-live-view.tsx` (only if the `AgendaItem` `kind` union there needs `"game"`)

**Interfaces:**

- Consumes: `GameRoundView` (Task 9), the current-item context already available in the runner.
- Produces: when the current agenda item is the game item, participants see the play controls via `GameRoundView` in `play` mode; the scoreboard when finished.

- [ ] **Step 1: Widen client `kind` unions if needed**

Run: `pnpm typecheck` first. If it reports that `"game"` is not assignable to the `AgendaItem`/item `kind` in `components/meetings/agenda-runner.tsx` or `components/meetings/meeting-live-view.tsx`, add `| "game"` to those `kind` unions (mirroring Task 5).

- [ ] **Step 2: Render `GameRoundView` for the game item**

In `components/meetings/agenda-runner.tsx`, locate where the current item is rendered by `kind` (the runner switches on the item to show discussion/prompt/picker UIs). Add a branch:

```tsx
import { GameRoundView } from "@/components/games/game-round-view";
```

```tsx
{
  item.kind === "game" && (
    <GameRoundView meetingId={meetingId} mode="play" isHost={isHost} />
  );
}
```

Use the `meetingId` and `isHost` values already available in the runner's props/context (read the file to confirm their exact names; `MeetingLiveView` passes `isHost` down).

- [ ] **Step 3: Verify two-player flow**

Run: `pnpm typecheck`.
Create a second confirmed demo user (admin API, as in prior QA). With the host in present mode and a participant on the live meeting page, advance to the game item: the participant can submit; the presenter's `SubmissionCounter` increments via realtime; when the timer ends both see the scoreboard.

- [ ] **Step 4: Commit**

```bash
git add components/meetings/agenda-runner.tsx components/meetings/meeting-live-view.tsx
git commit -m "feat(games): participants play the game from the live agenda runner"
```

---

## Task 11: Full regression + RLS

**Files:** none (verification only)

- [ ] **Step 1: Unit + typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean; all unit tests pass (including the new `pin-game-first`, `meeting-game`, and slide-state cases).

- [ ] **Step 2: Migrations from scratch + RLS**

Run: `pnpm supabase db reset && pnpm test:rls`
Expected: all migrations apply through `0028`; RLS suite (`games_rls.sql` included) passes.

- [ ] **Step 3: Confirm no lingering autostart references**

Run:

```bash
grep -rn "ensureRoundAction" app components lib
```

Expected: `ensureRoundAction` is referenced only in `lib/actions/game.ts` (definition) and `lib/actions/meeting.ts` (advance call) — **not** in any component that renders on page load.

- [ ] **Step 4: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "test: regression pass for games-as-first-agenda-item"
```

---

## Self-Review Notes (spec coverage)

- Spec §Data model → Task 1. §Seeding → Task 4. §Locking → Tasks 3, 5. §Removing autostart → Task 7 (+ `ensureRoundAction` guard in Task 6). §Round start on advance → Task 6. §Present slide + participant surface → Tasks 8, 9, 10. §Testing → per-task tests + Task 11.
- The pre-existing lifecycle finalize hooks in `startMeeting`/`endMeeting`/`postponeMeetingManual` remain valid: with the lobby no longer starting rounds, `startMeeting`'s pre-live finalize is a harmless no-op, while `endMeeting`'s finalize still protects a running game the presenter ends early. No change required; do not remove them.
