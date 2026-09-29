# F4: Answer page, grounded explanation, number guard, receipt

**Goal:** show the answer so a non-expert understands it and can see what it's based on. Every answer gets a receipt that can be replayed later.

## Page: `/` (Hebrew, RTL)

1. **Ask box:** textarea + 4 example chips (one per intent). A submit button that disables while loading.
2. **Answer card:**
   - **Headline:** price range (or median per m² for area stats). With `insufficient`: "אין מספיק עסקאות כדי לתת טווח אמין" (not enough deals to give a reliable range) plus what was found.
   - **Confidence badge** (high/medium/low) with its reasons listed right under it.
   - **"על מה זה מבוסס"** (what this is based on): n deals, area and widening level, date range, source split, filters applied.
   - **Explanation paragraph:** LLM text (LLM #2) that passed the number guard, or the template text labeled "הסבר אוטומטי" (automatic explanation) when the LLM wasn't used.
   - **Deals table:** id, date, neighborhood, type, rooms, m², price, ₪/m², source, warning icons for flags (tooltip in Hebrew).
   - **"מה לא נכלל ולמה"** (what was excluded and why): excluded matching deals with reasons.
   - **Receipt footer:** `קוד: R-7F3K2A` · "העתק קישור" (copy link) · dataset version.
3. **Fallback form** (city / neighborhood / type / rooms / m² selects). It's always reachable via a "חיפוש ידני" (manual search) link and opened automatically when the LLM fails (F7). It posts a plan directly.

## LLM #2: narration

- Input: a **facts object** built from `CompsResult`, containing only display-ready values: `{ rangeLow: "4,100,000", median: "41,200", n: 9, dateFrom: "2022-01", level: "L3", confidenceReasons: [...], excludedCount: 2, ... }`.
- Prompt: "כתוב 2–4 משפטים בעברית פשוטה…" (write 2–4 sentences in plain Hebrew…): explain the range, what it's based on, and the main caveat. Use only the numbers given, exactly as written. Don't give advice ("כדאי לקנות", worth buying). Don't use the words "הוגן" (fair) or "שווי" (value).
- Output schema: `{ text: string }` (strict).

## Number guard (src/lib/numberGuard.ts)

1. Extract every number from the LLM text: digits with `,`/`.` separators, and scale words (`4.2 מיליון` → 4,200,000, `45 אלף` → 45,000, `חצי מיליון` → 500,000).
2. Build the allowed set from all numeric values in the facts object (and for F5, numbers in the customer's complaint).
3. Each extracted number must match an allowed value within 1% (rounding), or be a small count ≤ 10 that equals a count in the facts.
4. Any miss → reject the text, log `guard_rejected` with the offending numbers, and show the template text instead.

This is the check that enforces "only says what the data supports".

## Receipt (src/lib/receipt.ts)

- **Payload:** `{ v: datasetVersion, p: QueryPlan }` → JSON → base64url → link `/?r=<payload>`.
- **Short code:** `R-` + the first 6 hex chars of sha256(payload), shown to the customer and written in every log line for that request.
- **Replay:** opening `/?r=…` runs F3 on the plan directly (no parse call) and shows the same numbers. The explanation text may be worded differently; the numbers can't be.
- If `v` ≠ current dataset version: banner "הנתונים עודכנו מאז שהתשובה הזו הופקה" (the data has been updated since this answer was produced).
- Stateless on purpose: no DB (see DILEMMAS #13).

## Tests

- numberGuard: accepts correct text; rejects an invented number; handles `4.2 מיליון`, `4,200,000`, `45 אלף`, `41.2 אלף ₪ למ"ר`; ignores numbers inside the allowed list with commas vs. without
- receipt: encode → decode round trip; tampered payload → clear error; version mismatch detected
- templates: every `CompsResult` status/level produces non-empty Hebrew text (snapshot)
