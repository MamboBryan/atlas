import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Test-only sign-in endpoint used by Playwright fixtures and manual QA.
//
// Guarded by ATLAS_TEST_MODE=1 — .env.local sets it locally, production
// deploys never do. Two shapes:
//   POST { email, password } — for Playwright.
//   GET  ?email=…&password=… — for pasting into a browser URL bar
//                              (defaults password to atlas-test-password-1234).
// Both call signInWithPassword server-side; the SSR client writes the
// auth cookies onto the response.
const TEST_PASSWORD = "atlas-test-password-1234";

function disabled() {
  return (
    process.env.NODE_ENV === "production" || process.env.ATLAS_TEST_MODE !== "1"
  );
}

async function signIn(email: string, password: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.auth.signInWithPassword({ email, password });
}

export async function POST(req: NextRequest) {
  if (disabled()) {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }
  const body = (await req.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
  } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { error } = await signIn(email, password);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  if (disabled()) {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }
  const u = new URL(req.url);
  const email = u.searchParams.get("email") ?? "";
  const password = u.searchParams.get("password") ?? TEST_PASSWORD;
  const next = u.searchParams.get("next") ?? "/";
  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }
  const { error } = await signIn(email, password);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  return NextResponse.redirect(new URL(next, req.url));
}
