# Atlas — Design Spec

**Status**: Draft for review
**Date**: 2026-07-24
**Author**: mambo (with PM/PA support)
**Stack**: Next.js 15 (App Router) + shadcn/ui + Supabase (Postgres, Auth, Realtime) + Resend + Vercel Cron

---

## 1. What Atlas is

Atlas is an internal team webapp for running the interactive rituals inside recurring and one-off meetings. It replaces the ad-hoc mix of "who wants to go?", scattered Google Forms, and Slack polls with one small, opinionated tool.

Three surfaces, each intentionally small:

1. **Roster tools** — random pick and shuffle-through-the-team, always available on the home screen.
2. **Meetings** — recurring series and one-off events, each with an auto-rotated host, a Start/Postpone gate, an agenda of prompts (open text, single/multi choice, yes/no, rating), and live reveal.
3. **Standalone polls** — anyone in the roster can spin up a poll outside of any meeting, with the same anonymity and reveal mechanics.

Design targets: **minimal but interactive**. Everything that can feel live, feels live. Nothing that isn't essential ships in v1.

---

## 2. Non-goals for v1

Explicit list of things Atlas will **not** do — to keep scope honest.

- No video/audio conferencing.
- No calendar integrations (Google Calendar, iCal). v2 candidate.
- No Slack/Teams webhooks. v2 candidate.
- No mobile push notifications. v2 candidate.
- No public-facing polls or external participants.
- No ranked-choice or weighted voting.
- No file uploads on prompts or answers.
- No rich text — plain text only for questions and text answers.
- No multi-organisation / multi-tenancy — single team per deployment.
- No custom host-selection strategies. Rotation is strict round-robin skipping unavailable members.
- No delete-your-response after reveal. Responses are locked at reveal.

---

## 3. Personas & permissions

| Persona | How they get it | What they can do |
|---|---|---|
| **Admin** | Set by another admin. The first user (seeded) is admin by default. | Everything a member can + add/deactivate roster members, edit any recurring series' rotation order, transfer admin. |
| **Member** | Added to the roster by an admin. Signs in via magic link or Google using the email the admin used. | Uses roster tools, hosts on rotation, answers prompts, creates standalone polls, sets own unavailability windows. |
| **Host (per meeting)** | Auto-assigned by rotation for series occurrences; equals the creator for one-off meetings. | Everything a member can + Start/Postpone a meeting, add/edit agenda items on their occurrence, advance the agenda, open/close prompts, reveal results. |

**Auth gate**: sign-in requires that `auth.users.email` matches a row in `profiles.email` where `is_active = true`. Otherwise sign-in is denied. Admins pre-provision emails; users self-serve their first login.

---

## 4. Surfaces (screens)

Top-level nav (persistent left rail):

- **Home** — today's shortlist: your next meeting, pending async prompts, standalone polls awaiting your vote, quick-launch random tools.
- **Roster** — team list + profile pages. Admin sees management actions inline.
- **Meetings** — upcoming • live • past. "New meeting" button (one-off).
- **Series** — recurring templates. "New series" button (admin only).
- **Polls** — mine • open (for me to answer) • past.
- **Notifications** — feed.
- **Settings** — email preferences, unavailability, profile.

Each screen is designed to be understandable in one screenshot. If a screen needs a scroll to explain itself, it's doing too much.

---

## 5. Data model

Column types are Postgres; timestamps are `timestamptz`; ids are `uuid` unless noted.

### 5.1 `profiles`
Extends `auth.users`.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | = `auth.users.id` |
| `email` | text unique | pre-provisioned by admin |
| `display_name` | text | |
| `avatar_url` | text nullable | |
| `role` | enum(`admin`, `member`) | |
| `is_active` | bool default true | admin toggles to remove from roster |
| `email_prefs` | jsonb | per-kind opt-out flags |
| `created_at`, `updated_at` | | |

### 5.2 `unavailability_windows`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK profiles | |
| `starts_on` | date | inclusive |
| `ends_on` | date | inclusive |
| `note` | text nullable | |

A user is *unavailable* on a given date if any window contains it. Unavailability excludes the user from:
- Host rotation for occurrences whose `scheduled_start::date` falls inside a window.
- Participation denominator for prompts opened while inside a window.

