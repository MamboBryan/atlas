# Participant Agenda Adds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any meeting participant add agenda items before a meeting goes live, and restrict adds to the host or an atlas admin once it is live.

**Architecture:** Authorization lives in Postgres RLS. A new insert-only permissive policy on `agenda_items` grants participants the narrow new right; the existing `agenda_items_write_host` policy is untouched and still covers every verb and status for hosts and admins. The server action and the UI mirror the same predicate so users get a clean `forbidden` instead of a database error, but the policy is the real boundary.

**Tech Stack:** Next.js 15 App Router server actions, Supabase (Postgres + RLS), `@supabase/supabase-js`, Vitest integration tests against a local Supabase, pgTAP for schema assertions.

## Global Constraints

- Migrations are append-only, numbered files in `db/supabase/migrations/`. The next free number is `0037`. Never edit an existing migration.
- Supabase commands run through the repo script: `pnpm supabase <args>` (it passes `--workdir db`).
- Participant predicate must match the shape already used in `0013_meetings.sql:29` and `0022_present_mode.sql:52`: `participants_override is null` OR listed in it OR host OR creator.
- Pre-live statuses are exactly `scheduled` and `postponed`. `ended` and `cancelled` stay locked for participants.
- Participants may add kinds `discussion`, `prompt`, `picker` — never `game`.
- Add is the only widened verb. `update`, `delete` and reorder stay host+admin.
- Do not add a `Co-Authored-By` trailer or any Claude-branding line to commit messages.
- Full verification before the final commit: `pnpm typecheck`, `pnpm test`, `pnpm lint`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `db/supabase/migrations/0037_agenda_participant_adds.sql` | New insert-only RLS policy (create) |
| `db/supabase/tests/meetings_rls.sql` | pgTAP policy-count assertion (modify) |
| `tests/actions/game-test-helpers.ts` | Widen `makeMeeting` status union (modify) |
| `tests/actions/agenda-rls.integration.test.ts` | RLS matrix for participant inserts (create) |
| `lib/auth/host-or-admin.ts` | Shared `isHostOrAdmin` helper (create, extracted) |
| `lib/actions/game.ts` | Import the extracted helper instead of its private copy (modify) |
| `lib/actions/agenda.ts` | Server-action gate for `addAgendaItemAction` (modify) |
| `tests/actions/agenda.action.integration.test.ts` | Action-level gate tests (create) |
| `components/meetings/meeting-rail.tsx` | Rail gating + copy (modify) |
| `components/meetings/agenda-add-item.tsx` | `allowGame` prop, kind filtering (modify) |

---

### Task 1: RLS policy for participant inserts

**Files:**
- Create: `db/supabase/migrations/0037_agenda_participant_adds.sql`
- Modify: `db/supabase/tests/meetings_rls.sql:21-25`
- Modify: `tests/actions/game-test-helpers.ts:31-35`
- Test: `tests/actions/agenda-rls.integration.test.ts`

**Interfaces:**
- Consumes: `admin`, `canRun`, `userClient`, `makeMeeting`, `makeAgendaItem`, `resetGameTestDb` from `tests/actions/game-test-helpers.ts`.
- Produces: policy `agenda_items_insert_participant` on `public.agenda_items`. `makeMeeting(hostId, title, status)` gains `"postponed" | "ended"` in its status union.

- [ ] **Step 1: Widen the `makeMeeting` status union**

`tests/actions/game-test-helpers.ts` currently pins the status parameter to two values. Replace the signature so later tests can build postponed and ended meetings:

```ts
export async function makeMeeting(
  hostId: string,
  title: string,
  status: "live" | "scheduled" | "postponed" | "ended" = "live",
) {
```

The function body is unchanged.

- [ ] **Step 2: Write the failing RLS test**

Create `tests/actions/agenda-rls.integration.test.ts`:

