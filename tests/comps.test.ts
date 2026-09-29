import { describe, expect, it } from "vitest";
import { compareAreas, findComps } from "../src/lib/comps";
import type { CompsQuery } from "../src/lib/comps";
import type { Deal, Flag } from "../src/lib/types";

const AS_OF = "2026-07-26";
let seq = 0;

/** Small fixture factory: pass the ₪/m² you want and the price is derived from size. */
function deal(o: Partial<Deal> & { ppsqm?: number | null } = {}): Deal {
  const { ppsqm = 40_000, ...rest } = o;
  const sizeSqm = rest.sizeSqm === undefined ? 100 : rest.sizeSqm;
  return {
    id: `T${++seq}`,
    city: "עיר",
    neighborhood: "א",
    street: null,
    type: "דירה",
    rooms: 4,
    sizeSqm,
    floor: 2,
    totalFloors: 5,
    yearBuilt: 2000,
    condition: null,
    elevator: null, parking: null, balcony: null, safeRoom: null,
    date: "2026-03-01",
    datePrecision: "day",
    priceNis: ppsqm !== null && sizeSqm ? ppsqm * sizeSqm : null,
    pricePerSqm: ppsqm,
    source: "רשות המסים",
    status: "ok",
    flags: [] as Flag[],
    ...rest,
  };
}

const many = (ppsqms: number[], o: Partial<Deal> = {}) => ppsqms.map((p) => deal({ ppsqm: p, ...o }));

const query = (o: Partial<CompsQuery> = {}): CompsQuery => ({
  city: "עיר", neighborhood: "א", propertyType: "דירה", rooms: 4, sizeSqm: 100, askingPriceNis: null, ...o,
});

describe("stats", () => {
  it("odd n: median and quartiles", () => {
    const r = findComps(many([10, 20, 30, 40, 50].map((k) => k * 1000)), query(), AS_OF);
    expect(r.stats).toMatchObject({ n: 5, median: 30_000, p25: 20_000, p75: 40_000, min: 10_000, max: 50_000 });
  });

  it("even n: median is the mean of the middle two", () => {
    const r = findComps(many([10, 20, 30, 40, 50, 60].map((k) => k * 1000)), query(), AS_OF);
    expect(r.stats?.median).toBe(35_000);
    expect(r.stats?.p25).toBe(22_500);
    expect(r.stats?.p75).toBe(47_500);
  });

  it("price range is p25 × size to p75 × size, rounded to ₪10K", () => {
    const r = findComps(many([31_234, 32_000, 33_000, 34_000, 35_678]), query({ sizeSqm: 100 }), AS_OF);
    expect(r.priceRange).toEqual({ low: 3_200_000, high: 3_400_000 });
  });

  it("no size → no price range", () => {
    const r = findComps(many([1, 2, 3, 4, 5].map((k) => k * 10_000)), query({ sizeSqm: null }), AS_OF);
    expect(r.status).toBe("ok");
    expect(r.priceRange).toBeNull();
  });

  it("source share and date range", () => {
    const deals = [
      deal({ date: "2024-01-10" }),
      deal({ date: "2026-05-01" }),
      deal({ source: "מתווך" }),
      deal({ source: "בעל נכס" }),
      deal({}),
    ];
    const s = findComps(deals, query(), AS_OF).stats!;
    expect(s.dateFrom).toBe("2024-01-10");
    expect(s.dateTo).toBe("2026-05-01");
    expect(s.sourceShare["רשות המסים"]).toBeCloseTo(0.6);
    expect(s.sourceShare["מתווך"]).toBeCloseTo(0.2);
  });
});

