# Hiring: Manage/Fields panel + page-owned right rails

**Date:** 2026-08-05
**Branch:** feat/hiring-evaluations

Two related changes to the hiring evaluation experience and the app-wide right rail:

- **Part A — Manage/Fields panel.** Turn the owner-only "Manage evaluation"
  card into a full-height, tabbed panel (`Manage` | `Fields`). The new `Fields`
  tab lets owners enable/disable and hide/reveal each imported form field.
- **Part B — page-owned right rails.** Retire the Next.js `@right` parallel-route
  mechanism. Every destination renders its own right rail through a shared
  `DetailWithRail` shell, so main content and rail move as one unit.

Part B lands first (pure structural refactor), then Part A restyles the rail
content into the tabbed panel.

---

## Part B — Page-owned right rails

### Motivation

The right rail is currently a parallel route (`app/(app)/@right/**`) rendered by
the app layout independently of the page. We want each destination to *own* its
rail so the two are one React subtree that changes together on navigation. This
is a structural change only — no behavior change intended.

### Current state

- `app/(app)/layout.tsx` renders a 3-column grid
  `[var(--nav-w) 7fr 3fr]`: `<Nav>`, `<main>{children}</main>`, and
  `<RightSlot>{right}</RightSlot>` where `right` is the `@right` parallel slot.
- `<main>` carries the sticky-header CSS (`[&_header]` rules), horizontal
  padding, and independent `md:h-screen md:overflow-y-auto` scroll.
- `components/app/right-slot.tsx` is a client component keyed by pathname,
  `hidden md:block md:h-screen md:overflow-y-auto px-6 pt-8 pb-10`.
- Rails today:
  | Route | Rail |
  |---|---|
  | `/` | Picker + Availability + next Meeting + awaiting Polls (inline in `@right/page.tsx`) |
  | `/polls` | heading + `PastPollsList` |
  | `/polls/past` | heading + `PastPollsList` |
  | `/polls/[id]` | `PollDetailPanel` |
  | `/meetings/[id]` | Add-agenda-item + `MeetingCommentBox` (inline in `@right/meetings/[id]/page.tsx`) |
  | `/hiring/[id]` | `AdminControls` (owner-only) |
  | all others | `default.tsx` → `null` |
- Override layouts `hiring/[id]/evaluate/layout.tsx` and
  `meetings/[id]/present/layout.tsx` use `fixed inset-0 z-50` — they escape the
  grid entirely and are unaffected by any grid change.

### Target design

**New shell — `components/app/detail-with-rail.tsx`:**

```tsx
export function DetailWithRail({
  children, rail,
}: { children: React.ReactNode; rail?: React.ReactNode }) { … }
```

- Renders `md:grid md:grid-cols-[7fr_3fr]` when `rail` is present, else main
  spans full width.
