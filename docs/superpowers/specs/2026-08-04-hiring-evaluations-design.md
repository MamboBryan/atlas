# Hiring Evaluations — Design Spec

**Date:** 2026-08-04
**Status:** Approved (design), pending implementation plan
**Owner:** Atlas

## Summary

A new **Hiring** section in Atlas for evaluating job candidates. Candidates
answer a Google Form; their questions and answers land in a Google Sheet. Atlas
imports that sheet, and a designated **evaluator panel** scores each candidate's
answer to each question on a **1–5** scale. While an evaluation is open, each
evaluator sees only their own scores and their own ranking of candidates. When
an admin **closes** the evaluation, an **aggregate** result (per-candidate
averages, ranking, per-question breakdown) becomes visible to everyone — but no
one ever sees another evaluator's individual scores.

## Goals

- Import questions + candidate responses from a Google Sheet (Google-Form-backed).
- A **Refresh** button that re-syncs the latest questions/responses on demand.
- Panel members rate each candidate's answer to each question 1–5.
- Strong per-evaluator privacy: nobody sees another evaluator's scores.
- Aggregate results revealed to everyone once the evaluation is closed.
- Support **multiple named evaluations** running in parallel, plus history.

## Non-goals (v1 / YAGNI)

- Live realtime co-rating (no per-keystroke sync between evaluators).
- Per-rating comments / notes.
- Candidate-facing accounts or dashboards.
- Email notifications when an evaluation opens/closes.
- Rating the raw Google Form ratings (the form collects candidate *answers*, not
  scores; scoring happens natively in Atlas).

These are intentionally deferred; the schema leaves room to add them later.

## Roles

- **Admin** (existing `user_role = 'admin'`, `atlas_is_admin()`): creates
  evaluations, connects the sheet, confirms column mapping, manages the panel,
  refreshes, and closes/reopens.
- **Panelist**: a profile added to an evaluation's panel by an admin. Only
  panelists can submit ratings, and only their ratings count.
- **Everyone (authenticated)**: can see that an evaluation exists and, once it is
  closed, can view the aggregate results.

## Decisions (locked during brainstorming)

- **Rater/subject:** Atlas users (the panel) rate external candidates' responses.
- **Ingestion:** import questions + candidate responses from the sheet; scoring
  is native in Atlas. A Refresh button re-syncs.
- **Sheet connection:** private **Google Sheets API** via a service account (not
  a public "publish to web" CSV — the data is candidate PII).
- **Sheet layout:** one row per candidate, identified by an **email** column;
  each question is its own column.
- **Column mapping:** **auto-detected, admin-confirmed** (email/timestamp/name =
  identity; remaining columns = rated questions).
- **Rating grain:** **per question per candidate**; candidate overall score =
  average of that candidate's per-question scores.
- **On close:** aggregate visible to **everyone**; individual evaluator scores
  stay private to their author (admins included).
- **Scope:** **multiple named** evaluations, each with its own sheet/panel/
  lifecycle.
- **Panel:** admins **pick the evaluators** per evaluation.
- **Privacy enforcement:** Postgres **RLS** + pgTAP tests (not app-layer only).
- **Sheets client:** lightweight **service-account JWT** signed with Node
  `crypto`; **no `googleapis` dependency**.

## Data model

New migration `db/supabase/supabase/migrations/0028_hiring_evaluations.sql`.
All tables `enable row level security`; grants to `authenticated` and
`service_role`, following existing conventions. `updated_at` columns use the
existing `atlas_touch_updated_at()` trigger.

### `evaluation_status` enum

`'draft' | 'open' | 'closed'`

- `draft` — created, sheet may not be connected/mapped yet; not visible to
  non-admins; no rating.
- `open` — panel can rate; each rater sees only their own scores.
- `closed` — no more rating; aggregate visible to everyone.

