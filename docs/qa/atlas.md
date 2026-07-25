# Atlas — pre-release manual QA checklist

Run this before every deploy. Two browsers side by side (real or incognito)
signed in as different users. All timestamps in your local timezone.

## Setup

- [ ] Fresh Supabase project or `pnpm supabase db reset` locally
- [ ] Sign in as `admin@atlas.com` (first user → auto-admin)
- [ ] Add three members via roster (`user1@atlas.com`, `user2@atlas.com`,
      `user3@atlas.com`)
- [ ] Sign in as `user1@atlas.com` in a second browser

## Phase 2 — Auth & roster

- [ ] Unauthed `/` redirects to `/sign-in`
- [ ] Magic-link email arrives (check Mailpit at `http://127.0.0.1:54324`
      locally; real inbox in production)
- [ ] First user gets `profiles.role = 'admin'`; subsequent users default to
      `member`
- [ ] Admin sees Roster with all members; member sees only the roster view
- [ ] Admin can toggle `is_active`; deactivated user does not appear in
      picker/shuffle candidate lists
- [ ] Profile page: user can edit their `display_name` and unavailability
      windows; changes persist across reload

## Phase 3 — Attributed prompts

- [ ] Owner creates a `single_choice` async prompt with 3 options
- [ ] Non-owner opens `/polls/{id}`, sees the poll open, submits a response
- [ ] Participation counter increments (n / active-roster-count)
- [ ] Owner cannot submit their own response
- [ ] Owner reveals; both users see the attributed breakdown ("user1 → blue")
- [ ] After reveal, no one can re-submit or edit their response
- [ ] Poll appears in `/polls/past` after reveal (standalone only)

## Phase 4 — Hard-anonymous prompts

- [ ] Create a `hard_anonymous` rating (1–5) prompt
- [ ] User B submits rating 4
- [ ] `responses_anonymous` row has NO `user_id` column (verify in Supabase
      Studio)
- [ ] Reveal: owner sees a histogram, not a per-user list
- [ ] Cannot infer who answered from any UI or API response

## Phase 5 — One-off meetings + agenda

- [ ] Host creates a one-off meeting with a title, scheduled_start, timezone
- [ ] Host adds three agenda items: discussion, prompt, discussion
- [ ] Meeting appears on `/meetings` under "Upcoming"
- [ ] Host starts the meeting; status flips to `live`
- [ ] Host advances through agenda; participants see current item update in
      real time (no manual refresh)
- [ ] Meeting-scoped prompt: participation counter uses meeting participant
      count as denominator (not full roster)
- [ ] Host ends meeting; status flips to `ended`; meeting appears on
      `/meetings/past`

## Phase 6 — Random tools

- [ ] Standalone `/tools/pick` picks a single active roster member
- [ ] Standalone `/tools/shuffle` produces a full permutation
- [ ] Both respect deactivated users (excluded from the pool)
- [ ] Add a "picker" agenda item to a live meeting; host clicks "Pick" —
      participants see the result in real time
- [ ] "Shuffle" agenda item: host advances through the sequence; all viewers
      stay in sync

## Phase 7 — Series + rotation

- [ ] Admin creates a weekly series with 3-person rotation
- [ ] Cron endpoint `/api/cron/generate-occurrences` (with `x-cron-secret`)
      creates upcoming meetings
- [ ] Rotation cursor advances after each meeting; hosts cycle through the
      list in order
- [ ] Removing a rotation member skips them without breaking the cursor

## Phase 8 — Start / Postpone

- [ ] Host clicks "Postpone" on a scheduled meeting; picks a new datetime;
      new meeting created with same agenda + host; original marked
      `postponed`
- [ ] `auto_postpone_count` increments on each auto-postpone
- [ ] After 3 auto-postpones the chain is cancelled and the series'
      rotation_cursor advances
- [ ] Cron endpoint `/api/cron/auto-postpone` (with `x-cron-secret`) applies
      the state machine correctly on past-due meetings

## Phase 9 — Notifications + email

