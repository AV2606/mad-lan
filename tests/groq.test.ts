import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { callGroq } from "../src/lib/groq";

const schema = z.object({ text: z.string() });
const args = { messages: [{ role: "user" as const, content: "hi" }], schema: { name: "t", schema: {} }, zod: schema };

const completion = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

function mockFetch(...responses: (Response | Error | ((init: RequestInit) => Promise<Response>))[]) {
  const fn = vi.fn(async (_url: unknown, init: RequestInit) => {
    const next = responses.shift();
    if (next === undefined) throw new Error("unexpected extra fetch call");
    if (next instanceof Error) throw next;
    if (typeof next === "function") return next(init);
    return next;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  process.env.GROQ_API_KEY = "test-key";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GROQ_API_KEY;
  delete process.env.GROQ_MODEL;
});

describe("callGroq: happy path", () => {
  it("200 + valid JSON → ok, with strict json_schema request", async () => {
    const fetchFn = mockFetch(completion('{"text":"שלום"}'));
    const r = await callGroq(args);
    expect(r).toMatchObject({ ok: true, data: { text: "שלום" }, model: "openai/gpt-oss-120b" });
    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.temperature).toBe(0);
    expect(body.reasoning_effort).toBe("low");
  });

  it("GROQ_MODEL overrides the model, and reasoning_effort is only sent to gpt-oss models", async () => {
    process.env.GROQ_MODEL = "llama-3.3-70b-versatile";
    const fetchFn = mockFetch(completion('{"text":"x"}'));
    const r = await callGroq(args);
    expect(r).toMatchObject({ ok: true, model: "llama-3.3-70b-versatile" });
    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.reasoning_effort).toBeUndefined();
  });

  it("never puts the API key anywhere but the Authorization header", async () => {
    const fetchFn = mockFetch(completion('{"text":"x"}'));
    await callGroq(args);
    const init = fetchFn.mock.calls[0][1] as RequestInit;
    expect(init.body as string).not.toContain("test-key");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-key");
  });
});

describe("callGroq: failure kinds", () => {
  it("no answer within the timeout → timeout, and no retry", async () => {
    const fetchFn = mockFetch(
      (init) =>
        new Promise((_, reject) => {
          init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    );
    const r = await callGroq({ ...args, timeoutMs: 20 });
    expect(r).toMatchObject({ ok: false, kind: "timeout" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("429 → rate_limited", async () => {
    mockFetch(new Response("slow down", { status: 429 }));
    expect(await callGroq(args)).toMatchObject({ ok: false, kind: "rate_limited" });
  });

  it("503 → unavailable, not retried", async () => {
    const fetchFn = mockFetch(new Response("", { status: 503 }));
    expect(await callGroq(args)).toMatchObject({ ok: false, kind: "unavailable" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("network error → unavailable", async () => {
    mockFetch(new TypeError("fetch failed"));
    const r = await callGroq(args);
    expect(r).toMatchObject({ ok: false, kind: "unavailable" });
    expect(!r.ok && r.detail).toContain("fetch failed");
  });

  it("401 → config", async () => {
    mockFetch(new Response("", { status: 401 }));
    expect(await callGroq(args)).toMatchObject({ ok: false, kind: "config" });
  });

  it("missing key → config, without calling the network", async () => {
    delete process.env.GROQ_API_KEY;
    const fetchFn = mockFetch();
    expect(await callGroq(args)).toMatchObject({ ok: false, kind: "config" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("other 4xx → unavailable with detail (we sent something wrong; not the user's fault)", async () => {
    mockFetch(new Response('{"error":"bad schema"}', { status: 422 }));
    const r = await callGroq(args);
    expect(r).toMatchObject({ ok: false, kind: "unavailable" });
    expect(!r.ok && r.detail).toContain("422");
  });
});

describe("callGroq: bad output and the single retry", () => {
  it("invalid JSON once, then valid → ok", async () => {
    const fetchFn = mockFetch(completion("not json"), completion('{"text":"ok"}'));
    expect(await callGroq(args)).toMatchObject({ ok: true, data: { text: "ok" } });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("schema violation once, then valid → ok", async () => {
    mockFetch(completion('{"wrong":1}'), completion('{"text":"ok"}'));
    expect(await callGroq(args)).toMatchObject({ ok: true });
  });

  it("invalid twice → bad_output, exactly 2 calls, raw output kept for the debug panel", async () => {
    const fetchFn = mockFetch(completion("nope"), completion("still nope"));
    const r = await callGroq(args);
    expect(r).toMatchObject({ ok: false, kind: "bad_output", raw: "still nope" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("Groq 400 json_validate_failed is treated as bad output and retried", async () => {
    const fetchFn = mockFetch(
      new Response('{"error":{"code":"json_validate_failed"}}', { status: 400 }),
      completion('{"text":"ok"}'),
    );
    expect(await callGroq(args)).toMatchObject({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("empty completion → bad_output", async () => {
    mockFetch(completion(""), completion(""));
    expect(await callGroq(args)).toMatchObject({ ok: false, kind: "bad_output" });
  });
});

describe("callGroq: simulation replaces only the HTTP call", () => {
  it("down / ratelimit map to their kinds and never touch the network", async () => {
    const fetchFn = mockFetch();
    expect(await callGroq({ ...args, simulate: "down" })).toMatchObject({ ok: false, kind: "unavailable" });
    expect(await callGroq({ ...args, simulate: "ratelimit" })).toMatchObject({ ok: false, kind: "rate_limited" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("timeout waits for the timeout, then reports it", async () => {
    const t0 = Date.now();
    expect(await callGroq({ ...args, simulate: "timeout", timeoutMs: 50 })).toMatchObject({ ok: false, kind: "timeout" });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(45);
  });

  it("invalid goes through the real parse + retry path and ends in bad_output", async () => {
    expect(await callGroq({ ...args, simulate: "invalid" })).toMatchObject({ ok: false, kind: "bad_output" });
  });

  it("hallucinate returns the provided text as if the model said it", async () => {
    const r = await callGroq({ ...args, simulate: "hallucinate", hallucination: '{"text":"המחיר 7,777,777"}' });
    expect(r).toMatchObject({ ok: true, data: { text: "המחיר 7,777,777" } });
  });
});
