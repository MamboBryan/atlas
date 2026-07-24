import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import type { ReactElement } from "react";
import { renderEmail } from "@/lib/email/render";
import MeetingScheduled from "@/emails/meeting-scheduled";
import MeetingStartsSoon from "@/emails/meeting-starts-soon";
import MeetingPostponed from "@/emails/meeting-postponed";
import MeetingCancelled from "@/emails/meeting-cancelled";
import AsyncPromptsPending from "@/emails/async-prompts-pending";
import PollCreated from "@/emails/poll-created";
import PollRevealed from "@/emails/poll-revealed";

type EmailEvent = {
  id: string;
  user_id: string;
  kind: string;
  payload: Record<string, unknown>;
};

type Profile = {
  email: string;
  email_prefs: Record<string, boolean> | null;
};

const templates: Record<string, (p: any) => ReactElement> = {
  meeting_scheduled: (p) => <MeetingScheduled {...p} />,
  meeting_starts_soon: (p) => <MeetingStartsSoon {...p} />,
  meeting_postponed: (p) => <MeetingPostponed {...p} />,
  meeting_cancelled: (p) => <MeetingCancelled {...p} />,
  async_prompts_pending: (p) => <AsyncPromptsPending {...p} />,
  poll_created: (p) => <PollCreated {...p} />,
  poll_revealed: (p) => <PollRevealed {...p} />,
};

const BATCH_SIZE = 50;

export async function POST(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET)
    return NextResponse.json({ ok: false }, { status: 401 });

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const resendKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.RESEND_FROM ?? "Atlas <no-reply@atlas.example>";
  const resend = resendKey ? new Resend(resendKey) : null;

  const { data: events, error: fetchErr } = await svc
    .from("email_events")
    .select("id,user_id,kind,payload")
    .is("sent_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE)
    .returns<EmailEvent[]>();
  if (fetchErr)
    return NextResponse.json(
      { ok: false, error: fetchErr.message },
      { status: 500 },
    );

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const e of events ?? []) {
    const { data: p } = await svc
      .from("profiles")
      .select("email,email_prefs")
      .eq("id", e.user_id)
      .single<Profile>();

    if (!p) {
      await svc
        .from("email_events")
        .update({
          sent_at: new Date().toISOString(),
          error: "no_profile",
        })
        .eq("id", e.id);
      skipped += 1;
      continue;
    }

    if (p.email_prefs && p.email_prefs[e.kind] === false) {
      await svc
        .from("email_events")
        .update({
          sent_at: new Date().toISOString(),
          error: "opted_out",
        })
        .eq("id", e.id);
      skipped += 1;
      continue;
    }

    const tpl = templates[e.kind];
    if (!tpl) {
      await svc
        .from("email_events")
        .update({
          sent_at: new Date().toISOString(),
          error: "no_template",
        })
        .eq("id", e.id);
      failed += 1;
      continue;
    }

    if (!resend) {
      await svc
        .from("email_events")
        .update({
          sent_at: new Date().toISOString(),
          error: "no_resend_key",
        })
        .eq("id", e.id);
      skipped += 1;
      continue;
    }

    try {
      const { html, text } = await renderEmail(tpl(e.payload));
      const subject =
        (e.payload.subject as string | undefined) ?? "Atlas update";
      const { data: r, error: sendErr } = await resend.emails.send({
        from: fromAddr,
        to: p.email,
        subject,
        html,
        text,
      });
      await svc
        .from("email_events")
        .update({
          resend_id: r?.id ?? null,
          sent_at: new Date().toISOString(),
          error: sendErr?.message ?? null,
        })
        .eq("id", e.id);
      if (sendErr) failed += 1;
      else sent += 1;
    } catch (renderErr) {
      await svc
        .from("email_events")
        .update({
          sent_at: new Date().toISOString(),
          error:
            renderErr instanceof Error ? renderErr.message : "render_failed",
        })
        .eq("id", e.id);
      failed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: events?.length ?? 0,
    sent,
    skipped,
    failed,
  });
}
