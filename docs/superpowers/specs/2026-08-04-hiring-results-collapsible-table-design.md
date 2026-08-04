# Hiring Evaluations — Collapsible Results Table

**Date:** 2026-08-04
**Scope:** `app/(app)/hiring/[id]/_ui/results-view.tsx` only

## Problem

The evaluation results currently render each candidate as a separate,
always-expanded `Card` showing the overall score and every per-question
average at once. With multiple candidates and questions this gets long and
noisy. We want a compact list/table where each candidate is one row, and the
per-question breakdown is revealed on click — mirroring the Invoices table
reference (collapsed rows that expand to show detail).

## Design

Replace the stack of cards with a **single `Card` (size `sm`) acting as a
list table**, preserving the chunky "sticker" border + beveled shadow around
the whole group.

### Structure

- **Outer container:** one `Card size="sm"` wrapping the table. Internal
  padding removed so rows span full width; row padding applied per-row.
- **Header row:** `Candidate` (left) · `Score` (right), small muted label
  text, bottom divider `border-ink/10`.
- **Candidate row:** a full-width `<button>` (keyboard-accessible) containing:
  - Left: `#{rank} {display_name}` in `font-display` semibold.
  - Right: overall score, bold `font-display`; `—` when null.
  - A `ChevronDownIcon` (lucide-react) that rotates 180° when the row is open.
  - Hover state uses a soft surface token; rows divided by `border-ink/10`.
- **Expanded panel:** revealed below the row when open. Lists each question
  `prompt` (left, `text-ink-soft`) and its `avg` (right, `text-ink`); `—` when
  null. Indented/muted background to distinguish from the row; top divider.

### Behavior

- Component becomes a client component (`"use client"`).
- Local state `useState<Set<string>>` keyed by `candidate_id` tracks open
  rows. **Independent toggle** — multiple rows can be open at once. Default:
  all collapsed.
- The `{rater_count} evaluators` caption and the suppressed `EmptyState`
  branch are unchanged.

### Out of scope / unchanged

- Data shape (`Results`, `Cand`, `Cell`) is untouched → `page.tsx` and the
  server query need no changes.
- No new dependencies (`lucide-react` already present).

## Refinements (density, dividers, nested answers, pagination)

Follow-up pass after the first implementation:

- **Reusable divider token.** Added `--divider` to `globals.css` (light
  `7%` ink, dark `12%` ink, both via `color-mix`) and mapped it to a
  `border-divider` Tailwind utility in `tailwind.config.ts`. Replaces the
  ad-hoc `border-ink/10` here and is available app-wide.
- **Density.** Reduced row/header padding and font sizes so more candidates
  fit in a long list.
- **Expanded background.** The expanded candidate panel uses `bg-surface`
  (the navigation/cream background) to distinguish it from the white card.
- **Nested answer expansion.** Each question row is itself expandable to
  reveal the candidate's `answer_text`. Answers are only fetched for
  admins/panelists (`queries.ts`), so a question is expandable only when its
  answer is present; for other viewers the question row is static. `page.tsx`
  now passes `answers` into `ResultsView`; no query/RLS change.
- **Pagination.** Client-side, `PAGE_SIZE = 10`. Controls (Previous / Page N
  of M / Next) render only when candidates exceed the page size.

## Testing

- Visual verification via screenshot in light + dark themes (collapsed and
  expanded states).
- Manual: click toggles a single row without affecting others; keyboard
  focus + Enter/Space toggles; suppressed state still renders EmptyState.
