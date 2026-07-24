import type { BrowserContext } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url =
  process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc =
  process.env.SUPABASE_TEST_SERVICE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;

export const canRun = !!url && !!svc;

export function admin(): SupabaseClient {
  if (!canRun) throw new Error("Supabase env vars not set");
  return createClient(url!, svc!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function resetUsers() {
  const c = admin();
  // Drop user-owned rows in FK-safe order before deleting users. The
  // `created_by` columns on prompts/meetings/series use `on delete
  // restrict`, so cascading through auth.users would fail otherwise.
  for (const table of [
    "email_events",
    "notifications",
    "participation",
    "responses_attributed",
    "responses_anonymous",
    "agenda_items",
    "shuffle_sessions",
    "prompts",
    "meetings",
    "meeting_series",
    "unavailability_windows",
  ] as const) {
    await c.from(table).delete().not("id", "is", null);
  }
  const { data } = await c.auth.admin.listUsers();
  for (const u of data.users ?? []) {
    await c.auth.admin.deleteUser(u.id);
  }
}

export const TEST_PASSWORD = "atlas-test-password-1234";

export async function createUser(email: string, fullName: string) {
  const c = admin();
  const { data, error } = await c.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  return data.user!;
}

/**
 * Signs the given browser context in as `email` by POSTing to the
 * test-only /auth/test-signin route (guarded by ATLAS_TEST_MODE=1),
 * which runs Supabase signInWithPassword server-side. The SSR client
 * writes the auth cookies on the response, and Playwright captures
 * them onto the browser context automatically.
 */
export async function signIn(
  context: BrowserContext,
  email: string,
  baseURL: string,
) {
  const res = await context.request.post(`${baseURL}/auth/test-signin`, {
    data: { email, password: TEST_PASSWORD },
  });
  if (!res.ok()) {
    const body = await res.text().catch(() => "");
    throw new Error(`sign-in failed (${res.status()}): ${body}`);
  }
}
