import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { nextOccurrences } from "@/lib/rrule/next-occurrences";
import { emit } from "@/lib/notify/emit";
import { resolveMeetingParticipants } from "@/lib/notify/participants";

type Series = {
  id: string;
  name: string;
  rrule: string;
  timezone: string;
  rotation_order: string[];
  rotation_cursor: number;
  default_participant_ids: string[] | null;
  agenda_template: {
    title: string;
    kind: "discussion" | "prompt" | "picker";
    prompt_id?: string | null;
  }[];
  created_by: string;
};

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ ok: false }, { status: 401 });

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const now = new Date();
  const until = new Date(now.getTime() + 14 * 24 * 3600 * 1000);

  const { data: series, error: seriesErr } = await svc
    .from("meeting_series")
    .select(
      "id,name,rrule,timezone,rotation_order,rotation_cursor,default_participant_ids,agenda_template,created_by",
    )
    .returns<Series[]>();
  if (seriesErr)
    return NextResponse.json(
      { ok: false, error: seriesErr.message },
      { status: 500 },
    );

  let created = 0;

  for (const s of series ?? []) {
    const times = nextOccurrences(s.rrule, s.timezone, now, until);

    for (const t of times) {
      const iso = t.toISOString();
      const { count } = await svc
        .from("meetings")
        .select("id", { count: "exact", head: true })
        .eq("series_id", s.id)
        .eq("scheduled_start", iso);
      if ((count ?? 0) > 0) continue;

      const day = iso.slice(0, 10);
      const order = s.rotation_order;
      const n = order.length;
      const skipped: string[] = [];
      let host: string | null = null;
      let nextCursor = s.rotation_cursor % Math.max(1, n);

      for (let step = 0; step < n; step++) {
        const idx = (s.rotation_cursor + step) % n;
        const candidate = order[idx];
        const { data: unavail } = await svc.rpc("atlas_is_unavailable_on", {
          uid: candidate,
          day,
        });
        if (!unavail) {
          host = candidate;
          nextCursor = (idx + 1) % n;
          break;
        }
        skipped.push(candidate);
      }

      const { data: inserted, error: insertErr } = await svc
        .from("meetings")
        .insert({
          series_id: s.id,
          title: s.name,
          scheduled_start: iso,
          timezone: s.timezone,
          host_user_id: host,
          created_by: s.created_by,
          status: host ? "scheduled" : "cancelled",
          participants_override: s.default_participant_ids ?? null,
        })
        .select("id")
        .single();

      if (insertErr || !inserted) continue;
      created += 1;

      if (host) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
        const participants = await resolveMeetingParticipants(svc, {
          participants_override: s.default_participant_ids,
        });
        try {
          await emit(
            {
              user_ids: participants,
              kind: "meeting_scheduled",
              title: `${s.name} scheduled`,
              body: `Scheduled for ${iso}.`,
              link: `/meetings/${inserted.id}`,
              email: {
                dedupeKey: (uid) =>
                  `meeting:${inserted.id}:scheduled:user:${uid}`,
                payload: {
                  subject: `${s.name} scheduled`,
                  meetingTitle: s.name,
                  when: iso,
                  url: `${appUrl}/meetings/${inserted.id}`,
                },
              },
            },
            svc,
          );
        } catch {
          // notification failure non-fatal
        }
      }

      const template = s.agenda_template ?? [];
      if (template.length > 0) {
        await svc.from("agenda_items").insert(
          template.map((it, i) => ({
            meeting_id: inserted.id,
            ordinal: i,
            title: it.title,
            kind: it.kind,
            prompt_id: it.kind === "prompt" ? (it.prompt_id ?? null) : null,
            picker_config:
              it.kind === "picker"
                ? { mode: "shuffle", scope: "meeting_participants" }
                : null,
          })),
        );
      }

      if (host) {
        await svc
          .from("meeting_series")
          .update({ rotation_cursor: nextCursor })
          .eq("id", s.id);
      }
    }
  }

  return NextResponse.json({ ok: true, created });
}
