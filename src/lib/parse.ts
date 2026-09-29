/** Field parsers for the raw CSV. Pure functions; anything unparseable returns null or throws, never guesses. */

export const MIN_VALID_PRICE_NIS = 300_000;

export function cleanText(raw: string | undefined | null): string | null {
  const s = (raw ?? "").replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/** `3054000`, `"4,331,000"`, `"₪12,144,000"` → int. Empty / non-numeric → null. Range check is the caller's job. */
export function parsePrice(raw: string | undefined | null): number | null {
  const s = (raw ?? "").replace(/[₪,\s]/g, "");
  if (!/^\d+$/.test(s)) return null;
  return Number(s);
}

/** `3.5`, `"4 חדרים"` → first number in the string. */
export function parseRooms(raw: string | undefined | null): number | null {
  const m = /\d+(\.\d+)?/.exec(raw ?? "");
  return m ? Number(m[0]) : null;
}

export function parseIntOrNull(raw: string | undefined | null): number | null {
  const s = (raw ?? "").trim();
  return /^\d+$/.test(s) ? Number(s) : null;
}

const TRUE_WORDS = new Set(["כן", "yes", "true", "1"]);
const FALSE_WORDS = new Set(["לא", "no", "false", "0"]);

export function parseBool(raw: string | undefined | null): boolean | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "") return null;
  if (TRUE_WORDS.has(s)) return true;
  if (FALSE_WORDS.has(s)) return false;
  throw new Error(`Unrecognized boolean value: "${raw}"`);
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoDay(year: number, month: number, day: number, raw: string): string {
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Invalid calendar date: "${raw}"`);
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * `2025-09-07`, `15/06/2025`, `17.07.2026` → day precision. `Aug 2025` → month precision.
 * Slash and dot dates are DD/MM/YYYY (DILEMMAS #9). Never goes through `new Date(string)`:
 * it reads "04/05/2026" as April 5th.
 */
export function parseDate(raw: string): { date: string; precision: "day" | "month" } {
  const s = raw.trim();
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) {
    return { date: isoDay(+m[1], +m[2], +m[3], raw), precision: "day" };
  }
  if ((m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s))) {
    return { date: isoDay(+m[3], +m[2], +m[1], raw), precision: "day" };
  }
  if ((m = /^([A-Za-z]{3}) (\d{4})$/.exec(s))) {
    const month = MONTHS[m[1].toLowerCase()];
    if (month) return { date: `${m[2]}-${pad(month)}`, precision: "month" };
  }
  throw new Error(`Unrecognized date format: "${raw}"`);
}
