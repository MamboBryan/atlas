# Full-screen Pick & Shuffle tools — design

Date: 2026-08-04

## Goal

Make the standalone `/tools/pick` and `/tools/shuffle` experiences full-screen and
colorful — matching the meeting **present mode** look — instead of the current plain
cards in a narrow column. Add a slot-machine "loading" moment when a person is being
selected. Turn shuffle into a **sequential reveal**: one person spotlighted in the
center, with a card in the bottom-right showing who's coming next.

## Current state

- `/tools/pick` → `PickRunner` (`components/tools/pick-runner.tsx`): slot-machine name
  cycle inside a shadcn `Card`, narrow `max-w-2xl` column.
- `/tools/shuffle` → `ShufflePlayground` (`components/tools/shuffle-playground.tsx`):
  a grid of all names that reshuffles all-at-once. Persists a `shuffle_sessions` DB row
  and exposes a shareable `?id=` link.
- Present mode achieves its look via a `fixed inset-0 z-50` layout, a per-slide
  `Palette` from `lib/present/palettes.ts` applied with
  `style={{ background: palette.bg, color: palette.ink }}`, neo-brutalist accent buttons
  (`shadow-[Npx_Npx_0_...]`), the `Confetti` component, and `NextUpCard` bottom-right.

## Design

### Shared building blocks (new)

1. **`ToolStage`** — `components/tools/tool-stage.tsx`. A `fixed inset-0 z-50` overlay
   that paints a palette background (`style={{ background, color }}`), lays out a header
   row / centered body / footer, and renders a **circular ✕ close button, top-right**, in
   the neo-brutalist actions style (accent fill, `border-2`, hard `shadow-[3px_3px_0_...]`).
   Closes on **Esc** and on click via `router.back()` (fallback `/`). Props:
   `palette`, `onClose?`, `children`, optional `footer`.

2. **`useSlotMachine`** — `lib/tools/use-slot-machine.ts`. Extracts the decaying-interval
   name-cycle currently inlined in `PickRunner` (~40ms → 200ms over ~1.5s), honoring
   `prefers-reduced-motion` (skip cycle, land immediately). Returns
   `{ displayed, spinning, run(finalName, pool, onLand) }`. Both tools drive their
   "loading when selecting" moment through it.

### Pick — reworked `PickRunner`

Renders inside `ToolStage`. Giant centered display name, a large accent **"Pick!"**
button. On click: `useSlotMachine.run` cycles then lands on a random eligible member →
`Confetti` fires → "Pick again" re-runs. Loading/empty/error states render inside the
stage (colorful, not plain cards). Eligible roster via existing `listEligibleNames`.

### Shuffle — new `ShuffleStage` (sequential reveal)

Replaces `ShufflePlayground` as the component `/tools/shuffle/page.tsx` renders. Driven by
the existing `shuffle_sessions` model + `startShuffle` / `advanceShuffle` server actions,
so the shareable `?id=` link is preserved (no regression). Behavior:

- On mount: ensure a session exists (create via `startShuffle(null)` and `router.replace`
  to `?id=` when none, mirroring current logic), then load `roster_snapshot` + display
  names.
- **Current person centered** (big name) inside `ToolStage`.
- **`NextUpCard` bottom-right** showing the next person in the shuffled order (reused from
  `components/present/next-up-card.tsx`), hidden on the last person.
- **"Next person →"** button → `useSlotMachine` cycle → lands on the next person (order is
  the fixed `roster_snapshot`; the cycle is suspense) → `advanceShuffle` persists index →
  `Confetti`. On the last person the primary button becomes **"Restart"** (`restartShuffle`).

### Color behavior

No agenda ordinal exists here, so **rotate through the 6 `stagePalettes` on each reveal**
(each pick / each next-person gets a fresh bold color) via a local counter
`stagePalettes[n % stagePalettes.length]`. Standby uses the first palette.

## Pages

- `app/(app)/tools/pick/page.tsx` and `app/(app)/tools/shuffle/page.tsx` drop the
  `max-w-2xl` column + heading + "← Home" (the stage is full-screen with its own close);
  they render the stage component directly. Shuffle page still reads `?id=`.

## Impact / cleanup

- `ShufflePlayground` becomes unused after the page swap → remove it. `ShuffleRunner`
  (used by `components/meetings/agenda-runner.tsx`) and the present-mode `PickerSlide` are
  **untouched**.
- No DB or server-action changes. No schema migration.

## Verification

Drive both flows in the running dev app: normal motion (cycle + confetti + reveal),
`prefers-reduced-motion` (instant land, no cycle), Esc + ✕ close, and the shuffle up-next
card advancing / disappearing on the last person. Type-check clean.
