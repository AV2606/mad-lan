export const PROPERTY_TYPES = ["דירה", "דירת גן", "דופלקס", "דירת גג", "פנטהאוז", "בית פרטי"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const SOURCES = ["רשות המסים", "מתווך", "בעל נכס"] as const;
export type Source = (typeof SOURCES)[number];

export type Flag =
  | "exact_duplicate"
  | "conflicting_duplicate"
  | "invalid_price"
  | "outlier_price"
  | "missing_size"
  | "garden_high_floor"
  | "penthouse_not_top"
  | "new_but_old"
  | "deal_before_built"
  | "tiny_duplex"
  | "month_only_date"
  | "ppsqm_mismatch"
  | "missing_neighborhood";

export type Deal = {
  id: string;
  city: string;
  neighborhood: string | null;
  street: string | null;
  type: PropertyType;
  rooms: number | null;
  sizeSqm: number | null;
  floor: number | null;
  totalFloors: number | null;
  yearBuilt: number | null;
  condition: string | null;
  elevator: boolean | null;
  parking: boolean | null;
  balcony: boolean | null;
  safeRoom: boolean | null;
  /** "YYYY-MM-DD", or "YYYY-MM" when only the month is known */
  date: string;
  datePrecision: "day" | "month";
  priceNis: number | null;
  /** recomputed as price / size, never the raw column */
  pricePerSqm: number | null;
  source: Source;
  /** excluded = never used in stats */
  status: "ok" | "excluded";
  flags: Flag[];
  /** only on a `conflicting_duplicate` loser: the price of the row that was kept, so the receipt can show both */
  keptPriceNis?: number;
};

export type QualityIssue = {
  flag: Flag;
  count: number;
  dealIds: string[];
  action: "removed" | "excluded" | "kept, warning" | "kept, info";
  explanationHe: string;
};

export type QualityReport = {
  datasetVersion: string;
  rawRows: number;
  uniqueDeals: number;
  usableForStats: number;
  issues: QualityIssue[];
  dateRange: { from: string; to: string };
  cities: { city: string; deals: number; neighborhoods: number }[];
};
