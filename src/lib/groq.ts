import type { ZodType } from "zod";

export type FailureKind = "timeout" | "rate_limited" | "unavailable" | "bad_output" | "guard_rejected" | "config";
export type Simulate = "timeout" | "down" | "ratelimit" | "invalid" | "hallucinate";
export const SIMULATIONS: readonly Simulate[] = ["timeout", "down", "ratelimit", "invalid", "hallucinate"];

export const DEFAULT_MODEL = "openai/gpt-oss-120b";
export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
export const DEFAULT_TIMEOUT_MS = 10_000;

export type GroqOk<T> = { ok: true; data: T; latencyMs: number; model: string; raw: string };
export type GroqFail = { ok: false; kind: FailureKind; detail: string; latencyMs: number; raw?: string };
export type GroqResult<T> = GroqOk<T> | GroqFail;

type Message = { role: "system" | "user" | "assistant"; content: string };

export type CallGroqArgs<T> = {
  messages: Message[];
  /** name + JSON schema sent to Groq's strict structured-output mode */
  schema: { name: string; schema: object };
  /** the source of truth: whatever the model returns must pass this */
  zod: ZodType<T>;
  simulate?: Simulate | null;
  /** what `simulate: "hallucinate"` makes the "model" return (a valid-looking answer with an invented number) */
  hallucination?: string;
  timeoutMs?: number;
};

export function isSimulate(v: unknown): v is Simulate {
  return typeof v === "string" && (SIMULATIONS as readonly string[]).includes(v);
}

const model = () => process.env.GROQ_MODEL || DEFAULT_MODEL;

type Attempt = { kind: "content"; content: string } | { kind: "fail"; failure: FailureKind; detail: string };

/** The only place that talks to Groq. Never throws; the caller always gets a result object. */
export async function callGroq<T>(args: CallGroqArgs<T>): Promise<GroqResult<T>> {
  const started = Date.now();
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const done = (): number => Date.now() - started;

  let raw = "";
  // One retry, and only for unusable output. Timeouts and 5xx are not retried: the user shouldn't wait 20s.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await requestOnce(args, timeoutMs);
    if (res.kind === "fail") {
      if (res.failure === "bad_output" && attempt === 1) continue;
      return { ok: false, kind: res.failure, detail: res.detail, latencyMs: done(), ...(raw ? { raw } : {}) };
    }
    raw = res.content;
    let parsed: unknown;
    try {
      parsed = JSON.parse(res.content);
    } catch {
      if (attempt === 1) continue;
      return { ok: false, kind: "bad_output", detail: "response was not valid JSON", latencyMs: done(), raw: res.content.slice(0, 500) };
    }
    const checked = args.zod.safeParse(parsed);
    if (checked.success) return { ok: true, data: checked.data, latencyMs: done(), model: model(), raw: res.content };
    if (attempt === 1) continue;
    return {
      ok: false,
      kind: "bad_output",
      detail: `schema check failed: ${checked.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 300)}`,
      latencyMs: done(),
      raw: res.content.slice(0, 500),
    };
  }
  return { ok: false, kind: "bad_output", detail: "unreachable", latencyMs: done() };
}

async function requestOnce<T>(args: CallGroqArgs<T>, timeoutMs: number): Promise<Attempt> {
  // Simulation replaces only the HTTP call. Parsing, retry and everything downstream stay real code.
  switch (args.simulate) {
    case "down":
      return { kind: "fail", failure: "unavailable", detail: "simulated outage" };
    case "ratelimit":
      return { kind: "fail", failure: "rate_limited", detail: "simulated 429" };
    case "timeout":
      await new Promise((r) => setTimeout(r, timeoutMs));
      return { kind: "fail", failure: "timeout", detail: `simulated: no answer within ${timeoutMs}ms` };
    case "invalid":
      return { kind: "content", content: '{"this is": not json' };
    case "hallucinate":
      if (args.hallucination !== undefined) return { kind: "content", content: args.hallucination };
      break;
  }

  const key = process.env.GROQ_API_KEY;
  if (!key) return { kind: "fail", failure: "config", detail: "GROQ_API_KEY is not set" };

  const name = model();
  const body = {
    model: name,
    temperature: 0,
    // gpt-oss models only; other models reject the parameter
    ...(name.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
    messages: args.messages,
    response_format: { type: "json_schema", json_schema: { name: args.schema.name, strict: true, schema: args.schema.schema } },
  };

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const err = e as { name?: string; message?: string };
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return { kind: "fail", failure: "timeout", detail: `no answer within ${timeoutMs}ms` };
    }
    return { kind: "fail", failure: "unavailable", detail: `network error: ${err.message ?? "unknown"}` };
  }

  if (res.status === 401 || res.status === 403) return { kind: "fail", failure: "config", detail: `HTTP ${res.status}: key rejected` };
  if (res.status === 429) return { kind: "fail", failure: "rate_limited", detail: "HTTP 429" };
  if (res.status >= 500) return { kind: "fail", failure: "unavailable", detail: `HTTP ${res.status}` };
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Groq answers 400 "json_validate_failed" when the model's output broke the schema: retryable, like invalid JSON
    if (res.status === 400 && text.includes("json_validate_failed")) {
      return { kind: "fail", failure: "bad_output", detail: "HTTP 400 json_validate_failed" };
    }
    return { kind: "fail", failure: "unavailable", detail: `HTTP ${res.status}: ${text.slice(0, 200)}` };
  }

  try {
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content === "") return { kind: "fail", failure: "bad_output", detail: "empty completion" };
    return { kind: "content", content };
  } catch {
    return { kind: "fail", failure: "bad_output", detail: "response body was not JSON" };
  }
}
