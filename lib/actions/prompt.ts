"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth/require";
import { createPromptInput } from "@/lib/zod/prompt";
import { err, ok, type ActionResult } from "@/lib/actions/_result";
import { emit } from "@/lib/notify/emit";
import { resolveAllActiveUserIds } from "@/lib/notify/participants";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "";
}

const YES_NO_OPTIONS = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
];

export async function createPrompt(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createPromptInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  const { user, supabase } = await requireUser();
  const p = parsed.data;
  const row: Record<string, unknown> = {
    created_by: user.id,
    owner_user_id: user.id,
    question: p.question,
    response_type: p.response_type,
    anonymity: p.anonymity,
    timing: p.timing,
    is_open: true,
    opens_at: p.opens_at ?? null,
    closes_at: p.closes_at ?? null,
    meeting_id: p.meeting_id ?? null,
  };
  if (p.response_type === "single_choice" || p.response_type === "multi_choice")
    row.options = p.options;
  if (p.response_type === "yes_no") row.options = YES_NO_OPTIONS;
  if (p.response_type === "rating") {
    row.rating_min = p.rating_min;
    row.rating_max = p.rating_max;
  }
  const { data, error } = await supabase
    .from("prompts")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) return err("db_error", error?.message ?? "unknown");

  if (p.meeting_id) {
    revalidatePath(`/meetings/${p.meeting_id}`);
    return ok({ id: data.id });
  }

  try {
    const svc = serviceClient();
    const recipients = (await resolveAllActiveUserIds(svc)).filter(
      (id) => id !== user.id,
    );
    const { data: creator } = await svc
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single<{ display_name: string }>();
    await emit(
      {
        user_ids: recipients,
        kind: "poll_created",
        title: `New poll: ${p.question}`,
        body: `${creator?.display_name ?? "Someone"} opened a poll.`,
        link: `/polls/${data.id}`,
        email: {
          dedupeKey: (uid) => `poll:${data.id}:created:user:${uid}`,
          payload: {
            subject: `New poll: ${p.question}`,
            pollTitle: p.question,
            createdBy: creator?.display_name ?? "Someone",
            url: `${appUrl()}/polls/${data.id}`,
          },
        },
      },
      svc,
    );
  } catch {
    // notification failure non-fatal
  }

  revalidatePath("/polls");
  return ok({ id: data.id });
}

export async function revealPrompt(
  prompt_id: string,
): Promise<ActionResult<null>> {
  const { user, supabase } = await requireUser();
  const { error } = await supabase
    .from("prompts")
    .update({
      is_revealed: true,
      revealed_at: new Date().toISOString(),
      is_open: false,
    })
    .eq("id", prompt_id)
    .eq("owner_user_id", user.id);
  if (error) return err("db_error", error.message);

  const svc = serviceClient();
  const { data: prompt } = await svc
    .from("prompts")
    .select("question")
    .eq("id", prompt_id)
    .single<{ question: string }>();
  const { data: responders } = await svc
    .from("responses_attributed")
    .select("user_id")
    .eq("prompt_id", prompt_id);
  const respIds = Array.from(
    new Set(
      (responders ?? []).map((r: { user_id: string }) => r.user_id),
    ),
  );
  try {
    await emit(
      {
        user_ids: respIds,
        kind: "poll_revealed",
        title: `Results are in`,
        body: `${prompt?.question ?? "A poll"} results are visible.`,
        link: `/polls/${prompt_id}`,
        email: {
          dedupeKey: (uid) => `poll:${prompt_id}:revealed:user:${uid}`,
          payload: {
            subject: `Results are in: ${prompt?.question ?? "poll"}`,
            pollTitle: prompt?.question ?? "poll",
            url: `${appUrl()}/polls/${prompt_id}`,
          },
        },
      },
      svc,
    );
  } catch {
    // notification failure non-fatal
  }

  revalidatePath(`/polls/${prompt_id}`);
  return ok(null);
}

export async function closePrompt(
  prompt_id: string,
): Promise<ActionResult<null>> {
  const { user, supabase } = await requireUser();
  const { error } = await supabase
    .from("prompts")
    .update({ is_open: false })
    .eq("id", prompt_id)
    .eq("owner_user_id", user.id);
  if (error) return err("db_error", error.message);
  revalidatePath(`/polls/${prompt_id}`);
  return ok(null);
}
