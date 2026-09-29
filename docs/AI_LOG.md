# AI work log

How this project was built with AI assistance: what I asked, what I kept, and what I caught.
Raw prompts are appended automatically to [AI_PROMPTS_LOG.md](AI_PROMPTS_LOG.md) by a Claude Code hook (`.claude/hooks/log-prompt.mjs`).

**Tools:** Claude Code (in VS Code) for analysis, planning and coding. Groq (`openai/gpt-oss-120b`) inside the app.

---

## Caught bad answers

### 1. Conflicting duplicates: wrong claim about the sources (planning, 2026-09-29)
- **What the AI said:** In its first data analysis, it said the four conflicting duplicate pairs (D100124, D100032, D100017, D100303) were each "tax authority vs broker", and that the tax-authority price always matches `price_per_sqm`.
- **What was actually true:** Only D100124 and D100017 have a tax-authority row. D100032 and D100303 are **owner vs broker**. A rule of "tax authority wins" would have had no winner for two of the four pairs.
- **How it was caught:** It came up while writing the dedup spec, which required checking each pair's rows one by one.
- **Fix:** Source priority tax authority > owner > broker, plus a ppsqm consistency check that must agree. The test pins the expected winner price for each pair. See DILEMMAS #6.
- **Lesson:** A summary of dirty data ("in each case…") is exactly where an AI over-generalizes. Pin specific rows in tests.

<!-- Add more as they happen. Template:
### N. <short title> (<stage>, <date>)
- **What the AI said/did:**
- **What was actually true:**
- **How I caught it:**
- **Fix:**
-->

---

## Watch list: things to verify during the build

Likely AI mistakes for this project. Check each when the relevant code is written, and move any that happen into "Caught bad answers".

