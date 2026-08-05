# Hiring Manage/Fields Panel + Page-Owned Right Rails — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the `@right` parallel-route rails in favor of a shared page-owned `DetailWithRail` shell, then turn the owner-only "Manage evaluation" card into a full-height `Manage | Fields` tabbed panel with per-field enable/hide controls and hidden-field context in closed results.

**Architecture:** Part B is a pure structural refactor — a new `DetailWithRail` component owns the two-pane (main + rail) chrome; every `(app)` page wraps its content in it; the `@right` folder and `RightSlot` are deleted. Part A builds on the relocated rail: a new owner-gated `setEvaluationFieldAction`, a `fields` query addition, refresh-time preservation of disabled fields, and a service-client fetch of hidden-field answers surfaced as read-only context in `ResultsView`.

**Tech Stack:** Next.js App Router (RSC + server actions), React client components, Supabase (RLS + service client), Zod, Tailwind, Vitest.

## Global Constraints

- Field-visibility columns already exist (`evaluation_questions.is_active`, `is_hidden`) — **no new migration**.
- `is_active=false` ⇒ field excluded from evaluation **and** results. `is_hidden=true` ⇒ hidden from panelists during evaluation, shown as read-only context (answer text, no score) in **closed** results.
- Field toggles are editable only while `draft` or `open`; **locked when `closed`**.
- Hidden-field answers are RLS-blocked for non-admin panelists (`answers_read` policy) — the closed-results context fetch **must** use the service client `svc`, strictly gated to `closed && (isPanelist || isAdmin)`.
- Server actions return `ActionResult<T>` via `ok(data)` / `err(code, message)` from `lib/actions/_result.ts`.
- Owner-gated actions call `requireEvaluationOwner(evaluationId)` and mutate via `atlasServiceClient()`.
- Commit messages describe the change only — **no** `Co-Authored-By` or tool-branding trailers.
- Override layouts `hiring/[id]/evaluate/layout.tsx` and `meetings/[id]/present/layout.tsx` (`fixed inset-0`) must remain untouched and unaffected.

---

## File Structure

**Part B (rails):**
- Create `components/app/detail-with-rail.tsx` — the two-pane shell (main chrome + optional rail column).
- Create `components/app/home-rail.tsx` — home dashboard rail (extracted from `@right/page.tsx`).
- Create `components/meetings/meeting-rail.tsx` — meeting rail (extracted from `@right/meetings/[id]/page.tsx`).
- Modify `app/(app)/layout.tsx` — drop `right` slot + `RightSlot`, grid → `[nav 1fr]`, render `{children}` bare.
- Modify all `(app)` pages — wrap content in `DetailWithRail` (rail routes pass `rail`).
- Delete `app/(app)/@right/**` and `components/app/right-slot.tsx`.

**Part A (Manage/Fields):**
- Create `lib/evaluation/refresh.ts` — pure `partitionRefreshColumns` helper.
- Create `tests/evaluation/refresh.test.ts` — unit tests for the helper.
- Modify `lib/zod/evaluation.ts` — `setEvaluationFieldInput`.
- Modify `lib/actions/evaluation.ts` — `setEvaluationFieldAction`; rewrite `refreshEvaluationAction` to use the helper.
- Modify `lib/evaluation/queries.ts` — `fields` (owner) + `contextFields` (closed results).
- Modify `app/(app)/hiring/[id]/_ui/admin-controls.tsx` — full-height tabbed panel + Fields tab.
- Modify `app/(app)/hiring/[id]/_ui/results-view.tsx` — context rows.
- Modify `app/(app)/hiring/[id]/page.tsx` — thread `fields` + `contextFields` props.

---

# PART B — Page-owned right rails

### Task B1: `DetailWithRail` shell component

**Files:**
- Create: `components/app/detail-with-rail.tsx`

**Interfaces:**
- Produces: `DetailWithRail({ children, rail }: { children: React.ReactNode; rail?: React.ReactNode })` — a server-compatible component (no hooks). When `rail` is falsy, renders only the main column full-width; otherwise a `md:grid md:grid-cols-[7fr_3fr]` with main + a `hidden md:flex md:flex-col md:h-screen md:overflow-y-auto` rail column.

- [ ] **Step 1: Create the component**

