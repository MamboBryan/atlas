import { RRule } from "rrule";
import { DateTime } from "luxon";

export function nextOccurrences(
  rrule: string,
  tz: string,
  since: Date,
  until: Date,
): Date[] {
  const sinceLocal = DateTime.fromJSDate(since).setZone(tz);
  const untilLocal = DateTime.fromJSDate(until).setZone(tz);

  const dtstart = sinceLocal.toFormat("yyyyLLdd'T'HHmmss");
  const rule = RRule.fromString(`DTSTART:${dtstart}\nRRULE:${rrule}`);

  const sinceFloat = new Date(
    Date.UTC(
      sinceLocal.year,
      sinceLocal.month - 1,
      sinceLocal.day,
      sinceLocal.hour,
      sinceLocal.minute,
      sinceLocal.second,
    ),
  );
  const untilFloat = new Date(
    Date.UTC(
      untilLocal.year,
      untilLocal.month - 1,
      untilLocal.day,
      untilLocal.hour,
      untilLocal.minute,
      untilLocal.second,
    ),
  );

  const raw = rule.between(sinceFloat, untilFloat, true);
  return raw.map((d) =>
    DateTime.fromObject(
      {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        hour: d.getUTCHours(),
        minute: d.getUTCMinutes(),
        second: d.getUTCSeconds(),
      },
      { zone: tz },
    ).toJSDate(),
  );
}
