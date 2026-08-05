# Hiring Evaluations — Fullscreen Evaluate Flow

**Date:** 2026-08-05
**Scope:** hiring `[id]` detail (open + panelist), new `evaluate` route

## Goal

Turn rating into a focused, Present-style fullscreen experience. From an open
evaluation a panelist can:

1. See their **own ranked list** of candidates (by their average score).
2. Press **Evaluate** to enter a fullscreen flow that resumes at the first
   unrated candidate, scores one candidate at a time, and **dismisses on
   finish** back to the ranked list.
3. Click any candidate → **Evaluate** to re-score just that candidate in the
   same fullscreen flow.

Mirrors the meeting **Present** pattern: a dedicated route under `(app)` with
its own `layout.tsx` (`fixed inset-0 z-50`) that overlays the app chrome,
entered via a `<Link>` and dismissed with `router.push` back to the detail
page. Unlike Present, the backdrop uses the **app theme** (surface/sticker),
since reading answer text is the core task.

## Structure

- **Route** `app/(app)/hiring/[id]/evaluate/`
  - `layout.tsx` — `fixed inset-0 z-50 bg-surface text-ink` fullscreen shell.
  - `page.tsx` (server) — `getEvaluationForViewer(id)`; guard to `open` +
    panelist, else `redirect(/hiring/[id])`. Reads `?candidate=<id>`; when
    present, narrows the candidate list to that one (single re-evaluate).
  - Renders `EvaluateShell`.
- **`_ui/evaluate-shell.tsx`** (client) — the fullscreen scorer:
  - One candidate at a time; resumes at first unrated (full mode) or the
    requested candidate (single mode).
  - Question prompt + answer + 1–5 buttons; **auto-saves each tap** via
    `rateAnswerAction` (unchanged); selections seeded from `myRatings`.
  - Dual progress: overall "N of M candidates rated" + per-candidate
    "X of Y answered".
  - Header with eval name + **Close (X)**; footer **Previous / Next**, with
    **Finish** on the last (or single) candidate. Close/Finish/Esc →
    `router.push(/hiring/[id])`.
- **`_ui/rank-list.tsx`** (client) — replaces the inline scorer on the detail
  page for open + panelist:
  - Collapsible table styled like the closed results table (divider token,
    cream expanded background). Ordered by the panelist's `personal` ranking.
  - Row shows rank, name, my overall (or "Not rated"). Expands to each
    question: my score, expandable to the candidate's answer.
  - Primary **Evaluate** button → `/evaluate`; per-row **Evaluate** →
    `/evaluate?candidate=<id>`.

## Data

No schema/RLS change. `getEvaluationForViewer` already returns `candidates`,
`questions`, `answers`, `myRatings`, and `personal` (sorted ranking). The
detail page and the evaluate route both consume it. The old inline
`rating-panel.tsx` is removed (superseded by `rank-list` + `evaluate-shell`).

## Testing

- E2E: from the open eval as a panelist — see the ranked list + Evaluate,
  enter fullscreen, rate a question, verify progress, reload to confirm
  persistence, and dismiss. Screenshot the ranked list and the fullscreen
  scorer. Single re-evaluate via `?candidate=`.
- Typecheck + evaluation unit tests stay green.
