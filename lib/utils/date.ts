/**
 * Convert a datetime-local string ("YYYY-MM-DDTHH:mm") in a given IANA
 * timezone to a UTC ISO-8601 string.
 *
 * datetime-local values from <input type="datetime-local"> carry no timezone
 * information — they represent wall-clock time in the viewer's local zone.
 * This helper interprets the value in the provided `tz` IANA identifier and
 * returns the equivalent UTC instant as an ISO string.
 *
 * @param v  The datetime-local string, e.g. "2026-08-01T14:30"
 * @param tz An IANA timezone identifier, e.g. "Africa/Nairobi"
 * @returns  UTC ISO-8601 string, or null if input is empty / malformed
 */
export function localInputToIso(v: string, tz: string): string | null {
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