```ts
// RLS-level tests for who may insert agenda items. These talk to the local
// Supabase directly with per-user anon clients, so every assertion is about
// what Postgres allows — no server-action code is involved.
import { expect, test, beforeEach, afterAll } from "vitest";
import {
  admin,
  canRun,
  userClient,
  makeMeeting,
  makeAgendaItem,
  resetGameTestDb,
} from "./game-test-helpers";

beforeEach(resetGameTestDb);
afterAll(resetGameTestDb);

async function setup(
  status: "live" | "scheduled" | "postponed" | "ended",
  suffix: string,
) {
  const host = await userClient(`agenda-host-${suffix}@atlas.com`);
  const guest = await userClient(`agenda-guest-${suffix}@atlas.com`);
  const meetingId = await makeMeeting(host.id, `Agenda ${suffix}`, status);
  return { host, guest, meetingId };
}

test.runIf(canRun)("participant may insert into a scheduled meeting", async () => {
  const { guest, meetingId } = await setup("scheduled", "sched");
  const { error } = await guest.client
    .from("agenda_items")
    .insert({ meeting_id: meetingId, ordinal: 0, title: "My topic", kind: "discussion" });
  expect(error).toBeNull();
});

test.runIf(canRun)("participant may insert into a postponed meeting", async () => {
  const { guest, meetingId } = await setup("postponed", "postp");
  const { error } = await guest.client
    .from("agenda_items")
    .insert({ meeting_id: meetingId, ordinal: 0, title: "My topic", kind: "discussion" });
  expect(error).toBeNull();
});

test.runIf(canRun)("participant may not insert into a live meeting", async () => {
  const { guest, meetingId } = await setup("live", "live");
  const { error } = await guest.client
    .from("agenda_items")
    .insert({ meeting_id: meetingId, ordinal: 0, title: "Nope", kind: "discussion" });
  expect(error).not.toBeNull();
});

test.runIf(canRun)("participant may not insert into an ended meeting", async () => {
  const { guest, meetingId } = await setup("ended", "ended");
  const { error } = await guest.client
    .from("agenda_items")
    .insert({ meeting_id: meetingId, ordinal: 0, title: "Nope", kind: "discussion" });
  expect(error).not.toBeNull();
});

test.runIf(canRun)("participant may not insert a game item pre-live", async () => {
  const { guest, meetingId } = await setup("scheduled", "game");
  const { error } = await guest.client
    .from("agenda_items")
    .insert({ meeting_id: meetingId, ordinal: 0, title: "Warm-up", kind: "game" });
  expect(error).not.toBeNull();
});

test.runIf(canRun)("participant may not update or delete items pre-live", async () => {
  const { guest, meetingId } = await setup("scheduled", "mutate");
  const itemId = await makeAgendaItem(meetingId, 0, "Host topic", "discussion");

  const upd = await guest.client
    .from("agenda_items")
    .update({ title: "Hijacked" })
    .eq("id", itemId)
    .select("id");
  expect(upd.data ?? []).toHaveLength(0);

  const del = await guest.client
    .from("agenda_items")
    .delete()
    .eq("id", itemId)
    .select("id");
  expect(del.data ?? []).toHaveLength(0);

  const { data: still } = await admin!
    .from("agenda_items")
    .select("title")
    .eq("id", itemId)
    .single();
  expect(still!.title).toBe("Host topic");
});

test.runIf(canRun)("host may insert while live", async () => {
  const { host, meetingId } = await setup("live", "hostlive");
  const { error } = await host.client
    .from("agenda_items")
    .insert({ meeting_id: meetingId, ordinal: 0, title: "Host topic", kind: "discussion" });
  expect(error).toBeNull();
});

test.runIf(canRun)("atlas admin may insert while live", async () => {
  const host = await userClient("agenda-host-adm@atlas.com");
  const adminUser = await userClient("agenda-admin@atlas.com", "admin");
  const meetingId = await makeMeeting(host.id, "Agenda adm", "live");
  const { error } = await adminUser.client
    .from("agenda_items")
    .insert({ meeting_id: meetingId, ordinal: 0, title: "Admin topic", kind: "discussion" });
  expect(error).toBeNull();
});
```

Note on the update/delete assertions: RLS filters rows out of an `update`/`delete`
rather than raising an error, so those cases assert "zero rows affected", not a
non-null error.

- [ ] **Step 3: Run the new tests and confirm the participant-insert cases fail**

Run: `pnpm test tests/actions/agenda-rls.integration.test.ts`
Expected: the two "participant may insert" tests FAIL (error is a non-null RLS violation, `new row violates row-level security policy for table "agenda_items"`). Every other test in the file already passes — they assert the status quo.

