import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { METRICS } from "./_shared/registry.ts";

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function handler(req: Request): Promise<Response> {
  const syncSecret = Deno.env.get("SYNC_SECRET");
  const provided = req.headers.get("x-sync-secret") ?? "";
  if (!syncSecret || !timingSafeEqual(provided, syncSecret)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  try {
    const now = new Date();
    const thamani = createClient(
      Deno.env.get("THAMANI_SUPABASE_URL")!,
      Deno.env.get("THAMANI_SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const atlas = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const rows = (
      await Promise.all(METRICS.map((m) => m.compute(thamani, now)))
    ).flat();
    const { error } = await atlas.from("thamani_metrics").upsert(
      rows.map((r) => ({ ...r, computed_at: now.toISOString() })),
      { onConflict: "metric_key,grain,period_start" },
    );
    if (error)
      return Response.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    return Response.json({ ok: true, upserted: rows.length });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

// Guarded so importing this module (e.g. from handler_test.ts) doesn't bind
// a network listener — only the entrypoint invocation starts the server.
if (import.meta.main) {
  Deno.serve(handler);
}
