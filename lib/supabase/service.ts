import { createClient } from "@supabase/supabase-js";

/** Service-role client for atlas's OWN database. Bypasses RLS. Server-only. */
export function atlasServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
