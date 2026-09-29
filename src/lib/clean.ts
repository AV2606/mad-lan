import { createHash } from "node:crypto";
import type { RawRow } from "./csv";
import { FLAG_META, FLAG_ORDER } from "./flags";
import {
  MIN_VALID_PRICE_NIS,
  cleanText,
  parseBool,
  parseDate,
  parseIntOrNull,
  parsePrice,
  parseRooms,
} from "./parse";
import { median, scaledMad } from "./stats";
import { PROPERTY_TYPES, SOURCES } from "./types";
import type { Deal, Flag, PropertyType, QualityReport, Source } from "./types";

// ---------- aliases (hardcoded on purpose, DILEMMAS #17) ----------

export const CITY_ALIASES: Record<string, string> = {
  "ירושלים": "ירושלים",
  "Jerusalem": "ירושלים",
  "תל אביב": "תל אביב-יפו",
  "תל אביב-יפו": "תל אביב-יפו",
  "תל אביב יפו": "תל אביב-יפו",
  "Tel Aviv-Yafo": "תל אביב-יפו",
  'ת"א': "תל אביב-יפו",
  "באר שבע": "באר שבע",
  "באר-שבע": "באר שבע",
  'ב"ש': "באר שבע",
  "בית שמש": "בית שמש",
  "בית-שמש": "בית שמש",
  "מודיעין": "מודיעין-מכבים-רעות",
  "מודיעין מכבים רעות": "מודיעין-מכבים-רעות",
  "מודיעין-מכבים-רעות": "מודיעין-מכבים-רעות",
  "ראשון לציון": "ראשון לציון",
  "חולון": "חולון",
  "רמת גן": "רמת גן",
  "הרצליה": "הרצליה",
  "פתח תקווה": "פתח תקווה",
  "נתניה": "נתניה",
  "חיפה": "חיפה",
  "כפר סבא": "כפר סבא",
  "רעננה": "רעננה",
  "גבעתיים": "גבעתיים",
  "בת ים": "בת ים",
  "רחובות": "רחובות",
  "אשדוד": "אשדוד",
};

export function normalizeCity(raw: string): string {
  const key = cleanText(raw) ?? "";
  const city = CITY_ALIASES[key];
  if (!city) throw new Error(`Unknown city "${raw}": add it to CITY_ALIASES in clean.ts`);
  return city;
}

// Only provable aliases are merged. "מרכז" and "מרכז העיר" stay separate (DILEMMAS #18).
export function normalizeNeighborhood(raw: string): string | null {
  const s = cleanText(raw);
  if (s === null) return null;
  if (s === "Florentin") return "פלורנטין";
  const abbreviated = /^רמב"ש ([אג])'?$/.exec(s);
  if (abbreviated) return `רמת בית שמש ${abbreviated[1]}'`;
  const missingGeresh = /^רמת בית שמש ([אג])$/.exec(s);
  if (missingGeresh) return `רמת בית שמש ${missingGeresh[1]}'`;
  return s;
}

// ---------- row parsing ----------

const SOURCE_PRIORITY: Source[] = ["רשות המסים", "בעל נכס", "מתווך"]; // DILEMMAS #6
const PPSQM_TOLERANCE = 0.02;
const GLOBAL_PPSQM_BOUNDS = { low: 8_000, high: 130_000 };
const MAD_MULTIPLIER = 3;
const MIN_CITY_DEALS_FOR_MAD = 8;

function pick<T extends string>(raw: string, allowed: readonly T[], label: string): T {
  const s = cleanText(raw);
  if (s === null || !(allowed as readonly string[]).includes(s)) {
    throw new Error(`Unknown ${label} "${raw}"`);
  }
  return s as T;
}

/** A parsed row before duplicates are resolved. `givenPpsqm` is only used to tell conflicting duplicates apart. */
type Candidate = { deal: Deal; givenPpsqm: number | null };

