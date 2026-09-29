# F7: Failure handling, failure simulation, logging and debug panel

**Goal:** when the model is slow, wrong or down, the user gets an honest Hebrew message **and still gets the numbers**. When something breaks, the log line says what broke without guessing.

## Groq wrapper (src/lib/groq.ts): one function

```ts
callGroq<T>({ rid, stage, messages, schema, zod, simulate }): Promise<
  | { ok: true; data: T; latencyMs: number; model: string }
  | { ok: false; kind: FailureKind; detail: string; latencyMs: number }
>
```

- Never throws; the caller always gets a result object.
- `AbortSignal.timeout(10_000)`.
- One retry, **only** for `bad_output` (invalid JSON or Zod failure). Timeouts and 5xx aren't retried; the user shouldn't wait 20s.

| FailureKind | Cause | Hebrew message to user (templates.ts) |
|---|---|---|
| `timeout` | > 10s | "שירות הניסוח לא ענה בזמן. הנה המספרים עם הסבר אוטומטי." (the text service didn't answer in time; here are the numbers with an automatic explanation) |
| `rate_limited` | HTTP 429 | "יש עומס זמני על שירות הניסוח. המספרים למטה מחושבים בלי AI." (temporary load on the text service; the numbers below are computed without AI) |
| `unavailable` | 5xx, network error | "שירות הניסוח לא זמין כרגע…" (the text service is unavailable right now…) |
| `bad_output` | invalid JSON / schema after retry | "לא הצלחנו להבין את השאלה בוודאות. אפשר לנסח מחדש או לבחור ידנית:" (we couldn't understand the question reliably; rephrase or choose manually), plus the fallback form |
| `guard_rejected` | number guard failed (F4) | no user-facing error; template text shown, labeled "הסבר אוטומטי" (automatic explanation) |
| `config` | missing key / 401 | "התצורה של השרת חסרה. פנו לצוות." (server configuration is missing; contact the team) + log at error level |

## Where each failure lands

| Stage fails | User still gets |
|---|---|
| parse (LLM #1) | the fallback form, pre-filled with anything code could guess (city via alias match) |
| narrate (LLM #2) | full numbers, deals, receipt, and template explanation |
| investigate (LLM #3) | automatic checks + template reply |
| F3 throws (bug) | "משהו השתבש אצלנו. קוד לבירור: R-…" (something went wrong on our side; reference code: R-…) and an error log with a stack trace. Never a raw stack trace in the UI |

**Client side:** `fetch` with its own 20s abort, so the spinner can never spin forever. The loading state names the stage ("מבין את השאלה…", understanding the question…; "מחשב…", calculating…).

## Failure simulation: for the demo and the "show us the model failing" moment

Query param `?simulate=` on `/` and `/csm`, forwarded to the API:

| Value | Behaviour |
|---|---|
| `timeout` | wrapper waits 10s then returns `timeout` (real code path, fake cause) |
| `down` | returns `unavailable` immediately |
| `ratelimit` | returns `rate_limited` |
| `invalid` | returns malformed JSON → exercises retry → `bad_output` |
| `hallucinate` | narration returns a sentence with an invented number → the number guard rejects it |

Simulation replaces the HTTP call only; everything downstream is real code. It's allowed in production on purpose (demo app).

## Logging (src/lib/log.ts)

One JSON line per stage to stdout, so it shows up in Vercel logs and is searchable by receipt code:

```json
{"rid":"R-7F3K2A","stage":"parse","ok":true,"model":"openai/gpt-oss-120b","latencyMs":812,"intent":"estimate"}
{"rid":"R-7F3K2A","stage":"comps","ok":true,"level":"L3","n":9,"confidence":"medium"}
{"rid":"R-7F3K2A","stage":"narrate","ok":false,"kind":"guard_rejected","badNumbers":[4350000]}
```

No question text in logs beyond the first 200 chars; no API key, ever.

## Debug panel

A collapsed "פרטים טכניים" (technical details) section at the bottom of every answer: rid, plan JSON, stage timings, failure kind, the raw LLM output (truncated), dataset version. The CSM can copy it into a ticket, and R&D sees exactly what happened.

## Tests (tests/groq.test.ts, tests/api.test.ts, with mocked `fetch`)

- 200 + valid JSON → ok
- Abort → `timeout`; 429 → `rate_limited`; 503 and network error → `unavailable`; 401 / missing key → `config`
- Invalid JSON once then valid → ok (retry works); invalid twice → `bad_output`
- `/api/ask` with `simulate=down`: response has full stats + `narration.source = "template"` + Hebrew message
- `/api/ask` with `simulate=hallucinate`: `narration.source = "template"`, log contains `guard_rejected`
- `/api/ask` with a plan (no question): no Groq call made
