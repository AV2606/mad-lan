# Dilemmas, decisions and assumptions

Every non-obvious call in this project, with the options considered and why one won. Numbers (#N) are referenced from the feature specs. Status: **Decided** = chosen and will be built; **Open** = decided for now, but worth revisiting or raising in the interview.

---

## Product

### #1 What to build · Decided
- **Options:** (a) chat with the CSV; (b) market dashboard; (c) price check with receipts + CSM investigation mode.
- **Decision:** (c).
- **Why:** The role is the bridge between customers, CS and R&D, and the interview includes a "customer moment" about a disputed number. (c) makes constraint #4 (show what an answer is based on) the core feature. (a) is what most candidates will build and is hard to keep grounded. (b) barely uses the LLM.
- **Cost:** Two user-facing surfaces instead of one. Mitigated by sharing the same engine and answer card.

### #4 Where the LLM sits · Decided
- **Options:** LLM computes answers from the data in its context; or the LLM only translates language ↔ structure while code computes.
- **Decision:** The LLM never produces a number. It parses questions, writes explanations from given facts, and triages complaints.
- **Why:** Constraint #4. It's also cheaper, testable, and replayable. The LLM still does real work (Hebrew understanding, aliases, explanation, complaint triage), which satisfies constraint #3.
- **Cost:** Questions outside the plan schema become `unsupported` rather than being answered creatively. That's acceptable, and honest.

### #12 Median + middle-50% range vs average / point estimate · Decided
- **Decision:** Show the median and p25–p75 range. Never a single "value", never "fair price".
- **Why:** Tiny samples with outliers make averages meaningless. A range communicates uncertainty to non-experts better than "±". Also, a point estimate from 6 deals is exactly the kind of number that produces an angry customer.

### #11 Minimum sample size and widening · Decided (thresholds Open)
- **Decision:** n ≥ 5 to show any range. Widen neighborhood → city in 4 steps, and always say so.
- **Why:** Most neighborhoods have 1–5 deals. Without widening, almost every question returns "insufficient". Without disclosure, widening is misleading.
- **Open:** 5 is a judgment call, not a statistic. Confidence thresholds (F3) are hand-tuned; this is "the part I'm least happy with".
- **Measured (M2):** asking about each of the 109 neighborhoods with no other filters: 60 widen to the whole city, and confidence comes out 97 low, 12 medium, **0 high**. "High" is only reachable for city-level questions. That is honest for this data (most neighborhoods have 1–5 deals), but it means the badge rarely differentiates at neighborhood level.

### #10 No time adjustment · Decided
- **Context:** Deals span 2021-01 to 2026-07. Israeli prices moved a lot in that period. A price index isn't in the CSV ("some of what you need isn't in the CSV at all").
- **Options:** (a) pull a public price index (CBS) and adjust; (b) restrict to recent deals; (c) show the date range and lower confidence for old data.
- **Decision:** (c).
- **Why:** (a) adds an external dependency and a modelling claim I can't validate in 5 hours. (b) would leave most areas with n < 5.
- **Cost:** Ranges mixing 2021 and 2026 are biased low in rising areas. The app says this, and it's a likely customer complaint that F5 detects (`old_deals_included`).

### #16 Language · Decided
- **Decision:** UI, LLM output and the CSM guide are in Hebrew. Code, docs and logs are in English (reviewers + interview are in English).

---

## Data

### #5 Clean at build time (committed JSON) vs at runtime · Decided
- **Decision:** A script generates `deals.json` + `quality-report.json`, which are committed. The app imports JSON.
- **Why:** Reading a CSV from disk in a Vercel serverless function depends on file tracing, a known source of "works locally, 500 in prod". A committed JSON is visible in diffs and reviewable. A freshness test fails if the code changed but the JSON wasn't regenerated.

### #6 Conflicting duplicates: which source wins · Decided (assumption)
- **Context:** Four deal IDs appear twice with different prices (2–5% apart): D100124 and D100017 (tax authority vs broker), D100032 and D100303 (owner vs broker). In all four, the broker price is non-round (e.g. 5,429,440) and doesn't match the given `price_per_sqm`; the other row's price is round and matches.
- **Decision:** Source priority tax authority (רשות המסים) > owner (בעל נכס) > broker (מתווך). The losing row is kept as excluded, and its price is shown in the receipt.
- **Why:** The tax authority is the reported transaction. The owner knows the exact price they got, while broker figures look estimated. The ppsqm consistency check independently picks the same winner in all four cases.
- **Rejected:** "keep first row" (the usual AI/pandas default). In D100124 the broker row comes first, so it silently keeps the wrong price.
- **Note:** My first analysis claimed all four pairs were "tax authority vs broker". That was wrong (two are owner vs broker), and I caught it while writing this spec. Logged in [AI_LOG.md](AI_LOG.md).

### #7 Outlier rule · Decided
- **Options:** fixed bounds; IQR per city; MAD per city.
- **Decision:** Median ± 3×MAD per city (city n ≥ 8), else global bounds ₪8K–₪130K/m².
- **Why:** MAD is robust with ~20–30 deals per city. Fixed bounds alone would either flag real Tel Aviv prices (~₪100K/m²) or miss a ₪140K/m² deal in Pisgat Ze'ev.
- **Cost:** A real luxury deal may be flagged. It's excluded from stats but visible, never hidden.
- **Measured on the data (M1):** k=3 flags 12 deals, not just the 3 obvious ones (D100001, D100193, D100160 at 6.1–6.7 MADs). The other 9 sit at 3.1–4.3 MADs and look like plausible deals (e.g. D100132, a Netanya penthouse at ₪58K/m²). k=4 would flag 4, k=5 exactly the 3. **Kept k=3 by explicit choice**; revisit if thin neighborhoods look too empty.

### #8 Flag vs delete contradictory rows · Decided
- **Context:** Garden apartment (דירת גן) on floor 16; "new from contractor" (חדש מקבלן) built in 1950; 23 m² duplex.
- **Decision:** Keep them in stats with a visible warning flag. Exclude only when the price itself is unusable (invalid, outlier, duplicate).
- **Why:** The wrong field could be the type/condition label, not the price. Deleting would shrink already tiny samples on a guess.

### #9 Date formats · Decided (assumption)
- **Decision:** Slash and dot dates are day/month/year. `Aug 2025` keeps month precision.
- **Why:** Values like `15/06/2025` and `23/02/2025` are only valid as DD/MM, and Israeli convention is DD/MM. No value in the file is valid only as MM/DD.
- **Risk:** An ambiguous date like `04/05/2026` is read as 4 May. Consistent with the rest of the file.

### #18 Neighborhood merging · Open
- **Decision:** Merge only provable aliases: spacing, missing geresh, English spelling (`Florentin`), known abbreviations (`רמב"ש` = רמת בית שמש). Don't merge `מרכז` with `מרכז העיר`.
- **Why:** Merging two areas that aren't the same is worse than leaving a known duplicate. Listed on the data page as an open question to raise with the data owner.

### #19 Deals before year_built · Decided
- **Decision:** Keep with a warning ("possibly sold off-plan").
- **Why:** Buying off-plan ("על הנייר") is common in Israel, so this may be correct data.

### #20 Missing price per m² in the source · Decided
- **Decision:** Ignore the given `price_per_sqm` column and recompute from price and size. Rows with a mismatch > 2% are flagged.
- **Why:** The column is derived data, and it's already wrong in at least one row (D100317: 18,000 / 132 m² ≠ 0).
- **Measured (M1):** 28 rows disagree with price ÷ size by more than 2%, far beyond the 4 conflicting duplicates. Some differ by 20%+ (D100178: 55,169 computed vs 68,592 given), so the column can't be trusted as a cross-check outside the duplicate tie-break.

---

## Engineering

### #2 Which Groq model · Decided (revisit with eval)
- **Options:** `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `llama-3.3-70b-versatile`, `qwen` preview.
- **Decision:** `openai/gpt-oss-120b`, overridable via `GROQ_MODEL`.
- **Why:** It supports **strict** JSON-schema output on Groq (guaranteed schema compliance), which Llama 3.3 doesn't. It has reasonable Hebrew quality, it's fast, and it's cheap ($0.15/$0.60 per 1M tokens as of 2026-09). The preview models may be discontinued.
- **Check:** Run the live eval (F2) once on 120b vs 20b. If 20b matches, switch to it for speed and cost.

### #3 Groq SDK vs plain fetch · Decided
- **Decision:** Plain `fetch` to `https://api.groq.com/openai/v1/chat/completions`.
- **Why:** One endpoint and one function. Timeout, error mapping and failure simulation are explicit in ~40 lines I can show in the walkthrough. There's no hidden SDK retry behaviour to explain.

### #13 Receipts: stateless link vs storage · Decided
- **Options:** store answers in Vercel KV/Upstash keyed by short code; or encode the plan in the URL.
- **Decision:** Encode `{datasetVersion, plan}` in the URL; the short code is just a hash for logs.
- **Why:** No DB to provision or fail. The numbers are deterministic, so replaying the plan reproduces them exactly.
- **Cost:** A CSM can't look up a bare code; they need the link. The explanation text isn't stored, so a replay may word it differently (numbers identical). Both are stated in the CSM guide.

### #14 Number-guard strictness · Decided
- **Decision:** Every number in LLM text must match a fact within 1%, or be a small count ≤ 10 matching a count in the facts. Otherwise the text is rejected and the template is used.
- **Why:** A false rejection costs a less pretty sentence. A false acceptance puts an invented number in front of a customer. The trade-off favours strictness.
- **Cost:** Hebrew number words the extractor doesn't know ("שלושה מיליון ורבע", three and a quarter million) could slip through. The prompt tells the model to copy the given number strings exactly; that's the main defense.

### #15 Public debug panel and `?simulate=` in production · Decided
- **Decision:** Both are on in production.
- **Why:** This is a demo for evaluators, and "show us the model failing" is part of the session. The debug panel contains no secrets.
- **In a real product:** the simulate param would be behind a flag and the debug panel internal-only. Stated in the README.

### #17 No building for the future · Decided (explicit instruction)
- **Decision:** No provider abstraction, no DB, no auth, no i18n library, no component library, no state library; aliases are hardcoded maps; flat `src/lib`.
- **Why:** Speed. The brief values "one thing done with real thought".
- **Cost:** Swapping the LLM provider or adding a dataset means editing code directly, which is fine at this size.

### #21 Test scope · Decided
- **Decision:** Unit tests for parsers, cleaning, comps, number guard, receipt; mocked-fetch tests for every Groq failure kind; route tests with simulation. The live-model eval is a separate script, not in CI.
- **Why:** Those are "the parts that matter most": the numbers and the failure paths. No end-to-end browser tests; manual [USER_TEST_CASES.md](USER_TEST_CASES.md) covers the UI.

### #22 Rate limits and cost · Decided
- **Context:** Each question = up to 2 Groq calls (parse + narrate); each investigation = 1.
- **Decision:** No caching. Handle 429 gracefully (F7).
- **Why:** Evaluator traffic is tiny. Groq's limits and pricing make this negligible.

---

## Decisions made during the build

### #23 Requests with a plan never call the model · Decided
- **Context:** F4 says a replayed receipt "may be worded differently" (implies a narration call); F7's test says "`/api/ask` with a plan: no Groq call made"; the manual-form test case says "without any Groq call".
- **Decision:** A request that arrives with a plan (manual form, receipt link, CSM replay) makes **no** model call. The explanation is the labeled template ("הסבר אוטומטי").
- **Why:** Two of the three specs said so, it keeps replays fast and free, and it means the CSM's replay can't fail because of the model.
- **Cost:** A receipt opened from a link shows template wording rather than the wording the customer saw. The numbers are identical.

### #24 Failure simulation can target one stage · Decided
- **Context:** F7 says `simulate=down` still shows numbers with a template explanation. USER_TEST_CASES says it opens the manual form. Both are right, for different stages: parse failing opens the form, narration failing keeps the numbers.
- **Decision:** `?simulate=` hits every model call by default (so parse fails first and the form opens). Adding `&stage=narrate` (or `parse`) aims it at one call.
- **Why:** "Model fails, numbers still shown" is the best failure demo, and it needs a way to get past a working parse.

### #25 CSM: the code extracts the customer's claim, not the LLM · Decided (deviation from F5)
- **F5 said:** the LLM extracts `claimedPriceNis`, street, date; code then searches for the deal.
- **Decision:** Code extracts the claim (prices with the same extractor the number guard uses, streets by matching known street names). The LLM gets the matched deals as input and returns only causes and texts.
- **Why:** Keeps "the LLM never produces a number", avoids a second model call (the search has to happen *before* the LLM writes anything), and is testable.
- **Match strength (found by running it live):** a price alone is weak evidence, since many deals sit within 3% of any price. A match is "strong" only when price **and** a street named in the complaint agree. A price with no street is reported as "can't verify". Even a strong match is worded "כנראה" (probably), because the date can't be checked ("a month ago").
- **Street matching:** a street must not be part of a longer word (`הרצל` is not `הרצליה`).

### #26 What the model is told is part of the design · Decided
- Live runs showed the model inventing rationale and conflating fields. Fixes: the facts now include the real exclusion explanation and `priceUsedInstead`; the user's asking price is named `askingPriceEnteredByUser` (the model had presented it as our estimate); a `complaintHasDetails` flag stops it from attributing claims to a customer who wrote "you're terrible".
- Code rejects (and falls back to the template) reply drafts that contain jargon, blame, promises, English words, the word "average" for a median, more than 6 sentences, or a number not in the facts or the complaint.
- **Known remaining weakness:** the model sometimes states a strong match without hedging. The check text says "כנראה" and the prompt asks it to keep the hedge, but it isn't enforced in code. The draft is labeled a draft for the CSM to edit.

### #27 Client timeout is 25s, not 20s · Decided
- F7 said 20s. The server's worst case is parse (10s) + narrate (10s), so a 20s client would abort a legitimate slow answer. Set to 25s.

### #28 `places.json` · Decided
- The plan schema and manual form need city → neighborhood lists. Importing `deals.json` in the browser bundle would ship every deal to every visitor, so the cleaning script also writes a small `places.json` (covered by the freshness test).