If all tests are skipped, the local Supabase env vars are missing. Start it with `pnpm supabase start` and re-run before continuing.

- [ ] **Step 4: Write the migration**

Create `db/supabase/migrations/0037_agenda_participant_adds.sql`:

```sql
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
```

- [ ] **Step 5: Apply the migration locally**

Run: `pnpm supabase db reset`
Expected: all migrations `0002`–`0037` apply with no error.

- [ ] **Step 6: Run the RLS tests and verify they pass**

Run: `pnpm test tests/actions/agenda-rls.integration.test.ts`
Expected: PASS, all 8 tests.

- [ ] **Step 7: Update the pgTAP policy-count assertion**

`db/supabase/tests/meetings_rls.sql:21-25` asserts `agenda_items` has exactly 2 policies. Change the count and the message:

```sql
SELECT ok(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'agenda_items') = 3,
  'agenda_items has 3 policies (read, write_host, insert_participant)'
);
```

- [ ] **Step 8: Run the pgTAP suite**

Run: `pnpm test:rls`
Expected: PASS, including `meetings_rls.sql`.

- [ ] **Step 9: Commit**

```bash
git add db/supabase/migrations/0037_agenda_participant_adds.sql \
        db/supabase/tests/meetings_rls.sql \
        tests/actions/game-test-helpers.ts \
        tests/actions/agenda-rls.integration.test.ts
git commit -m "feat(agenda): let participants add items before a meeting is live"
```

---

### Task 2: Extract the shared `isHostOrAdmin` helper

**Files:**
- Create: `lib/auth/host-or-admin.ts`
- Modify: `lib/actions/game.ts:148-160` (delete the private copy, import instead)

**Interfaces:**
- Consumes: `requireUser` from `@/lib/auth/require` for its client type.
- Produces: `isHostOrAdmin(supabase, hostUserId, userId): Promise<boolean>` — exported from `lib/auth/host-or-admin.ts`, consumed by Task 3 and Task 5.

Why extract rather than reuse `isCurrentUserAdmin()` from `lib/auth/is-admin.ts`: that function builds its own cookie-based client via `createSupabaseServerClient()`. The action test harness stubs `requireUser`, so a helper that ignores the caller's client would bypass the stub and fail outside a Next request context. `isHostOrAdmin` takes the client as an argument.

- [ ] **Step 1: Create the shared helper**

Create `lib/auth/host-or-admin.ts` with the body lifted verbatim from `lib/actions/game.ts:148-160`:

```ts
import type { requireUser } from "@/lib/auth/require";

/**
 * True when the user hosts the meeting or is an active atlas admin. Takes the
 * caller's Supabase client so it runs under whatever identity the caller
 * already established — do not swap this for a helper that builds its own.
 */
export async function isHostOrAdmin(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  hostUserId: string | null,
  userId: string,
): Promise<boolean> {
  if (hostUserId === userId) return true;
  const { data } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", userId)
    .single();
  return data?.role === "admin" && data?.is_active === true;
}
```

- [ ] **Step 2: Point `game.ts` at the shared helper**

In `lib/actions/game.ts`, delete the private `isHostOrAdmin` function (lines 148-160) and add the import alongside the existing imports at the top of the file:

```ts
import { isHostOrAdmin } from "@/lib/auth/host-or-admin";
```

Call sites inside `game.ts` are unchanged — same name, same signature.

- [ ] **Step 3: Verify nothing broke**

Run: `pnpm typecheck && pnpm test tests/actions/game.action.integration.test.ts`
Expected: typecheck clean, game action tests PASS. This is a pure move; a failure here means the extraction changed behavior.

- [ ] **Step 4: Commit**

```bash
git add lib/auth/host-or-admin.ts lib/actions/game.ts
git commit -m "refactor(auth): extract isHostOrAdmin into a shared helper"
```

---

### Task 3: Server-action gate in `addAgendaItemAction`

**Files:**
- Modify: `lib/actions/agenda.ts:30-40`
- Test: `tests/actions/agenda.action.integration.test.ts`

**Interfaces:**
- Consumes: `isHostOrAdmin` from `@/lib/auth/host-or-admin` (Task 2).
- Produces: `addAgendaItemAction` returns `err("forbidden", "host only once live")` and `err("forbidden", "host only for game items")` for the two participant-denial cases.

