import { median, percentile } from "./stats";
import type { Deal, Flag, PropertyType, Source } from "./types";

// ---------- types ----------

export type CompsQuery = {
  city: string;
  neighborhood: string | null;
  propertyType: PropertyType | null;
  rooms: number | null;
  sizeSqm: number | null;
  askingPriceNis: number | null;
};

export type DealSummary = Pick<
  Deal,
  | "id" | "city" | "neighborhood" | "street" | "type" | "rooms" | "sizeSqm" | "floor" | "totalFloors"
  | "yearBuilt" | "condition" | "date" | "datePrecision" | "priceNis" | "pricePerSqm" | "source" | "flags" | "keptPriceNis"
>;

export type Level = "L1" | "L2" | "L3" | "L4";

export type CompsStats = {
  n: number;
  median: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
  dateFrom: string;
  dateTo: string;
  /** fraction of the used deals per source, 0..1 */
  sourceShare: Record<Source, number>;
};

export type Confidence = { level: "high" | "medium" | "low"; reasons: string[] };

export type CompsResult = {
  status: "ok" | "insufficient";
  level: Level;
  filtersApplied: string[];
  deals: DealSummary[];
  excluded: { deal: DealSummary; reason: Flag }[];
  stats: CompsStats | null;
  priceRange: { low: number; high: number } | null;
  askingPricePerSqm: number | null;
  askingPosition: "below" | "within" | "above" | null;
  confidence: Confidence;
  notes: string[];
};

export type CompareResult = {
  areas: [CompsResult, CompsResult];
  /** median ₪/m² of area 0 divided by area 1; null unless both have status ok */
  ratio: number | null;
  higher: 0 | 1 | null;
};

// ---------- constants ----------

export const MIN_DEALS = 5;
const PRICE_ROUNDING_NIS = 10_000;
const HIGH_MIN_N = 10;
const LOW_MAX_N = 8;
const HIGH_MAX_SPREAD = 0.25;
const LOW_MIN_SPREAD = 0.4;
const HIGH_MIN_TAX_SHARE = 0.6;
const OLD_MEDIAN_DEAL_YEARS = 3;

const TYPE_GROUPS: PropertyType[][] = [
  ["דירה", "דירת גן", "דופלקס"],
  ["דירת גג", "פנטהאוז"],
  ["בית פרטי"],
];
const groupOf = (t: PropertyType) => TYPE_GROUPS.find((g) => g.includes(t)) as PropertyType[];

type LevelSpec = { id: Level; area: "neighborhood" | "city"; sameGroup: boolean; roomsTol: number; sizeTol: number | null };
const LEVELS: LevelSpec[] = [
  { id: "L1", area: "neighborhood", sameGroup: true, roomsTol: 0.5, sizeTol: 0.25 },
  { id: "L2", area: "neighborhood", sameGroup: true, roomsTol: 1, sizeTol: null },
  { id: "L3", area: "city", sameGroup: true, roomsTol: 0.5, sizeTol: 0.25 },
  { id: "L4", area: "city", sameGroup: false, roomsTol: 1, sizeTol: null },
];

/** Excluded deals are listed (when they match) with the first of these reasons that applies. */
const EXCLUSION_REASONS: Flag[] = ["invalid_price", "outlier_price", "conflicting_duplicate", "missing_size"];

// ---------- helpers ----------

/** "YYYY-MM-DD" or "YYYY-MM" → days since epoch (month-only dates count as the 1st). */
function toDays(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d ?? 1) / 86_400_000);
}

export const latestDealDate = (deals: Deal[]) => deals.map((d) => d.date).sort().at(-1) as string;

const summarize = (d: Deal): DealSummary => ({
  id: d.id, city: d.city, neighborhood: d.neighborhood, street: d.street, type: d.type, rooms: d.rooms,
  sizeSqm: d.sizeSqm, floor: d.floor, totalFloors: d.totalFloors, yearBuilt: d.yearBuilt, condition: d.condition,
  date: d.date, datePrecision: d.datePrecision, priceNis: d.priceNis, pricePerSqm: d.pricePerSqm, source: d.source,
  flags: d.flags, ...(d.keptPriceNis !== undefined ? { keptPriceNis: d.keptPriceNis } : {}),
});

function matches(d: Deal, q: CompsQuery, lv: LevelSpec, opts: { ignoreMissingSize: boolean }): boolean {
  if (d.city !== q.city) return false;
  if (lv.area === "neighborhood" && d.neighborhood !== q.neighborhood) return false;
  if (lv.sameGroup && q.propertyType !== null && !groupOf(q.propertyType).includes(d.type)) return false;
  if (q.rooms !== null && (d.rooms === null || Math.abs(d.rooms - q.rooms) > lv.roomsTol)) return false;
  if (lv.sizeTol !== null && q.sizeSqm !== null) {
    if (d.sizeSqm === null) return opts.ignoreMissingSize;
    if (Math.abs(d.sizeSqm - q.sizeSqm) > lv.sizeTol * q.sizeSqm) return false;
  }
  return true;
}

