import { expect, test } from "vitest";
import { parseCsv } from "@/lib/sheets/csv";

test("quoted field containing a comma", () => {
  const text = 'Email,Name,Q1\na@x.com,"Doe, Jane",yes\n';
  expect(parseCsv(text)).toEqual({
    headers: ["Email", "Name", "Q1"],
    rows: [["a@x.com", "Doe, Jane", "yes"]],
  });
});

test("embedded newline inside a quoted field", () => {
  const text = 'Email,Notes\na@x.com,"line one\nline two"\n';
  expect(parseCsv(text)).toEqual({
    headers: ["Email", "Notes"],
    rows: [["a@x.com", "line one\nline two"]],
  });
});

test("escaped double-quotes within a quoted field", () => {
  const text = 'Email,Quote\na@x.com,"She said ""hi"" today"\n';
  expect(parseCsv(text)).toEqual({
    headers: ["Email", "Quote"],
    rows: [["a@x.com", 'She said "hi" today']],
  });
});

test("ragged rows are padded/truncated to header width", () => {
  const text = "Email,Name,Q1\na@x.com,Ann\nb@x.com,Bob,b1,extra\n";
  expect(parseCsv(text)).toEqual({
    headers: ["Email", "Name", "Q1"],
    rows: [
      ["a@x.com", "Ann", ""],
      ["b@x.com", "Bob", "b1"],
    ],
  });
});

test("CRLF line endings", () => {
  const text = "Email,Name\r\na@x.com,Ann\r\nb@x.com,Bob\r\n";
  expect(parseCsv(text)).toEqual({
    headers: ["Email", "Name"],
    rows: [
      ["a@x.com", "Ann"],
      ["b@x.com", "Bob"],
    ],
  });
});

test("strips a leading UTF-8 BOM and filters fully-blank rows", () => {
  const text = "﻿Email,Name\na@x.com,Ann\n,\nb@x.com,Bob\n";
  expect(parseCsv(text)).toEqual({
    headers: ["Email", "Name"],
    rows: [
      ["a@x.com", "Ann"],
      ["b@x.com", "Bob"],
    ],
  });
});
