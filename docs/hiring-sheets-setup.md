# Hiring evaluations: Google Sheets setup

Atlas imports candidate evaluation data by reading a Google Sheet server-side,
using a Google service-account JWT. The sheet itself is never made public —
only the service account (which you explicitly share the sheet with) can read
it, and only Atlas's server holds the service-account key.

This takes about 10 minutes. Do the steps in order.

## 1. Create a Google Cloud project

1. Go to https://console.cloud.google.com/projectcreate.
2. Name it something like `atlas-hiring` and create it.
3. Make sure the new project is selected in the project switcher before
   continuing.

## 2. Enable the Google Sheets API

1. Go to https://console.cloud.google.com/apis/library/sheets.googleapis.com
   (with the project from step 1 selected).
2. Click **Enable**.

## 3. Create a service account

1. Go to **IAM & Admin → Service Accounts**
   (https://console.cloud.google.com/iam-admin/serviceaccounts).
2. Click **Create service account**.
3. Give it a name (e.g. `atlas-hiring-sheets-reader`). No project roles are
   needed — Atlas only needs read access to sheets it's explicitly shared
   with, not any project-level IAM role. Click through and finish.
4. Note the service account's email address, shown in the list — it looks
   like `atlas-hiring-sheets-reader@<project-id>.iam.gserviceaccount.com`.
   You'll need it in step 6.

## 4. Create a JSON key

1. Open the service account you just created.
2. Go to the **Keys** tab → **Add key** → **Create new key** → type **JSON**.
3. This downloads a `.json` key file. Treat it as a secret — it grants read
   access to every sheet shared with this service account.

## 5. Set `GOOGLE_SERVICE_ACCOUNT_JSON`

Atlas reads the entire key file as a single-line JSON string from the
`GOOGLE_SERVICE_ACCOUNT_JSON` env var.

**Locally** (`.env.local`):

1. Minify the downloaded key file to one line, e.g.:
   ```bash
   jq -c . path/to/downloaded-key.json
   ```
2. Copy the output and set it in `.env.local`:
   ```
   GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"atlas-hiring-sheets-reader@....iam.gserviceaccount.com",...}
   ```
   Keep it on a single line — the `\n` sequences inside `private_key` are
   literal backslash-n escapes, which is what `jq -c` produces.

**In Vercel:**

1. Project → **Settings → Environment Variables**.
2. Add `GOOGLE_SERVICE_ACCOUNT_JSON`, paste the same single-line JSON value,
   and set it for the environments that need it (Production, and Preview if
   you test hiring evaluations from preview deploys).
3. Redeploy for the new env var to take effect.

Never commit the key file or its JSON value — `.env.example` only documents
the variable name, not a value.

## 6. Share the target sheet with the service account

For each Google Sheet you want Atlas to import from:

1. Open the sheet and click **Share**.
2. Add the service account's email from step 3
   (`...@<project-id>.iam.gserviceaccount.com`).
3. Set its role to **Viewer** — Atlas only reads data, it never writes to
   the sheet.

Without this step, Atlas's read requests will fail with a permission error
even though the API is enabled and the key is valid — the service account
is just another Google identity and needs to be granted access like any
other viewer.

## 7. Find the spreadsheet ID and tab name

When connecting a sheet to an evaluation in Atlas (Hiring → evaluation →
admin controls → **Spreadsheet ID** / **Tab**):

- **Spreadsheet ID** — from the sheet's URL:
  ```
  https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit#gid=0
                                        ^-------------- spreadsheet ID --------------^
  ```
  It's the long ID segment between `/d/` and the next `/`.
- **Tab** — the name of the sheet tab (bottom tab bar in Google Sheets,
  e.g. `Form Responses 1`) that holds the evaluation data. This field is
  optional; leave it blank to read the first/default range of the sheet.

That's it — once the sheet is shared and the spreadsheet ID (and optional
tab) is set on the evaluation, Atlas can import responses from it.
