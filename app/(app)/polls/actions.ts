"use server";

import { createPrompt } from "@/lib/actions/prompt";
import { localInputToIso } from "@/lib/utils/date";

/**
 * Server action consumed by NewPollForm (Sheet-based form).
 * Accepts FormData with: question, response_type, anonymity, timing, opens_at.
 * Returns { error?: string; id?: string }.
 *
 * Fields NOT included (schema mismatch / not in createPromptInput base):
 *   - meeting_id: no meeting_id column on prompts insert path
 *   - soft_anonymous: anonymity enum only has "attributed" | "hard_anonymous"
 *   - scale_1_5 / single_choice / multi_choice options handled in PromptForm directly
 *   - closes_at: accepted by schema but omitted from this simple form
 *
 * For single_choice / multi_choice the user must provide at least 2 options
 * (comma-separated in the "options" field). For rating the form sends
 * rating_max (5 or 10).
 */
export async function createPollAction(
  fd: FormData,
): Promise<{ error?: string; id?: string }> {
  const question = (fd.get("question") as string | null)?.trim() ?? "";
  const response_type = (fd.get("response_type") as string | null) ?? "text";
  const anonymity =
    (fd.get("anonymity") as string | null) ?? "attributed";
  const timing = (fd.get("timing") as string | null) ?? "async";
  const opens_at_raw = (fd.get("opens_at") as string | null)?.trim() ?? "";
  const timezone = (fd.get("timezone") as string | null)?.trim() || "UTC";

  if (!question) return { error: "Question is required." };

  const base: Record<string, unknown> = {
    question,
    anonymity,
    timing,
  };

  if (opens_at_raw) {
    // datetime-local gives "YYYY-MM-DDTHH:mm" — interpret in the viewer's
    // timezone (sent as a hidden field) then convert to UTC ISO.
    const iso = localInputToIso(opens_at_raw, timezone);
    if (!iso) return { error: "Invalid opens_at date/time." };
    base.opens_at = iso;
  }

  let input: unknown;

  if (response_type === "text" || response_type === "yes_no") {
    input = { response_type, ...base };
  } else if (
    response_type === "single_choice" ||
    response_type === "multi_choice"
  ) {
    const raw = (fd.get("options") as string | null) ?? "";
    const options = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((label, i) => ({
        id:
          label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || `opt-${i + 1}`,
        label,
      }));
    if (options.length < 2)
      return { error: "Provide at least 2 options, comma-separated." };
    input = { response_type, ...base, options };
  } else if (response_type === "rating") {
    const ratingMax = Number(fd.get("rating_max") ?? "5") as 5 | 10;
    input = {
      response_type: "rating",
      ...base,
      rating_min: 1,
      rating_max: ratingMax === 10 ? 10 : 5,
    };
  } else {
    return { error: `Unknown response type: ${response_type}` };
  }

  const res = await createPrompt(input);
  if (!res.ok) return { error: res.error.message };
  return { id: res.data.id };
}