- [ ] **Step 1: Write the failing action test**

Create `tests/actions/agenda.action.integration.test.ts`. The `vi.mock` calls must appear before the `import` of the action under test — Vitest hoists them, and the `identity` object uses `vi.hoisted` for the same reason:

```ts
// Action-level tests for addAgendaItemAction. Only Next.js request plumbing is
// stubbed (requireUser's cookie session, revalidatePath); the Supabase client
// is a real anon-key client signed in as a specific test user, so RLS is
// genuinely enforced underneath the action's own gate.
import { expect, test, beforeEach, afterAll, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canRun,
  userClient,
  makeMeeting,
  resetGameTestDb,
} from "./game-test-helpers";

const identity = vi.hoisted(() => ({
  current: null as { id: string; supabase: SupabaseClient } | null,
}));

vi.mock("@/lib/auth/require", () => ({
  requireUser: async () => {
    if (!identity.current) {
      throw new Error("test identity not set — call actingAs() first");
    }
    return {
      user: { id: identity.current.id },
      supabase: identity.current.supabase,
    };
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addAgendaItemAction } from "@/lib/actions/agenda";

function actingAs(id: string, supabase: SupabaseClient) {
  identity.current = { id, supabase };
}

beforeEach(async () => {
  identity.current = null;
  await resetGameTestDb();
});
afterAll(resetGameTestDb);

test.runIf(canRun)("participant add succeeds before the meeting is live", async () => {
  const host = await userClient("act-host-a@atlas.com");
  const guest = await userClient("act-guest-a@atlas.com");
  const meetingId = await makeMeeting(host.id, "Act A", "scheduled");

  actingAs(guest.id, guest.client);
  const res = await addAgendaItemAction({
    meeting_id: meetingId,
    kind: "discussion",
    title: "Guest topic",
  });
  expect(res.ok).toBe(true);
});

test.runIf(canRun)("participant add is forbidden once live", async () => {
  const host = await userClient("act-host-b@atlas.com");
  const guest = await userClient("act-guest-b@atlas.com");
  const meetingId = await makeMeeting(host.id, "Act B", "live");

  actingAs(guest.id, guest.client);
  const res = await addAgendaItemAction({
    meeting_id: meetingId,
    kind: "discussion",
    title: "Guest topic",
  });
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.error.code).toBe("forbidden");
});

test.runIf(canRun)("participant may not add a game item", async () => {
  const host = await userClient("act-host-c@atlas.com");
  const guest = await userClient("act-guest-c@atlas.com");
  const meetingId = await makeMeeting(host.id, "Act C", "scheduled");

  actingAs(guest.id, guest.client);
  const res = await addAgendaItemAction({
    meeting_id: meetingId,
    kind: "game",
    title: "Warm-up",
  });
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.error.code).toBe("forbidden");
});

test.runIf(canRun)("host may add while live", async () => {
  const host = await userClient("act-host-d@atlas.com");
  const meetingId = await makeMeeting(host.id, "Act D", "live");

  actingAs(host.id, host.client);
  const res = await addAgendaItemAction({
    meeting_id: meetingId,
    kind: "discussion",
    title: "Host topic",
  });
  expect(res.ok).toBe(true);
});

test.runIf(canRun)("host may add a game item", async () => {
  const host = await userClient("act-host-e@atlas.com");
  const meetingId = await makeMeeting(host.id, "Act E", "scheduled");

  actingAs(host.id, host.client);
  const res = await addAgendaItemAction({
    meeting_id: meetingId,
    kind: "game",
    title: "Warm-up",
  });
  expect(res.ok).toBe(true);
});

test.runIf(canRun)("atlas admin may add while live", async () => {
  const host = await userClient("act-host-f@atlas.com");
  const adminUser = await userClient("act-admin-f@atlas.com", "admin");
  const meetingId = await makeMeeting(host.id, "Act F", "live");

  actingAs(adminUser.id, adminUser.client);
  const res = await addAgendaItemAction({
    meeting_id: meetingId,
    kind: "discussion",
    title: "Admin topic",
  });
  expect(res.ok).toBe(true);
});
```

