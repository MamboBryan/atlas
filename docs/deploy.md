# Atlas — first deploy runbook

Atlas ships as a Next.js app on Vercel talking to a hosted Supabase
project. Email uses Resend. Vercel Cron drives the four scheduled jobs
defined in `vercel.json`.

## 1. Supabase — provision project

1. Create a new Supabase project (region: closest to your team). Pick a
   strong DB password and save it.
2. Note the project's **URL** and **API keys** (anon + service-role) from
   Project Settings → API.
3. Push the schema:

   ```bash
   pnpm supabase link --project-ref <ref>
   pnpm supabase db push
   ```

4. Verify migrations landed via the SQL editor:
   `select migration_name from supabase_migrations.schema_migrations order by version desc limit 5;`

## 2. Google OAuth (optional but recommended)

1. Google Cloud Console → APIs & Services → Credentials → Create OAuth
   client. Application type: Web application.
2. Add authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
3. In Supabase → Authentication → Providers → Google, enable and paste
   the Client ID + Secret.
4. Under Authentication → URL Configuration, add your Vercel URL to
   Site URL and additional redirect URLs.

Magic-link sign-in works out of the box; Google is optional.

## 3. Resend — email sender

1. Create a Resend account and verify a sending domain (e.g.
   `notifications.your-team.com`).
2. Generate an API key with sending scope only.
3. Update `RESEND_FROM_ADDRESS` in `lib/email/send.ts` (or move it to
   an env var) to match your verified sender.

If the API key is missing at runtime, `send-emails` logs a `no_resend_key`
error and skips the batch — a safe no-op.

## 4. Vercel — deploy the app

1. Import the repo in Vercel.
2. Framework preset: Next.js. Build command and output stay default.
3. Add environment variables (Project → Settings → Environment
   Variables). All are **Production + Preview**:

   | Name                            | Value                                  |
   | ------------------------------- | -------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`      | `https://<ref>.supabase.co`            |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key                      |
   | `SUPABASE_SERVICE_ROLE_KEY`     | Supabase service-role key (server-only) |
   | `RESEND_API_KEY`                | Resend key                             |
   | `CRON_SECRET`                   | 32-char random string                  |

   Do **not** set `ATLAS_TEST_MODE`. It gates the test-only sign-in
   route; leaving it unset in production returns 404.

4. Trigger a deploy. Wait for the initial build to succeed.

## 5. Vercel Cron

Vercel picks up `vercel.json` automatically. After the first deploy,
verify under Deployments → the current one → Crons that all four jobs
are listed:

- `/api/cron/send-emails` — every 2 min
- `/api/cron/starts-soon` — every 2 min
- `/api/cron/auto-postpone` — every 5 min
- `/api/cron/generate-occurrences` — hourly

Vercel Cron invokes each endpoint with a **GET** request carrying an
`Authorization: Bearer $CRON_SECRET` header (injected automatically from
the `CRON_SECRET` env var). Each route rejects any request whose header
doesn't match. To trigger a job manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/<job>
```

## 6. First sign-in and admin bootstrap

1. Open the Vercel URL. It should redirect to `/sign-in`.
2. Enter your email; grab the magic link from the real inbox (or Google
   sign-in). Complete the callback.
3. The `atlas_on_auth_user_created` trigger promotes the first
   authenticated user to `admin`.
4. Add teammates via `/roster` (admin only).

## 7. Smoke test (deployed)

Follow `docs/qa/atlas.md` for the full checklist. Minimum happy path:

- [ ] Sign in as admin, add one teammate to roster.
- [ ] Create a one-off meeting with a hard-anonymous rating prompt in
      the agenda.
- [ ] Teammate signs in, opens the prompt, submits rating 4.
- [ ] Admin starts the meeting, advances to the prompt, reveals — bar
      appears at 4.
- [ ] Notifications bell shows the meeting invite for the teammate.
- [ ] Wait 2 min → confirm at least one email arrived (assuming the
      teammate's email prefs allow it).

## 8. Rollback

Vercel Deployments → previous deployment → Promote. Supabase migrations
have no automatic rollback; keep schema changes additive when possible.
For destructive migrations, snapshot the database before deploying.
