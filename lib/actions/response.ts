"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require";
import { validateResponse } from "@/lib/prompts/validate-response";
import { err, ok, type ActionResult } from "@/lib/actions/_result";

export async function submitResponse(
  prompt_id: string,
  response: unknown,
): Promise<ActionResult<null>> {
  const { supabase } = await requireUser();

  const { data: p } = await supabase
    .from("prompts")
    .select(
      "id,response_type,options,rating_min,rating_max,anonymity,is_open,is_revealed,opens_at,closes_at,timing",
    )
    .eq("id", prompt_id)
    .single();
  if (!p) return err("not_found", "prompt");
  if (p.is_revealed || !p.is_open) return err("closed", "prompt not open");

  const now = new Date();
  if (p.opens_at && now < new Date(p.opens_at))
    return err("closed", "not yet open");
  if (p.closes_at && now > new Date(p.closes_at))
    return err("closed", "past close");

  const v = validateResponse(p as never, response);
  if (!v.ok) return err("invalid_input", v.error);

  if (p.anonymity === "attributed") {
    const { error } = await supabase.rpc("atlas_submit_attributed", {
      p_prompt: prompt_id,
      p_response: response as never,
    });
    if (error) return err("db_error", error.message);
  } else {
    return err("not_implemented", "hard-anonymous ships in phase 4");
  }

  revalidatePath(`/polls/${prompt_id}`);
  return ok(null);
}