describe("widening ladder", () => {
  it("stops at L1 when the neighborhood has enough close matches", () => {
    const r = findComps(many([40_000, 41_000, 42_000, 43_000, 44_000]), query(), AS_OF);
    expect(r.level).toBe("L1");
  });

  it("L2: relaxes rooms and size but stays in the neighborhood", () => {
    // 4 exact matches + 1 with 5 rooms and 150 m²: fails L1 (rooms ±0.5, size ±25%), passes L2 (rooms ±1)
    const deals = [...many([40_000, 41_000, 42_000, 43_000]), deal({ ppsqm: 44_000, rooms: 5, sizeSqm: 150 })];
    const r = findComps(deals, query(), AS_OF);
    expect(r.level).toBe("L2");
    expect(r.stats?.n).toBe(5);
  });

  it("L3: goes to the whole city, and says so in the filters and confidence", () => {
    const deals = [...many([40_000, 41_000], { neighborhood: "א" }), ...many([42_000, 43_000, 44_000], { neighborhood: "ב" })];
    const r = findComps(deals, query(), AS_OF);
    expect(r.level).toBe("L3");
    expect(r.filtersApplied[0]).toContain("כל העיר");
    expect(r.confidence.level).toBe("low");
    expect(r.confidence.reasons).toContain("הורחב לכל העיר");
  });

  it("L4: any property type, rooms ±1", () => {
    const deals = [
      ...many([40_000, 41_000], { neighborhood: "ב" }),
      ...many([42_000, 43_000, 44_000], { neighborhood: "ב", type: "בית פרטי", rooms: 5 }),
    ];
    const r = findComps(deals, query(), AS_OF);
    expect(r.level).toBe("L4");
    expect(r.filtersApplied).toContain("כל סוגי הנכסים");
    expect(r.confidence.level).toBe("low");
  });

  it("no neighborhood in the query starts at the city level, and that is not treated as widening", () => {
    const r = findComps(many([40_000, 41_000, 42_000, 43_000, 44_000, 45_000, 46_000, 47_000, 48_000, 49_000]), query({ neighborhood: null }), AS_OF);
    expect(r.level).toBe("L3");
    expect(r.confidence.reasons).not.toContain("הורחב לכל העיר");
  });

  it("filters that are null in the query are skipped", () => {
    const r = findComps(many([1, 2, 3, 4, 5].map((k) => k * 10_000), { rooms: 2, sizeSqm: 50, type: "בית פרטי" }), query({ propertyType: null, rooms: null, sizeSqm: null }), AS_OF);
    expect(r.level).toBe("L1");
    expect(r.stats?.n).toBe(5);
  });

  it("property-type groups: a penthouse query doesn't pull regular apartments before L4", () => {
    const deals = [...many([40_000, 41_000, 42_000, 43_000, 44_000]), ...many([90_000, 91_000], { type: "פנטהאוז" })];
    const r = findComps(deals, query({ propertyType: "פנטהאוז" }), AS_OF);
    expect(r.level).toBe("L4");
    expect(r.deals.map((d) => d.type)).toContain("פנטהאוז");
  });

  it("is a different city → never used", () => {
    const r = findComps(many([1, 2, 3, 4, 5].map((k) => k * 10_000), { city: "אחרת" }), query(), AS_OF);
    expect(r.status).toBe("insufficient");
    expect(r.deals).toHaveLength(0);
  });
});

describe("insufficient", () => {
  it("4 matches at every level → insufficient, no numbers, but the deals are listed", () => {
    const r = findComps(many([40_000, 41_000, 42_000, 43_000]), query(), AS_OF);
    expect(r.status).toBe("insufficient");
    expect(r.level).toBe("L4");
    expect(r.stats).toBeNull();
    expect(r.priceRange).toBeNull();
    expect(r.askingPosition).toBeNull();
    expect(r.deals).toHaveLength(4);
    expect(r.confidence.level).toBe("low");
  });
});

describe("excluded deals", () => {
  it("an outlier that matches the filters is listed as excluded and not in stats", () => {
    const outlier = deal({ id: "OUT", ppsqm: 145_000, status: "excluded", flags: ["outlier_price"] });
    const r = findComps([...many([40_000, 41_000, 42_000, 43_000, 44_000]), outlier], query(), AS_OF);
    expect(r.deals.map((d) => d.id)).not.toContain("OUT");
    expect(r.stats?.max).toBe(44_000);
    expect(r.excluded).toEqual([{ deal: expect.objectContaining({ id: "OUT" }), reason: "outlier_price" }]);
  });

  it("invalid price, conflicting duplicate and missing size are listed with their reason; exact duplicates are not", () => {
    const extras = [
      deal({ id: "INV", ppsqm: null, priceNis: null, status: "excluded", flags: ["invalid_price"] }),
      deal({ id: "CONF", status: "excluded", flags: ["conflicting_duplicate"], keptPriceNis: 4_000_000 }),
      deal({ id: "NOSIZE", ppsqm: null, sizeSqm: null, flags: ["missing_size"] }),
      deal({ id: "DUP", status: "excluded", flags: ["exact_duplicate"] }),
    ];
    const r = findComps([...many([40_000, 41_000, 42_000, 43_000, 44_000]), ...extras], query(), AS_OF);
    expect(Object.fromEntries(r.excluded.map((e) => [e.deal.id, e.reason]))).toEqual({
      INV: "invalid_price",
      CONF: "conflicting_duplicate",
      NOSIZE: "missing_size",
    });
    expect(r.excluded.find((e) => e.deal.id === "CONF")?.deal.keptPriceNis).toBe(4_000_000);
  });

  it("excluded deals that don't match the filters are not listed", () => {
    const far = deal({ id: "FAR", rooms: 1, status: "excluded", flags: ["outlier_price"] });
    const r = findComps([...many([40_000, 41_000, 42_000, 43_000, 44_000]), far], query(), AS_OF);
    expect(r.excluded).toHaveLength(0);
  });
});

