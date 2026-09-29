import { describe, expect, it } from "vitest";
import { checkNumbers, extractNumbers, latinLeaks } from "../src/lib/numberGuard";

describe("extractNumbers", () => {
  it.each([
    ["4,200,000 ₪", [4_200_000]],
    ["4.2 מיליון", [4_200_000]],
    ["45 אלף", [45_000]],
    ["41.2 אלף ₪ למ\"ר", [41_200]],
    ["חצי מיליון", [500_000]],
    ["רבע מיליון", [250_000]],
    ["בין 4.1–4.6 מיליון ₪", [4_100_000, 4_600_000]],
    ["מ-3.9 עד 4.4 מיליון", [3_900_000, 4_400_000]],
    ["כ-9 עסקאות בשכונה", [9]],
    ["בשנת 2022, ב-3 מקרים.", [2022, 3]],
    ["מיליון", [1_000_000]],
    ["אין כאן מספרים", []],
  ])("%s", (text, expected) => expect(extractNumbers(text)).toEqual(expected));

  it("ignores receipt codes and deal ids (their digits are identifiers, not claims)", () => {
    expect(extractNumbers("קוד R-7F3K2A, עסקה D100124")).toEqual([]);
  });

  it("a trailing comma or period is punctuation, not part of the number", () => {
    expect(extractNumbers("המחיר 4,200,000, או 3.5.")).toEqual([4_200_000, 3.5]);
  });

  it("works next to Hebrew letters (no \\b)", () => {
    expect(extractNumbers("ב-45אלף")).toEqual([45_000]);
    expect(extractNumbers("ל-12 שנים")).toEqual([12]);
  });
});

describe("latinLeaks", () => {
  it("finds English words but not identifiers or R&D", () => {
    expect(latinLeaks("המדגם sample קטן")).toEqual(["sample"]);
    expect(latinLeaks("עסקה D100124 בקוד R-7F3K2A, פנו ל-R&D")).toEqual([]);
    expect(latinLeaks("טקסט עברי רגיל, 4.2 מיליון")).toEqual([]);
  });
});

describe("checkNumbers", () => {
  const facts = {
    rangeLow: "4,100,000",
    rangeHigh: "4,600,000",
    median: 41_200,
    n: 9,
    dateFrom: "2022-01",
    level: "L3",
    sources: { tax: "60%" },
    reasons: ["רק 9 עסקאות", "הורחב לכל העיר"],
  };

  it("accepts text whose numbers all come from the facts", () => {
    const text = "לפי 9 עסקאות מאז 2022, הטווח הוא 4.1 עד 4.6 מיליון ₪, והחציון 41,200 ₪ למ\"ר.";
    expect(checkNumbers(text, facts)).toEqual({ ok: true });
  });

  it("rejects an invented number and reports it", () => {
    const r = checkNumbers("המחיר הוא כ-4,350,000 ₪.", facts);
    expect(r).toEqual({ ok: false, badNumbers: [4_350_000] });
  });

  it("accepts commas vs no commas, and a scale word vs the full number", () => {
    expect(checkNumbers("4100000", facts).ok).toBe(true);
    expect(checkNumbers("4.1 מיליון", facts).ok).toBe(true);
    expect(checkNumbers("41.2 אלף", facts).ok).toBe(true);
    expect(checkNumbers("41,200", { median: "41200" }).ok).toBe(true);
  });

  it("allows rounding within 1%, but not beyond", () => {
    expect(checkNumbers("4.12 מיליון", facts).ok).toBe(true); // 0.5% off 4.1M
    expect(checkNumbers("4.2 מיליון", facts).ok).toBe(false); // 2.4% off
  });

  it("small counts must match exactly", () => {
    expect(checkNumbers("9 עסקאות", facts).ok).toBe(true);
    expect(checkNumbers("8 עסקאות", facts).ok).toBe(false);
    expect(checkNumbers("10 עסקאות", facts).ok).toBe(false);
  });

  it("numbers inside fact strings count (percentages, years, counts in reasons)", () => {
    expect(checkNumbers("60% מהעסקאות, מאז 2022", facts).ok).toBe(true);
  });

  it("rejects the number words the extractor can see, e.g. half a million that isn't in the facts", () => {
    expect(checkNumbers("בערך חצי מיליון", facts).ok).toBe(false);
  });

  it("text with no numbers is fine", () => {
    expect(checkNumbers("אין מספיק עסקאות כדי לתת טווח.", facts).ok).toBe(true);
  });

  it("extra allowed text (the customer's complaint) lets the answer repeat their number", () => {
    const complaint = "מכרתי ב-5.2 מיליון";
    expect(checkNumbers("ציינת מכירה של 5.2 מיליון", facts).ok).toBe(false);
    expect(checkNumbers("ציינת מכירה של 5.2 מיליון", facts, [complaint]).ok).toBe(true);
  });

  it("the simulated hallucination is rejected", () => {
    expect(checkNumbers("לפי הנתונים המחיר הוא כ-7,777,777 ₪ למ״ר.", facts).ok).toBe(false);
  });
});
