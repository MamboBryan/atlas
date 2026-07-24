export type PickResult = {
  host: string | null;
  nextCursor: number;
  skipped: string[];
};

export function pickNextHost(
  order: string[],
  cursor: number,
  isUnavailable: (id: string) => boolean,
): PickResult {
  const n = order.length;
  const skipped: string[] = [];
  for (let step = 0; step < n; step++) {
    const idx = (cursor + step) % n;
    const id = order[idx];
    if (!isUnavailable(id))
      return { host: id, nextCursor: (idx + 1) % n, skipped };
    skipped.push(id);
  }
  return { host: null, nextCursor: cursor % n, skipped };
}