```tsx
import type { ReactNode } from "react";

// Main-column chrome, copied verbatim from the old app-layout <main> so pages
// look identical after the @right retirement. The sticky-header [&_header] rules
// are the recent leak fix — keep them exact.
const MAIN_CLASSES =
  "w-full bg-surface-raised px-4 pb-24 pt-6 md:px-8 md:pb-10 md:pt-0 md:h-screen md:overflow-y-auto " +
  "md:[&_header]:sticky md:[&_header]:-top-px md:[&_header]:z-10 md:[&_header]:bg-surface-raised " +
  "[&_header]:border-b-[0.5px] [&_header]:border-ink/80 [&_header]:pb-6 md:[&_header]:pt-8 " +
  "[&_header]:-mx-4 [&_header]:px-4 md:[&_header]:-mx-8 md:[&_header]:px-8";

export function DetailWithRail({
  children,
  rail,
}: {
  children: ReactNode;
  rail?: ReactNode;
}) {
  if (!rail) return <main className={MAIN_CLASSES}>{children}</main>;
  return (
    <div className="md:grid md:h-screen md:grid-cols-[7fr_3fr] md:overflow-hidden">
      <main className={MAIN_CLASSES}>{children}</main>
      <aside className="hidden md:flex md:flex-col md:h-screen md:overflow-y-auto px-6 pt-8 pb-10">
        {rail}
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (component compiles; unused for now).

- [ ] **Step 3: Commit**

```bash
git add components/app/detail-with-rail.tsx
git commit -m "feat(app): add DetailWithRail two-pane shell"
```

---

### Task B2: Extract home + meeting rails into standalone components

Safe no-op refactor: the `@right` routes keep working, now delegating to reusable components that the pages will import in Task B3.

**Files:**
- Create: `components/app/home-rail.tsx`
- Create: `components/meetings/meeting-rail.tsx`
- Modify: `app/(app)/@right/page.tsx`
- Modify: `app/(app)/@right/meetings/[id]/page.tsx`

**Interfaces:**
- Produces: `HomeRail()` — async server component returning the home dashboard rail (Picker + Availability + Meetings + Polls).
- Produces: `MeetingRail({ id }: { id: string })` — async server component returning the meeting rail.

- [ ] **Step 1: Create `HomeRail`**

Move the **entire body** of `app/(app)/@right/page.tsx` (all imports, helper functions `fmtDay`/`fmtWhen`, types, and the default export's logic + returned JSX) into `components/app/home-rail.tsx`, renaming the export:

```tsx
export async function HomeRail() {
  // …exact contents of the old HomeRight() default export…
}
```

- [ ] **Step 2: Point `@right/page.tsx` at `HomeRail`**

Replace the file with:

```tsx
import { HomeRail } from "@/components/app/home-rail";

export default async function HomeRight() {
  return <HomeRail />;
}
```

- [ ] **Step 3: Create `MeetingRail`**

Move the body of `app/(app)/@right/meetings/[id]/page.tsx` into `components/meetings/meeting-rail.tsx`, changing the signature from `params: Promise<{ id: string }>` to a plain `id` prop (drop the `const { id } = await params;` line):

```tsx
import { requireUser } from "@/lib/auth/require";
import { AgendaAddItem, type PromptOption } from "@/components/meetings/agenda-add-item";
import { MeetingCommentBox } from "@/components/meetings/meeting-comment-box";

export async function MeetingRail({ id }: { id: string }) {
  const { user, supabase } = await requireUser();
  // …exact remaining logic + returned JSX from the old MeetingRight()…
}
```

- [ ] **Step 4: Point `@right/meetings/[id]/page.tsx` at `MeetingRail`**

```tsx
import { MeetingRail } from "@/components/meetings/meeting-rail";