### `evaluations`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `name` | text not null | e.g. "Backend Engineer – Aug 2026" |
| `status` | `evaluation_status` not null default `'draft'` | |
| `sheet_id` | text | Google spreadsheet ID |
| `sheet_tab` | text | tab/worksheet name (default first tab) |
| `email_column` | text | header key of the identity email column |
| `name_column` | text null | header key of the name column, if any |
| `timestamp_column` | text null | header key of the timestamp column, if any |
| `mapping_confirmed` | boolean not null default false | true after admin confirms |
| `created_by` | uuid not null → profiles(id) | |
| `last_synced_at` | timestamptz null | |
| `created_at` / `updated_at` | timestamptz | |

### `evaluation_questions`

One row per rated column.

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `evaluation_id` | uuid not null → evaluations(id) on delete cascade | |
| `column_key` | text not null | sheet header text = stable upsert key |
| `prompt` | text not null | question text shown to raters |
| `position` | int not null | column order |
| `is_active` | boolean not null default true | soft-deactivated if column removed |
| unique | `(evaluation_id, column_key)` | |

### `evaluation_candidates`

One row per candidate (sheet row).

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `evaluation_id` | uuid not null → evaluations(id) on delete cascade | |
| `email` | citext not null | identity key |
| `display_name` | text not null | from name column, else email local-part |
| `submitted_at` | timestamptz null | from timestamp column, if mapped |
| `is_active` | boolean not null default true | soft-deactivated if row removed |
| unique | `(evaluation_id, email)` | |

### `evaluation_answers`

A candidate's response text to one question.

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `evaluation_id` | uuid not null → evaluations(id) on delete cascade | denormalized for RLS |
| `candidate_id` | uuid not null → evaluation_candidates(id) on delete cascade | |
| `question_id` | uuid not null → evaluation_questions(id) on delete cascade | |
| `answer_text` | text | may be empty |
| unique | `(candidate_id, question_id)` | |

### `evaluation_panelists`

| column | type | notes |
|---|---|---|
| `evaluation_id` | uuid not null → evaluations(id) on delete cascade | |
| `profile_id` | uuid not null → profiles(id) on delete cascade | |
| pk | `(evaluation_id, profile_id)` | |

### `evaluation_ratings`

One panelist's score for one candidate's answer to one question.

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `evaluation_id` | uuid not null → evaluations(id) on delete cascade | denormalized for RLS |
| `candidate_id` | uuid not null → evaluation_candidates(id) on delete cascade | |
| `question_id` | uuid not null → evaluation_questions(id) on delete cascade | |
| `rater_id` | uuid not null → profiles(id) on delete cascade | |
| `score` | smallint not null | check `score between 1 and 5` |
| `created_at` / `updated_at` | timestamptz | |
| unique | `(evaluation_id, rater_id, candidate_id, question_id)` | |

**Ratings survive refresh:** ratings reference `candidate_id`/`question_id`,
which are preserved across re-syncs (soft-deactivation, not deletion), so
re-importing the sheet never discards scores already given.

## Sheet sync & column mapping

### Credentials

- Env var `GOOGLE_SERVICE_ACCOUNT_JSON` holds the service-account JSON
  (`client_email`, `private_key`). Added to `.env.example` and Vercel.
- The target Google Sheet is shared (viewer) with the service-account email.
- Setup is a documented ~10-minute one-time step (create GCP project → enable
  Sheets API → create service account → download key → share sheet).

### Client (`lib/sheets/*`)

- Mint an RS256 JWT (header + claim set with scope
  `https://www.googleapis.com/auth/spreadsheets.readonly`), signed with Node
  `crypto.sign` using the service account private key.
- Exchange the JWT at Google's OAuth token endpoint for a short-lived access
  token; cache it in-memory until near expiry.
- Call the Sheets `spreadsheets.values.get` endpoint for `sheet_id` + `sheet_tab`
  to fetch the full grid (header row + data rows).
- No `googleapis` dependency; plain `fetch`.

### Import / refresh flow (`lib/actions/evaluation.ts`, admin-only)