### 5.3 `meeting_series`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `name`, `description` | text | |
| `rrule` | text | RFC 5545 recurrence rule |
| `timezone` | text | IANA (e.g. `Africa/Nairobi`) |
| `rotation_order` | jsonb `uuid[]` | ordered user ids in the rotation |
| `rotation_cursor` | int default 0 | next-to-host index into `rotation_order` |
| `default_participant_ids` | jsonb `uuid[]` nullable | null = whole active roster |
| `agenda_template` | jsonb | ordered array of item templates (see §7) |
| `created_by` | uuid FK profiles | |
| `created_at`, `updated_at` | | |

### 5.4 `meetings` (occurrences + one-offs)

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `series_id` | uuid FK meeting_series nullable | null = one-off |
| `title` | text | |
| `scheduled_start` | timestamptz | |
| `timezone` | text | |
| `host_user_id` | uuid FK profiles nullable | null only for cancelled occurrences that couldn't find any available host (see §8.1) |
| `status` | enum(`scheduled`, `live`, `ended`, `postponed`, `cancelled`) | |
| `auto_postpone_count` | int default 0 | resets when host clicks Start or Postpone manually |
| `current_agenda_item_id` | uuid FK agenda_items nullable | live pointer |
| `participants_override` | jsonb `uuid[]` nullable | null = whole active roster minus unavailable |
| `created_by` | uuid FK profiles | |
| `started_at`, `ended_at` | timestamptz nullable | |
| `created_at`, `updated_at` | | |

### 5.5 `agenda_items`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `meeting_id` | uuid FK meetings | |
| `ordinal` | int | position |
| `title` | text | |
| `kind` | enum(`discussion`, `prompt`, `picker`) | |
| `prompt_id` | uuid FK prompts nullable | set iff kind=prompt |
| `picker_config` | jsonb nullable | set iff kind=picker: `{ mode: 'oneshot' \| 'shuffle', scope: 'whole_roster' \| 'meeting_participants' }` |
| `picker_result` | jsonb nullable | for oneshot: `{ user_id }`. For shuffle: shuffle_session_id ref. |
| `created_at`, `updated_at` | | |

### 5.6 `prompts` (unified Q&A + polls)

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `meeting_id` | uuid FK meetings nullable | null = standalone poll |
| `author_user_id` | uuid FK profiles | |
| `question` | text | plain text, ≤ 500 chars |
| `response_type` | enum(`text`, `single_choice`, `multi_choice`, `yes_no`, `rating`) | |
| `options` | jsonb nullable | array of `{ id, label }` for single/multi. Yes/no auto-populated. |
| `rating_min`, `rating_max` | int nullable | default 1 and 5; alternative 1 and 10 |
| `anonymity` | enum(`attributed`, `hard_anonymous`) | **locked at creation** |
| `timing` | enum(`async`, `live`) | |
| `opens_at`, `closes_at` | timestamptz nullable | async and standalone polls only |
| `is_open` | bool | for live prompts: host toggles during meeting. For async / standalone: system-derived from `opens_at`/`closes_at` and creator's close action. |
| `is_revealed` | bool | one-way toggle |
| `revealed_at` | timestamptz nullable | |
| `created_at`, `updated_at` | | |

### 5.7 `responses_attributed`
Used only when `prompts.anonymity = 'attributed'`.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `prompt_id` | uuid FK prompts | |
| `user_id` | uuid FK profiles | |
| `response` | jsonb | shape depends on response_type (see §6) |
| `created_at`, `updated_at` | | |
| UNIQUE(prompt_id, user_id) | | |

### 5.8 `responses_anonymous`
Used only when `prompts.anonymity = 'hard_anonymous'`. **Deliberately has no user_id column.**

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `prompt_id` | uuid FK prompts | |
| `response` | jsonb | shape depends on response_type |
| `created_at` | | |

### 5.9 `participation`
Populated for *both* anonymity modes. Powers the "N of M responded" counter and prevents double-submission.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `prompt_id` | uuid FK prompts | |
| `user_id` | uuid FK profiles | |
| `responded_at` | timestamptz | |
| UNIQUE(prompt_id, user_id) | | |

### 5.10 `shuffle_sessions`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `owner_user_id` | uuid FK profiles | |
| `meeting_id` | uuid FK meetings nullable | null = private/standalone |
| `roster_snapshot` | jsonb `uuid[]` | shuffled once at creation |
| `current_index` | int default 0 | |
| `status` | enum(`active`, `finished`) | |
| `created_at`, `updated_at` | | |

