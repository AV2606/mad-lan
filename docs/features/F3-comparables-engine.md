# F3: Comparable-deals engine and confidence

**Goal:** given a query plan, choose the deals that support an answer, compute the numbers, and say how much to trust them. Fully deterministic; the same plan and dataset always give the same result.

## Pool

Start from `deals.json` where `status = ok`. Deals flagged `outlier_price` or `missing_size` aren't used for per-m² stats, but they're **listed under "excluded"** when they match the filters, so the user sees them.

## Property-type groups

| Group | Types |
|---|---|
| apartment | דירה, דירת גן, דופלקס |
| top floor | דירת גג, פנטהאוז |
| house | בית פרטי |

If `propertyType` is null → all groups.

## Widening ladder (estimate and area_stats)

Try levels in order; stop at the first with **n ≥ 5**:

| Level | Area | Type | Rooms | Size |
|---|---|---|---|---|
| L1 | neighborhood | same group | ±0.5 | ±25% |
| L2 | neighborhood | same group | ±1 | any |
| L3 | city | same group | ±0.5 | ±25% |
| L4 | city | any | ±1 | any |

- Filters that are null in the plan are skipped (e.g. no rooms → no room filter).
- No neighborhood in plan → start at L3.
- The level used is part of the result and **always shown** ("לא היו מספיק עסקאות בשכונה, הרחבנו לכל העיר": not enough deals in the neighborhood, so we widened to the whole city).
- n < 5 even at L4 → `insufficient`: no range is shown. The deals found are still listed.

## Numbers

On the selected deals' `pricePerSqm`:
- `n`, `median`, `p25`, `p75` (linear interpolation), `min`, `max`
- `dateFrom`, `dateTo`, share by source (tax authority / broker / owner)
- If `sizeSqm` is given: price range = `p25 × size` to `p75 × size`, rounded to ₪10K
- If `askingPriceNis` + `sizeSqm` are given: asking price per m² and where it falls ("below most / within the middle half / above most comparable deals"). Never "fair" or "overpriced".
- Compare: the same stats per area, plus the ratio of medians. Only if both areas have n ≥ 5.

## Confidence (hand-tuned heuristic, shown with its reasons)

| Level | Rule |
|---|---|
| גבוהה (high) | n ≥ 10 **and** (p75−p25)/median ≤ 0.25 **and** ≥ 60% tax authority **and** not widened to city |
| נמוכה (low) | n < 8 **or** spread > 0.40 **or** widened past L2 **or** median deal older than 3 years |
| בינונית (medium) | otherwise |

The result includes the list of reasons, e.g. `["רק 6 עסקאות", "הורחב לכל העיר"]` ("only 6 deals", "widened to the whole city"), so the badge is never a mystery.

## Result shape (input to F4 narration and the receipt)

```ts
type CompsResult = {
  status: "ok" | "insufficient";
  level: "L1" | "L2" | "L3" | "L4";
  filtersApplied: string[];          // Hebrew, for display
  deals: DealSummary[];              // used, sorted by similarity then date
  excluded: { deal: DealSummary; reason: Flag }[];
  stats: { n, median, p25, p75, min, max, dateFrom, dateTo, sourceShare } | null;
  priceRange: { low, high } | null;
  askingPosition: "below" | "within" | "above" | null;
  confidence: { level: "high" | "medium" | "low"; reasons: string[] };
  notes: string[];                   // e.g. dropped neighborhood from F2
};
```

## Tests (tests/comps.test.ts, with small fixture arrays, not the real data)

- Median/percentiles on odd and even n
- Ladder stops at the first level with n ≥ 5; reports the level
- n = 4 everywhere → `insufficient`, no range
- Outlier deal matching the filters appears in `excluded`, not in stats
- Confidence: one fixture per level, and reasons listed
- Asking-price position below/within/above
- Deterministic: same input → deep-equal output