function rowToCandidate(row: RawRow): Candidate {
  const id = cleanText(row.deal_id);
  if (!id) throw new Error("Row without deal_id");

  const { date, precision } = parseDate(row.deal_date);
  const priceRaw = parsePrice(row.price_nis);
  const priceNis = priceRaw !== null && priceRaw >= MIN_VALID_PRICE_NIS ? priceRaw : null;
  const sizeSqm = parseIntOrNull(row.size_sqm);
  const pricePerSqm = priceNis !== null && sizeSqm ? Math.round(priceNis / sizeSqm) : null;
  const givenPpsqm = parseIntOrNull(row.price_per_sqm);

  const deal: Deal = {
    id,
    city: normalizeCity(row.city),
    neighborhood: normalizeNeighborhood(row.neighborhood),
    street: cleanText(row.street),
    type: pick<PropertyType>(row.property_type, PROPERTY_TYPES, "property_type"),
    rooms: parseRooms(row.rooms),
    sizeSqm,
    floor: parseIntOrNull(row.floor),
    totalFloors: parseIntOrNull(row.total_floors),
    yearBuilt: parseIntOrNull(row.year_built),
    condition: cleanText(row.condition),
    elevator: parseBool(row.has_elevator),
    parking: parseBool(row.has_parking),
    balcony: parseBool(row.has_balcony),
    safeRoom: parseBool(row.has_safe_room),
    date,
    datePrecision: precision,
    priceNis,
    pricePerSqm,
    source: pick<Source>(row.source, SOURCES, "source"),
    status: "ok",
    flags: [],
  };

  const flags = new Set<Flag>();
  if (priceNis === null) flags.add("invalid_price");
  if (sizeSqm === null) flags.add("missing_size");
  if (deal.neighborhood === null) flags.add("missing_neighborhood");
  if (precision === "month") flags.add("month_only_date");
  if (
    pricePerSqm !== null &&
    givenPpsqm !== null &&
    givenPpsqm > 0 &&
    Math.abs(givenPpsqm - pricePerSqm) / pricePerSqm > PPSQM_TOLERANCE
  ) {
    flags.add("ppsqm_mismatch");
  }
  if (deal.type === "דירת גן" && deal.floor !== null && deal.floor >= 4) flags.add("garden_high_floor");
  if (
    (deal.type === "פנטהאוז" || deal.type === "דירת גג") &&
    deal.floor !== null &&
    deal.totalFloors !== null &&
    deal.floor < deal.totalFloors
  ) {
    flags.add("penthouse_not_top");
  }
  if (deal.condition === "חדש מקבלן" && deal.yearBuilt !== null && deal.yearBuilt < 2000) flags.add("new_but_old");
  if (deal.yearBuilt !== null && Number(date.slice(0, 4)) < deal.yearBuilt) flags.add("deal_before_built");
  if (deal.type === "דופלקס" && sizeSqm !== null && sizeSqm < 40) flags.add("tiny_duplex");

  deal.flags = orderFlags(flags);
  if (flags.has("invalid_price")) deal.status = "excluded";
  return { deal, givenPpsqm };
}

function orderFlags(flags: Iterable<Flag>): Flag[] {
  const set = new Set(flags);
  return FLAG_ORDER.filter((f) => set.has(f));
}

function exclude(deal: Deal, flag: Flag) {
  deal.status = "excluded";
  deal.flags = orderFlags([...deal.flags, flag]);
}

// ---------- duplicates ----------

/** Same deal_id on several rows. Never "keep first" (DILEMMAS #6). */
function resolveDuplicates(candidates: Candidate[]): Deal[] {
  const groups = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const g = groups.get(c.deal.id);
    if (g) g.push(c);
    else groups.set(c.deal.id, [c]);
  }

  for (const group of groups.values()) {
    if (group.length === 1) continue;

    // 1. exact duplicates: keep the first, exclude the rest
    const distinct: Candidate[] = [];
    const seen = new Map<string, Candidate>();
    for (const c of group) {
      const key = JSON.stringify(c);
      if (seen.has(key)) {
        exclude(c.deal, "exact_duplicate");
      } else {
        seen.set(key, c);
        distinct.push(c);
      }
    }
    if (distinct.length === 1) continue;

    // 2. conflicting duplicates: best source wins; on a tie, the row whose price matches price_per_sqm; else nobody
    const rank = (c: Candidate) => SOURCE_PRIORITY.indexOf(c.deal.source);
    const best = Math.min(...distinct.map(rank));
    let top = distinct.filter((c) => rank(c) === best);
    if (top.length > 1) top = top.filter((c) => !c.deal.flags.includes("ppsqm_mismatch"));
    const winner = top.length === 1 ? top[0] : null;
    for (const c of distinct) {
      if (c === winner) continue;
      exclude(c.deal, "conflicting_duplicate");
      if (winner?.deal.priceNis != null) c.deal.keptPriceNis = winner.deal.priceNis;
    }
  }
  // excluded duplicates stay in the output so the data page and receipts can show them
  return candidates.map((c) => c.deal);
}