### 5.11 `notifications`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK profiles | recipient |
| `kind` | text | see §11 |
| `title`, `body` | text | |
| `link` | text | in-app path |
| `read_at` | timestamptz nullable | |
| `created_at` | | |

### 5.12 `email_events`
Idempotency for the cron-driven mail pipeline.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK profiles | |
| `kind` | text | |
| `dedupe_key` | text unique | e.g. `meeting:<id>:starts_soon` |
| `resend_id` | text nullable | provider id |
| `sent_at` | timestamptz | |
| `error` | text nullable | |

---

## 6. Response shapes

```
text            → { "text": "..." }        # ≤ 2000 chars
single_choice   → { "option_id": "opt_1" }
multi_choice    → { "option_ids": ["opt_1", "opt_3"] }
yes_no          → { "option_id": "yes" }  # option ids are "yes" | "no"
rating          → { "value": 4 }           # int in [rating_min, rating_max]
```

Server-side validation on write (Zod schema per response_type). Client validates the same schema before optimistic UI.

---

## 7. Anonymity mechanics (the delicate part)

### 7.1 Attributed prompts
Standard row-level model. Writes go into `responses_attributed` with the caller's `user_id`. RLS allows a user to read their own row at any time and to read all rows for the prompt once `is_revealed = true`.

Users may edit their own attributed response any time until `is_revealed` flips. After reveal, responses are immutable.

### 7.2 Hard-anonymous prompts
Two guarantees:

1. **No user_id ever lands in `responses_anonymous`.** The column doesn't exist. There is no way for a Server Action, an admin, or a database inspection to attribute a specific response to a specific person.
2. **Aggregation is server-side only.** Clients cannot `SELECT` individual anonymous rows. Results are exposed via a `security definer` Postgres function (`get_prompt_results(prompt_id)`) that returns tallies (`{ option_id: count }`, distribution buckets for rating, or the *shuffled* list of text answers for text prompts) — never per-row data.

Submission flow for a hard-anonymous prompt:

```
Server Action `submit_response(prompt_id, response)`:
  1. Authenticate user, resolve `caller_id`.
  2. Assert prompt.is_open (live) or now() ∈ [opens_at, closes_at] (async).
  3. Assert no existing row in `participation(prompt_id, caller_id)`. If exists, error.
  4. Validate response payload against prompt.response_type.
  5. INSERT into `responses_anonymous(prompt_id, response)`.    -- no caller_id
  6. INSERT into `participation(prompt_id, user_id=caller_id)`.
  Steps 5 + 6 in a single transaction. If either fails, both roll back.
```

### 7.3 Editing anonymous responses
Not allowed. Once submitted, an anonymous response cannot be edited or deleted by the submitter — because verifying "this is your row" requires linking it back, which we don't allow. This is called out clearly in the UI on submit ("Anonymous — final. Take a moment.").

### 7.4 The participation counter
Denominator, in priority order:
1. If the prompt belongs to a meeting and that meeting has `participants_override`, use that set.
2. Else if the prompt belongs to a meeting (no override), use the whole active roster minus users in unavailability windows overlapping `now()`.
3. Else (standalone poll), use the whole active roster minus users in unavailability windows overlapping `now()`.

Numerator = `count(participation) where prompt_id = X`. Displayed as `8 of 12 responded • 4 to go`.

Two distinct things — the **count** and the **identity of the stragglers** — get treated differently:

