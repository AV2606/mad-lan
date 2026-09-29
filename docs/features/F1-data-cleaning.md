# F1: Data cleaning and quality flags

**Goal:** turn the raw CSV into one trustworthy list of deals, where every deviation from the raw data is recorded on the deal itself (`flags`) and counted in a report.

No LLM. It runs once as a script (`npm run data`), and the output is committed.

## Input → output

- In: `data/madlan_deals_sample.csv` (never edited by hand)
- Out: `src/data/deals.json` (array of `Deal`) and `src/data/quality-report.json`

```ts
type Deal = {
  id: string;                 // deal_id
  city: string;               // canonical Hebrew name
  neighborhood: string | null;
  street: string | null;
  type: "דירה" | "דירת גן" | "דופלקס" | "דירת גג" | "פנטהאוז" | "בית פרטי";
  rooms: number | null;
  sizeSqm: number | null;
  floor: number | null;
  totalFloors: number | null;
  yearBuilt: number | null;
  condition: string | null;
  elevator: boolean | null; parking: boolean | null; balcony: boolean | null; safeRoom: boolean | null;
  date: string;               // "YYYY-MM-DD", or "YYYY-MM" when only month known
  datePrecision: "day" | "month";
  priceNis: number | null;
  pricePerSqm: number | null; // recomputed = price / size, rounded
  source: "רשות המסים" | "מתווך" | "בעל נכס";
  status: "ok" | "excluded";  // excluded = never used in stats
  flags: Flag[];              // why it's excluded or why to be careful
};
```

## Parsing rules (src/lib/parse.ts)

| Field | Raw variants seen | Rule |
|---|---|---|
| all text | leading/trailing/double spaces | trim, collapse inner whitespace |
| price | `3054000`, `"4,331,000"`, `"₪12,144,000"`, `0`, `18000` | strip `₪` and `,` → int. `< 300,000` → `null` + flag `invalid_price` |
| rooms | `3.5`, `"4 חדרים"` | first number in string |
| size | number or empty | empty → `null` + flag `missing_size` |
| floor | number or empty | empty → `null` (no flag, only matters for contradictions) |
| booleans | `כן/yes/TRUE/1`, `לא/no/FALSE/0`, empty | map to `true/false/null` |
| date | `2025-09-07`, `15/06/2025`, `17.07.2026`, `Aug 2025` | ISO; `DD/MM/YYYY`; `DD.MM.YYYY`; `Mon YYYY` → month precision + flag `month_only_date`. Never use `new Date(string)` on non-ISO input |
| price_per_sqm | given column | ignored for stats; recomputed. If given value differs from recomputed by >2% → flag `ppsqm_mismatch` |

## Normalization (aliases, hardcoded maps in clean.ts)

- **Cities:** `ירושלים `/`Jerusalem` → `ירושלים`. `תל אביב`/`תל אביב-יפו`/`תל אביב יפו`/`Tel Aviv-Yafo`/`ת"א` → `תל אביב-יפו`. `באר שבע`/`באר-שבע`/`ב"ש` → `באר שבע`. `בית שמש`/`בית-שמש` → `בית שמש`. `מודיעין`/`מודיעין מכבים רעות`/`מודיעין-מכבים-רעות` → `מודיעין-מכבים-רעות`.
- **Neighborhoods:** trim. `Florentin` → `פלורנטין`. `רמב"ש א'`/`רמב"ש ג'` → `רמת בית שמש א'`/`ג'`. `רמת בית שמש א` → `רמת בית שמש א'` (missing geresh). Empty → `null` + flag `missing_neighborhood`.
- **Not merged:** `מרכז` vs `מרכז העיר` (see DILEMMAS #18).
- Any city not in the alias map makes the script **fail loudly**, so nothing slips through silently.

## Deduplication

1. **Exact duplicates** (all fields identical after normalization): keep one; the other gets `status: excluded` + flag `exact_duplicate`. Known: D100196, D100311, D100099, D100416, D100215, D100025.
2. **Conflicting duplicates** (same `deal_id`, different price/source): keep by source priority **רשות המסים > בעל נכס > מתווך**. The loser gets `excluded` + flag `conflicting_duplicate` and records its price, so the receipt can show it.
   - Known pairs: D100124 (broker vs tax authority), D100017 (tax authority vs broker), D100032 (owner vs broker), D100303 (owner vs broker).
   - In all 4 the broker row loses, and its price is the one that is non-round and doesn't match `price_per_sqm`. The ppsqm check agrees with the source priority every time; the test asserts this.
   - **Don't** "keep first": in D100124 the broker row comes first.
   - Same source on both rows: keep the one whose price matches `price_per_sqm`; if neither matches, exclude both.

## Validity and outlier flags

| Flag | Rule | Effect |
|---|---|---|
| `invalid_price` | price missing or < ₪300,000 (D100251 = 0, D100317 = 18,000) | excluded |
| `missing_size` | no size | kept for counts, excluded from price-per-m² stats |
| `outlier_price` | price per m² outside city median ± 3×MAD (scaled), computed on valid deals; for cities with < 8 deals use global bounds ₪8K–₪130K per m² | excluded from stats, listed in receipt. Expected to catch D100001 (145K/m² Ramat Gan), D100193 (142K/m² Pisgat Ze'ev), D100160 (96K/m² Modi'in) |
| `garden_high_floor` | דירת גן on floor ≥ 4 | kept, warning |
| `penthouse_not_top` | פנטהאוז/דירת גג with floor < total_floors | kept, warning |
| `new_but_old` | condition "חדש מקבלן" and yearBuilt < 2000 | kept, warning |
| `deal_before_built` | deal year < yearBuilt | kept, warning ("possibly sold off-plan (על הנייר)") |
| `tiny_duplex` | דופלקס with size < 40 m² | kept, warning |
| `month_only_date` | date given as month | kept, info |
| `ppsqm_mismatch` | see parsing | kept, info |
| `missing_neighborhood` | empty neighborhood | kept; appears in city-level stats only |

"kept, warning" = included in stats, but the flag is visible on the deal row in the receipt.

## Quality report (`quality-report.json`)

```json
{
  "datasetVersion": "a1b2c3",      // first 6 hex of sha256(deals.json)
  "rawRows": 0, "uniqueDeals": 0, "usableForStats": 0,
  "issues": [{ "flag": "exact_duplicate", "count": 6, "dealIds": ["D100196", "..."], "action": "removed", "explanationHe": "..." }],
  "dateRange": { "from": "2021-01-05", "to": "2026-07-26" },
  "cities": [{ "city": "גבעתיים", "deals": 0, "neighborhoods": 0 }]
}
```

## Tests (tests/parse.test.ts, tests/clean.test.ts)

- Each parser against every raw variant listed above
- `"15/06/2025"` → `2025-06-15`, `"04/05/2026"` → `2026-05-04` (DD/MM), `"Aug 2025"` → `2025-08` + month precision
- Every alias maps to its canonical city; unknown city throws
- Each known exact and conflicting duplicate resolves as specified: D100124 keeps 5,727,000, D100017 keeps 1,919,000, D100032 keeps 5,141,000, D100303 keeps 6,064,000; each winner's price matches its `price_per_sqm`
- D100251 and D100317 are excluded as `invalid_price`
- D100001 and D100193 get `outlier_price`
- **Freshness test:** `clean(readCsv())` deep-equals the committed `deals.json`. This catches "changed the code, forgot to regenerate"
