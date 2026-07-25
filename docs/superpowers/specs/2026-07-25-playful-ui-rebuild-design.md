# Playful UI Rebuild — Design Spec

**Date:** 2026-07-25
**Status:** Draft (awaiting user review)
**Author:** brainstorming session with @mambobryan

## Summary

Rebuild Atlas's visual layer to feel more interactive, playful, and colorful — a
"Duolingo vibe" — while remaining a credible internal work tool. Introduce a
right-side sheet primitive that replaces all dedicated `/new` routes. Ship both
light and dark modes as first-class variants. Migrate in dependency-safe slices
so every commit leaves the app working.

Direction (locked from brainstorming):

- **Playfulness:** Playful + restrained. Bright palette, chunky shapes, thick
  outlined borders, hard offset shadows, bouncy micro-interactions. Illustrations
  used sparingly (empty states, auth, celebration moments).
- **Sheets:** All create flows open in a right-side sheet. Dedicated `/new`
  routes (`/meetings/new`, `/polls/new`, `/series/new`) are deleted.
- **Palette:** Atlas blue (`#4B4DF7`) primary, duo yellow (`#FFD84A`) accent,
  cream surface, ink outlines.
- **Motion:** Bouncy + celebratory — button squish, spring-slide sheets,
  confetti on creation moments.
- **Dark mode:** First-class variant, not an inverted afterthought.

## Non-goals

- Custom mascot character or hand-drawn illustrations (in-house SVG sticker set
  only for this rebuild).
- Lottie animations.
- Sound or haptic feedback.
- Reshaping detail / edit flows into sheets (only creation flows in scope).
- Adding new features. This is a visual + structural rebuild, not a feature
  release.

## Design tokens

Replaces the current monochrome shadcn tokens in `app/globals.css`. Everything
downstream reads from these.

### Color (semantic, both themes)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--surface` | `#FFF8EC` cream | `#0E1030` deep navy | Page background |
| `--surface-raised` | `#FFFFFF` | `#171A3D` | Cards, sheet body |
| `--ink` | `#111111` | `#F3F1E8` | Primary text, outlines |
| `--ink-soft` | `#5A5A5A` | `#A5A8C7` | Secondary text |
| `--primary` | `#4B4DF7` | `#8A8CFF` | CTAs, links, headings-accent |
| `--primary-ink` | `#FFFFFF` | `#0E1030` | Text on primary |
| `--accent` | `#FFD84A` | `#FFE264` | Highlights, celebration |
| `--accent-ink` | `#111111` | `#111111` | Text on accent (dark both modes) |
| `--success` | `#58CC02` | `#7EE84A` | Confirmation, live, streaks |
| `--success-ink` | `#111111` | `#111111` | Text on success backgrounds |
| `--danger` | `#FF4B4B` | `#FF7070` | Destructive, errors (backgrounds/borders) |
| `--danger-ink` | `#111111` | `#111111` | Text on danger backgrounds |
| `--danger-text` | `#D42222` | `var(--danger)` | Danger text on light surfaces (WCAG AA) |
| `--info` | `#1CB0F6` | `#6ED2FF` | Neutral notice |

All combinations verified against WCAG AA (4.5:1 body, 3:1 large text) before
merge. Yellow-on-cream restricted to elements ≥ 18px bold.

### Radii

- `--radius-sm: 10px`
- `--radius-md: 16px`
- `--radius-lg: 24px`
- `--radius-pill: 999px`

(Current app uses flat 10px everywhere; the playful language needs the chunkier
scale.)

### Borders

- `--border-thin: 2px`
- `--border-chunk: 3px`

Border color is always `--ink`, never a faded gray. The "outlined sticker" look
is the visual signature.

### Shadows — the press effect

Hard offset shadows in `--ink`, not soft blurs:

```css
--shadow-flat:  0 3px 0 0 var(--ink);   /* resting */
--shadow-lift:  0 5px 0 0 var(--ink);   /* hover */
--shadow-press: 0 1px 0 0 var(--ink);   /* active */
```

Buttons/cards translate downward 2px on hover, 2px more on press — the "squish"
that makes the UI feel physical.

**Dark mode:** hard ink shadows are invisible on navy surface, so `--shadow-flat`
becomes `0 3px 0 0 #000` (plain black at higher contrast). Motion behavior
unchanged.

### Typography

