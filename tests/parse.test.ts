import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/lib/csv";
import { cleanText, parseBool, parseDate, parseIntOrNull, parsePrice, parseRooms } from "../src/lib/parse";
import { median, percentile, scaledMad } from "../src/lib/stats";

describe("parsePrice", () => {
  it.each([
    ["3054000", 3054000],
    ["4,331,000", 4331000],
    ["₪12,144,000", 12144000],
    ["0", 0],
    ["18000", 18000],
    ["", null],
    ["abc", null],
  ])("%s → %s", (raw, expected) => expect(parsePrice(raw)).toBe(expected));
});

describe("parseRooms", () => {
  it.each([
    ["3.5", 3.5],
    ["4 חדרים", 4],
    ["5.5 חדרים", 5.5],
    ["", null],
  ])("%s → %s", (raw, expected) => expect(parseRooms(raw)).toBe(expected));
});

describe("parseBool", () => {
  it.each(["כן", "yes", "TRUE", "1"])("%s → true", (raw) => expect(parseBool(raw)).toBe(true));
  it.each(["לא", "no", "FALSE", "0"])("%s → false", (raw) => expect(parseBool(raw)).toBe(false));
  it("empty → null", () => expect(parseBool("")).toBeNull());
  it("unknown value throws instead of guessing", () => expect(() => parseBool("maybe")).toThrow());
});

describe("parseDate", () => {
  it("ISO", () => expect(parseDate("2025-09-07")).toEqual({ date: "2025-09-07", precision: "day" }));
  it("DD/MM/YYYY", () => expect(parseDate("15/06/2025")).toEqual({ date: "2025-06-15", precision: "day" }));
  it("ambiguous 04/05/2026 is 4 May, not April 5", () => expect(parseDate("04/05/2026").date).toBe("2026-05-04"));
  it("DD.MM.YYYY", () => expect(parseDate("17.07.2026")).toEqual({ date: "2026-07-17", precision: "day" }));
  it("Mon YYYY is month precision", () => expect(parseDate("Aug 2025")).toEqual({ date: "2025-08", precision: "month" }));
  it("rejects impossible dates and unknown formats", () => {
    expect(() => parseDate("31/02/2025")).toThrow();
    expect(() => parseDate("2025/01/01")).toThrow();
    expect(() => parseDate("Foo 2025")).toThrow();
  });
});

describe("text and ints", () => {
  it("cleanText trims and collapses whitespace, empty → null", () => {
    expect(cleanText("  אלנבי   ")).toBe("אלנבי");
    expect(cleanText("דירה  ")).toBe("דירה");
    expect(cleanText("  ")).toBeNull();
  });
  it("parseIntOrNull", () => {
    expect(parseIntOrNull("12")).toBe(12);
    expect(parseIntOrNull("")).toBeNull();
  });
});

describe("parseCsv", () => {
  it("handles quoted commas, doubled quotes and empty fields", () => {
    const rows = parseCsv('a,b,c\n"4,331,000","הפלמ""ח",\n1,2,3\n');
    expect(rows).toEqual([
      { a: "4,331,000", b: 'הפלמ"ח', c: "" },
      { a: "1", b: "2", c: "3" },
    ]);
  });
  it("throws on a ragged row", () => expect(() => parseCsv("a,b\n1\n")).toThrow());
});

describe("stats", () => {
  it("median odd / even", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it("percentile interpolates linearly", () => {
    expect(percentile([10, 20, 30, 40, 50], 0.25)).toBe(20);
    expect(percentile([10, 20, 30, 40], 0.25)).toBe(17.5);
    expect(percentile([10, 20, 30, 40], 0.75)).toBe(32.5);
    expect(percentile([7], 0.75)).toBe(7);
  });
  it("scaledMad", () => expect(scaledMad([1, 2, 3, 4, 100])).toBeCloseTo(1.4826, 4));
});
