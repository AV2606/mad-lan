# מאיפה המספר הזה? (Where does this number come from?)

A Hebrew, RTL price-check tool over Israeli residential deals, where every number comes with a receipt: the deals behind it, what was excluded and why, and how much to trust it. A CSM mode turns a receipt plus a customer complaint into an explanation and a reply draft.

Built for the Madlan R&D Operations Engineer challenge ([brief](docs/challenge.md)).

## Docs

| Doc | What's in it |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | Pitch, stack, file layout, milestones, what was cut |
| [docs/features/](docs/features/) | One spec per feature (F1–F7) |
| [docs/DILEMMAS.md](docs/DILEMMAS.md) | Every non-obvious decision and assumption |
| [docs/USER_TEST_CASES.md](docs/USER_TEST_CASES.md) | Manual test checklist against the live app |
| [docs/AI_LOG.md](docs/AI_LOG.md) | How AI was used, including caught bad answers |
| [docs/AI_PROMPTS_LOG.md](docs/AI_PROMPTS_LOG.md) | Raw prompt log (auto-appended by `.claude/hooks/log-prompt.mjs`) |
| docs/CSM_GUIDE.md | One-page guide for Customer Success (to be written after the build) |

## Run locally

```bash
npm install
cp .env.example .env.local    # set GROQ_API_KEY
npm run data                  # regenerate src/data/*.json from data/madlan_deals_sample.csv
npm test
npm run dev
```

Env: `GROQ_API_KEY` (required), `GROQ_MODEL` (optional, default `openai/gpt-oss-120b`).

## Demo notes

- Failure simulation: add `?simulate=timeout|down|ratelimit|invalid|hallucinate` to `/` or `/csm`.
- A "פרטים טכניים" (technical details) panel under each answer shows the plan, timings and any failure kind.
- Both are on in production on purpose, for the evaluation. In a real product they would be internal-only.
