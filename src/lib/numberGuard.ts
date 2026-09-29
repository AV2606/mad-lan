/**
 * The number guard: every number in LLM-written text must exist in the facts the code computed.
 * Strict on purpose (DILEMMAS #14): a false rejection costs a less pretty sentence,
 * a false acceptance puts an invented number in front of a customer.
 */

const SCALE: Record<string, number> = { "אלף": 1_000, "מיליון": 1_000_000, "מיליארד": 1_000_000_000 };
const FRACTION_WORD: Record<string, number> = { "חצי": 0.5, "רבע": 0.25 };
const NOT_HEBREW_LETTER = "(?![\\u05D0-\\u05EA])";
const SCALE_WORDS = "(אלף|מיליון|מיליארד)" + NOT_HEBREW_LETTER;
// No \b: word boundaries don't work with Hebrew letters in JS regexes.
const NUMBER = "\\d+(?:,\\d{3})*(?:\\.\\d+)?";

// Receipt codes (R-7F3K2A) and deal ids (D100124) contain digits that are identifiers, not claims.
const IDENTIFIERS = /R-[0-9A-Za-z]{6}|D\d{6}/g;

const toNumber = (s: string) => Number(s.replace(/,/g, ""));
/** 4.1 * 1e6 is 4099999.9999999995 in floating point; round the noise away. */
const scaled = (n: number, scale: number) => Math.round(n * scale * 1e4) / 1e4;

/** Every number the text claims, with scale words applied: "4.2 מיליון" → 4200000, "חצי מיליון" → 500000. */
export function extractNumbers(text: string): number[] {
  let rest = text.replace(IDENTIFIERS, " ");
  const found: number[] = [];

  // ranges with one shared scale word: "4.1–4.6 מיליון" → both are millions
  rest = rest.replace(
    new RegExp(`(${NUMBER})\\s*(?:-|–|—|עד)\\s*(${NUMBER})\\s*${SCALE_WORDS}`, "g"),
    (_m, a: string, b: string, scale: string) => {
      found.push(scaled(toNumber(a), SCALE[scale]), scaled(toNumber(b), SCALE[scale]));
      return " ";
    },
  );

  // "חצי מיליון", "רבע מיליון"
  rest = rest.replace(new RegExp(`(חצי|רבע)\\s+${SCALE_WORDS}`, "g"), (_m, frac: string, scale: string) => {
    found.push(scaled(FRACTION_WORD[frac], SCALE[scale]));
    return " ";
  });

  // digits, optionally followed by a scale word
  rest = rest.replace(new RegExp(`(${NUMBER})(?:\\s*${SCALE_WORDS})?`, "g"), (_m, n: string, scale?: string) => {
    found.push(scaled(toNumber(n), scale ? SCALE[scale] : 1));
    return " ";
  });

  // a bare scale word ("מיליון") still claims a number
  rest.replace(new RegExp(SCALE_WORDS, "g"), (_m, scale: string) => {
    found.push(SCALE[scale]);
    return " ";
  });

  return found;
}

/** All numbers appearing anywhere in a facts object: numeric values, and digits inside strings. */
export function collectAllowed(facts: unknown): number[] {
  const out: number[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
    else if (typeof v === "string") out.push(...extractNumbers(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(facts);
  return out;
}

const close = (a: number, b: number) => a === b || Math.abs(a - b) <= 0.01 * Math.max(Math.abs(a), Math.abs(b));

/** English words leaking into Hebrew text ("sample קטן"). Identifiers and "R&D" are fine. */
export function latinLeaks(text: string): string[] {
  return text.replace(IDENTIFIERS, " ").replace(/R&D/g, " ").match(/[A-Za-z]{2,}/g) ?? [];
}

export type GuardResult = { ok: true } | { ok: false; badNumbers: number[] };

/**
 * `extraAllowedText`: other text whose numbers the answer may repeat (F5: the customer's own complaint).
 * Small counts (≤ 10) must match exactly; larger numbers may differ by up to 1% (rounding).
 */
export function checkNumbers(text: string, facts: unknown, extraAllowedText: string[] = []): GuardResult {
  const allowed = [...collectAllowed(facts), ...extraAllowedText.flatMap(extractNumbers)];
  const bad = extractNumbers(text).filter((n) => !allowed.some((a) => (n <= 10 ? n === a : close(n, a))));
  return bad.length === 0 ? { ok: true } : { ok: false, badNumbers: [...new Set(bad)] };
}
