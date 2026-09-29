# F2: Question understanding (LLM #1: parse)

**Goal:** turn a free Hebrew question (slang, abbreviations, typos, English city names) into a typed **query plan** that deterministic code can run. The LLM does the language work; it never answers the question itself.

## Endpoint

`POST /api/ask` with `{ question: string }`, or `{ plan: QueryPlan }` (used by the manual fallback form and when replaying a receipt, which skips the LLM).

## Query plan

```ts
type QueryPlan = {
  intent: "estimate" | "area_stats" | "compare" | "unsupported" | "clarify";
  areas: { city: City; neighborhood: string | null }[];   // 1 area, or 2 for compare
  propertyType: PropertyType | null;
  rooms: number | null;
  sizeSqm: number | null;
  askingPriceNis: number | null;                          // "ביקשו ממני 4.2 מיליון"
  unsupportedReason: "rent" | "forecast" | "mortgage_or_legal" | "place_not_in_data" | "other" | null;
  mentionedPlace: string | null;                          // raw place text, for "we have no data on X"
  clarifyQuestion: string | null;                         // Hebrew, when intent = clarify
};
```

| Intent | Example | What runs |
|---|---|---|
| `estimate` | "4 חדרים בגבעתיים, 100 מ״ר, ביקשו 4.2 מיליון. הגיוני?" (4 rooms in Givatayim, 100 m², asking 4.2M, reasonable?) | F3 comps around a described property; places the asking price among them |
| `area_stats` | "כמה עולה מטר בפלורנטין?" (what's the price per m² in Florentin?) | F3 stats for an area and optional filters |
| `compare` | "מה יקר יותר, רעננה או כפר סבא?" (which is more expensive, Ra'anana or Kfar Saba?) | F3 stats for 2 areas side by side |
| `unsupported` | rent, "will prices go up", mortgage, a city not in the data | No numbers. A fixed Hebrew message per reason (templates.ts) |
| `clarify` | "כמה זה עולה?" (how much does it cost?) with no place | Shows `clarifyQuestion` + example chips |

## Groq call

- Model `openai/gpt-oss-120b`, `response_format: { type: "json_schema", json_schema: { strict: true, ... } }`, `temperature: 0`, `reasoning_effort: "low"`.
- Strict mode requires all fields `required` and `additionalProperties: false`; nullable fields use `type: ["x", "null"]`.
- `city` is an **enum** of the canonical cities in the schema, so the model can't invent one. `ת"א`, `Jerusalem`, `ב"ש` etc. are mapped by the model with help from alias hints in the prompt.
- Neighborhood can't be an enum per city in JSON schema, so the prompt includes the city → neighborhoods list and **code validates** the pair after the call.

## Prompt (in prompts.ts, Hebrew system prompt, summarized)

- You translate a question about Israeli residential deals into a query plan. You never answer the question.
- Allowed cities + neighborhoods list (generated from deals.json).
- Room counts: "חדר וחצי" = 1.5, "4 חד'" = 4. Prices: "4.2 מיליון" = 4200000, "מיליון ושמונה" = 1800000.
- If the place isn't on the list → `unsupported` + `place_not_in_data` + `mentionedPlace`.
- If there's no place at all → `clarify`.
- 5–6 few-shot examples covering each intent.

## Post-validation (code, after Zod)

| Check | On failure |
|---|---|
| Zod parse | one retry, then `bad_output` → fallback form (F7) |
| neighborhood belongs to city | drop neighborhood, add note "השכונה X לא נמצאה בנתונים של העיר, מציגים את כל העיר" (neighborhood X wasn't found in the city's data, showing the whole city) |
| `compare` has exactly 2 areas; others have 1 | treat as `clarify` |
| rooms in 1–8, size in 15–400, asking price in 300K–60M | null the field + note |

## Tests (tests/plan.test.ts; live eval separate)

- Zod accepts valid plans and rejects: unknown city, 3 areas in compare, rooms = 40
- Neighborhood/city mismatch is dropped with a note
- JSON schema generated for Groq has `additionalProperties: false` and all keys required (strict-mode contract)
- **Live eval** (`npm run eval`, not in CI): ~15 Hebrew questions → expected intent/city/rooms, printed as a pass/fail table. Used to compare models and prompt changes