export default async function MeetingRight({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MeetingRail id={id} />;
}
```

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS. The app still renders rails via `@right` (unchanged behavior).

- [ ] **Step 6: Commit**

```bash
git add components/app/home-rail.tsx components/meetings/meeting-rail.tsx "app/(app)/@right/page.tsx" "app/(app)/@right/meetings/[id]/page.tsx"
git commit -m "refactor(app): extract home and meeting rails into standalone components"
```

---

### Task B3: Flip to page-owned rails (atomic pivot)

This is the single point where main-column chrome moves from the layout into the shell, so it must land together: the layout change, every page wrap, and the `@right`/`RightSlot` deletion. There is no working intermediate.

**Files:**
- Modify: `app/(app)/layout.tsx`
- Modify (wrap in shell): all pages under `app/(app)/` listed below
- Delete: `app/(app)/@right/` (whole folder), `components/app/right-slot.tsx`

**Interfaces:**
- Consumes: `DetailWithRail` (B1), `HomeRail` + `MeetingRail` (B2), existing `PollDetailPanel`, `PastPollsList`, `AdminControls`.

- [ ] **Step 1: Rewrite the app layout**

Replace `app/(app)/layout.tsx` with (auth block unchanged; only the returned JSX + `right` param removed):

```tsx
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { Nav } from "@/components/app/nav";
import { MobileNav } from "@/components/app/mobile-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let userId: string;
  let displayName = "You";
  try {
    const { user, supabase } = await requireUser();
    userId = user.id;
    const { data } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    if (data?.display_name) displayName = data.display_name;
  } catch {
    redirect("/sign-in");
  }
  return (
    <div className="min-h-screen bg-surface md:h-screen md:min-h-0 md:overflow-hidden md:grid md:grid-cols-[var(--nav-w,240px)_1fr] md:transition-[grid-template-columns] md:duration-med md:ease-soft">
      <Nav userId={userId!} displayName={displayName} />
      {children}
      <MobileNav />
    </div>
  );
}
```

- [ ] **Step 2: Wrap the six rail routes**

For each, import `DetailWithRail` and wrap the page's existing returned root element as `children`, passing the specified `rail`. Do **not** re-add main padding — the shell provides it.

- `app/(app)/page.tsx` — `import { HomeRail } from "@/components/app/home-rail";` then
  `return <DetailWithRail rail={<HomeRail />}>{/* existing root */}</DetailWithRail>;`
- `app/(app)/meetings/[id]/page.tsx` — `import { MeetingRail } from "@/components/meetings/meeting-rail";`
  `rail={<MeetingRail id={id} />}` (the page already resolves `id`).
- `app/(app)/polls/[id]/page.tsx` — `import { PollDetailPanel } from "@/components/polls/poll-detail-panel";`
  `rail={<PollDetailPanel pollId={id} />}`.
- `app/(app)/polls/page.tsx` — `import { PastPollsList } from "@/app/(app)/polls/_ui/past-polls-list";`
  ```tsx
  rail={
    <div className="space-y-4">
      <h2 className="font-display text-xl font-extrabold text-ink">Completed Polls</h2>
      <PastPollsList />
    </div>
  }
  ```
- `app/(app)/polls/past/page.tsx` — same import; heading text `"Past polls"`.
- `app/(app)/hiring/[id]/page.tsx` — `import { AdminControls } from "@/app/(app)/hiring/[id]/_ui/admin-controls";` (already imported indirectly via `@right` today — add here). The page already computes `data = await getEvaluationForViewer(id)`. Pass:
  ```tsx
  rail={
    data.isOwner ? (
      <AdminControls
        evaluation={data.ev}
        roster={data.roster}
        panel={data.panel}
        owners={data.owners}
        createdBy={data.createdBy}
      />
    ) : null
  }
  ```
  Wrap the existing `<div className="space-y-8">…</div>` return as `children`.

- [ ] **Step 3: Wrap the rail-less routes**

Wrap each of these pages' returned root in `<DetailWithRail>…</DetailWithRail>` (no `rail`), adding `import { DetailWithRail } from "@/components/app/detail-with-rail";`:

`app/(app)/series/page.tsx`, `app/(app)/settings/page.tsx`, `app/(app)/roster/page.tsx`, `app/(app)/leaderboard/page.tsx`, `app/(app)/hiring/page.tsx`, `app/(app)/meetings/page.tsx`, `app/(app)/notifications/page.tsx`, `app/(app)/series/[id]/page.tsx`, `app/(app)/tools/shuffle/page.tsx`, `app/(app)/tools/pick/page.tsx`, `app/(app)/roster/[id]/page.tsx`, `app/(app)/meetings/past/page.tsx`.

(Also add the `DetailWithRail` import to the six rail routes from Step 2.)

- [ ] **Step 4: Delete the parallel-route machinery**

```bash
git rm -r "app/(app)/@right" && git rm components/app/right-slot.tsx
```

- [ ] **Step 5: Confirm no stragglers**

Run: `grep -rn "RightSlot\|@right\|slots?.*right\|right:" app/(app)/layout.tsx components/ app/ | grep -i right`
Expected: no references to `RightSlot` or the `@right` slot remain (matches for the CSS/word "right" elsewhere are fine).

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 7: Verify each rail renders (driven)**

Use the `run`/`verify` skill to launch the app and confirm, on desktop width:
- `/` shows the dashboard rail; `/polls` + `/polls/past` show the polls rail; `/polls/[id]` shows the poll detail rail; `/meetings/[id]` shows the agenda/comment rail (host vs participant); `/hiring/[id]` shows the Manage panel for an owner and nothing for a non-owner.
- A rail-less route (e.g. `/settings`) renders full-width with the sticky header intact.
- The fullscreen `/hiring/[id]/evaluate` and `/meetings/[id]/present` routes are visually unchanged.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(app): page-owned right rails via DetailWithRail; retire @right slot"
```