- **Count**: always shown to everyone. This is the "how many are left" feature and applies equally to attributed and hard-anonymous prompts. (Yes, at N−1 the identity of the last respondent becomes inferable to anyone who knows the full roster. That's an accepted design tradeoff — see §7.5.)
- **Identity list of who-hasn't-responded**: shown *only* to the host of an *attributed* prompt (for gentle nudging). Never shown for hard-anonymous prompts.

### 7.5 Accepted risks (documented, not solved)

Atlas's hard-anonymous mode defends against DB-level attribution. It does **not** defend against:

- **Writing style** — a five-word text answer in an eight-person team is often identifiable.
- **Real-time timing** — an observer who can watch the counter tick up while watching who's typing in a video call can link submissions to submitters.

Both are noted on the anonymous-submission UI: *"Truly anonymous in the database. Style and timing can still give you away in a small group."*

---

## 8. Rotation, Start/Postpone, and cancellation

### 8.1 Selecting the next host (series occurrence creation)
When a series creates a new occurrence:
1. Read `rotation_cursor`. Candidate = `rotation_order[cursor]`.
2. If candidate is inactive or in an unavailability window overlapping `scheduled_start::date`, advance the cursor (modulo length) and retry. Log skips to the meeting's audit trail.
3. If a full loop returns no available user, the occurrence is created with `host_user_id = null` and `status = cancelled`, notifying admins.
4. On success, persist the candidate as host, then advance `rotation_cursor` by 1 (so the *next* occurrence picks the *next* person).

### 8.2 Start / Postpone (host actions)
At `scheduled_start` the meeting enters `status = scheduled` with UI showing two buttons: **Start** and **Postpone**.

- **Start** → `status = live`, `started_at = now()`, `auto_postpone_count = 0`. Broadcasts to all participants.
- **Postpone (manual)** → host picks a new datetime (default: +1 day, same time). The current meeting → `status = postponed`. A new meeting row is inserted with the new `scheduled_start`, same host, `auto_postpone_count = 0`, agenda copied.

### 8.3 Auto-postpone
Cron runs every minute. For each `status = scheduled` meeting where `now() > scheduled_start + 15min` and host has taken no action:

- If `auto_postpone_count < 3`: mark current as `status = postponed`, insert new meeting +1 day same time same host, `auto_postpone_count += 1`. Notify host + participants.
- If `auto_postpone_count = 3`: mark current as `status = cancelled`, advance `rotation_cursor` for the series (if applicable), notify host + admins.

Grace window is 15 minutes to avoid punishing a host who's a few minutes late.

### 8.4 Occurrence pipeline
A daily cron generates the next 14 days of occurrences for each series. That way the host-24h-in-advance email always fires, and the rotation cursor advances predictably even when nobody's opened the app.

---

## 9. Random tools

### 9.1 One-shot pick
Button on Home. Server picks uniformly at random from `profiles WHERE is_active AND user_id NOT IN (unavailable today)`. Result animates onto a card. No persistence — refreshing re-rolls.

Inside a meeting: an agenda item with `kind = picker`, `picker_config.mode = oneshot`. When the host advances to it, the server picks and writes `picker_result`. All participants see the same animation via Realtime.

### 9.2 Shuffle session (Next / Next / Next)
Standalone: user clicks "Shuffle". Server creates a `shuffle_sessions` row with a randomised `roster_snapshot` of active users (respecting today's unavailability). Session persists on the user's account — they can leave and resume. Navigate with Next / Back. "Restart" wipes and reshuffles.

Meeting-embedded: agenda item with `kind = picker`, `picker_config.mode = shuffle`. On host-advance, a `shuffle_sessions` row is created bound to the meeting. All participants subscribe to Realtime updates on `shuffle_sessions.id`. Only the host advances.

Boundaries:
- `scope: 'whole_roster'` uses all active users.
- `scope: 'meeting_participants'` uses `meeting.participants_override ?? whole_roster`.

---

## 10. Real-time

Supabase Realtime subscriptions, driven directly off table changefeeds:

| What changes | Who subscribes | What they render |
|---|---|---|
| `meetings.current_agenda_item_id` | Meeting participants | Advance the agenda view |
| `prompts.is_revealed`, `prompts.is_open` | Meeting participants (or standalone poll audience) | Flip reveal UI, open/close submission |
| `participation` inserts, filtered `prompt_id` | Meeting participants viewing that prompt | Increment "N of M" counter |
| `shuffle_sessions.current_index` | Meeting participants | Animate to next person |
| `notifications` inserts, filtered `user_id = auth.uid()` | The recipient | Bell badge |

TanStack Query holds cache; Realtime events trigger `invalidateQueries` for the relevant key. A 30-second background refetch is the safety net if Realtime disconnects.

---

## 11. Notifications

### 11.1 In-app
Bell in the header. `notifications` table drives the feed. Realtime updates the badge. Marking-read on click.

### 11.2 Email (Resend + React Email templates)

| Kind | Trigger | Recipient(s) |
|---|---|---|
| `meeting_scheduled` | Occurrence created (series or one-off) | All participants (body mentions host) |
| `async_prompts_pending` | Async prompt opens | All participants of the prompt's meeting |
| `meeting_starts_soon` | 10 minutes before `scheduled_start` | Host + participants |
| `meeting_postponed` | Manual or auto postpone | Host + participants |
| `meeting_cancelled` | 3-strike auto-cancel | Host + admins |
| `poll_created` | Standalone poll opens | All active users (except author) |
| `poll_revealed` | Standalone poll creator reveals | Everyone who responded |

Users toggle each kind on/off in Settings. In-app is always on.

Idempotency: `email_events.dedupe_key` (e.g. `meeting:<id>:starts_soon:user:<uid>`) is a unique index. Cron retries are safe.

---

## 12. Auth & RLS

Auth: Supabase Auth with magic link + Google OAuth. First sign-in must match a pre-provisioned active `profiles.email`.

RLS in one paragraph per table:

- **profiles** — read: all authenticated. Write: self, plus admin.
- **unavailability_windows** — read: self, plus admin. Write: self.
- **meeting_series** — read: all authenticated. Write: admin.
- **meetings** — read: participants (roster if `participants_override` is null, else its set). INSERT: any active member (creates a one-off with themselves as host) or the service role (creates series occurrences). UPDATE / DELETE: host + admin.
- **agenda_items** — read: meeting participants. Write: host of that meeting.
- **prompts** — read: meeting participants (or all authenticated for standalone). Write: prompt author until first response; then locked to reveal-toggle by host/creator.
- **responses_attributed** — read: own row anytime; all rows for the prompt when `is_revealed = true`. Write: own row, INSERT + UPDATE, until reveal.
- **responses_anonymous** — read: **no one, ever** via direct query. Aggregate access is via `get_prompt_results(prompt_id)` security-definer function. Write: INSERT-only via `submit_response` server action.
- **participation** — read: own row anytime. Aggregate `count(*)` for participants of the prompt's meeting (via a view/function). Write: INSERT-only via `submit_response`.
- **shuffle_sessions** — read: owner (standalone) or meeting participants (bound). Write: owner or host.
- **notifications** — read+write: self only.
- **email_events** — read: admin only. Write: service role only.

The `get_prompt_results` function does the type-appropriate aggregation and returns *only* aggregate results, never row-level. For text prompts, it returns responses in shuffled order to further blur ordering signals.

---

## 13. Server Actions (the write surface)

All mutations go through typed Next.js Server Actions. Each returns `{ ok: true, data } | { ok: false, error: { code, message } }`. Client uses TanStack Query mutations with optimistic updates and rollback on error.

Complete list:

- `profile.update` (own display_name, avatar_url, email_prefs)
- `roster.addMember`, `roster.setRole`, `roster.deactivate`
- `unavailability.set`, `unavailability.clear`
- `series.create`, `series.update`, `series.setRotation`, `series.delete`
- `meeting.createOneOff`, `meeting.updateAgenda`, `meeting.start`, `meeting.postponeManual`, `meeting.end`
- `agenda.addItem`, `agenda.updateItem`, `agenda.reorder`, `agenda.advanceTo`
- `prompt.create`, `prompt.update`, `prompt.open`, `prompt.close`, `prompt.reveal`
- `submit_response(prompt_id, response)` — the anonymity-aware entry point
- `poll.createStandalone`, `poll.close`, `poll.reveal`
- `picker.oneShot`, `picker.startShuffle`, `picker.advanceShuffle`, `picker.backShuffle`, `picker.restartShuffle`
- `notifications.markRead`, `notifications.markAllRead`
- `settings.updateEmailPrefs`

---

## 14. Error handling

- **Server actions** return typed error objects. UI renders a toast with the message. Recoverable errors (e.g. "double submit") are silenced client-side after optimistic revert.
- **Optimistic writes** are used for: submitting responses, casting votes, advancing shuffle, marking notifications read. Rollback on failure.
- **Realtime disconnects** fall back to a 30s background refetch. Reconnection is automatic.
- **Cron failures** are logged into a `cron_runs` table and surfaced on the Admin's home. A retry is safe due to idempotent `email_events` and idempotent postpone logic (state checks happen inside a transaction).

---

## 15. Testing

- **Unit (Vitest)**: rotation math, postpone state machine, participation counter, response validators.
- **Integration (Playwright, against a Supabase preview branch)**:
  - Auth (magic link stub), roster invite flow.
  - Create prompt (attributed + hard-anonymous), submit, reveal, verify reveal.
  - Verify **no** `user_id` in `responses_anonymous` after 20+ hard-anonymous submissions.
  - Verify counter increments live.
  - Postpone flow: manual + auto (fake clock).
  - Rotation with unavailability skipping.
- **RLS (pgTAP)**:
  - No SELECT path returns `(response, user_id)` for anonymous prompts.
  - Non-participants can't SELECT meeting prompts.
  - Non-host can't UPDATE `is_revealed`.
- **Manual QA checklist** (in `docs/superpowers/qa/atlas.md`) run before each release.

CI: unit + RLS on every PR. Playwright runs against a Supabase branch spun up per PR.

---

## 16. Rollout (milestones)

| # | Milestone | Contents |
|---|---|---|
| M1 | Foundation | Next.js app scaffold, Supabase project, auth, profiles, roster CRUD, home shell |
| M2 | Standalone polls | prompts + both response tables + participation + reveal + counter + all 5 response types |
| M3 | One-off meetings | meetings + agenda_items + host = creator + live reveal + real-time agenda |
| M4 | Series + rotation | meeting_series + rotation cursor + occurrence generator + Start/Postpone + auto-postpone cron |
| M5 | Random tools | one-shot picker + shuffle sessions (standalone + meeting-embedded, real-time synced) |
| M6 | Notifications | in-app feed + email pipeline (Resend + React Email) + settings toggles |
| M7 | History & polish | Past meetings/polls, admin views, small design pass, accessibility check |

Each milestone ends with a deployed, testable slice.

---

## 17. Assumed defaults (call out for confirmation)

Decisions I've committed to in the spec above; flag if any are wrong:

1. **Only the current host can edit a meeting's agenda.** Other members can only submit "Topic for next meeting" suggestions that appear as pre-filled candidates for the next host.
2. **Timezones** — each series has its own TZ. Meetings display in the viewer's local TZ. Cron uses UTC internally.
3. **Prompt editing** — editable until first response, then locked except for adding (not removing) options and toggling reveal.
4. **Live prompts can be added mid-meeting** by the host.
5. **Rating scale** — default `1..5`, with `1..10` option chosen at creation. No other scales.
6. **Standalone shuffle** — private to the user who started it. No sharing.
7. **Deleting standalone polls** — creator can delete a poll before it opens; after any response, only close is allowed.
8. **Reveal is irreversible.** Once revealed, always revealed.
9. **Attributed reveal** shows all authors at once. No "one at a time" mode in v1.
10. **Auto-postpone grace window** = 15 minutes past scheduled start before the cron acts.
11. **First user is admin** by convention (seeded during initial setup).

---

## 18. Open questions parked for post-v1

- Calendar integration (Google Calendar OAuth + iCal export).
- Slack / Teams webhook notifications.
- Ranked-choice voting.
- Attachment support on prompts.
- Retrospective templates (starfish, 4Ls) as first-class agenda items.
- Admin analytics ("participation rate over last quarter").

---

## Appendix A — Directory layout (informative)

```
atlas/
├── app/                      # Next.js App Router
│   ├── (auth)/               # Sign-in / magic link callback
│   ├── (app)/                # Auth-gated shell
│   │   ├── home/
│   │   ├── roster/
│   │   ├── meetings/
│   │   ├── series/
│   │   ├── polls/
│   │   ├── notifications/
│   │   └── settings/
│   └── api/cron/             # Vercel Cron endpoints
├── components/               # Shared UI (shadcn primitives + Atlas atoms)
├── db/
│   ├── migrations/           # Supabase migrations (SQL)
│   ├── policies/             # RLS SQL
│   └── functions/            # security-definer PL/pgSQL (e.g. get_prompt_results)
├── lib/
│   ├── actions/              # Server Actions
│   ├── realtime/             # Realtime channel wrappers
│   ├── email/                # React Email templates
│   ├── rotation/             # Rotation + postpone logic (pure)
│   └── zod/                  # Schemas
├── docs/superpowers/specs/   # This file
└── e2e/                      # Playwright suites
```
