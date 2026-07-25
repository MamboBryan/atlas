# Atlas QA notes

Deferred manual/E2E checks that require fixtures Phase 2 does not yet provide.

## Phase 2

- **Admin adds a member and sees them in the roster table.** Requires an
  authenticated Playwright fixture (signed-in admin session). Task 2.7 Step 4
  logged this deferral. Cover in Phase 10 E2E pass, or once we introduce
  auth session storage for Playwright.
- **Magic-link sign-in end-to-end.** Requires driving the Mailpit UI at
  `http://127.0.0.1:54324` (link click) or reading the OTP directly from
  Supabase Auth. Manual check for now:
  1. `pnpm supabase start && pnpm dev`
  2. Open `/`, expect redirect to `/sign-in`.
  3. Enter an email, click "Send magic link".
  4. Grab the link from Mailpit, follow it — should land on `/`.
  5. First user must have `profiles.role = 'admin'`.
- **Google OAuth.** Local Supabase does not have Google configured. Verify
  after remote deploy (Phase 10).
