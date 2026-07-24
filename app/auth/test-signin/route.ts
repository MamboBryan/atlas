import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Test-only sign-in endpoint used by Playwright fixtures.
//
// Guarded by ATLAS_TEST_MODE=1 — the .env for dev sets it, production
// deploys never do. Accepts { email, password } and calls
// signInWithPassword server-side so the SSR client writes the auth
// cookies on the response.
export async function POST(req: NextRequest) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ATLAS_TEST_MODE !== "1"
  ) {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }
  const body = (await req.json().catch(() => null)) as
    | { email?: unknown; password?: unknown }
    | null;
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