1. Fetch the grid. First non-empty row = headers.
2. **Auto-detect** identity columns: email (header matches /e-?mail/ or values
   look like emails), timestamp (header /time ?stamp/ or parseable dates), name
   (header /name/). Everything else = candidate question.
3. **First sync only:** return the detected mapping to the admin UI for
   confirmation. On confirm, persist `email_column` / `name_column` /
   `timestamp_column`, set `mapping_confirmed = true`, and create
   `evaluation_questions` rows for the question columns.
4. **Every sync (including refresh):** idempotent upsert —
   - questions upsert on `(evaluation_id, column_key)`; new columns appended,
     missing columns set `is_active = false`.
   - candidates upsert on `(evaluation_id, email)`; missing rows set
     `is_active = false`.
   - answers upsert on `(candidate_id, question_id)`.
   - set `last_synced_at = now()`.
5. Refresh preserves all existing ratings.

**Edge cases**
- Row without a valid email → skipped, surfaced in an import summary
  ("N rows skipped: missing email").
- Duplicate email in the sheet → last row wins; note in summary.
- Header text changed → treated as a new question (old one deactivated). Called
  out to the admin in the summary so they can re-map if needed.
- Sheet unreachable / auth failure → action returns a clear error; no partial
  writes (wrap the upserts in a transaction / RPC).
- Auto-detect may misclassify a question column whose header contains "name"
  (e.g. "Your company name") as the identity name column — the admin-confirm step
  is the safety net; detection is a suggestion, never final without confirmation.

## Privacy & aggregation (RLS)

RLS policies, tested in `db/supabase/supabase/tests/evaluations_rls.sql`.

**Design principle:** raw candidate data (identities, answers, questions) is
readable *directly* only by that evaluation's **panelists + admins**. Everyone
else — including for the post-close aggregate — receives data *only* through the
`security definer` results RPC, which emits display names, prompts, and averages
but never raw rows. This makes the child-table policies simple and closes the
"query the table directly" leak (a non-panelist can never `select` a candidate,
question, or answer row regardless of evaluation status).

Helper (mirrors `atlas_is_admin`): `atlas_is_panelist(uid, evaluation_id)` —
`security definer stable`, true if the user is an active panelist for that
evaluation. Used by policies to avoid recursive RLS on `evaluation_panelists`.

- **`evaluations`** — SELECT: admins always; non-admins only when
  `status <> 'draft'` (they may see that an open/closed evaluation exists — its
  name and status — but not its raw child rows). INSERT/UPDATE/DELETE: admins only.
- **`evaluation_panelists`** — SELECT: admins, or the row's own `profile_id`
  (a user may see that *they* are on a panel). Writes: admins only.
- **`evaluation_questions`** — SELECT: **panelists + admins only**. Writes: admins
  only (via sync). Non-panelists get prompts for the closed dashboard via the RPC.
- **`evaluation_candidates`** — SELECT: **panelists + admins only** (covers both
  `display_name` and `email`; no column-level split needed since non-panelists
  never read the table). Writes: admins only. Non-panelists get display names for
  the closed dashboard via the RPC.
- **`evaluation_answers`** — SELECT: **panelists + admins only** (raw candidate
  PII). Writes: admins only.
- **`evaluation_ratings`** —
  - SELECT: `rater_id = auth.uid()` **only**. No one, including admins, can read
    another user's individual ratings.
  - INSERT/UPDATE: only when `rater_id = auth.uid()`, the user is a panelist for
    that evaluation, and the evaluation `status = 'open'`.
  - DELETE: same as insert (a rater may clear their own score while open).

### Aggregation semantics

Defined precisely because it drives the leaderboard and the privacy floor:

- **Scope:** aggregation considers **active rows only** (`is_active = true` on
  both candidate and question). Soft-deactivated candidates/questions and their
  ratings are excluded, so a refresh that removes/renames a column does not shift
  historical ranks by counting stale data.
