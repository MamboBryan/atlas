import type { SheetGrid, DetectedMapping } from "@/lib/sheets/types";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function columnValues(grid: SheetGrid, idx: number): string[] {
  return grid.rows.map((r) => (r[idx] ?? "").trim()).filter(Boolean);
}

export function detectMapping(grid: SheetGrid): DetectedMapping {
  const headers = grid.headers;
  const lower = headers.map((h) => h.toLowerCase());

  const timestampColumn =
    headers[lower.findIndex((h) => /time\s?stamp/.test(h))] ?? null;

  // Email: header match first, else a column whose values look like emails.
  let emailIdx = lower.findIndex((h) => /e-?mail/.test(h));
  if (emailIdx === -1) {
    emailIdx = headers.findIndex((_, i) => {
      const vals = columnValues(grid, i);
      return vals.length > 0 && vals.every((v) => EMAIL_RE.test(v));
    });
  }
  const emailColumn = emailIdx === -1 ? headers[0] : headers[emailIdx];

  const nameIdx = lower.findIndex(
    (h) => /\bname\b/.test(h) && headers[lower.indexOf(h)] !== emailColumn,
  );
  const nameColumn = nameIdx === -1 ? null : headers[nameIdx];

  const identity = new Set(
    [emailColumn, nameColumn, timestampColumn].filter(Boolean) as string[],
  );
  const questionColumns = headers.filter((h) => !identity.has(h));

  return { emailColumn, nameColumn, timestampColumn, questionColumns };
}