function describeFilters(q: CompsQuery, lv: LevelSpec): string[] {
  const out: string[] = [];
  out.push(lv.area === "neighborhood" ? `שכונה: ${q.neighborhood}, ${q.city}` : `כל העיר: ${q.city}`);
  if (q.propertyType !== null) {
    out.push(lv.sameGroup ? `סוג נכס: ${groupOf(q.propertyType).join(" / ")}` : "כל סוגי הנכסים");
  }
  if (q.rooms !== null) out.push(`חדרים: ${q.rooms - lv.roomsTol}–${q.rooms + lv.roomsTol}`);
  if (q.sizeSqm !== null && lv.sizeTol !== null) {
    out.push(`שטח: ${Math.round(q.sizeSqm * (1 - lv.sizeTol))}–${Math.round(q.sizeSqm * (1 + lv.sizeTol))} מ״ר`);
  }
  return out;
}

/** Closest first: same neighborhood, then rooms and size distance, then newest, then id (fully deterministic). */
function sortBySimilarity(deals: Deal[], q: CompsQuery): Deal[] {
  const score = (d: Deal) =>
    (q.neighborhood !== null && d.neighborhood === q.neighborhood ? 0 : 1) +
    (q.rooms !== null && d.rooms !== null ? Math.abs(d.rooms - q.rooms) : 0) +
    (q.sizeSqm !== null && d.sizeSqm !== null ? Math.abs(d.sizeSqm - q.sizeSqm) / q.sizeSqm : 0);
  return [...deals].sort((a, b) => score(a) - score(b) || b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

function computeStats(deals: Deal[]): CompsStats {
  const values = deals.map((d) => d.pricePerSqm as number);
  const dates = deals.map((d) => d.date).sort();
  const counts: Record<Source, number> = { "רשות המסים": 0, "מתווך": 0, "בעל נכס": 0 };
  for (const d of deals) counts[d.source]++;
  return {
    n: deals.length,
    median: median(values),
    p25: percentile(values, 0.25),
    p75: percentile(values, 0.75),
    min: Math.min(...values),
    max: Math.max(...values),
    dateFrom: dates[0],
    dateTo: dates[dates.length - 1],
    sourceShare: {
      "רשות המסים": counts["רשות המסים"] / deals.length,
      "מתווך": counts["מתווך"] / deals.length,
      "בעל נכס": counts["בעל נכס"] / deals.length,
    },
  };
}

function assessConfidence(
  stats: CompsStats,
  deals: Deal[],
  level: Level,
  q: CompsQuery,
  asOf: string,
): Confidence {
  const spread = (stats.p75 - stats.p25) / stats.median;
  const taxShare = stats.sourceShare["רשות המסים"];
  // Widening only counts against confidence when the user asked about a neighborhood in the first place.
  const widenedToCity = q.neighborhood !== null && (level === "L3" || level === "L4");
  const relaxedType = level === "L4" && q.propertyType !== null;
  const medianDealAgeYears = (toDays(asOf) - median(deals.map((d) => toDays(d.date)))) / 365.25;
  const old = medianDealAgeYears > OLD_MEDIAN_DEAL_YEARS;

  const isLow = stats.n < LOW_MAX_N || spread > LOW_MIN_SPREAD || widenedToCity || relaxedType || old;
  const isHigh =
    !isLow && stats.n >= HIGH_MIN_N && spread <= HIGH_MAX_SPREAD && taxShare >= HIGH_MIN_TAX_SHARE;

  if (isHigh) {
    return { level: "high", reasons: [`${stats.n} עסקאות`, "מחירי העסקאות קרובים זה לזה", "רוב העסקאות מדווחות על ידי רשות המסים"] };
  }

  const reasons: string[] = [];
  if (stats.n < HIGH_MIN_N) reasons.push(stats.n < LOW_MAX_N ? `רק ${stats.n} עסקאות` : `${stats.n} עסקאות בלבד`);
  if (spread > LOW_MIN_SPREAD) reasons.push("פיזור מחירים גדול בין העסקאות");
  else if (spread > HIGH_MAX_SPREAD) reasons.push("פיזור מחירים בינוני בין העסקאות");
  if (widenedToCity) reasons.push("הורחב לכל העיר");
  if (relaxedType) reasons.push("הורחב גם לסוגי נכסים אחרים");
  if (old) reasons.push(`רוב העסקאות מלפני יותר מ-${OLD_MEDIAN_DEAL_YEARS} שנים`);
  if (taxShare < HIGH_MIN_TAX_SHARE) reasons.push("פחות מ-60% מהעסקאות מדווחות על ידי רשות המסים");
  return { level: isLow ? "low" : "medium", reasons };
}

// ---------- public API ----------

/**
 * Deterministic comparable-deals search: walks the widening ladder (L1 → L4), stops at the first level with
 * at least MIN_DEALS usable deals, computes stats, and rates confidence. `asOf` is the "today" of the dataset
 * (its latest deal date) so results never depend on the wall clock.
 */
export function findComps(allDeals: Deal[], q: CompsQuery, asOf: string): CompsResult {
  const inCity = allDeals.filter((d) => d.city === q.city);
  const usable = inCity.filter((d) => d.status === "ok" && d.pricePerSqm !== null);
  const startAt = q.neighborhood === null ? 2 : 0;
  const notes: string[] = [];

  if (q.askingPriceNis !== null && q.sizeSqm === null) {
    notes.push("לא צוין שטח, ולכן אי אפשר לחשב מחיר למ״ר ולמקם בו את המחיר המבוקש.");
  }

  let chosen: { lv: LevelSpec; deals: Deal[] } | null = null;
  let last = LEVELS[LEVELS.length - 1];
  for (const lv of LEVELS.slice(startAt)) {
    last = lv;
    const found = usable.filter((d) => matches(d, q, lv, { ignoreMissingSize: false }));
    if (found.length >= MIN_DEALS) {
      chosen = { lv, deals: found };
      break;
    }
  }

  const lv = chosen?.lv ?? last;
  const excluded = sortBySimilarity(
    inCity.filter(
      (d) => (d.status === "excluded" || d.pricePerSqm === null) && matches(d, q, lv, { ignoreMissingSize: true }),
    ),
    q,
  )
    .filter((d) => !d.flags.includes("exact_duplicate"))
    .flatMap((d) => {
      const reason = EXCLUSION_REASONS.find((r) => d.flags.includes(r));
      return reason ? [{ deal: summarize(d), reason }] : [];
    });

  if (chosen === null) {
    const nearby = sortBySimilarity(
      usable.filter((d) => matches(d, q, lv, { ignoreMissingSize: false })),
      q,
    );
    return {
      status: "insufficient",
      level: lv.id,
      filtersApplied: describeFilters(q, lv),
      deals: nearby.map(summarize),
      excluded,
      stats: null,
      priceRange: null,
      askingPricePerSqm: null,
      askingPosition: null,
      confidence: { level: "low", reasons: [`נמצאו רק ${nearby.length} עסקאות מתאימות, פחות מ-${MIN_DEALS}`] },
      notes,
    };
  }

  const sorted = sortBySimilarity(chosen.deals, q);
  const stats = computeStats(sorted);
  const priceRange =
    q.sizeSqm !== null
      ? {
          low: Math.round((stats.p25 * q.sizeSqm) / PRICE_ROUNDING_NIS) * PRICE_ROUNDING_NIS,
          high: Math.round((stats.p75 * q.sizeSqm) / PRICE_ROUNDING_NIS) * PRICE_ROUNDING_NIS,
        }
      : null;

  let askingPricePerSqm: number | null = null;
  let askingPosition: CompsResult["askingPosition"] = null;
  if (q.askingPriceNis !== null && q.sizeSqm !== null) {
    askingPricePerSqm = Math.round(q.askingPriceNis / q.sizeSqm);
    askingPosition = askingPricePerSqm < stats.p25 ? "below" : askingPricePerSqm > stats.p75 ? "above" : "within";
  }

  return {
    status: "ok",
    level: lv.id,
    filtersApplied: describeFilters(q, lv),
    deals: sorted.map(summarize),
    excluded,
    stats,
    priceRange,
    askingPricePerSqm,
    askingPosition,
    confidence: assessConfidence(stats, sorted, lv.id, q, asOf),
    notes,
  };
}

export function compareAreas(allDeals: Deal[], a: CompsQuery, b: CompsQuery, asOf: string): CompareResult {
  const areas: [CompsResult, CompsResult] = [findComps(allDeals, a, asOf), findComps(allDeals, b, asOf)];
  if (areas[0].stats === null || areas[1].stats === null) return { areas, ratio: null, higher: null };
  const [ma, mb] = [areas[0].stats.median, areas[1].stats.median];
  return { areas, ratio: ma / mb, higher: ma === mb ? null : ma > mb ? 0 : 1 };
}
