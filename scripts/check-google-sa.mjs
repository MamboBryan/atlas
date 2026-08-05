#!/usr/bin/env node
// Validate GOOGLE_SERVICE_ACCOUNT_JSON without running the app.
// Parses the env var, mints a service JWT, exchanges it for an access token,
// and (optionally) does a read against a sheet you pass in.
//
// Run:
//   node scripts/check-google-sa.mjs                 # parse + token exchange
//   node scripts/check-google-sa.mjs <spreadsheetId> # + a real read
//   node scripts/check-google-sa.mjs <spreadsheetId> "Form Responses 1"
import { createSign } from "node:crypto";
import { config as dotenv } from "dotenv";

// Match the app: load .env.local, fall back to .env.
dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
const ok = (msg) => console.log(`✓ ${msg}`);

// ---- 1. env present ----
const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if (!raw)
  fail("GOOGLE_SERVICE_ACCOUNT_JSON is not set (checked .env.local and .env)");
ok("GOOGLE_SERVICE_ACCOUNT_JSON is set");

// ---- 2. parses to JSON with required fields ----
let sa;
try {
  sa = JSON.parse(raw);
} catch (e) {
  fail(`GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON: ${e.message}`);
}
if (!sa.client_email || !sa.private_key)
  fail("GOOGLE_SERVICE_ACCOUNT_JSON missing client_email/private_key");
ok(`parsed JSON — client_email: ${sa.client_email}`);

// ---- 3. mint the JWT (mirrors lib/sheets/jwt.ts) ----
const b64url = (buf) => Buffer.from(buf).toString("base64url");
function mintServiceJwt(sa, nowSec) {
  const iat = nowSec ?? Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      sub: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat,
      exp: iat + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  const pem = sa.private_key.replace(/\\n/g, "\n");
  const sig = signer.sign(pem);
  return `${signingInput}.${b64url(sig)}`;
}

let assertion;
try {
  assertion = mintServiceJwt(sa);
} catch (e) {
  fail(`could not sign JWT (private_key is malformed): ${e.message}`);
}
ok("signed service JWT");

// ---- 4. exchange for an access token ----
const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  }),
});
if (!tokenRes.ok) {
  fail(
    `token exchange failed: ${tokenRes.status} ${await tokenRes.text()}\n` +
      "  → key may be rotated/disabled, or the Sheets API is not enabled on the project.",
  );
}
const { access_token } = await tokenRes.json();
ok("exchanged JWT for an access token — credentials are valid");

// ---- 5. optional: read a real sheet ----
const spreadsheetId = process.argv[2];
if (!spreadsheetId) {
  console.log(
    "\nDone. Pass a spreadsheetId to also test a real read + sheet sharing:\n" +
      "  node scripts/check-google-sa.mjs <spreadsheetId> [tabName]",
  );
  process.exit(0);
}

const tab = process.argv[3];
const range = tab ? encodeURIComponent(tab) : "A1:ZZ";
const readRes = await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}?majorDimension=ROWS`,
  { headers: { Authorization: `Bearer ${access_token}` } },
);
if (!readRes.ok) {
  const status = readRes.status;
  const hint =
    status === 403
      ? `  → share the sheet (Viewer) with ${sa.client_email}`
      : status === 404
        ? "  → check the spreadsheetId (and tab name)"
        : "";
  fail(`sheet read failed: ${status} ${await readRes.text()}\n${hint}`);
}
const { values = [] } = await readRes.json();
ok(
  `read sheet — ${values.length} row(s), ${values[0]?.length ?? 0} column(s) in the first row`,
);