- **Main column** reproduces today's `<main>` exactly: `md:h-screen
  md:overflow-y-auto`, horizontal padding, and the verbatim sticky-header
  `[&_header]` isolation rules (the recent leak fix).
- **Rail column**: `hidden md:flex md:flex-col md:h-screen md:overflow-y-auto`
  with the current rail padding. `md:flex md:flex-col` is required so Part A's
  full-height panel can resolve its `h-full` chain.

**App layout (`app/(app)/layout.tsx`):**

- Remove the `right` parallel-slot param, the `<RightSlot>` import/usage, and the
  `3fr` grid column. Grid becomes `md:grid-cols-[var(--nav-w,240px)_1fr]`. The
  content cell holds either a `DetailWithRail` (rail routes) or plain page
  content. Nav-collapse still animates only the nav column.
- The main-column styling (scroll, padding, sticky header) moves **out** of the
  layout and **into** the shell. The layout renders `{children}` into a bare
  content grid-cell with no `<main>` and no chrome. **Every** page (rail or not)
  wraps its content in `DetailWithRail` — rail routes pass a `rail`, plain routes
  omit it and get full-width main with identical chrome. This makes the shell the
  single source of truth for main-column chrome. Cost: all ~18 `(app)` pages get
  a one-line wrapper change; the plan enumerates them.

**Rails become self-contained server components** rendered by their own page as
`rail`:

- Extract home rail → `components/app/home-rail.tsx` (async server component;
  moves the data fetching + JSX from `@right/page.tsx`). `app/(app)/page.tsx`
  renders `<DetailWithRail rail={<HomeRail />}>…</DetailWithRail>`.
- Extract meeting rail → `components/meetings/meeting-rail.tsx` (async, self-
  fetches from `params`/`requireUser` exactly as `@right/meetings/[id]/page.tsx`
  does). Rendered by `app/(app)/meetings/[id]/page.tsx`.
- Polls: `app/(app)/polls/page.tsx` and `polls/past/page.tsx` render the
  `heading + <PastPollsList />` rail inline; `polls/[id]/page.tsx` renders
  `<PollDetailPanel pollId={id} />` as `rail`.
- **Hiring detail (`hiring/[id]/page.tsx`)**: already calls
  `getEvaluationForViewer(id)` for its main content. Reuse that single `data` to
  render `rail={data.isOwner ? <AdminControls … /> : null}`, eliminating the
  duplicate fetch that lived in `@right/hiring/[id]/page.tsx`.

**Deletions:**

- Entire `app/(app)/@right/` folder (all `page.tsx` + `default.tsx`).
- `components/app/right-slot.tsx`.

### Isolation & boundaries

- `DetailWithRail` is the single owner of two-pane chrome (grid, scroll, padding,
  sticky header). Pages supply only content. Rails are independent server
  components that self-fetch — each is understandable and testable in isolation.
- Override layouts (`evaluate`, `present`) are untouched: `fixed inset-0`
  content ignores the grid.

### Verification (Part B)

Drive the app (via the `run`/`verify` skill) and confirm each rail still appears
and updates on navigation: home dashboard, `/polls`, `/polls/past`,
`/polls/[id]`, `/meetings/[id]` (host vs participant, live vs not), and
`/hiring/[id]` (owner sees the panel, non-owner sees none). Confirm rail-less
routes (roster, settings, tools, list pages) render full-width with the sticky
header intact. Confirm the fullscreen `evaluate` and `present` routes are
unchanged.

---

## Part A — Manage/Fields panel

### Data model (already present)

`evaluation_questions` has `is_active` (default `true`) and `is_hidden`
(default `false`). Today both `is_active=false` and `is_hidden=true` exclude a
question **everywhere** (rating screen *and* the `evaluation_results` RPC). This
spec changes the meaning of `is_hidden` in results only (see below).

### Field semantics (decided)

Per field, two independent toggles:

- **Enabled** (`is_active`): off ⇒ field is fully removed from evaluation **and**
  results. (Unchanged behavior.)
- **Hidden** (`is_hidden`): hidden from panelists during evaluation (already the
  case — not rated), but in **closed results** it appears as read-only
  **context (answer text, no score)**. This is the one behavior change:
  hidden-but-active questions are surfaced in results instead of dropped.

Editing is allowed while `draft` or `open`; **locked when `closed`** (avoids
mutating an already-scored result set).

### Backend changes

**New server action — `setEvaluationFieldAction`** (`lib/actions/evaluation.ts`):

```ts
setEvaluationFieldInput = z.object({
  evaluationId: z.string().uuid(),
  questionId: z.string().uuid(),
  isActive: z.boolean().optional(),
  isHidden: z.boolean().optional(),
});
```
- Owner-gated via `requireEvaluationOwner`.
- Rejects with an error when the evaluation status is `closed`.
- Updates `evaluation_questions` (`is_active` / `is_hidden`) for the given
  `questionId` scoped to `evaluationId`, via the service client.
- `revalidatePath('/hiring/{id}')`.

**Owner query data — `fields`** (`lib/evaluation/queries.ts`,
`getEvaluationForViewer`): when `isOwner`, fetch **all** questions (any state) via
the service client: `{ id, prompt, position, is_active, is_hidden }` ordered by
`position`. Returned as `fields` and passed to `AdminControls`.

**Refresh preservation** (`refreshEvaluationAction`): today it carries forward
`is_hidden` from existing rows. Extend it to also carry forward `is_active=false`
(disabled fields stay disabled through a re-sync). Implementation: read existing
`{ column_key, is_active, is_hidden }`; drop disabled columns from the synced
column set entirely (so `syncEvaluation` deactivates them → `is_active=false`),
and keep hidden columns in `hiddenColumns` (unchanged). No `syncEvaluation`
signature change required.

**Results context** (`getEvaluationForViewer` + `results-view.tsx`): when
`status === 'closed'` and the viewer is panelist/admin, fetch hidden-but-active
questions (`is_active=true, is_hidden=true`, ordered by `position`) and their
answers. Pass a **separate** payload to `ResultsView`:

```ts
contextFields: {
  questions: { question_id: string; prompt: string }[];
  answers: { candidate_id: string; question_id: string; answer_text: string | null }[];
}
```

Kept separate from the existing `answers` prop so hidden answers never leak into
the open/rating flow (`RankList`). `ResultsView` renders, inside each expanded
candidate row and **after** the scored cells, a context group: each hidden
field's prompt with an expandable answer (reusing the existing answer-expansion
pattern) and **no score column**. Context is answer-text-only, so non-panelist
viewers (who receive no answer text) simply see nothing extra — consistent with
today's visibility model.

### UI — `AdminControls` full-height tabbed panel

- Drop the `<Card>` chrome. Root becomes `flex h-full min-h-0 flex-col`.
- **Top (pinned, `shrink-0`)**: a segmented control `[ Manage | Fields ]`, built
  inline from two buttons in the app's chunky style (no new primitive; there is
  no Tabs/Switch component in `components/ui`). Local `useState` for active tab.
- **Body (`flex-1 min-h-0 overflow-y-auto`)**: the active tab.
  - **Manage tab**: the existing Sheet + Panel + Owners sections, un-carded.
  - **Fields tab**: list of every field (from `fields`), each row showing the
    prompt (truncated) and two toggle pills — **Enabled** (`is_active`) and
    **Hidden** (`is_hidden`). The Hidden pill is disabled when the field is not
    Enabled (moot). One helper line: *"Hidden fields aren't scored during
    evaluation but appear as context in results."* Each toggle calls
    `setEvaluationFieldAction` then `router.refresh()`, with a pending state.
    When `status === 'closed'`, toggles are read-only with a "Fields lock after
    closing" note. Empty state when no fields imported yet: prompt to connect a
    sheet or upload a CSV.
- **Footer (pinned, `shrink-0`)**: the lifecycle actions (Last synced · Refresh ·
  Open/Close/Reopen · status message) stay **visible on both tabs** — they are
  the evaluation's status controls, not tab-specific.

Toggle pills reuse the existing selected/unselected chip styling already used by
the Panel and Owners pickers.

### Verification (Part A)

Via the `run`/`verify` skill: import fields → in the Fields tab, disable one
field and hide another → confirm the rating screen (`open`) omits both → close
the evaluation → confirm results exclude the disabled field entirely and show the
hidden field as a context row (answer text, no score) for panelists/admins →
Refresh the sheet and confirm the disabled/hidden states persist. Add a focused
unit test only if the refresh `is_active`-preservation logic factors cleanly out
of the DB round-trip; otherwise rely on the driven flow.

---

## Build order

1. **Part B** — `DetailWithRail` shell, layout change, extract/relocate rails,
   delete `@right` + `RightSlot`. Verify all rails render unchanged.
2. **Part A** — backend (`setEvaluationFieldAction`, `fields` query, refresh
   preservation, results context), then `AdminControls` tabbed full-height UI and
   `ResultsView` context rows. Verify the field lifecycle end-to-end.

## Out of scope

- No new migration (columns already exist).
- No change to the anonymized `evaluation_results` RPC (hidden fields are
  surfaced via a separate query path, not the aggregate).
- No redesign of poll/meeting rail *content* — only where it is rendered.
