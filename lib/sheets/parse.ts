import type { SheetGrid, DetectedMapping, NormalizedCandidate, ImportSummary } from "@/lib/sheets/types";

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

export function normalizeRows(
  grid: SheetGrid,
  mapping: {
    emailColumn: string;
    nameColumn: string | null;
    timestampColumn: string | null;
    questionColumns: string[];
  },
): { candidates: NormalizedCandidate[]; summary: ImportSummary } {
  const idx = (h: string) => grid.headers.indexOf(h);
  const emailI = idx(mapping.emailColumn);
  const nameI = mapping.nameColumn ? idx(mapping.nameColumn) : -1;
  const tsI = mapping.timestampColumn ? idx(mapping.timestampColumn) : -1;
  const qCols = mapping.questionColumns.map((h) => ({ key: h, i: idx(h) }));

  const byEmail = new Map<string, NormalizedCandidate>();
  const dupes = new Set<string>();
  let skipped = 0;

  for (const row of grid.rows) {
    const email = (row[emailI] ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      skipped++;
      continue;
    }
    if (byEmail.has(email)) dupes.add(email);
    const nameVal = nameI >= 0 ? (row[nameI] ?? "").trim() : "";
    byEmail.set(email, {
      email,
      displayName: nameVal || email.split("@")[0],
      submittedAt: tsI >= 0 ? (row[tsI] ?? "").trim() || null : null,
      answers: qCols.map((q) => ({ columnKey: q.key, text: (row[q.i] ?? "").trim() })),
    });
  }

  const summary: ImportSummary = {
    candidatesSeen: byEmail.size,
    rowsSkipped: skipped ? [{ reason: "missing_or_invalid_email", count: skipped }] : [],
    duplicateEmails: [...dupes],
    questionColumns: mapping.questionColumns,
  };
  return { candidates: [...byEmail.values()], summary };
}
