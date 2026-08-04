import { mintServiceJwt } from "@/lib/sheets/jwt";
import type { SheetGrid } from "@/lib/sheets/types";

type SA = { client_email: string; private_key: string };

let cachedToken: { value: string; expiresAt: number } | null = null;

function readSA(): SA {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  const sa = JSON.parse(raw) as SA;
  if (!sa.client_email || !sa.private_key)
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON missing client_email/private_key");
  return sa;
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.value;

  const sa = readSA();
  const assertion = mintServiceJwt(sa, now);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`Sheets token exchange failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: now + json.expires_in };
  return json.access_token;
}

export async function readSheet(spreadsheetId: string, tab?: string | null): Promise<SheetGrid> {
  const token = await getAccessToken();
  const range = tab ? encodeURIComponent(tab) : "A1:ZZ";
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}?majorDimension=ROWS`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets read failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { values?: string[][] };
  const values = (json.values ?? []).filter((r) => r.some((c) => (c ?? "").trim() !== ""));
  if (values.length === 0) return { headers: [], rows: [] };
  const headers = values[0].map((h) => (h ?? "").trim());
  const width = headers.length;
  const rows = values.slice(1).map((r) => {
    const padded = r.slice(0, width);
    while (padded.length < width) padded.push("");
    return padded.map((c) => c ?? "");
  });
  return { headers, rows };
}
