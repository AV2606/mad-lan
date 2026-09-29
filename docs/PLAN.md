# Project plan: "מאיפה המספר הזה?" (Where does this number come from?)

Madlan R&D Operations Engineer home assignment. Brief: [challenge.md](challenge.md).

## One-line pitch

A Hebrew, RTL price-check tool where **every number comes with a receipt**: the deals it's based on, what was excluded and why, and how much to trust it. There's also a **CSM mode** that takes a receipt plus an upset customer's message and explains what happened, with a reply ready to send.

## Why this and not "chat with the CSV"

- The role sits between customers, Customer Success and R&D. The 10-minute "customer moment" in the interview is literally a CSM holding a complaint about a number. The product is built for that moment.
- Constraint #4 ("user can tell what an answer is based on") becomes the core feature, not a footnote.
- The data is small (~520 rows, most neighborhoods have 1–5 deals) and dirty. A tool that is honest about that is more useful than one that always returns a number.

## Guiding rules

1. **The LLM never produces a number.** Numbers come from deterministic code. The LLM understands the question, writes the explanation and triages complaints.
2. **Every LLM output is checked.** It must pass a strict JSON schema and Zod validation. Any number in LLM text must appear in the computed facts (the number guard). If a check fails, the app uses deterministic template text.
3. **Build for speed, not for the future** (explicit instruction). There's one LLM provider and no provider abstraction, no DB, no auth, no i18n framework, no state library and no component library. Plain CSS. Data is baked into a JSON file in the repo. If something needs changing later, it gets rewritten.
4. **Refuse a number rather than make one up.** Below 5 comparable deals the app shows no range, only an explanation.

## Stack

| Piece | Choice | Note |
|---|---|---|
| App | Next.js 16 App Router on Vercel (already connected) | Read `node_modules/next/dist/docs/` before writing routes; see AGENTS.md |
| LLM | Groq, `openai/gpt-oss-120b`, strict `json_schema` output | Overridable via `GROQ_MODEL` env var. See [DILEMMAS.md](DILEMMAS.md) #2 |
| LLM client | Plain `fetch` to Groq's OpenAI-compatible endpoint | No SDK. See DILEMMAS #3 |
| Validation | Zod | |
| Tests | Vitest | |
| Data script | `tsx scripts/clean-data.ts` → committed `src/data/*.json` | |
| Styling | Plain CSS, `dir="rtl" lang="he"`, Hebrew web font via `next/font` | |

Env vars: `GROQ_API_KEY` (required), `GROQ_MODEL` (optional).

## Features

Each feature has its own spec file under [features/](features/):

| # | Feature | File | Uses LLM? |
|---|---|---|---|
| F1 | Data cleaning and quality flags | [F1-data-cleaning.md](features/F1-data-cleaning.md) | No |
| F2 | Question understanding (Hebrew free text → query plan) | [F2-question-understanding.md](features/F2-question-understanding.md) | Yes |
| F3 | Comparable-deals engine and confidence | [F3-comparables-engine.md](features/F3-comparables-engine.md) | No |
| F4 | Answer page: grounded explanation, number guard, receipt | [F4-answer-and-receipt.md](features/F4-answer-and-receipt.md) | Yes |
| F5 | CSM mode: complaint investigation and reply draft | [F5-csm-investigation.md](features/F5-csm-investigation.md) | Yes |
| F6 | Data-quality page ("מה אנחנו יודעים על הנתונים") | [F6-data-quality-page.md](features/F6-data-quality-page.md) | No |
| F7 | Failure handling, failure simulation, logging and debug panel | [F7-failure-and-observability.md](features/F7-failure-and-observability.md) | Around it |

## File layout (flat on purpose)

