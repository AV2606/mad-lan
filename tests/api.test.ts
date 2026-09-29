import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ask } from "../src/lib/ask";
import type { AskResponse } from "../src/lib/ask";
import { POST } from "../src/app/api/ask/route";
import { NEIGHBORHOODS } from "../src/lib/plan";
import { decodeReceipt } from "../src/lib/receipt";

type Ok = Extract<AskResponse, { ok: true }>;

const completion = (obj: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content: typeof obj === "string" ? obj : JSON.stringify(obj) } }] }), { status: 200 });

const planJson = (o: Record<string, unknown> = {}) => ({
  intent: "estimate",
  areas: [{ city: "גבעתיים", neighborhood: null }],
  propertyType: "דירה",
  rooms: 4,
  sizeSqm: 100,
  askingPriceNis: 4_200_000,
  unsupportedReason: null,
  mentionedPlace: null,
  clarifyQuestion: null,
  ...o,
});

/** Routes calls by prompt: the parse prompt gets `parse`, the narrate prompt gets `narrate`. */
function mockModel(handlers: { parse?: () => Response; narrate?: (facts: unknown) => Response }) {
  const fn = vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    const isParse = body.response_format.json_schema.name === "query_plan";
    if (isParse) {
      if (!handlers.parse) throw new Error("unexpected parse call");
      return handlers.parse();
    }
    if (!handlers.narrate) throw new Error("unexpected narrate call");
    return handlers.narrate(JSON.parse(body.messages[1].content));
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

let logs: string[];
beforeEach(() => {
  process.env.GROQ_API_KEY = "test-key";
  logs = [];
  vi.spyOn(console, "log").mockImplementation((s: string) => void logs.push(s));
  vi.spyOn(console, "error").mockImplementation((s: string) => void logs.push(s));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.GROQ_API_KEY;
});

const Q = "דירת 4 חדרים בגבעתיים, 100 מ״ר, ביקשו 4.2 מיליון";

describe("/api/ask with a question", () => {
  it("happy path: parse → comps → narrate, receipt in every log line", async () => {
    mockModel({
      parse: () => completion(planJson()),
      narrate: (facts) => completion({ text: `בדקנו ${(facts as { dealsFound: number }).dealsFound} עסקאות דומות בגבעתיים.` }),
    });
    const r = (await ask({ question: Q })) as Ok;
    expect(r.ok).toBe(true);
    expect(r.outcome).toBe("answer");
    expect(r.narration?.source).toBe("llm");
    expect(r.failure).toBeNull();
    expect(r.answer?.kind).toBe("single");
    expect(r.receipt?.code).toMatch(/^R-[0-9A-F]{6}$/);
    expect(decodeReceipt(r.receipt!.token).plan).toEqual(r.plan);

    const lines = logs.map((l) => JSON.parse(l));
    expect(lines.map((l) => l.stage)).toEqual(["parse", "comps", "narrate"]);
    expect(new Set(lines.map((l) => l.rid))).toEqual(new Set([r.receipt!.code]));
    expect(logs.join("\n")).not.toContain("test-key");
    expect(logs.join("\n")).not.toContain("גבעתיים, 100"); // the question text is not logged
  });

  it("the model's out-of-range values and unknown neighborhood are dropped with notes, not trusted", async () => {
    mockModel({
      parse: () => completion(planJson({ rooms: 40, areas: [{ city: "חיפה", neighborhood: "פלורנטין" }] })),
      narrate: () => completion({ text: "בדקנו עסקאות." }),
    });
    const r = (await ask({ question: "דירה בפלורנטין בחיפה" })) as Ok;
    expect(r.plan?.rooms).toBeNull();
    expect(r.plan?.areas).toEqual([{ city: "חיפה", neighborhood: null }]);
    expect(r.planNotes.join(" ")).toContain("פלורנטין");
  });

  it("simulate=down hits both stages: parsing fails first, so the manual form opens pre-filled", async () => {
    const fn = mockModel({});
    const r = (await ask({ question: Q, simulate: "down" })) as Ok;
    expect(r.outcome).toBe("parse_failed");
    expect(r.failure).toBe("unavailable");
    expect(r.showManualForm).toBe(true);
    expect(r.message).toContain("שירות הניסוח לא זמין");
    expect(r.prefill).toEqual({ city: "גבעתיים" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("simulate=down&stage=narrate: parse is real, numbers are complete, explanation is the template", async () => {
    mockModel({ parse: () => completion(planJson()) });
    const r = (await ask({ question: Q, simulate: "down", simulateStage: "narrate" })) as Ok;
    expect(r.outcome).toBe("answer");
    expect(r.failure).toBe("unavailable");
    expect(r.narration?.source).toBe("template");
    expect(r.message).toContain("שירות הניסוח לא זמין");
    expect(r.answer?.kind === "single" && r.answer.comps.stats?.n).toBeGreaterThan(0);
  });

  it("narration failure keeps all numbers and falls back to the template", async () => {
    mockModel({
      parse: () => completion(planJson()),
      narrate: () => new Response("", { status: 503 }),
    });
    const r = (await ask({ question: Q })) as Ok;
    expect(r.outcome).toBe("answer");
    expect(r.failure).toBe("unavailable");
    expect(r.narration?.source).toBe("template");
    expect(r.narration?.text.length).toBeGreaterThan(20);
    expect(r.message).toContain("שירות הניסוח לא זמין");
    expect(r.answer?.kind === "single" && r.answer.comps.stats).toBeTruthy();
  });

  it("a model text with an invented number is rejected by the guard and replaced by the template", async () => {
    mockModel({
      parse: () => completion(planJson()),
      narrate: () => completion({ text: "המחיר הוא בדיוק 4,350,000 ₪." }),
    });
    const r = (await ask({ question: Q })) as Ok;
    expect(r.narration?.source).toBe("template");
    expect(r.failure).toBe("guard_rejected");
    expect(r.message).toBeNull();
    const narrateLog = logs.map((l) => JSON.parse(l)).find((l) => l.stage === "narrate");
    expect(narrateLog).toMatchObject({ ok: false, kind: "guard_rejected", badNumbers: [4_350_000] });
  });

  it("a model text using a forbidden word is rejected too", async () => {
    mockModel({ parse: () => completion(planJson()), narrate: () => completion({ text: "זה מחיר הוגן." }) });
    const r = (await ask({ question: Q })) as Ok;
    expect(r.narration?.source).toBe("template");
  });

  it("simulate=hallucinate: the invented number never reaches the response", async () => {
    // parse is real, narrate is simulated to hallucinate
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        n++;
        return completion(planJson());
      }),
    );
    const r = (await ask({ question: Q, simulate: "hallucinate" })) as Ok;
    expect(r.outcome).toBe("answer");
    expect(r.narration?.source).toBe("template");
    expect(r.narration?.text).not.toContain("7,777,777");
    expect(r.failure).toBe("guard_rejected");
    expect(n).toBe(1); // only the parse stage hit the network
    expect(logs.some((l) => l.includes("guard_rejected") && l.includes("7777777"))).toBe(true);
  });

  it("simulate=invalid: bad_output after one retry, manual form opens", async () => {
    const r = (await ask({ question: Q, simulate: "invalid" })) as Ok;
    expect(r.outcome).toBe("parse_failed");
    expect(r.failure).toBe("bad_output");
    expect(r.showManualForm).toBe(true);
  });

  it("missing key → config message, manual form still offered", async () => {
    delete process.env.GROQ_API_KEY;
    const r = (await ask({ question: Q })) as Ok;
    expect(r.failure).toBe("config");
    expect(r.message).toContain("התצורה");
    expect(r.showManualForm).toBe(true);
    expect(logs.some((l) => l.includes('"kind":"config"'))).toBe(true);
  });

  it("unsupported (place not in data): fixed Hebrew text, no numbers, no narrate call", async () => {
    const fn = mockModel({
      parse: () => completion(planJson({ intent: "unsupported", areas: [], unsupportedReason: "place_not_in_data", mentionedPlace: "אילת", rooms: null, sizeSqm: null, askingPriceNis: null })),
    });
    const r = (await ask({ question: "כמה עולה דירה באילת?" })) as Ok;
    expect(r.outcome).toBe("unsupported");
    expect(r.message).toContain("אילת");
    expect(r.answer).toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("clarify: returns the model's question", async () => {
    mockModel({
      parse: () => completion(planJson({ intent: "clarify", areas: [], clarifyQuestion: "איפה?", rooms: null, sizeSqm: null, askingPriceNis: null })),
    });
    const r = (await ask({ question: "כמה זה עולה?" })) as Ok;
    expect(r.outcome).toBe("clarify");
    expect(r.message).toBe("איפה?");
  });

  it("compare with a wrong number of areas becomes a clarify", async () => {
    mockModel({ parse: () => completion(planJson({ intent: "compare" })) });
    const r = (await ask({ question: "השוואה" })) as Ok;
    expect(r.outcome).toBe("clarify");
  });

  it("compare runs both areas", async () => {
    mockModel({
      parse: () =>
        completion(
          planJson({
            intent: "compare",
            areas: [{ city: "רעננה", neighborhood: null }, { city: "כפר סבא", neighborhood: null }],
            rooms: null, sizeSqm: null, askingPriceNis: null, propertyType: null,
          }),
        ),
      narrate: () => completion({ text: "נבדקו שני אזורים." }),
    });
    const r = (await ask({ question: "מה יקר יותר, רעננה או כפר סבא?" })) as Ok;
    expect(r.answer?.kind).toBe("compare");
    expect(r.facts?.kind).toBe("compare");
  });
});

describe("/api/ask validation", () => {
  it("empty question and over-long question get friendly 400s, without calling the model", async () => {
    const fn = mockModel({});
    const empty = await ask({ question: "   " });
    const long = await ask({ question: "א".repeat(5000) });
    expect(empty).toMatchObject({ ok: false, status: 400 });
    expect(long).toMatchObject({ ok: false, status: 400 });
    expect(fn).not.toHaveBeenCalled();
  });

  it("a malformed plan is rejected", async () => {
    expect(await ask({ plan: { intent: "estimate", areas: [] } })).toMatchObject({ ok: false, status: 400 });
    expect(await ask({ plan: planJson({ areas: [{ city: "אילת", neighborhood: null }] }) })).toMatchObject({ ok: false, status: 400 });
    expect(await ask({ plan: planJson({ rooms: 40 }) })).toMatchObject({ ok: false, status: 400 });
  });
});

describe("/api/ask with a plan (manual form, receipt replay)", () => {
  it("makes no Groq call at all and still returns full numbers", async () => {
    const fn = mockModel({});
    const r = (await ask({ plan: planJson(), simulate: "hallucinate" })) as Ok;
    expect(fn).not.toHaveBeenCalled();
    expect(r.outcome).toBe("answer");
    expect(r.narration?.source).toBe("template");
    expect(r.debug.stages.map((s) => s.stage)).toEqual(["comps"]);
  });

  it("replaying a receipt reproduces the same numbers and the same code", async () => {
    mockModel({ parse: () => completion(planJson()), narrate: () => completion({ text: "בדקנו." }) });
    const first = (await ask({ question: Q })) as Ok;
    const replay = (await ask({ plan: decodeReceipt(first.receipt!.token).plan })) as Ok;
    expect(replay.receipt?.code).toBe(first.receipt?.code);
    expect(replay.answer).toEqual(first.answer);
  });

  it("every real neighborhood/city pair the manual form can send is accepted", async () => {
    for (const [city, hoods] of Object.entries(NEIGHBORHOODS)) {
      const r = await ask({ plan: planJson({ areas: [{ city, neighborhood: hoods[0] }], rooms: null, sizeSqm: null, askingPriceNis: null, propertyType: null }) });
      expect(r.ok).toBe(true);
    }
  });
});

describe("POST route", () => {
  const post = (body: unknown, url = "http://localhost/api/ask") =>
    POST(new Request(url, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

  it("reads ?simulate= from the URL", async () => {
    const res = await post({ question: Q }, "http://localhost/api/ask?simulate=down");
    const json = (await res.json()) as Ok;
    expect(res.status).toBe(200);
    expect(json.failure).toBe("unavailable");
    expect(json.debug.simulate).toBe("down");
  });

  it("bad JSON body → 400, not a crash", async () => {
    expect((await post("{nope")).status).toBe(400);
  });

  it("validation errors are 400 with a Hebrew message", async () => {
    const res = await post({ question: "" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/[א-ת]/);
  });
});