`ActionResult` (`lib/actions/_result.ts`) is a union of `{ ok: true; data: T }` and `{ ok: false; error: { code: string; message: string } }` — hence the `if (!res.ok)` narrowing before reading `res.error.code`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/actions/agenda.action.integration.test.ts`
Expected: FAIL. Under the current gate (`meeting.status === "live" || host`), the "participant add succeeds before the meeting is live" test fails with `ok === false`, and "participant add is forbidden once live" fails because the action returns a `db_error` from the RLS rejection rather than `forbidden`.

- [ ] **Step 3: Rewrite the gate**

In `lib/actions/agenda.ts`, add the import at the top:

```ts
import { isHostOrAdmin } from "@/lib/auth/host-or-admin";
```

Then replace lines 38-40 — the comment and the two `canAdd` lines:

```ts
  // Participants may add items until the meeting starts; once it is live the
  // agenda belongs to whoever is running it. Games are host-only in any status
  // because the host starts and finalizes their rounds.
  const hostOrAdmin = await isHostOrAdmin(
    supabase,
    meeting.host_user_id,
    user.id,
  );
  const preLive =
    meeting.status === "scheduled" || meeting.status === "postponed";
  if (!hostOrAdmin) {
    if (parsed.data.kind === "game")
      return err("forbidden", "host only for game items");
    if (!preLive) return err("forbidden", "host only once live");
  }
```

This replaces the `canAdd` variable entirely — delete it and the `if (!canAdd)` line. Everything below (ordinal computation, row build, insert) is unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test tests/actions/agenda.action.integration.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/agenda.ts tests/actions/agenda.action.integration.test.ts
git commit -m "feat(agenda): gate addAgendaItemAction on meeting status"
```

---

### Task 4: `AgendaAddItem` hides the game kind for non-hosts

**Files:**
- Modify: `components/meetings/agenda-add-item.tsx:31-36`, `:129-135`, `:203`

**Interfaces:**
- Produces: `AgendaAddItem` gains a required prop `allowGame: boolean`. Task 5 supplies it.

There is no existing component test harness in this repo — `tests/lib/present-slide-state.test.ts` covers pure state logic only, not rendering. Do not scaffold one for a prop-driven list filter; `pnpm typecheck` catches the prop wiring, and Task 5's manual check covers the behavior.

- [ ] **Step 1: Split the kind list**

In `components/meetings/agenda-add-item.tsx`, replace the `KINDS` constant at lines 31-36:

```ts
const PARTICIPANT_KINDS: { v: Kind; label: string }[] = [
  { v: "discussion", label: "Discussion" },
  { v: "prompt", label: "Prompt" },
  { v: "picker", label: "Picker" },
];

const HOST_KINDS: { v: Kind; label: string }[] = [
  ...PARTICIPANT_KINDS,
  { v: "game", label: "Game" },
];
```

- [ ] **Step 2: Accept and apply the prop**

Extend the component signature at lines 129-135:

```ts
export function AgendaAddItem({
  meetingId,
  availablePrompts,
  allowGame,
}: {
  meetingId: string;
  availablePrompts: PromptOption[];
  allowGame: boolean;
}) {
```

Then pass the right list to the `TabRow` at line 203:

```tsx
<TabRow value={kind} onChange={setKind} options={allowGame ? HOST_KINDS : PARTICIPANT_KINDS} />
```

The `kind` state already defaults to `"discussion"`, so a non-host never lands on a hidden tab. The `kind === "game"` branch at line 275 stays — it is simply unreachable when `allowGame` is false.

- [ ] **Step 3: Verify the prop is required**

Run: `pnpm typecheck`
Expected: FAIL with an error at `components/meetings/meeting-rail.tsx:55` — `allowGame` is missing. That failure is the proof the prop is wired; Task 5 resolves it.

- [ ] **Step 4: Do not commit yet**

This task leaves the tree non-compiling by design. Commit it together with Task 5.

---

### Task 5: Meeting rail gating and copy

**Files:**
- Modify: `components/meetings/meeting-rail.tsx:27-61`

**Interfaces:**
- Consumes: `isHostOrAdmin` from `@/lib/auth/host-or-admin` (Task 2); `AgendaAddItem`'s `allowGame` prop (Task 4).

- [ ] **Step 1: Add the import**

