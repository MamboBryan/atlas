import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { emit } from "@/lib/notify/emit";
import { resolveMeetingParticipants } from "@/lib/notify/participants";

type Meeting = {
  id: string;
  title: string;
  scheduled_start: string;
  timezone: string;
  participants_override: string[] | null;
};

const WINDOW_MINUTES = 10;

export async function POST(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET)
    return NextResponse.json({ ok: false }, { status: 401 });

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const now = new Date();
  const windowEnd = new Date(now.getTime() + WINDOW_MINUTES * 60_000);

  const { data: candidates, error: fetchErr } = await svc
    .from("meetings")
    .select("id,title,scheduled_start,timezone,participants_override")
    .eq("status", "scheduled")
    .gte("scheduled_start", now.toISOString())
    .lte("scheduled_start", windowEnd.toISOString())
    .returns<Meeting[]>();
  if (fetchErr)
    return NextResponse.json(
      { ok: false, error: fetchErr.message },
      { status: 500 },
    );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  let notified = 0;

  for (const m of candidates ?? []) {
    const participants = await resolveMeetingParticipants(svc, m);
    if (participants.length === 0) continue;

    const url = `${appUrl}/meetings/${m.id}`;
    const when = new Date(m.scheduled_start).toISOString();

    await emit(
      {
        user_ids: participants,
        kind: "meeting_starts_soon",
        title: `${m.title} starts soon`,
        body: `Starts in about 10 minutes.`,
        link: `/meetings/${m.id}`,
        email: {
          dedupeKey: (uid) => `meeting:${m.id}:starts_soon:user:${uid}`,
          payload: {
            subject: `${m.title} starts in 10 minutes`,
            meetingTitle: m.title,
            when,
            url,
          },
        },
      },
      svc,
    );
    notified += participants.length;
  }

  return NextResponse.json({
    ok: true,
    scanned: candidates?.length ?? 0,
    notified,
  });
}