- **Display:** Nunito variable (weights 800/900), loaded via `next/font`. Used
  for page titles, sheet headers, card titles, primary button labels.
- **Body:** Inter (already in project via Next.js default), weights 400/500/600.

### Motion

```css
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);   /* overshoot */
--ease-soft:   cubic-bezier(0.4, 0, 0.2, 1);
--dur-fast:    120ms;
--dur-med:     220ms;
--dur-slow:    360ms;
```

All motion behind `@media (prefers-reduced-motion: reduce)` — swaps every
animation for instant transitions.

**Implementation:** CSS transitions/animations + `tailwindcss-animate` +
`tw-animate-css` (both already installed). No `framer-motion` dependency to keep
the bundle lean. Complex sequences (stagger, orchestration) done via CSS custom
properties + `animation-delay`.

### Spacing

No change — Tailwind's default 4px scale.

## App shell

### Desktop (≥ 768px)

Two-column layout: `nav | main`. Nav is a **chunky pill-rail**:

- Fixed 240px wide, cream surface, 3px ink right-border.
- Logo + "Atlas" wordmark at top in Nunito 800.
- Each nav item = full-width pill row (`--radius-md`, 3px ink border on active).
  - Rest: transparent, ink text, monoline icon on left.
  - Hover: `--surface-raised` background, item lifts 2px with `--shadow-flat`.
  - **Active: `--accent` fill, ink text, `--shadow-flat` in ink** — the
    "you are here" beacon.
- Notifications bell + user pill (avatar + display name) sit at the bottom of
  the rail. User pill opens a dropdown with theme toggle, settings, sign out.

### Mobile (< 768px)

Rail collapses to a bottom nav bar — 5 icons: Home, Meetings, Polls, Roster,
More. Yellow highlight on active. Series / Notifications / Settings live under
"More".

### Page container

`main` gets `max-w-5xl mx-auto px-6 py-8` (bumped from current `max-w-4xl`).
Every page has:

- **Page header block:** Nunito 800 title, one-line subhead in `--ink-soft`,
  primary CTA on the right (this is where "New meeting" / "New poll" /
  "New series" live and trigger their sheet).
- Sections below are cards (`--surface-raised`, 3px ink border,
  `--radius-lg`, `--shadow-flat`).

### Top-right area

Removed. Nav rail owns notifications + user pill. Simplifies visual hierarchy.

## Sheet primitive

The anchor of the rebuild. Replaces `/meetings/new`, `/polls/new`,
`/series/new`. Universal creation affordance.

### Foundation

Built on `@base-ui/react`'s `Dialog` primitive (already used by shadcn's
`Dialog` in this project). No new dependency. `<Sheet>` is a positioned
variant that slides from the right edge.

### Anatomy

- **Overlay:** ink at 40% opacity, fades in over 120ms.
- **Panel:** `min(560px, 100vw - 32px)` wide on desktop, full-screen on mobile
  (< 640px). `--surface-raised`, 3px ink border on left edge only, 24px
  top-left + bottom-left radius. "Card that slid in."
- **Header (sticky):** title in Nunito 800, close button top-right (pill,
  `--shadow-flat`).
- **Body:** scrollable form area, `p-6`, chunky inputs.
- **Footer (sticky):** two buttons right-aligned — primary CTA
  ("Create meeting") in Atlas blue, secondary ("Cancel") ghost. Mobile:
  full-width stacked, primary on top.

### Motion

- **Enter:** overlay fades in (120ms). Panel slides from `translateX(100%)` to
  `0` over 260ms with `--ease-spring` (subtle overshoot). Body content
  fades + rises 8px over 220ms with 60ms stagger delay via
  `animation-delay: calc(var(--stagger-i) * 60ms)`.
- **Exit:** reverse without overshoot, 200ms `--ease-soft`.

### Routing

Sheet open state mirrored to URL query param: `?new=meeting`, `?new=poll`,
`?new=series`. Benefits:

- Back button closes the sheet (feels native).
- Deep-linkable (share the URL, sheet opens).
- Server pre-renders the underlying page; sheet is client-only.

Implementation: a small `useSheetParam(name)` hook that reads `useSearchParams`
and provides `open`, `onOpenChange` that call `router.push` with updated URL
(scroll preserved).

### Interaction contract

- ESC or overlay click → close (with unsaved-changes confirm if form dirty).
- Successful create → close sheet + toast success + optimistic list update +
  confetti burst on the newly-created item.
