import { createClient } from "@supabase/supabase-js";

/**
 * Read-only client for THAMANI PROD (a separate Supabase project from atlas).
 * Source of truth for accounts/devices/etc. Server-only; never import in a
 * client component.
 */
export function thamaniReadClient() {
  const url = process.env.THAMANI_SUPABASE_URL;
  const key = process.env.THAMANI_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "THAMANI_SUPABASE_URL / THAMANI_SUPABASE_SERVICE_ROLE_KEY are not set. " +
        "Add them to .env.local (Thamani prod project lxescgcuelttoxaacsib).",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
