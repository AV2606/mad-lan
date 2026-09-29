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

- [ ] **Date parsing:** `new Date("15/06/2025")` is Invalid Date, and `new Date("04/05/2026")` silently parses as **April 5** (US MM/DD). Only ISO strings may go to `new Date`.
- [ ] **Dedup "keep first":** the default in most generated code. Wrong here (DILEMMAS #6).
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
