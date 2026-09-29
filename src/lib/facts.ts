import type { CompareResult, CompsQuery, CompsResult, Level } from "./comps";
import { SOURCES } from "./types";

/**
 * Facts = display-ready values (already formatted strings/counts) built from a CompsResult.
 * They are the ONLY input the narration model sees, and the allowed-number list for the number guard.
 */

export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
export const fmtNis = (n: number) => `${fmtInt(n)} ₪`;
/** "2022-01-15" → "01/2022"; "2022-01" → "01/2022" */
export const fmtMonth = (date: string) => `${date.slice(5, 7)}/${date.slice(0, 4)}`;
const fmtPercent = (share: number) => `${Math.round(share * 100)}%`;

export const CONFIDENCE_HE = { high: "גבוהה", medium: "בינונית", low: "נמוכה" } as const;
export const POSITION_HE = {
  below: "מתחת לרוב העסקאות המקבילות",
  within: "בתוך טווח המחירים שבו נמצאות רוב העסקאות המקבילות",
  above: "מעל לרוב העסקאות המקבילות",
} as const;

export function areaLabel(city: string, neighborhood: string | null): string {
  return neighborhood ? `${neighborhood}, ${city}` : city;
}

export function levelNote(level: Level, q: Pick<CompsQuery, "neighborhood">): string {
  const hasHood = q.neighborhood !== null;
  switch (level) {
    case "L1":
      return "השוואה לעסקאות בשכונה עם מספר חדרים ושטח דומים";
    case "L2":
      return "השוואה לעסקאות בשכונה עם טווח רחב יותר של חדרים ושטח";
    case "L3":
      return hasHood ? "לא היו מספיק עסקאות בשכונה, ולכן הרחבנו את ההשוואה לכל העיר" : "השוואה לעסקאות דומות בכל העיר";
    case "L4":
      return hasHood
        ? "לא היו מספיק עסקאות בשכונה, ולכן הרחבנו לכל העיר וגם לסוגי נכסים אחרים"
        : "לא היו מספיק עסקאות דומות, ולכן הרחבנו גם לסוגי נכסים אחרים";
  }
}

export type EstimateFacts = {
  kind: "estimate";
  area: string;
  status: "ok" | "insufficient";
  requested: { rooms: number | null; sizeSqm: number | null; propertyType: string | null; askingPriceEnteredByUser: string | null };
  /** number of deals found (used for stats when ok; nearby but too few when insufficient) */
  dealsFound: number;
  minDeals: number;
  levelNote: string;
  widened: boolean;
  medianPerSqm: string | null;
  typicalLowPerSqm: string | null;
  typicalHighPerSqm: string | null;
  rangeLow: string | null;
  rangeHigh: string | null;
  askingPerSqm: string | null;
  askingPosition: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  taxAuthorityShare: string | null;
  confidence: string;
  confidenceReasons: string[];
  excludedCount: number;
  notes: string[];
};

export type CompareFacts = {
  kind: "compare";
  a: EstimateFacts;
  b: EstimateFacts;
  /** how much higher the pricier area's median is, in percent; null when either side is insufficient */
  higherArea: string | null;
  differencePercent: string | null;
};

export type Facts = EstimateFacts | CompareFacts;

export function estimateFacts(q: CompsQuery, r: CompsResult, minDeals: number): EstimateFacts {
  const s = r.stats;
  return {
    kind: "estimate",
    area: areaLabel(q.city, q.neighborhood),
    status: r.status,
    requested: {
      rooms: q.rooms,
      sizeSqm: q.sizeSqm,
      propertyType: q.propertyType,
      askingPriceEnteredByUser: q.askingPriceNis === null ? null : fmtNis(q.askingPriceNis),
    },
    dealsFound: s ? s.n : r.deals.length,
    minDeals,
    levelNote: levelNote(r.level, q),
    widened: q.neighborhood !== null && (r.level === "L3" || r.level === "L4"),
    medianPerSqm: s ? fmtNis(s.median) : null,
    typicalLowPerSqm: s ? fmtNis(s.p25) : null,
    typicalHighPerSqm: s ? fmtNis(s.p75) : null,
    rangeLow: r.priceRange ? fmtNis(r.priceRange.low) : null,
    rangeHigh: r.priceRange ? fmtNis(r.priceRange.high) : null,
    askingPerSqm: r.askingPricePerSqm === null ? null : fmtNis(r.askingPricePerSqm),
    askingPosition: r.askingPosition ? POSITION_HE[r.askingPosition] : null,
    dateFrom: s ? fmtMonth(s.dateFrom) : null,
    dateTo: s ? fmtMonth(s.dateTo) : null,
    taxAuthorityShare: s ? fmtPercent(s.sourceShare[SOURCES[0]]) : null,
    confidence: CONFIDENCE_HE[r.confidence.level],
    confidenceReasons: r.confidence.reasons,
    excludedCount: r.excluded.length,
    notes: r.notes,
  };
}

export function compareFacts(a: CompsQuery, b: CompsQuery, r: CompareResult, minDeals: number): CompareFacts {
  const fa = estimateFacts(a, r.areas[0], minDeals);
  const fb = estimateFacts(b, r.areas[1], minDeals);
  const diff = r.ratio === null ? null : Math.round((r.ratio >= 1 ? r.ratio - 1 : 1 / r.ratio - 1) * 100);
  return {
    kind: "compare",
    a: fa,
    b: fb,
    higherArea: r.higher === null ? null : r.higher === 0 ? fa.area : fb.area,
    differencePercent: diff === null ? null : `${diff}%`,
  };
}
