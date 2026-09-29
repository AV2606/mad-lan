export type RawRow = Record<string, string>;

/** Minimal RFC-4180 reader: quoted fields, "" escapes, CRLF or LF. Returns one object per data row, keyed by header. */
export function parseCsv(text: string): RawRow[] {
  const src = text.replace(/^﻿/, "");
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      records.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  const [header, ...data] = records;
  return data
    .filter((r) => !(r.length === 1 && r[0] === ""))
    .map((r) => {
      if (r.length !== header.length) {
        throw new Error(`CSV row has ${r.length} fields, expected ${header.length}: ${r.join(",").slice(0, 80)}`);
      }
      return Object.fromEntries(header.map((h, i) => [h, r[i]]));
    });
}