```
data/madlan_deals_sample.csv          raw input, never edited by hand
scripts/clean-data.ts                 CSV → src/data/deals.json + quality-report.json
src/data/deals.json                   cleaned deals incl. flags (committed)
src/data/quality-report.json          counts, affected IDs, dataset version (committed)
src/lib/parse.ts                      field parsers (price, date, rooms, bool, text)
src/lib/clean.ts                      normalize, aliases, dedupe, flags (pure function)
src/lib/comps.ts                      comparable selection, stats, confidence
src/lib/plan.ts                       query-plan Zod schema + JSON schema for Groq
src/lib/groq.ts                       single fetch wrapper: timeout, error kinds, simulation
src/lib/prompts.ts                    the 3 prompts (parse, narrate, investigate)
src/lib/numberGuard.ts                checks that every number in LLM text is in the facts
src/lib/receipt.ts                    encode/decode receipt, short code
src/lib/templates.ts                  deterministic Hebrew fallback texts
src/lib/log.ts                        one-line JSON logs
src/app/page.tsx                      customer page (ask + answer)
src/app/csm/page.tsx                  CSM investigation page
src/app/data/page.tsx                 data-quality page
src/app/api/ask/route.ts
src/app/api/investigate/route.ts
tests/*.test.ts
docs/                                 plan, features, dilemmas, test cases, AI log, CSM guide
```

## Milestones (~5 focused hours)

| # | Milestone | Time | Done when |
|---|---|---|---|
| M0 | Setup: copy CSV into `data/`, install zod/vitest/tsx, RTL layout shell, `GROQ_API_KEY` on Vercel | 20m | Empty Hebrew page deploys |
| M1 | F1 cleaning + parser tests + generated JSON | 70m | `npm test` green; quality report counts match the known issues in DILEMMAS |
| M2 | F3 comps engine + tests | 45m | Ladder, thresholds and confidence tested |
| M3 | F2 + F7 Groq wrapper + number guard + tests with mocked fetch | 60m | Every failure kind is covered by a test |
| M4 | F4 customer page + receipt | 50m | Happy path works end to end on Vercel |
| M5 | F5 CSM page | 35m | Receipt + complaint → causes + reply |
| M6 | F6 data page, run the manual test cases, write CSM guide and AI log | 40m | [USER_TEST_CASES.md](USER_TEST_CASES.md) all pass or are documented as known issues |

Order matters: F1 → F3 → F2/F7 → F4 → F5 → F6. If time runs out, cut from the end (F6 can be a plain table; F5 can drop the reply draft).

## Explicitly cut (and why)

| Cut | Why |
|---|---|
| Time/inflation adjustment of prices | Needs an external price index that isn't in the CSV. The app shows the date range instead |
| Maps and geography ("nearby neighborhoods") | No coordinates in the data |
| Charts beyond one simple price-spread strip | Adds nothing to trust or explanation |
| Chat memory / multi-turn | Each question stands alone, which makes receipts replayable |
| Auth, DB, caching, rate limiting | Demo app; stateless receipts make a DB unnecessary |
| Using features (elevator, parking…) in comparable matching | Too few deals per segment. They're displayed but not used for matching |
| Provider abstraction / multi-model fallback | Explicit instruction not to build for future change |

## Deliverables checklist

- [ ] Live URL (Vercel)
- [ ] Repo link
- [ ] `docs/CSM_GUIDE.md`: one page, Hebrew, plain language: what it does, what it can't do, and a "this number is wrong" reply
- [ ] `docs/AI_LOG.md`: curated log with at least one caught bad answer
- [ ] `docs/AI_PROMPTS_LOG.md`: raw prompt log (auto-appended by hook)
- [ ] `docs/DILEMMAS.md`: decisions and assumptions
- [ ] Tests green (`npm test`)

## Interview prep hooks

- **Demo:** customer question → receipt → copy link → CSM mode with a complaint.
- **"Show the model failing":** `?simulate=timeout|down|invalid|ratelimit|hallucinate` (F7).
- **Proudest part:** the number guard plus deterministic fallback, i.e. the LLM can't put a made-up number on screen.
- **Least happy with:** the confidence heuristic (hand-tuned thresholds) and no time adjustment.
