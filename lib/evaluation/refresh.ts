// Partition non-identity sheet headers for a refresh re-sync, preserving the
// per-field state owners set in the Fields tab: disabled fields are excluded
// (syncEvaluation then deactivates them), hidden fields stay hidden, and new or
// visible fields become rated questions.
export function partitionRefreshColumns(
  existing: { column_key: string; is_active: boolean; is_hidden: boolean }[],
  nonIdentityHeaders: string[],
): { questionColumns: string[]; hiddenColumns: string[] } {
  const byKey = new Map(existing.map((q) => [q.column_key, q]));
  const questionColumns: string[] = [];
  const hiddenColumns: string[] = [];
  for (const h of nonIdentityHeaders) {
    const q = byKey.get(h);
    if (q && !q.is_active) continue;
    if (q && q.is_hidden) hiddenColumns.push(h);
    else questionColumns.push(h);
  }
  return { questionColumns, hiddenColumns };
}
