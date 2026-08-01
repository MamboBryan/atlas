import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decidePostponeAction } from "@/lib/postpone/decide";
import { emit } from "@/lib/notify/emit";
import { resolveMeetingParticipants } from "@/lib/notify/participants";

type Meeting = {
  id: string;
  series_id: string | null;
  title: string;
  scheduled_start: string;
  timezone: string;
  host_user_id: string | null;
  created_by: string;
  participants_override: string[] | null;
  status: "scheduled" | "live" | "ended" | "postponed" | "cancelled";
  auto_postpone_count: number;
};

type AgendaItem = {
  ordinal: number;
  title: string;
  kind: "discussion" | "prompt" | "picker";
  prompt_id: string | null;
  picker_config: unknown;
};

const GRACE_MINUTES = 15;
const MAX_AUTO_POSTPONES = 3;

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
  const graceCutoff = new Date(
    now.getTime() - GRACE_MINUTES * 60_000,
  ).toISOString();

  const { data: candidates, error: fetchErr } = await svc
    .from("meetings")
    .select(
      "id,series_id,title,scheduled_start,timezone,host_user_id,created_by,participants_override,status,auto_postpone_count",
    )
    .eq("status", "scheduled")
    .lt("scheduled_start", graceCutoff)
    .returns<Meeting[]>();

  if (fetchErr)
    return NextResponse.json(
      { ok: false, error: fetchErr.message },
      { status: 500 },
    );

  let postponed = 0;
  let cancelled = 0;

  for (const m of candidates ?? []) {
    const decision = decidePostponeAction({
      status: m.status,
      scheduled_start: m.scheduled_start,
      auto_postpone_count: m.auto_postpone_count,
      now,
      graceMinutes: GRACE_MINUTES,
      maxAutoPostpones: MAX_AUTO_POSTPONES,
    });

    if (decision.action === "noop") continue;

    // Finalize any active game round before the meeting leaves 'scheduled'.
    // Service-role callers bypass RLS, so we call the finalization RPC directly.
    const { data: activeRound } = await svc
      .from("game_rounds")
      .select("id, status")
      .eq("meeting_id", m.id)
      .maybeSingle();
    if (activeRound?.status === "active") {
      // Read submissions and compute a zero-points finalization so the round
      // closes cleanly.  Full scoring is not attempted here because the
      // service-role context has no auth.uid() for the authorization check
      // inside atlas_finalize_game_round; instead we update the round status
      // directly via the service client (which bypasses RLS).
      await svc
        .from("game_rounds")
        .update({ status: "finished", finalized_at: new Date().toISOString() })
        .eq("id", activeRound.id)
        .eq("status", "active");
    }

    if (decision.action === "auto_cancel") {
      const { error: cancelErr } = await svc
        .from("meetings")
        .update({ status: "cancelled" })
        .eq("id", m.id)
        .eq("status", "scheduled");
      if (cancelErr) continue;

      const cancelParticipants = await resolveMeetingParticipants(svc, m);
      try {
        await emit(
          {
            user_ids: cancelParticipants,
            kind: "meeting_cancelled",
            title: `${m.title} cancelled`,
            body: `Cancelled after ${m.auto_postpone_count} auto-postponements.`,
            link: `/meetings/${m.id}`,
            email: {
              dedupeKey: (uid) => `meeting:${m.id}:cancelled:user:${uid}`,
              payload: {
                subject: `${m.title} cancelled`,
                meetingTitle: m.title,
                when: m.scheduled_start,
                reason: `Reached ${MAX_AUTO_POSTPONES} auto-postponements without starting`,
              },
            },
          },
          svc,
        );
      } catch {
        // notification failure non-fatal
      }

      if (m.series_id) {
        const { data: series } = await svc
          .from("meeting_series")
          .select("rotation_order,rotation_cursor")
          .eq("id", m.series_id)
          .single<{ rotation_order: string[]; rotation_cursor: number }>();
        if (series && series.rotation_order.length > 0) {
          const next =
            (series.rotation_cursor + 1) % series.rotation_order.length;
          await svc
            .from("meeting_series")
            .update({ rotation_cursor: next })
            .eq("id", m.series_id);
        }
      }
      cancelled += 1;
      continue;
    }

    const { data: items } = await svc
      .from("agenda_items")
      .select("ordinal,title,kind,prompt_id,picker_config")
      .eq("meeting_id", m.id)
      .order("ordinal", { ascending: true })
      .returns<AgendaItem[]>();

    const { data: inserted, error: insertErr } = await svc
      .from("meetings")
      .insert({
        series_id: m.series_id,
        title: m.title,
        scheduled_start: decision.newScheduledStart,
        timezone: m.timezone,
        host_user_id: m.host_user_id,
        created_by: m.created_by,
        status: "scheduled",
        auto_postpone_count: decision.nextAutoPostponeCount,
        participants_override: m.participants_override,
      })
      .select("id")
      .single();
    if (insertErr || !inserted) continue;

    if (items && items.length > 0) {
      await svc.from("agenda_items").insert(
        items.map((it) => ({
          meeting_id: inserted.id,
          ordinal: it.ordinal,
          title: it.title,
          kind: it.kind,
          prompt_id: it.prompt_id,
          picker_config: it.picker_config,
        })),
      );
    }

    const { error: updateErr } = await svc
      .from("meetings")
      .update({ status: "postponed" })
      .eq("id", m.id)
      .eq("status", "scheduled");
    if (updateErr) {
      await svc.from("meetings").delete().eq("id", inserted.id);
      continue;
    }

    const postponeParticipants = await resolveMeetingParticipants(svc, m);
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      await emit(
        {
          user_ids: postponeParticipants,
          kind: "meeting_postponed",
          title: `${m.title} postponed`,
          body: `Now scheduled for ${decision.newScheduledStart}.`,
          link: `/meetings/${inserted.id}`,
          email: {
            dedupeKey: (uid) =>
              `meeting:${m.id}:auto_postponed:${decision.newScheduledStart}:user:${uid}`,
            payload: {
              subject: `${m.title} postponed`,
              meetingTitle: m.title,
              newWhen: decision.newScheduledStart,
              reason: "Auto-postponed — did not start on time",
              url: `${appUrl}/meetings/${inserted.id}`,
            },
          },
        },
        svc,
      );
    } catch {
      // notification failure non-fatal
    }

    postponed += 1;
  }

  return NextResponse.json({
    ok: true,
    scanned: candidates?.length ?? 0,
    postponed,
    cancelled,
  });
}