- **Per-question average:** mean of the scores given to that (candidate, question)
  across all raters who scored it (raters who skipped it don't count).
- **Candidate overall:** **mean of that candidate's per-question averages**
  (mean-of-means) over active questions that have ≥1 rating. This weights every
  question equally regardless of how many raters happened to score it.
- **Ranking:** candidates ordered by overall descending; ties broken by name.
- **Departed panelists:** ratings from a now-inactive profile
  (`profiles.is_active = false`) **still count** toward a closed aggregate —
  historical integrity; the score was validly cast.

### Aggregation RPC & small-panel suppression

`evaluation_results(p_evaluation_id uuid)` — `security definer`. Because it runs
as definer it aggregates across all raters without exposing individual rows; it
emits only display names, prompts, per-candidate/per-question **averages**, and a
**rater bucket** (see below) — never raw scores.

- **Status gate:** returns rows **only when `status = 'closed'`**; empty otherwise
  (callers use the personal view while open). On **reopen**, status flips back to
  `open`, so the RPC returns empty again and the dashboard re-hides (any
  client-cached copy is not re-fetched).
- **Small-panel suppression:** the absolute guarantee is *"no evaluator can read
  another evaluator's individual rating rows."* Averages, however, can leak an
  individual score by inference on a tiny panel (with 2 raters, `other = 2·avg −
  own`). To defend the intent, the RPC **withholds all averages unless at least
  `MIN_RATERS_FOR_AGGREGATE` distinct raters** have scored the evaluation
  (default **3**, defined as a SQL constant). Below the floor it returns a
  `suppressed` flag and the rater count bucketed as `"<3"` — never an exact tiny
  count — so admins/users see "not enough evaluators to show results" rather than
  a derivable number. At/above the floor it returns the exact evaluator count.
- **Grants:** `revoke all on function evaluation_results(uuid) from public;`
  `grant execute ... to authenticated;` (matching the `0011` convention). All
  new RPCs follow this grant model — important since definer functions bypass RLS.

### Personal view (while open)

Computed directly from the caller's own `evaluation_ratings` rows (RLS-visible),
joined to active candidates/questions: their per-candidate average (mean-of-means
over questions *they* rated) and their personal candidate ranking. No RPC needed —
RLS already scopes it to the caller.

### Admin panel progress

A `security definer` RPC (`evaluation_panel_progress(p_evaluation_id)`, admin-only
via an internal `atlas_is_admin` guard + `authenticated` execute grant) returns,
per panelist, the **count** of answers rated (e.g. "18/40") — never the scores —
so admins can chase completion without
seeing anyone's individual scores.

## Routes, UX & roles

- **Nav:** new **Hiring** item (`/hiring`), Hugeicons icon, gated to
  authenticated users (management controls gated to admins).
- **`/hiring` (list):** evaluations with name, status badge, and the viewer's own
  progress ("18/40 rated") for open ones. Admins see a **Create** button and
  per-row management.
- **`/hiring/[id]` — panelist, open:** each active candidate with their answers
  grouped by question, a 1–5 selector per answer, autosaved via server action.
  Sidebar: the viewer's running per-candidate averages and personal ranking, plus
  a progress meter. Non-panelists see a "you're not on this panel" empty state.
- **`/hiring/[id]` — closed (results):** aggregate leaderboard — candidates ranked
  by mean score, per-question breakdown, evaluator count — rendered **entirely from
  the `evaluation_results` RPC** (non-panelists never read raw child tables). If
  fewer than `MIN_RATERS_FOR_AGGREGATE` raters scored, shows a "not enough
  evaluators to show results" state instead of numbers. Visible to all
  authenticated users.
- **Admin management** (within the detail page or a settings drawer): connect
  sheet (spreadsheet ID + tab), confirm column mapping, manage panel, **Refresh**
  (shows `last_synced_at` + last import summary), **Close** (reveals aggregate),
  **Reopen** (admin escape hatch).

## Server actions (`lib/actions/evaluation.ts`)

- `createEvaluation(name)` — admin.
- `connectSheet(evaluationId, sheetId, sheetTab)` — admin.
- `previewMapping(evaluationId)` — admin; fetch + auto-detect, return proposed
  mapping (no writes).
- `confirmMapping(evaluationId, mapping)` — admin; persist mapping + create
  questions, then run first sync.
- `refreshEvaluation(evaluationId)` — admin; idempotent re-sync, returns summary.
- `setPanel(evaluationId, profileIds[])` — admin.
- `openEvaluation` / `closeEvaluation` / `reopenEvaluation(evaluationId)` — admin.
- `rateAnswer(evaluationId, candidateId, questionId, score)` — panelist; upsert
  own rating; rejected unless status `open` and caller is a panelist (belt-and-
  suspenders with RLS).

Actions validate input with `zod` and re-check admin/panelist status server-side
in addition to RLS.

## Testing

- **pgTAP (`evaluations_rls.sql`):**
  - rater A cannot read rater B's ratings;
  - non-panelist cannot insert a rating;
  - no one can insert/update a rating when status ≠ `open`;
  - `evaluation_answers`, `evaluation_candidates`, `evaluation_questions` not
    readable by a non-panelist non-admin — **including for a `closed` evaluation**
    (the leak the review caught: raw child rows are panelist/admin-only always);
  - non-admin cannot read a `draft` evaluation row;
  - `evaluation_results` returns nothing while open, averages when closed;
  - `evaluation_results` **suppresses** averages when `< MIN_RATERS_FOR_AGGREGATE`
    distinct raters (returns the `suppressed` flag + `"<3"` bucket, no exact count);
  - admins cannot read individual ratings (only aggregate via RPC).
- **Vitest unit:**
  - column auto-detection (email/timestamp/name heuristics);
  - idempotent upsert + soft-deactivation on refresh;
  - email dedup / missing-email skip;
  - candidate average + ranking computation (mean-of-means over active
    questions; skipped questions excluded; inactive rows excluded);
  - JWT minting shape (header/claims/signature round-trip).
- **Vitest integration:** full import from a fixture sheet payload → questions +
  candidates + answers created; refresh with changed rows behaves correctly.
- **e2e (Playwright, optional):** admin creates evaluation → confirms mapping →
  panelist rates → admin closes → aggregate visible.

## Dependencies & config

- **No new npm dependencies** (Sheets via `fetch` + Node `crypto`; parsing
  in-house; `zod` already present).
- **Env:** `GOOGLE_SERVICE_ACCOUNT_JSON` (added to `.env.example` + Vercel).
- **Migrations:** `0028_hiring_evaluations.sql` (tables + RLS), and RPCs
  (`evaluation_results`, panel-progress) either in `0028` or a companion `0029`.

## Resolved during spec review

- **Candidate email visibility** — resolved: email (and all raw candidate data) is
  panelists+admins only; non-panelists get display names via the results RPC.
- **Child-table draft/closed leak** — resolved: raw child tables are
  panelist/admin-only at all statuses; the aggregate reaches everyone else only
  through the definer RPC.
- **Small-panel inference** — resolved: aggregate suppressed below
  `MIN_RATERS_FOR_AGGREGATE` (default 3); exact counts not emitted below the floor.
- **Averaging rule** — resolved: mean-of-means over active questions with ≥1
  rating; skipped questions and inactive rows excluded.
- **Reopen** — allowed for admins; flips status to `open`, so the results RPC
  returns empty and the dashboard re-hides.
- **Departed panelists** — their already-cast ratings still count post-close.

## Open questions for implementation (non-blocking, defaults stated)

- Sheet tab selection UI vs. defaulting to the first tab (default: first tab, with
  an override field).
- `MIN_RATERS_FOR_AGGREGATE` value (default 3) — confirm the floor suits your
  typical panel size before launch.
