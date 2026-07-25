"use server";

import { createSeriesAction as _create } from "@/lib/actions/series";

/**
 * Thin wrapper consumed by the NewSeriesForm Sheet.
 * Accepts a plain object with the series fields and returns { error?, id? }.
 */
export async function createSeriesAction(payload: {
  name: string;
  description: string | null;
  rrule: string;
  timezone: string;
  rotation_order: string[];
  default_participant_ids: string[] | null;
  agenda_template: { kind: string; title: string }[];
}): Promise<{ error?: string; id?: string }> {
  const res = await _create(payload);
  if (!res.ok) return { error: res.error.message };
  return { id: res.data.id };
}