- [ ] Bell in nav shows an unread badge on new events
- [ ] Realtime: new notification appears without page reload
- [ ] `/notifications` feed lists all rows, marks them read on view
- [ ] Settings → email preferences: toggling a channel off suppresses the
      email for that kind (verify in Mailpit / Resend logs)
- [ ] Cron `/api/cron/send-emails` (with `x-cron-secret`) drains queue and
      is idempotent (second run processes zero items)
- [ ] `meeting_starts_soon` cron fires once per meeting within window

## Phase 10 — Home dashboard + history

- [ ] Home shows next meeting, awaiting-response prompts, quick tools
- [ ] "Start meeting" appears on home only for host within ±5 min of
      scheduled_start
- [ ] `/meetings/past` lists ended/postponed/cancelled meetings that started
- [ ] Past meeting detail page has no host controls; shows agenda summary
- [ ] `/polls/past` lists revealed standalone polls; click opens the reveal
      view

## Cross-cutting

- [ ] Middleware blocks all non-`/api/cron`, non-`/auth`, non-`/sign-in`
      routes when unauthenticated
- [ ] All cron endpoints reject requests without a valid `x-cron-secret`
- [ ] Timezones: create a meeting in a non-viewer timezone; viewer sees both
      local and source times
- [ ] Sign-out clears session and redirects to `/sign-in`

## Keyboard navigation manual pass

Run after each UI rebuild. Use keyboard only — no mouse allowed during this
pass. A visible focus ring must be present at every step.

### Sign-in page (`/sign-in`)

- [ ] Tab once → focus lands on the Email input (autofocus)
- [ ] Type an address, Tab → focus moves to "Send magic link" button
- [ ] Enter → button activates (sends magic link)
- [ ] Tab again → focus moves to "Continue with Google" button
- [ ] Enter → Google OAuth redirect begins
- [ ] Shift+Tab cycles back through the two buttons and then the input

### Nav sidebar / top bar

- [ ] Tab from page body → focus enters the nav
- [ ] Arrow keys or Tab move through all nav links in DOM order
- [ ] Each nav link shows a clearly visible focus ring (not just a colour shift)
- [ ] Enter on a nav link navigates to that page
- [ ] Notification bell is reachable and activates with Enter/Space
- [ ] User-avatar / sign-out button is reachable and activates with Enter/Space

### Home page (`/`)

- [ ] Tab through "Your next meeting" card → link inside is focusable and
      activates with Enter
- [ ] "Open" / "Postpone or view" button is focusable and activates
- [ ] "Awaiting your response" poll cards are each focusable; Enter navigates
      to the poll
- [ ] "Pick someone" and "Shuffle roster" buttons are reachable and activate
      with Space/Enter
- [ ] "New meeting" empty-state action button is reachable when no meeting exists

### Meetings list (`/meetings`)

- [ ] "Past" link is focusable and activates
- [ ] "New meeting" button is focusable; Enter opens the new-meeting sheet
- [ ] Each meeting card link is focusable and activates with Enter

### New meeting sheet (`/meetings?new=meeting`)

- [ ] Sheet opens — focus moves automatically to the first form field (Title)
- [ ] Tab cycles through all form inputs: Title → Date → Time → Timezone →
      submit button
- [ ] Esc closes the sheet; focus returns to the "New meeting" trigger button
- [ ] All form labels are visually associated with their inputs (no orphan
      labels)

### Poll detail (`/polls/[id]`)

- [ ] Option buttons / radio inputs are Tab-reachable and toggle with
      Space/Enter
- [ ] "Submit" button is reachable; Enter activates it
- [ ] Confirmation dialog (if present) traps focus inside: Tab cycles only
      within the dialog; Esc closes it
- [ ] After dialog closes, focus returns to the submit button or a sensible
      landmark
- [ ] "Reveal" button (owner only) is reachable and activates

### General rules

- [ ] No focus traps outside of modal dialogs / sheets
- [ ] Skip-to-main-content link appears on first Tab keypress (if implemented)
- [ ] No interactive element is reachable only by mouse (hover menus etc.)
- [ ] Focus order matches visual reading order (top-left → bottom-right)
- [ ] All icon-only buttons have an accessible label (`aria-label` or
      visually-hidden text)