describe("confidence", () => {
  const tight = (n: number, o: Partial<Deal> = {}) =>
    many(Array.from({ length: n }, (_, i) => 40_000 + i * 200), o);

  it("high: n ≥ 10, tight, mostly tax authority, not widened", () => {
    const r = findComps(tight(12), query(), AS_OF);
    expect(r.confidence.level).toBe("high");
    expect(r.confidence.reasons.length).toBeGreaterThan(0);
  });

  it("medium: fine, but fewer than 10 deals", () => {
    const r = findComps(tight(9), query(), AS_OF);
    expect(r.confidence.level).toBe("medium");
    expect(r.confidence.reasons).toContain("9 עסקאות בלבד");
  });

  it("medium: enough deals but mostly brokers", () => {
    const r = findComps(tight(12, { source: "מתווך" }), query(), AS_OF);
    expect(r.confidence.level).toBe("medium");
    expect(r.confidence.reasons).toContain("פחות מ-60% מהעסקאות מדווחות על ידי רשות המסים");
  });

  it("low: fewer than 8 deals", () => {
    const r = findComps(tight(6), query(), AS_OF);
    expect(r.confidence.level).toBe("low");
    expect(r.confidence.reasons).toContain("רק 6 עסקאות");
  });

  it("low: very wide spread", () => {
    const r = findComps(many([20_000, 30_000, 40_000, 50_000, 60_000, 25_000, 55_000, 35_000, 45_000, 65_000]), query(), AS_OF);
    expect(r.confidence.level).toBe("low");
    expect(r.confidence.reasons).toContain("פיזור מחירים גדול בין העסקאות");
  });

  it("low: median deal is older than 3 years", () => {
    const r = findComps(tight(12, { date: "2022-01-01" }), query(), AS_OF);
    expect(r.confidence.level).toBe("low");
    expect(r.confidence.reasons.some((x) => x.includes("3 שנים"))).toBe(true);
  });
});

describe("asking price position", () => {
  const deals = many([30, 35, 40, 45, 50].map((k) => k * 1000)); // p25 35K, p75 45K
  it.each([
    [3_000_000, "below"],
    [4_000_000, "within"],
    [3_500_000, "within"],
    [5_000_000, "above"],
  ])("asking %i on 100 m² → %s", (asking, expected) => {
    const r = findComps(deals, query({ askingPriceNis: asking }), AS_OF);
    expect(r.askingPosition).toBe(expected);
    expect(r.askingPricePerSqm).toBe(asking / 100);
  });

  it("asking price without size adds a note and no position", () => {
    const r = findComps(deals, query({ askingPriceNis: 4_000_000, sizeSqm: null }), AS_OF);
    expect(r.askingPosition).toBeNull();
    expect(r.notes).toHaveLength(1);
  });
});

describe("compare", () => {
  const deals = [
    ...many([50, 51, 52, 53, 54].map((k) => k * 1000), { city: "יקרה" }),
    ...many([25, 26, 27, 28, 29].map((k) => k * 1000), { city: "זולה" }),
    ...many([30, 31], { city: "דלילה" }),
  ];
  const q = (city: string) => query({ city, neighborhood: null, rooms: null, sizeSqm: null });

  it("ratio of medians and which is higher", () => {
    const r = compareAreas(deals, q("יקרה"), q("זולה"), AS_OF);
    expect(r.higher).toBe(0);
    expect(r.ratio).toBeCloseTo(52 / 27);
  });

  it("no ratio when one side has too few deals", () => {
    const r = compareAreas(deals, q("יקרה"), q("דלילה"), AS_OF);
    expect(r.ratio).toBeNull();
    expect(r.higher).toBeNull();
    expect(r.areas[1].status).toBe("insufficient");
  });
});

describe("determinism", () => {
  it("same input → deep-equal output, and input order doesn't matter", () => {
    const deals = many([40_000, 41_000, 42_000, 43_000, 44_000, 45_000]);
    const a = findComps(deals, query(), AS_OF);
    const b = findComps(deals, query(), AS_OF);
    const c = findComps([...deals].reverse(), query(), AS_OF);
    expect(b).toEqual(a);
    expect(c.deals.map((d) => d.id).sort()).toEqual(a.deals.map((d) => d.id).sort());
    expect(c.stats).toEqual(a.stats);
  });
});