At the top of `components/meetings/meeting-rail.tsx`:

```ts
import { isHostOrAdmin } from "@/lib/auth/host-or-admin";
```

- [ ] **Step 2: Replace the `canAdd` computation**

Replace line 27-28 (the comment and the `canAdd` line):

```ts
  // Mirrors addAgendaItemAction: participants may add until the meeting is
  // live, after which the agenda belongs to the host.
  const hostOrAdmin = await isHostOrAdmin(
    supabase,
    meeting.host_user_id,
    user.id,
  );
  const preLive =
    meeting.status === "scheduled" || meeting.status === "postponed";
  const canAdd = hostOrAdmin || preLive;
```

The `promptRows` query at lines 30-39 already keys off `canAdd` and needs no change — it fetches the viewer's own open prompts, which is correct for a participant adding a prompt item.

- [ ] **Step 3: Pass the prop and fix the copy**

Replace the render block at lines 50-61:

```tsx
      {canAdd ? (
        <div className="space-y-4">
          <h2 className="font-display text-xl font-extrabold text-ink">
            Add agenda item
          </h2>
          <AgendaAddItem
            meetingId={id}
            availablePrompts={availablePrompts}
            allowGame={hostOrAdmin}
          />
        </div>
      ) : (
        <p className="text-sm text-ink-soft">
          Only the host can add agenda items once the meeting is live.
        </p>
      )}
```

The old copy — "Only the host can edit the agenda before it starts." — is now exactly backwards and must go. The `ended`/`cancelled` early return at lines 20-26 is unchanged.

- [ ] **Step 4: Verify the whole tree compiles and every suite passes**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: typecheck clean (the Task 4 error is resolved), all suites PASS, no lint warnings.

If `tests/actions/evaluation.rating.integration.test.ts` fails, stop and report it — that is unrelated to this work.

- [ ] **Step 5: Manual check in the browser**

Run `pnpm dev`. As a non-host on a `scheduled` meeting, confirm the add form renders with three kind tabs and no Game tab, and that adding a discussion item works. Set the meeting to `live` via Supabase Studio, reload, and confirm the form is replaced by "Only the host can add agenda items once the meeting is live." As the host on the same live meeting, confirm the form renders with all four tabs.

- [ ] **Step 6: Commit**

```bash
git add components/meetings/agenda-add-item.tsx components/meetings/meeting-rail.tsx
git commit -m "feat(agenda): mirror the add-item gate in the meeting rail"
```

---

### Task 6: Deploy the migration

**Files:** none — deployment only.

- [ ] **Step 1: Confirm the migration is pending**

Run: `pnpm supabase migration list --linked`
Expected: `0037_agenda_participant_adds` shows as local-only.

The last deploy hit a pgdelta certificate error with Supabase CLI 2.109.1 (migrations applied anyway). If the CLI is still on that version, upgrade before pushing.

- [ ] **Step 2: Push**

Run: `pnpm supabase db push --linked`
Expected: `0037` applies. If the CLI reports a certificate error, verify the actual state with Step 3 rather than re-running the push.

- [ ] **Step 3: Verify against production**

Query `pg_policies` for `tablename = 'agenda_items'` and confirm three rows: `agenda_items_read`, `agenda_items_write_host`, `agenda_items_insert_participant`.

- [ ] **Step 4: Report**

State the deployed migration and the verified policy list. Nothing to commit.

---

## Self-Review Notes

- **Spec coverage:** migration → Task 1; pgTAP count → Task 1; server action → Task 3 (helper extraction split into Task 2 because it touches `game.ts` and deserves its own review gate); UI → Tasks 4 and 5; test matrix → Tasks 1 and 3, split by layer (RLS vs. action) since the spec listed both concerns.
- **Deliberate cross-task incompleteness:** Task 4 leaves typecheck failing; Task 5 fixes it. Called out explicitly in both tasks so a fresh implementer does not treat it as a defect.
- **Naming consistency:** `isHostOrAdmin(supabase, hostUserId, userId)` is used with that exact signature in Tasks 2, 3 and 5. The local variable is `hostOrAdmin` in both call sites to avoid shadowing the import.
- **Out of scope, per the spec:** participant edit/delete of own items (needs a `created_by` column), reorder, and any change to the read policy.