- Error → inline field errors, sheet stays open, submit button returns to idle.

### API

```tsx
<Sheet open={open} onOpenChange={setOpen}>
  <SheetHeader title="New meeting" />
  <SheetBody>{/* form */}</SheetBody>
  <SheetFooter primary="Create" onPrimary={handleSubmit} />
</Sheet>
```

Each feature area owns its own form component (`<NewMeetingForm />`,
`<NewPollForm />`, `<NewSeriesForm />`) which mounts inside `<SheetBody>`.

### Accessibility

Base UI Dialog handles focus trap, `aria-modal`, ESC, initial focus. First
focusable element is the first form input. Close button has
`aria-label="Close new meeting"`.

## Component library

Lives in `components/ui/` alongside existing shadcn primitives.

### Rebuilt (same APIs, new styles)

- **`<Button>`** — Three variants (`primary`, `accent`, `ghost`) × three sizes
  (`sm`, `md`, `lg`). Signature squish: rest with `--shadow-flat`, hover
  `translateY(-2px)` + `--shadow-lift`, active `translateY(2px)` +
  `--shadow-press`. Loading: label replaced with `<BouncingDots>`, button
  keeps width (no reflow). Disabled: 50% opacity, no shadow, no motion.
- **`<Card>`** — `--surface-raised`, 3px ink border, `--radius-lg`,
  `--shadow-flat`. Optional `interactive` prop enables button-style hover lift.
- **`<Input>`, `<Textarea>`, `<Select>`** — 2px ink border, `--radius-md`,
  `h-12`. Focus ring: 3px `--primary` outline offset by 2px. Error state:
  border → `--danger`, small red message below with bouncy fade-in.
- **`<Badge>`** — Pill (`--radius-pill`), 2px ink border, no shadow. Presets:
  `live` (success + pulsing dot), `scheduled` (cream), `postponed` (yellow),
  `ended` (surface, soft ink), `open` (primary).
- **`<Toast>`** — Wraps existing `sonner`. Chunky pill, 2px ink border,
  `--shadow-flat`, spring-slides from top-right (desktop) / bottom (mobile).

### New

- **`<Sheet>`** — see previous section.
- **`<EmptyState>`** — centered: sticker slot + Nunito 800 headline +
  one-line body + primary CTA.
- **`<ConfettiBurst>`** — client-only. Fires a 1.2s canvas confetti burst in
  brand colors from a source coordinate. Called imperatively:
  `confetti({ from: buttonRef })`. Uses `canvas-confetti` (~5kb gzipped).
  Respects `prefers-reduced-motion` (no-op).
- **`<BouncingDots>`** — 3 dots scale-bouncing in sequence. Replaces spinner
  and the current text "…" loading indicators.
- **`<Sticker>`** — thin wrapper rendering an SVG from `public/stickers/` at
  a chosen size and rotation.

### Kept as-is (restyled via tokens only)

`Dialog` (for confirms only — most flows use `Sheet`), `DropdownMenu`,
`Separator`, `Label`, `Sonner`.

### Files touched

- Rebuild: `components/ui/button.tsx`, `card.tsx`, `input.tsx`, `badge.tsx`,
  `toast.tsx`
- New: `components/ui/sheet.tsx`, `empty-state.tsx`, `confetti-burst.tsx`,
  `bouncing-dots.tsx`, `sticker.tsx`, `textarea.tsx`, `select.tsx`

## Per-feature surfaces

### Home (`/`)

Three vertically-stacked cards:

- **Your next meeting** — big card, Nunito 800 title, host + timezone-aware
  time, prominent Start button (accent yellow) when in start window. Empty:
  sticker + "No meetings on the horizon" + "New meeting" button.
- **Awaiting your response** — stack of interactive cards, each a prompt with
  question + type badge + primary "Answer" button. Count badge in header.
- **Quick tools** — two pill-buttons: Pick someone, Shuffle roster.

### Meetings (`/meetings`, `/meetings/past`, `/meetings/[id]`)

- List: page header with "New meeting" primary button → `?new=meeting` sheet.
- Each row is an interactive `<Card>` with status badge (live pulses,
  scheduled cream, postponed yellow).
- Detail: chunky title header, host+time meta, status badge, action buttons
  (Start / Postpone / Cancel). Prompts list uses the same card treatment.