---

# PART A — Manage/Fields panel

### Task A1: `partitionRefreshColumns` helper (TDD) + wire into refresh

Extracts the refresh-time column partition into a pure, tested function that also preserves **disabled** fields (today only hidden state is carried forward).

**Files:**
- Create: `lib/evaluation/refresh.ts`
- Test: `tests/evaluation/refresh.test.ts`
- Modify: `lib/actions/evaluation.ts:188-221` (`refreshEvaluationAction`)

**Interfaces:**
- Produces: `partitionRefreshColumns(existing: { column_key: string; is_active: boolean; is_hidden: boolean }[], nonIdentityHeaders: string[]): { questionColumns: string[]; hiddenColumns: string[] }` — headers whose existing row is inactive are dropped from **both** arrays (so `syncEvaluation` deactivates them); existing hidden rows go to `hiddenColumns`; everything else (including brand-new headers) goes to `questionColumns`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { partitionRefreshColumns } from "@/lib/evaluation/refresh";

describe("partitionRefreshColumns", () => {
  it("keeps a brand-new header as a visible question", () => {
    const out = partitionRefreshColumns([], ["Q1"]);
    expect(out).toEqual({ questionColumns: ["Q1"], hiddenColumns: [] });
  });

  it("routes an existing hidden (active) field to hiddenColumns", () => {
    const out = partitionRefreshColumns(
      [{ column_key: "Q1", is_active: true, is_hidden: true }],
      ["Q1"],
    );
    expect(out).toEqual({ questionColumns: [], hiddenColumns: ["Q1"] });
  });

  it("drops a disabled field from both arrays", () => {
    const out = partitionRefreshColumns(
      [{ column_key: "Q1", is_active: false, is_hidden: false }],
      ["Q1"],
    );
    expect(out).toEqual({ questionColumns: [], hiddenColumns: [] });
  });

  it("keeps an existing active+visible field as a question", () => {
    const out = partitionRefreshColumns(
      [{ column_key: "Q1", is_active: true, is_hidden: false }],
      ["Q1"],
    );
    expect(out).toEqual({ questionColumns: ["Q1"], hiddenColumns: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evaluation/refresh.test.ts`
Expected: FAIL — `partitionRefreshColumns` not found.

- [ ] **Step 3: Implement the helper**

```ts
// lib/evaluation/refresh.ts
// Partition non-identity sheet headers for a refresh re-sync, preserving the
// per-field state owners set in the Fields tab: disabled fields are excluded
// (syncEvaluation then deactivates them), hidden fields stay hidden, and new or
// visible fields become rated questions.
export function partitionRefreshColumns(
  existing: { column_key: string; is_active: boolean; is_hidden: boolean }[],
  nonIdentityHeaders: string[],
): { questionColumns: string[]; hiddenColumns: string[] } {
  const byKey = new Map(existing.map((q) => [q.column_key, q]));
  const questionColumns: string[] = [];
  const hiddenColumns: string[] = [];
  for (const h of nonIdentityHeaders) {
    const q = byKey.get(h);
    if (q && !q.is_active) continue;
    if (q && q.is_hidden) hiddenColumns.push(h);
    else questionColumns.push(h);
  }
  return { questionColumns, hiddenColumns };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evaluation/refresh.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the helper into `refreshEvaluationAction`**

In `lib/actions/evaluation.ts`, add `import { partitionRefreshColumns } from "@/lib/evaluation/refresh";`. Replace the existing hidden-only partition block (currently selecting `column_key,is_hidden` and computing `hiddenKeys`/`questionColumns`/`hiddenColumns`) with:

```ts
const { data: existingQs } = await svc.from("evaluation_questions")
  .select("column_key,is_active,is_hidden").eq("evaluation_id", parsed.data.evaluationId);
const { questionColumns, hiddenColumns } =
  partitionRefreshColumns(existingQs ?? [], nonIdentityHeaders);
```

Leave the surrounding `identity`/`nonIdentityHeaders` computation and the `syncEvaluation(...)` call unchanged.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/evaluation/refresh.ts tests/evaluation/refresh.test.ts lib/actions/evaluation.ts
git commit -m "feat(hiring): preserve disabled fields across evaluation refresh"
```

---

### Task A2: `setEvaluationFieldAction` + input schema

**Files:**
- Modify: `lib/zod/evaluation.ts`
- Modify: `lib/actions/evaluation.ts`

**Interfaces:**
- Produces: `setEvaluationFieldAction(input: unknown): Promise<ActionResult<null>>` — owner-gated; rejects when the evaluation is `closed`; updates `is_active`/`is_hidden` (only the provided keys) for `questionId` scoped to `evaluationId`.
- Produces (zod): `setEvaluationFieldInput` with `{ evaluationId: uuid, questionId: uuid, isActive?: boolean, isHidden?: boolean }`.

- [ ] **Step 1: Add the zod input**

In `lib/zod/evaluation.ts`:

```ts
export const setEvaluationFieldInput = z.object({
  evaluationId: z.string().uuid(),
  questionId: z.string().uuid(),
  isActive: z.boolean().optional(),
  isHidden: z.boolean().optional(),
});
```

- [ ] **Step 2: Add the action**

In `lib/actions/evaluation.ts`, add `setEvaluationFieldInput` to the existing import from `@/lib/zod/evaluation`, then:

```ts
export async function setEvaluationFieldAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = setEvaluationFieldInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireEvaluationOwner(parsed.data.evaluationId);
  const svc = atlasServiceClient();
  const { data: ev } = await svc.from("evaluations")
    .select("status").eq("id", parsed.data.evaluationId).single();
  if (ev?.status === "closed")
    return err("locked", "fields are locked after the evaluation is closed");
  const patch: { is_active?: boolean; is_hidden?: boolean } = {};
  if (parsed.data.isActive !== undefined) patch.is_active = parsed.data.isActive;
  if (parsed.data.isHidden !== undefined) patch.is_hidden = parsed.data.isHidden;
  if (Object.keys(patch).length === 0) return ok(null);
  const { error } = await svc.from("evaluation_questions")
    .update(patch).eq("id", parsed.data.questionId)
    .eq("evaluation_id", parsed.data.evaluationId);
  if (error) return err("db_error", error.message);
  revalidatePath(`/hiring/${parsed.data.evaluationId}`);
  return ok(null);
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/zod/evaluation.ts lib/actions/evaluation.ts
git commit -m "feat(hiring): add setEvaluationFieldAction for per-field enable/hide"
```

---

### Task A3: Query — owner `fields` + closed-results `contextFields`

**Files:**
- Modify: `lib/evaluation/queries.ts`
- Modify: `app/(app)/hiring/[id]/page.tsx`

**Interfaces:**
- Produces (from `getEvaluationForViewer`): `fields: { id: string; prompt: string; position: number; is_active: boolean; is_hidden: boolean }[]` (owner-only, else `[]`); and `contextFields: { questions: { question_id: string; prompt: string }[]; answers: { candidate_id: string; question_id: string; answer_text: string | null }[] }` (closed + panelist/admin, else empty arrays).

- [ ] **Step 1: Add `fields` to the owner block**

In `getEvaluationForViewer`, inside the existing `if (isOwner) { … }` block, add:

```ts
fields = (await svc.from("evaluation_questions")
  .select("id,prompt,position,is_active,is_hidden")
  .eq("evaluation_id", id).order("position")).data ?? [];
```

And declare above the block, alongside the other owner vars:

```ts
let fields: { id: string; prompt: string; position: number; is_active: boolean; is_hidden: boolean }[] = [];
```

- [ ] **Step 2: Add the `contextFields` fetch (service client, closed + panelist/admin)**

After the `evaluatorBreakdown` block, add:

```ts
// Hidden fields become read-only context in closed results. Read via the
// service client because answers_read RLS blocks non-admin panelists from
// hidden-question answer text. Strictly gated to closed + panelist/admin.
let contextFields: {
  questions: { question_id: string; prompt: string }[];
  answers: { candidate_id: string; question_id: string; answer_text: string | null }[];
} = { questions: [], answers: [] };
if (ev.status === "closed" && (isPanelist || isAdmin)) {
  const hiddenQs = (await svc.from("evaluation_questions")
    .select("id,prompt,position").eq("evaluation_id", id)
    .eq("is_active", true).eq("is_hidden", true).order("position")).data ?? [];
  if (hiddenQs.length) {
    const hqIds = hiddenQs.map((q) => q.id);
    const hAns = (await svc.from("evaluation_answers")
      .select("candidate_id,question_id,answer_text")
      .eq("evaluation_id", id).in("question_id", hqIds)).data ?? [];
    contextFields = {
      questions: hiddenQs.map((q) => ({ question_id: q.id, prompt: q.prompt })),
      answers: hAns,
    };
  }
}
```

- [ ] **Step 3: Return the new fields**

Add `fields` and `contextFields` to the returned object literal at the end of `getEvaluationForViewer`.

- [ ] **Step 4: Thread props in the hiring page**

In `app/(app)/hiring/[id]/page.tsx`, destructure `fields` and `contextFields` from `data`, pass `fields={data.fields}` to `<AdminControls>` (added in Task A5's prop), and pass `contextFields={data.contextFields}` to `<ResultsView>` (added in Task A4's prop). Until A4/A5 add those props this is type-inert — sequence A4/A5 after, or add the props in the same edit.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (props consumed in A4/A5; if running A3 alone, omit the not-yet-existing prop passes and add them with A4/A5).

- [ ] **Step 6: Commit**

```bash
git add lib/evaluation/queries.ts "app/(app)/hiring/[id]/page.tsx"
git commit -m "feat(hiring): query owner fields and closed-results context fields"
```

---

### Task A4: `ResultsView` — hidden-field context rows

**Files:**
- Modify: `app/(app)/hiring/[id]/_ui/results-view.tsx`

**Interfaces:**
- Consumes: `contextFields` (A3).
- Produces: `ResultsView` accepts a new optional prop `contextFields?: { questions: { question_id: string; prompt: string }[]; answers: { candidate_id: string; question_id: string; answer_text: string | null }[] }` (default `{ questions: [], answers: [] }`).

- [ ] **Step 1: Add the prop + a per-candidate answer map**

Add to the props type/destructure a `contextFields = { questions: [], answers: [] }`. Build a lookup:

```ts
const contextAnswerFor = new Map<string, string>();
for (const a of contextFields.answers) {
  const text = a.answer_text?.trim();
  if (text) contextAnswerFor.set(`${a.candidate_id}|${a.question_id}`, text);
}
```

- [ ] **Step 2: Render a context group under each expanded candidate**

Inside the expanded-candidate block, **after** the `{c.cells.map(...)}` list, add (reusing the existing `openQ`/`toggleQ` expansion, keyed to avoid collision with scored cells):

```tsx
{contextFields.questions.length > 0 && (
  <div className="border-t border-divider">
    <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
      Context (not scored)
    </p>
    {contextFields.questions.map((q) => {
      const key = `ctx|${c.candidate_id}|${q.question_id}`;
      const answer = contextAnswerFor.get(`${c.candidate_id}|${q.question_id}`);
      const qOpen = openQ.has(key);
      return (
        <div key={q.question_id} className="border-b border-divider last:border-b-0">
          {answer ? (
            <button
              type="button"
              onClick={() => toggleQ(key)}
              aria-expanded={qOpen}
              className="flex w-full items-center justify-between gap-4 py-2 pl-10 pr-4 text-left text-sm transition-colors duration-fast ease-soft hover:bg-ink/5"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <ChevronDownIcon className={cn("size-3 shrink-0 text-ink-soft transition-transform duration-fast ease-soft", qOpen && "rotate-180")} />
                <span className="truncate text-ink-soft">{q.prompt}</span>
              </span>
            </button>
          ) : (
            <div className="py-2 pl-10 pr-4 text-sm">
              <span className="truncate text-ink-soft">{q.prompt}</span>
            </div>
          )}
          {answer && qOpen && (
            <p className="whitespace-pre-wrap py-2 pl-[3.75rem] pr-4 text-sm leading-relaxed text-ink">
              {answer}
            </p>
          )}
        </div>
      );
    })}
  </div>
)}
```

- [ ] **Step 3: Pass the prop from the page**

Ensure `app/(app)/hiring/[id]/page.tsx` renders `<ResultsView results={…} answers={answers} evaluators={evaluatorBreakdown} contextFields={contextFields} />`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/hiring/[id]/_ui/results-view.tsx" "app/(app)/hiring/[id]/page.tsx"
git commit -m "feat(hiring): show hidden fields as context in closed results"
```

---

### Task A5: `AdminControls` — full-height Manage/Fields tabbed panel

**Files:**
- Modify: `app/(app)/hiring/[id]/_ui/admin-controls.tsx`

**Interfaces:**
- Consumes: `fields` (A3), `setEvaluationFieldAction` (A2).
- Produces: `AdminControls` gains `fields?: { id: string; prompt: string; position: number; is_active: boolean; is_hidden: boolean }[]` and uses `evaluation.status` (add `status` to its `Ev` type) to lock the Fields tab when closed.

- [ ] **Step 1: Extend the type + imports**

- Add `status` to the `Ev` type: `status: "draft" | "open" | "closed";` (already present — confirm) and add `fields` to the component props (default `[]`).
- Add `setEvaluationFieldAction` to the `@/lib/actions/evaluation` import.
- Remove the `Card, CardHeader, CardTitle, CardContent, CardFooter` import (no longer used).
- Add a `const [activeTab, setActiveTab] = useState<"manage" | "fields">("manage");`.

- [ ] **Step 2: Replace the `<Card>` shell with a full-height flex column**

Restructure the returned JSX to:

```tsx
return (
  <div className="flex h-full min-h-0 flex-col gap-4">
    {/* Segmented tabs (pinned) */}
    <div className="flex shrink-0 gap-1 rounded-md border-chunk border-ink bg-surface-raised p-1">
      {(["manage", "fields"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setActiveTab(t)}
          className={
            "flex-1 rounded-sm px-3 py-1.5 text-sm font-semibold capitalize transition-all duration-fast " +
            (activeTab === t
              ? "bg-primary text-primary-ink shadow-[-2px_2px_0_0_var(--primary-shadow)]"
              : "text-ink-soft hover:text-ink")
          }
        >
          {t}
        </button>
      ))}
    </div>

    {/* Active tab body (scrolls) */}
    <div className="min-h-0 flex-1 overflow-y-auto">
      {activeTab === "manage" ? (
        <div className="space-y-5">{/* Sheet + Panel + Owners sections, moved verbatim from the old CardContent */}</div>
      ) : (
        <FieldsTab
          evaluationId={evaluation.id}
          fields={fields}
          locked={evaluation.status === "closed"}
          pending={pending}
          run={run}
        />
      )}
    </div>

    {/* Lifecycle footer (pinned, both tabs) */}
    <div className="flex shrink-0 flex-col items-stretch gap-2 border-t border-divider pt-4">
      {/* the existing CardFooter contents: last-synced, Refresh, Open/Close/Reopen, msg */}
    </div>
  </div>
);
```

Move the existing Sheet/Panel/Owners JSX (currently in `CardContent`) into the Manage branch **unchanged**, and the lifecycle buttons (currently in `CardFooter`) into the footer `div` **unchanged**. Keep the `MappingDialog` render where it is (inside the Manage branch, near the Sheet section).

- [ ] **Step 3: Add the `FieldsTab` sub-component (same file, below `AdminControls`)**

```tsx
function FieldsTab({
  evaluationId, fields, locked, pending, run,
}: {
  evaluationId: string;
  fields: { id: string; prompt: string; position: number; is_active: boolean; is_hidden: boolean }[];
  locked: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: { message: string } }>) => void;
}) {
  if (fields.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        No fields yet. Connect a sheet or upload a CSV to import fields.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-soft">
        Hidden fields aren&apos;t scored during evaluation but appear as context in results.
      </p>
      {locked && (
        <p className="text-xs font-semibold text-ink-soft">Fields lock after closing.</p>
      )}
      <ul className="space-y-2">
        {fields.map((f) => (
          <li
            key={f.id}
            className="flex items-center justify-between gap-3 rounded-md border-chunk border-ink bg-surface-raised px-3 py-2"
          >
            <span className="min-w-0 truncate text-sm font-medium text-ink">{f.prompt}</span>
            <span className="flex shrink-0 gap-1.5">
              <TogglePill
                label="Enabled"
                on={f.is_active}
                disabled={locked || pending}
                onClick={() => run(() => setEvaluationFieldAction({ evaluationId, questionId: f.id, isActive: !f.is_active }))}
              />
              <TogglePill
                label="Hidden"
                on={f.is_hidden}
                disabled={locked || pending || !f.is_active}
                onClick={() => run(() => setEvaluationFieldAction({ evaluationId, questionId: f.id, isHidden: !f.is_hidden }))}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TogglePill({
  label, on, disabled, onClick,
}: { label: string; on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={on}
      className={
        "rounded-md border-chunk px-2.5 py-1 text-xs font-semibold transition-all duration-fast disabled:cursor-not-allowed disabled:opacity-50 " +
        (on
          ? "bg-primary text-primary-ink border-primary shadow-[-2px_2px_0_0_var(--primary-shadow)]"
          : "bg-surface-raised text-ink-soft border-ink hover:text-ink")
      }
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 4: Accept the `fields` prop**

Update the `AdminControls` signature to destructure `fields = []` and add it to the props type.

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 6: Verify the panel end-to-end (driven)**

Use the `run`/`verify` skill on an owned evaluation:
- The rail is full-height; tabs switch between Manage and Fields; the lifecycle footer (Refresh/Open/Close) stays visible on both tabs.
- In Fields (status `open`), disable field A and hide field B → the `open` rating screen (`/hiring/[id]` main / evaluate) omits both.
- Close the evaluation → results exclude A entirely and show B under "Context (not scored)" with its answer text (as an owner/admin), no score.
- Refresh the sheet → A stays disabled and B stays hidden.
- Confirm the Fields toggles are disabled (read-only) once closed.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/hiring/[id]/_ui/admin-controls.tsx"
git commit -m "feat(hiring): full-height Manage/Fields tabbed evaluation panel"
```

---

## Self-Review

**Spec coverage:**
- Part B shell / layout / rail extraction / deletion → B1, B2, B3. ✓
- All ~18 pages wrapped → B3 Steps 2–3. ✓
- Part A field semantics (enable/hide, closed-lock) → A2 (action lock), A5 (UI lock). ✓
- Refresh preserves disabled + hidden → A1. ✓
- `fields` owner query → A3. ✓
- Results context via `svc`, gated → A3 + A4. ✓
- Full-height tabbed panel + toggles → A5. ✓
- No migration; no RPC change → honored (Global Constraints, Out of Scope). ✓

**Placeholder scan:** Rail-content moves in B2 and section moves in A5 say "verbatim/unchanged" rather than re-printing large existing blocks — intentional (moving existing code, not authoring new logic); every *new* code block is written in full. No TBD/TODO remain.

**Type consistency:** `fields` shape `{ id, prompt, position, is_active, is_hidden }` is identical across A3 (query), A5 (`AdminControls`/`FieldsTab`). `contextFields` shape `{ questions: { question_id, prompt }[]; answers: { candidate_id, question_id, answer_text }[] }` is identical across A3 (query) and A4 (`ResultsView`). `setEvaluationFieldAction` input keys (`evaluationId, questionId, isActive?, isHidden?`) match between A2 (zod/action) and A5 (call sites). `partitionRefreshColumns` signature matches between A1 helper and its `refreshEvaluationAction` call site.

## Notes on sequencing

Part B (B1→B3) must complete before Part A's A5 so the full-height panel resolves its `h-full` chain inside the shell's `md:flex md:flex-col` rail. Within Part A, run A3 together with A4/A5 (or add the new `ResultsView`/`AdminControls` props in the same edits) so `npx tsc --noEmit` stays green at each commit.
