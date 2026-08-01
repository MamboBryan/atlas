import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type NotifyKind =
  | "meeting_scheduled"
  | "meeting_starts_soon"
  | "meeting_postponed"
  | "meeting_cancelled"
  | "async_prompts_pending"
  | "poll_created"
  | "poll_revealed";

export type EmitInput = {
  user_ids: string[];
  kind: NotifyKind;
  title: string;
  body: string;
  link: string;
  email?: {
    dedupeKey: (uid: string) => string;
    payload: Record<string, unknown>;
  };
};

function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function emit(
  input: EmitInput,
  client?: SupabaseClient,
): Promise<{ inApp: number; queued: number }> {
  const svc = client ?? serviceClient();
  const users = Array.from(new Set(input.user_ids)).filter(Boolean);
  if (users.length === 0) return { inApp: 0, queued: 0 };

  const { error: notifErr } = await svc.from("notifications").insert(
    users.map((uid) => ({
      user_id: uid,
      kind: input.kind,
      title: input.title,
      body: input.body,
      link: input.link,
    })),
  );
  if (notifErr)
    throw new Error(`notify.emit notifications: ${notifErr.message}`);

  let queued = 0;
  if (input.email) {
    const rows = users.map((uid) => ({
      user_id: uid,
      kind: input.kind,
      dedupe_key: input.email!.dedupeKey(uid),
      payload: input.email!.payload,
    }));
    const { error: emailErr } = await svc
      .from("email_events")
      .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (emailErr)
      throw new Error(`notify.emit email_events: ${emailErr.message}`);
    queued = rows.length;
  }

  return { inApp: users.length, queued };
}