- **Sheet:** `<NewMeetingForm>` — title, date/time, timezone, host, invited
  members. Confetti + toast on create.

### Polls (`/polls`, `/polls/past`, `/polls/[id]`)

- List: header + "New poll" → `?new=poll` sheet.
- Cards show question, response type badge, anonymity badge, state (open /
  closed / revealed).
- Detail (respond flow): chunky question card, response input tailored to
  type (text, scale, choice), submit button. On submit: bouncy check
  animation + toast + confetti if last respondent.
- **Sheet:** `<NewPollForm>` — question, response type, anonymity, timing
  (sync/async), open window, target meeting (optional).

### Series (`/series`, `/series/[id]`)

- List: header + "New series" → `?new=series` sheet.
- Cards show name, cadence, next occurrence, member count.
- **Sheet:** `<NewSeriesForm>` — name, cadence, timezone, members.

### Roster (`/roster`, `/roster/[id]`)

- List becomes a tile grid — each member a card with avatar, display name,
  role pill. Admins see an edit affordance on hover.
- Detail: profile card + activity strip (last meetings attended, response
  streak).
- No creation sheet (roster populated by auth/invites).

### Notifications (`/notifications`)

- Feed of playful cards. Each type gets a small sticker on the left
  (meeting = calendar, poll = speech-bubble, reveal = eyes).
- Unread has an accent-yellow dot; mark-all-read is a pill button.

### Settings (`/settings`)

- Sectioned cards: Profile, Email preferences, Unavailability, Danger zone.
- Forms use new chunky inputs. Save = primary button.
- Danger zone actions open a `<Dialog>` confirm — destructive actions want
  the ceremony of a centered modal, not a sheet.

### Tools (`/tools/pick`, `/tools/shuffle`)

- Pick-someone: slot-machine-style spinner with satisfying deceleration +
  confetti on land.
- Shuffle-roster: cards flip and rearrange with staggered spring motion.

## Illustrations & empty states

**In-house SVG sticker set** matching the reference language: thick ink
outlines, flat blue/yellow/cream fills, slight rotation for personality.

Initial set (8 stickers in `public/stickers/`):

1. `calendar.svg` — chunky calendar with a yellow star (meetings)
2. `speech-bubble.svg` — outlined bubble with three dots (polls / prompts)
3. `peace-hand.svg` — celebration / easter egg
4. `eyes.svg` — cartoon eyes (reveal moments)
5. `thumbs-up.svg` — with a yellow burst behind (success)
6. `empty-box.svg` — open cardboard box (empty lists)
7. `clouds.svg` — auth backdrop, decorative
8. `bell.svg` — notifications empty state

SVGs use `currentColor` for outlines and `var(--sticker-fill)` for fills so
dark mode adapts automatically (swaps `--sticker-fill` from cream to navy).
Yellow accents stay yellow — they read on both.

**Usage:**

- Sign-in page: clouds in top corners, big Atlas logo, tagline in Nunito 800,
  chunky primary "Sign in" button. Tasteful yellow "hot stuff" burst behind
  the logo on hover.
- Empty states: `<EmptyState>` picks the appropriate sticker per surface.
- Celebration moments: sticker briefly pops in, rotates, fades. Used sparingly.

## Motion inventory

Layered, all respectful of `prefers-reduced-motion`.

### Micro (always on)

- Button squish, card hover lift on `interactive` cards, input focus outline
  draw-in, nav item scale + color pop on hover.

### Transitions

- Route changes: 180ms cross-fade on `main` via a CSS class swap in the app
  layout (View Transitions API skipped — browser support still uneven).
- Sheet enter/exit: as specified.
- Toast: spring-slide.
- List additions: new items fade + rise 8px with 60ms stagger via
  `animation-delay: calc(var(--i) * 60ms)`.

### Celebration

- Confetti burst on: new meeting created, new poll created, new series
  created, prompt reveal, last respondent completes a poll.
- Bouncy checkmark on response submit.
- Pick-someone slot-machine + confetti on land.

### Loading

- Buttons: `<BouncingDots>`.
- Page-level: skeleton cards (rounded rectangles pulsing between cream and
  surface-raised).

**Budget:** total animation on any single interaction ≤ 600ms. No animation
blocks user input. All transitions are opacity + transform only (no layout
thrash).

## Dark mode

