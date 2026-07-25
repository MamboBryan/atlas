"use server";

import { createOneOffMeeting } from "@/lib/actions/meeting";
import { localInputToIso } from "@/lib/utils/date";

/**
 * Server action consumed by NewMeetingForm (Sheet-based form).
 * Accepts a FormData with: title, scheduled_start (datetime-local), timezone.
 * Returns { error?: string; id?: string }.
 */
export async function createMeetingAction(
  fd: FormData,
): Promise<{ error?: string; id?: string }> {
  const title = (fd.get("title") as string | null)?.trim() ?? "";
  const scheduledStartRaw = (fd.get("scheduled_start") as string | null) ?? "";
  const timezone = (fd.get("timezone") as string | null)?.trim() ?? "UTC";

  if (!title) return { error: "Title is required." };
  if (!scheduledStartRaw) return { error: "Start date/time is required." };

  const scheduledStart = localInputToIso(scheduledStartRaw, timezone);
  if (!scheduledStart) return { error: "Invalid start date/time." };

  const res = await createOneOffMeeting({
    title,
    scheduled_start: scheduledStart,
    timezone,
    participants_override: null,
  });

  if (!res.ok) return { error: res.error.message };
  return { id: res.data.id };
}
