import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Read every value of `column` from `table`, paginated. Returns the raw string
 * values (e.g. ISO timestamps). Non-null values only.
 */
export async function pageAll(
  client: SupabaseClient,
  table: string,
  column: string,
): Promise<string[]> {
  const pageSize = 1000;
  const out: string[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from(table)
      .select(column)
      .range(from, from + pageSize - 1);
    if (error)
      throw new Error(
        `Thamani ${table}.${column} read failed: ${error.message}`,
      );
    const rows = (data ?? []) as unknown as Record<string, string | null>[];
    for (const r of rows) {
      const v = r[column];
      if (v) out.push(v);
    }
    if (rows.length < pageSize) break;
  }
  return out;
}