// ---------- outliers ----------

function flagOutliers(deals: Deal[]) {
  const pool = deals.filter((d) => d.status === "ok" && d.pricePerSqm !== null);
  const byCity = new Map<string, Deal[]>();
  for (const d of pool) {
    const g = byCity.get(d.city);
    if (g) g.push(d);
    else byCity.set(d.city, [d]);
  }
  for (const group of byCity.values()) {
    let low = GLOBAL_PPSQM_BOUNDS.low;
    let high = GLOBAL_PPSQM_BOUNDS.high;
    if (group.length >= MIN_CITY_DEALS_FOR_MAD) {
      const values = group.map((d) => d.pricePerSqm as number);
      const mad = scaledMad(values);
      if (mad > 0) {
        const m = median(values);
        low = m - MAD_MULTIPLIER * mad;
        high = m + MAD_MULTIPLIER * mad;
      }
    }
    for (const d of group) {
      const p = d.pricePerSqm as number;
      if (p < low || p > high) exclude(d, "outlier_price");
    }
  }
}

// ---------- public API ----------

export function cleanDeals(rows: RawRow[]): Deal[] {
  const deals = resolveDuplicates(rows.map(rowToCandidate));
  flagOutliers(deals);
  return deals;
}

/** The exact text written to src/data/deals.json. The dataset version is a hash of this string. */
export function serializeDeals(deals: Deal[]): string {
  return JSON.stringify(deals, null, 2) + "\n";
}

export function buildReport(deals: Deal[], rawRows: number): QualityReport {
  const datasetVersion = createHash("sha256").update(serializeDeals(deals)).digest("hex").slice(0, 6);

  const issues = FLAG_ORDER.flatMap((flag) => {
    const dealIds = [...new Set(deals.filter((d) => d.flags.includes(flag)).map((d) => d.id))];
    if (dealIds.length === 0) return [];
    const { action, explanationHe } = FLAG_META[flag];
    return [{ flag, count: dealIds.length, dealIds, action, explanationHe }];
  });

  const unique = deals.filter((d) => !d.flags.includes("exact_duplicate") && !d.flags.includes("conflicting_duplicate"));
  const cities = new Map<string, { deals: number; neighborhoods: Set<string> }>();
  for (const d of unique) {
    const c = cities.get(d.city) ?? { deals: 0, neighborhoods: new Set<string>() };
    c.deals++;
    if (d.neighborhood) c.neighborhoods.add(d.neighborhood);
    cities.set(d.city, c);
  }

  const dates = deals.map((d) => d.date).sort();
  return {
    datasetVersion,
    rawRows,
    uniqueDeals: new Set(deals.map((d) => d.id)).size,
    usableForStats: deals.filter((d) => d.status === "ok" && d.pricePerSqm !== null).length,
    issues,
    dateRange: { from: dates[0], to: dates[dates.length - 1] },
    cities: [...cities.entries()]
      .map(([city, c]) => ({ city, deals: c.deals, neighborhoods: c.neighborhoods.size }))
      .sort((a, b) => b.deals - a.deals || a.city.localeCompare(b.city, "he")),
  };
}

/** city → sorted neighborhoods, for the query-plan schema and the manual form (small, so the client never needs deals.json). */
export function buildPlaces(deals: Deal[]): Record<string, string[]> {
  const byCity = new Map<string, Set<string>>();
  for (const d of deals) {
    const set = byCity.get(d.city) ?? new Set<string>();
    if (d.neighborhood) set.add(d.neighborhood);
    byCity.set(d.city, set);
  }
  return Object.fromEntries(
    [...byCity.keys()]
      .sort((a, b) => a.localeCompare(b, "he"))
      .map((c) => [c, [...(byCity.get(c) as Set<string>)].sort((a, b) => a.localeCompare(b, "he"))]),
  );
}

export function clean(rows: RawRow[]): { deals: Deal[]; report: QualityReport } {
  const deals = cleanDeals(rows);
  return { deals, report: buildReport(deals, rows.length) };
}
