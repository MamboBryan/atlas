import type { SheetGrid } from "@/lib/sheets/types";

/**
 * RFC-4180-ish CSV parser: quoted fields may contain commas, newlines, and
 * escaped double-quotes (""). Strips a leading UTF-8 BOM. Handles CRLF and LF.
 * First non-empty row = headers; subsequent rows are padded/truncated to
 * header width; fully-blank rows are filtered out — mirrors the shape
 * readSheet() returns.
 */
export function parseCsv(text: string): SheetGrid {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = src.length;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      pushField();
      i++;
      continue;
    }
    if (ch === "\r") {
      if (src[i + 1] === "\n") i++;
      pushRow();
      i++;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // Final field/row (file may or may not end with a newline).
  if (field.length > 0 || row.length > 0) pushRow();

  const nonEmpty = rows.filter((r) => r.some((c) => (c ?? "").trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((h) => (h ?? "").trim());
  const width = headers.length;
  const dataRows = nonEmpty.slice(1).map((r) => {
    const padded = r.slice(0, width);
    while (padded.length < width) padded.push("");
    return padded.map((c) => c ?? "");
  });
  return { headers, rows: dataRows };
}
