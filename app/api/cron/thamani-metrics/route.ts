import { NextRequest, NextResponse } from "next/server";
import { atlasServiceClient } from "@/lib/supabase/service";
import { computeAccountsMetrics } from "@/lib/thamani/metrics/accounts";

export async function POST(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const now = new Date();
  const rows = await computeAccountsMetrics(now);

  const supabase = atlasServiceClient();
  const { error } = await supabase.from("thamani_metrics").upsert(
    rows.map((r) => ({ ...r, computed_at: now.toISOString() })),
    { onConflict: "metric_key,grain,period_start" },
  );
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, upserted: rows.length });
}