- [x] **Date parsing:** (M1: parser never uses `new Date(string)`; tests pin `04/05/2026` → 2026-05-04.) `new Date("15/06/2025")` is Invalid Date, and `new Date("04/05/2026")` silently parses as **April 5** (US MM/DD). Only ISO strings may go to `new Date`.
- [x] **Dedup "keep first":** (M1: test asserts D100124's broker row is first in the file and still loses.) the default in most generated code. Wrong here (DILEMMAS #6).
- [ ] **Next.js 16 APIs:** the AI's training data is mostly Next 13–15. Check route handlers, `params`/`searchParams` (async), and `next/font` against `node_modules/next/dist/docs/` before trusting generated code.
- [ ] **Groq model names and features:** verify against console.groq.com/docs, not memory. (Done at planning: gpt-oss-120b supports strict json_schema; Llama 3.3 doesn't.)
- [ ] **Percentiles:** off-by-one in p25/p75 interpolation. Test with known small arrays.
- [ ] **Hebrew in regexes:** `\b` word boundaries don't work with Hebrew letters in JS regex (no `u`-aware word chars). Matters for the number guard ("45 אלף").
- [ ] **RTL numbers:** prices like `₪4,200,000` and ranges "4.1–4.6" can visually reorder in RTL. Wrap in `<bdi>` / `dir="ltr"` spans.
- [ ] **Invented facts in the CSM guide:** AI drafts tend to describe features that weren't built. Check every sentence against the app.

---

## Session log

### 2026-09-29: Analysis and idea
- **Asked:** read the brief and the CSV; suggest a unique solution.
- **AI did:** catalogued the data issues (aliases, 4 date formats, price formats, duplicates, outliers, contradictions, thin neighborhoods, no time index). It proposed "every number comes with a receipt" plus a CSM investigation mode, instead of chat-with-CSV.
- **I decided:** go with it. The CSM angle matches the role and the interview's "customer moment".

### 2026-09-29: Planning
- **Asked:** plan the project; one file per feature; a prompt log; user test cases; use Groq, not Claude (cost, and I already have a subscription); no future-proofing; document the dilemmas.
- **AI did:**
  - Checked Groq's live docs for current models and structured-output support before choosing a model, instead of relying on memory.
  - Wrote PLAN, 7 feature specs, DILEMMAS, USER_TEST_CASES.
  - Set up the prompt-logging hook and tested it with Hebrew, multi-line and malformed input.
- **Caught:** bad answer #1 above.
- **I changed:** LLM provider from Claude to Groq (my constraint). The AI had proposed the Anthropic API.

### 2026-09-29: M0 + M1 build
- **Asked:** start implementing; ask when unsure.
- **AI did:** set up deps (had to bump `@types/node` to 24 for vitest 5), RTL Hebrew shell, CSV reader, parsers, cleaning pipeline, 74 tests, generated `deals.json` + `quality-report.json`.
- **Caught (by measuring, not assuming):** the spec's 3×MAD outlier rule expected to catch 3 deals but flags 12. The AI stopped and asked instead of quietly changing the threshold. I chose to keep k=3 (DILEMMAS #7).
- **Also found:** 28 rows where the given `price_per_sqm` disagrees with price ÷ size (DILEMMAS #20).

### 2026-09-29: M2–M3 build (comps engine, Groq wrapper, number guard, ask pipeline)
- **AI did:** comps engine, plan schema, Groq wrapper, number guard, templates, receipt, `ask()` orchestration, 199 tests, live eval script (15/15 on gpt-oss-120b).
- **Caught by tests (not by eye):** the number guard's identifier regex assumed receipt codes are hex (`R-7F3K2A` in the spec has a `K`); and `4.1 * 1e6 = 4099999.9999999995` broke scale-word parsing.
- **Caught by running it live:** the real model wrote "(p25)" and "(p75)" in a Hebrew explanation because my facts object used those key names. The guard rejected it correctly (25 and 75 aren't in the data), but the root cause was my key naming. Renamed to `typicalLowPerSqm` / `typicalHighPerSqm` and added a prompt rule.
- **Spec conflict resolved:** F7 says `simulate=down` still shows numbers, USER_TEST_CASES F2 says it opens the manual form. Both are right for different stages, so there is now an optional `stage=parse|narrate` to aim the simulation at one model call.
- **Decision:** requests that arrive with a plan (manual form, receipt replay) make no model call at all, so their explanation is always the labeled template.

### 2026-09-29: CSM mode (F5) and the live runs
- **AI did:** investigate pipeline (deterministic checks, customer-deal search, LLM draft with guards), CSM page, 250 tests total.
- **Wrong diagnosis, caught by looking at the data:** the first live run matched the customer's "5.2 million on Sokolov" to D100284 and said "your deal is in our data". I first read that as an overclaim from a coincidental price match and tightened the rule (price alone is weak; price + street named in the complaint is strong). Writing the regression test showed D100284 really *is* on Sokolov, in Givatayim, at ₪5,157,000. So the match was right; what was wrong was the certainty of the wording ("כנראה" now), and the date (07/2025) can't be squared with "a month ago". The street-aware rule stays: it still prevents a coincidental price on another street being called the customer's deal.
- **Bad model output, caught by reading it (three separate cases):**
  1. Invented rationale: "we preferred the lower price to avoid deviation". False, the rule is source priority. The facts only had a label, not the real explanation; now they include `exclusionExplanation` and `priceUsedInstead`.
  2. Invented complaint content: for "you're terrible" the draft said the customer thought the price was too low. Added `complaintHasDetails`; with nothing to explain, causes are forced empty and the draft asks for details.
  3. Accepting the customer's false premise ("you said 4 million"): the app showed a 4.64–6.35M range; 4.2M was the user's own asking price, which my facts called `askingPrice`. Renamed to `askingPriceEnteredByUser`.
- **Guards added from these:** English words in Hebrew text, "average" for a median, jargon, blame, promises, > 6 sentences. Each one has a test.
- **Still not solved:** the model sometimes drops the "כנראה" hedge. It is in the check text and the prompt, not enforced in code.
- **Process note:** twice the shell tool failed on large heredocs with Hebrew and quotes; switched to writing patch scripts with the file tool.
