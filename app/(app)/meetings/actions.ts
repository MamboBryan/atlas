"use server";

import { createOneOffMeeting } from "@/lib/actions/meeting";

/** Convert a datetime-local string ("YYYY-MM-DDTHH:mm") in a given IANA
 *  timezone to a UTC ISO-8601 string, which is what the Zod schema expects. */
function localInputToIso(v: string, tz: string): string | null {
  if (!v) return null;
  const [datePart, timePart] = v.split("T");
  if (!datePart || !timePart) return null;
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(utcGuess);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) === 24 ? 0 : Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  const offset = asUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offset).toISOString();
}

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