First-class variant. Every component ships with both. Every screenshot test
runs both.

- **Toggle:** in user pill dropdown (bottom of nav rail). Default = system
  preference. Persisted to localStorage via `next-themes` (already installed).
- **No FOUC:** `next-themes` handles the pre-hydration class-set script.
- **Palette:** as specified in the tokens table above.
- **Shadows:** `--shadow-flat` becomes `0 3px 0 0 #000` in dark. Motion
  unchanged.
- **Stickers:** `currentColor` + `var(--sticker-fill)` handle the adaptation
  automatically.

## Migration order (dependency-safe slices)

Each slice is a PR. Every commit leaves the app working.

1. **Tokens + fonts** — new CSS variables in `globals.css`, Nunito added via
   `next/font`, tailwind config extended. No component changes. App looks
   unchanged.
2. **New primitives (no wiring)** — `<Sheet>`, `<Textarea>`, `<Select>`,
   `<BouncingDots>`, `<Sticker>`, `<ConfettiBurst>` land in `components/ui/`,
   not yet used anywhere.
3. **App shell** — rebuild `nav.tsx` (pill rail + mobile bottom nav), update
   `app/(app)/layout.tsx` container widths. First visible change. Note: the
   per-page header block introduced by this slice can render a primary CTA
   slot, but the "New meeting" / "New poll" / "New series" buttons that open
   sheets are wired in their respective feature slices (6–8), not here — no
   dead buttons in the interim.
4. **Rebuild `<Button>`, `<Card>`, `<Input>`, `<Badge>`, `<Toast>`** —
   token-driven, same APIs. Ripples through the whole app; no page needs
   edits.
5. **Home page** — restructure into three chunky cards, add empty state +
   sticker.
6. **Meetings:** list + past + detail + `<NewMeetingForm>` in sheet +
   delete `/meetings/new`.
7. **Polls:** list + past + detail + `<NewPollForm>` in sheet +
   delete `/polls/new`.
8. **Series:** list + detail + `<NewSeriesForm>` in sheet +
   delete `/series/new`.
9. **Roster:** list tile grid + detail card.
10. **Notifications + Settings:** feed cards + settings sections.
11. **Tools:** pick + shuffle delight.
12. **Sign-in page:** clouds, big logo, chunky button.
13. **Dark mode polish pass:** visual QA every surface in dark, fix contrast.
14. **Motion + confetti wiring:** add celebrations at trigger points.
15. **Empty states everywhere:** sticker + copy on every empty list.

## Dependencies

- **Add:** `canvas-confetti` (~5kb gzipped), Nunito subset via `next/font`
  (built-in, no npm dep).
- **Already present, no add:** `@base-ui/react` (sheet primitive base),
  `next-themes` (dark mode toggle), `tailwindcss-animate` +
  `tw-animate-css` (CSS animation utilities), `sonner` (toasts).
- **Not adding:** `framer-motion` — CSS + existing animate utilities cover
  every motion requirement in this spec.
- **Bundle budget:** ≤ 10kb gzipped added to first-load JS. Well under the
  earlier 60kb budget because we're skipping `framer-motion`.

## Testing & accessibility

- **Playwright screenshot suite:** capture every surface in both light and
  dark. Diff baseline updated with the rebuild PR.
- **Axe scan:** extend from `/sign-in` to Home, Meetings list, Poll detail,
  and Sheet-open state. Bar: zero critical/serious violations.
- **Contrast:** every color combination verified against WCAG AA before
  merge.
- **Reduced motion:** manual toggle in system prefs, verify every animation
  degrades to instant.
- **Keyboard nav:** sheets are focus-trapped, close on Esc, restore focus to
  the trigger on close. Interactive cards are keyboard-activatable (Enter /
  Space) and part of the tab order.
- **Route removal:** search for `href="/meetings/new"`, `/polls/new`,
  `/series/new` before those PRs land; rewrite to sheet triggers.

## Route deletions

- `app/(app)/meetings/new/page.tsx`
- `app/(app)/polls/new/page.tsx`
- `app/(app)/series/new/page.tsx`

All incoming links rewritten to sheet triggers on the parent list page. Any
external links / bookmarks to these paths return 404 — acceptable, they were
never shared surfaces (internal tool, no marketing pages).

## Open questions

None at time of writing. All major decisions locked during brainstorming.
Any further questions surface during the writing-plans phase.
