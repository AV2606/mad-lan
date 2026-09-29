import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/investigate/route";
import { findComps, latestDealDate } from "../src/lib/comps";
import type { CompsQuery } from "../src/lib/comps";
import rawDeals from "../src/data/deals.json";
import { extractReceiptToken, findCustomerDeals, investigate, mentionsStreet, runChecks } from "../src/lib/investigate";
import type { InvestigateResponse } from "../src/lib/investigate";
import type { QueryPlan } from "../src/lib/plan";
import { encodeReceipt } from "../src/lib/receipt";
import type { Deal } from "../src/lib/types";

const DEALS = rawDeals as unknown as Deal[];
const AS_OF = latestDealDate(DEALS);

const query = (o: Partial<CompsQuery> = {}): CompsQuery => ({
  city: "גבעתיים", neighborhood: null, propertyType: null, rooms: null, sizeSqm: null, askingPriceNis: null, ...o,
});
const checksFor = (q: CompsQuery, complaint = "", stale = false) => {
  const comps = findComps(DEALS, q, AS_OF);
  return runChecks({ areas: [{ query: q, comps }], stale, complaint: findCustomerDeals(complaint, [q.city]) });
};
const ids = (cs: { id: string }[]) => cs.map((c) => c.id);

const planFor = (o: Partial<QueryPlan> = {}): QueryPlan => ({
  intent: "estimate",
  areas: [{ city: "מודיעין-מכבים-רעות", neighborhood: "כרמים" }],
  propertyType: "דירת גן", rooms: 5.5, sizeSqm: 134, askingPriceNis: null,
  unsupportedReason: null, mentionedPlace: null, clarifyQuestion: null,
  ...o,
});

describe("extractReceiptToken", () => {
  const { token } = encodeReceipt(planFor());
  it.each([
    ["full link", `https://example.vercel.app/?r=${token}`],
    ["link with simulate", `http://localhost:3000/?r=${token}&simulate=down`],
    ["fragment", `?r=${token}`],
    ["raw token", token],
    ["with surrounding spaces", `  https://x.app/?r=${token}  `],
  ])("%s", (_l, input) => expect(extractReceiptToken(input)).toEqual({ token }));

  it("bare code", () => expect(extractReceiptToken("r-7f3k2a")).toEqual({ bareCode: "R-7F3K2A" }));
  it("garbage", () => expect(extractReceiptToken("hello")).toBeNull());
});

describe("findCustomerDeals", () => {
  it("price + street agree → strong match, and the deal is reported as used", () => {
    const { matches } = findCustomerDeals("מכרתי ברחוב ביאליק ב-5,141,000", ["רמת גן"]);
    expect(matches[0]).toMatchObject({ matchedBy: "price+street", excludedReason: null });
    expect(matches[0].deal.id).toBe("D100032");
  });

  it("finds the excluded broker row with its reason (D100032 at ₪5,343,137)", () => {
    const { matches } = findCustomerDeals("הדירה ברחוב ביאליק נמכרה ב-5,343,137", ["רמת גן"]);
    expect(matches[0]).toMatchObject({ matchedBy: "price+street", excludedReason: "conflicting_duplicate" });
    expect(matches[0].deal.priceNis).toBe(5_343_137);
  });

  it("a price with no street is only a weak match (a coincidence within 3% proves nothing)", () => {
    const { matches, claimedStreets } = findCustomerDeals("מכרתי ב-5,141,000", ["רמת גן"]);
    expect(claimedStreets).toEqual([]);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.matchedBy === "price")).toBe(true);
  });

  it("closest price first among weak matches", () => {
    const { matches } = findCustomerDeals("מכרתי ב-5,141,000", ["רמת גן"]);
    expect(matches[0].deal.id).toBe("D100032");
  });

  it("3% tolerance: everything matched is within 3% of the claim", () => {
    const { matches } = findCustomerDeals("מכרתי ב-5.2 מיליון", ["רמת גן"]);
    for (const m of matches) expect(Math.abs(m.deal.priceNis! - 5_200_000) / 5_200_000).toBeLessThanOrEqual(0.03);
  });

  it("only prices in a plausible range count as a claim (rooms, sizes, years don't)", () => {
    expect(findCustomerDeals("דירה של 4 חדרים, 100 מטר, משנת 2015", ["חיפה"]).claimedPrices).toEqual([]);
  });

  it("street name without a price → street-only matches, kept short", () => {
    const { claimedPrices, matches } = findCustomerDeals("גרתי ברחוב ביאליק", ["רמת גן"]);
    expect(claimedPrices).toEqual([]);
    expect(matches.every((m) => m.matchedBy === "street")).toBe(true);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.length).toBeLessThanOrEqual(3);
  });

  it("only searches the cities of the receipt", () => {
    const { matches } = findCustomerDeals("מכרתי ברחוב ביאליק ב-5,141,000", ["חיפה"]);
    expect(matches.filter((m) => m.matchedBy === "price+street")).toHaveLength(0);
  });
});

describe("mentionsStreet", () => {
  it("matches a street, with or without an attached prefix letter", () => {
    expect(mentionsStreet("גרתי ברחוב ביאליק", "ביאליק")).toBe(true);
    expect(mentionsStreet("גרתי בביאליק", "ביאליק")).toBe(true);
  });
  it("does not match inside a longer word: הרצליה is not הרצל", () => {
    expect(mentionsStreet("הדירה בהרצליה", "הרצל")).toBe(false);
    expect(mentionsStreet("הדירה ברחוב הרצל", "הרצל")).toBe(true);
  });
  it("streets with quotes and spaces work", () => {
    expect(mentionsStreet('ברחוב הפלמ"ח', 'הפלמ"ח')).toBe(true);
    expect(mentionsStreet("ברחוב מבצע קדש", "מבצע קדש")).toBe(true);
  });
});

describe("runChecks", () => {
  it("small_sample: fewer than 8 deals", () => {
    const cs = checksFor(query({ rooms: 4, sizeSqm: 100, propertyType: "דירה" }));
    expect(ids(cs)).toContain("small_sample");
  });

  it("widened_area only when a neighborhood was asked about", () => {
    expect(ids(checksFor(query({ city: "תל אביב-יפו", neighborhood: "פלורנטין" })))).toContain("widened_area");
    expect(ids(checksFor(query({ city: "תל אביב-יפו" })))).not.toContain("widened_area");
  });

  it("mixed_types: only when no property type was given", () => {
    expect(ids(checksFor(query()))).toContain("mixed_types");
    expect(ids(checksFor(query({ propertyType: "דירה" })))).not.toContain("mixed_types");
  });

  it("outliers_excluded and conflicting_sources on the Karmim (Modi'in) query", () => {
    const cs = checksFor(query({ city: "מודיעין-מכבים-רעות", neighborhood: "כרמים", rooms: 5.5, propertyType: "דירת גן" }));
    expect(ids(cs)).toContain("conflicting_sources");
  });

  it("outliers_excluded appears when an outlier matches the filters", () => {
    const cs = checksFor(query({ city: "רמת גן", neighborhood: "מרכז", propertyType: "פנטהאוז" }));
    expect(ids(cs)).toContain("outliers_excluded");
    expect(cs.find((c) => c.id === "outliers_excluded")?.detailHe).toContain("D100001");
  });

  it("old_deals_included: oldest deal more than 3 years before the latest in the data", () => {
    const cs = checksFor(query({ city: "כפר סבא" }));
    expect(ids(cs)).toContain("old_deals_included");
  });

  it("data_changed only when the receipt is stale", () => {
    expect(ids(checksFor(query(), "", true))).toContain("data_changed");
    expect(ids(checksFor(query(), "", false))).not.toContain("data_changed");
  });

  it("customer deal: in data and used / in data but excluded / not in data", () => {
    const q = query({ city: "רמת גן", neighborhood: "מרכז העיר", rooms: 4 });
    expect(ids(checksFor(q, "מכרתי ברחוב ביאליק ב-5,141,000"))).toContain("customer_deal_used");
    expect(ids(checksFor(q, "מכרתי ברחוב ביאליק ב-5,343,137"))).toContain("customer_deal_excluded");
    const missing = checksFor(q, "מכרתי ברחוב ביאליק ב-9,876,543");
    expect(ids(missing)).toContain("customer_deal_not_in_data");
    expect(ids(missing)).not.toContain("customer_deal_used");
  });

  it("G1: same street and a price within 3% → probably the customer's deal, worded with a hedge and the data's date", () => {
    // D100284: Sokolov St, Givatayim, ₪5,157,000, 07/2025
    const q = query({ city: "גבעתיים", rooms: 4, sizeSqm: 100, propertyType: "דירה" });
    const cs = checksFor(q, "מכרתי דירה דומה ברחוב סוקולוב ב-5.2 מיליון לפני חודש");
    const used = cs.find((c) => c.id === "customer_deal_used");
    expect(used?.detailHe).toContain("D100284");
    expect(used?.detailHe).toContain("כנראה");
    expect(used?.detailHe).toContain("07/2025");
  });

  it("REGRESSION (live run): a similar price on a DIFFERENT street is not 'your deal is in our data'", () => {
    // D100284 sold for 5,157,000 (within 3% of 5.2M) but on Sokolov, and this customer named Ben Gurion
    const q = query({ city: "גבעתיים", rooms: 4, sizeSqm: 100, propertyType: "דירה" });
    const cs = checksFor(q, "מכרתי דירה דומה ברחוב בן גוריון ב-5.2 מיליון");
    expect(ids(cs)).not.toContain("customer_deal_used");
    expect(ids(cs)).not.toContain("customer_deal_excluded");
    expect(ids(cs)).toContain("customer_deal_not_in_data");
  });

  it("a price with no street is reported as 'can't verify', never as found", () => {
    const q = query({ city: "גבעתיים" });
    const cs = checksFor(q, "מכרתי דירה דומה ב-5.2 מיליון");
    expect(ids(cs)).not.toContain("customer_deal_used");
    expect(cs.find((c) => c.id === "customer_deal_not_in_data")?.detailHe).toContain("אי אפשר לדעת");
  });

  it("no claim details in the message → no customer-deal check at all", () => {
    expect(ids(checksFor(query(), "אתם גרועים")).filter((i) => i.startsWith("customer_deal"))).toEqual([]);
  });
});

// ---------- the full flow with a mocked model ----------

const completion = (obj: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(obj) } }] }), { status: 200 });

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

const link = () => `https://app.example/?r=${encodeReceipt(planFor()).token}`;
const goodModel = {
  causes: ["widened_area", "small_sample"],
  explanationForCsm: "הלקוח ראה תשובה שמבוססת על כל העיר.",
  replyToCustomer: "תודה שפניתם אלינו. המספר מבוסס על עסקאות דומות בכל העיר, כי בשכונה לא היו מספיק. נשמח לבדוק פרטים נוספים.",
  escalate: false,
};
type Investigated = Extract<InvestigateResponse, { kind: "investigated" }>;
const DETAILED_COMPLAINT = "המחיר לא נכון, מכרתי דירה דומה ב-3.5 מיליון";
const run = async (o: { complaint?: string; receipt?: string; simulate?: string } = {}) =>
  (await investigate({ receipt: link(), complaint: DETAILED_COMPLAINT, ...o })) as Investigated;

describe("investigate: flow", () => {
  it("bare code → asks for the link, no model call", async () => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);
    const r = await investigate({ receipt: "R-7F3K2A", complaint: "x" });
    expect(r).toMatchObject({ ok: true, kind: "needs_link" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("validates input with Hebrew messages", async () => {
    expect(await investigate({ receipt: "", complaint: "x" })).toMatchObject({ ok: false, status: 400 });
    expect(await investigate({ receipt: link(), complaint: "" })).toMatchObject({ ok: false, status: 400 });
    expect(await investigate({ receipt: link(), complaint: "א".repeat(3000) })).toMatchObject({ ok: false, status: 400 });
    expect(await investigate({ receipt: "not a link at all", complaint: "x" })).toMatchObject({ ok: false, status: 400 });
    expect(await investigate({ receipt: `?r=${"A".repeat(60)}`, complaint: "x" })).toMatchObject({ ok: false, status: 400 });
  });

  it("happy path: replay + checks + model draft, same receipt code in the logs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => completion(goodModel)));
    const r = await run();
    expect(r.result.source).toBe("llm");
    expect(r.answer.receipt?.code).toMatch(/^R-/);
    expect(r.checks.length).toBeGreaterThan(0);
    expect(r.result.causes).toEqual(["widened_area", "small_sample"]);
    expect(r.failure).toBeNull();
    const lines = logs.map((l) => JSON.parse(l));
    expect(lines.some((l) => l.stage === "investigate" && l.rid === r.rid)).toBe(true);
  });

  it("causes outside the allowed set are dropped and reported", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => completion({ ...goodModel, causes: ["widened_area", "outliers_excluded_but_not_real", "customer_deal_used", "possible_bug"] })));
    const r = await run();
    expect(r.result.causes).toEqual(["widened_area", "possible_bug"]);
    expect(r.debug.droppedCauses).toEqual(["outliers_excluded_but_not_real", "customer_deal_used"]);
    expect(r.escalate).toBe(true);
  });

  it("model down → automatic checks stay, template reply contains the applied checks, honest note", async () => {
    const r = await run({ simulate: "down" });
    expect(r.result.source).toBe("template");
    expect(r.failure).toBe("unavailable");
    expect(r.message).toContain("טיוטת ה-AI לא זמינה");
    expect(r.checks.length).toBeGreaterThan(0);
    expect(r.result.replyToCustomer).toContain("השווינו לכל העיר");
    expect(r.result.replyToCustomer).not.toMatch(/חציון|חריג|טעיתם/);
  });

  it("simulate=hallucinate: an invented number in the draft is rejected, template is used", async () => {
    const r = await run({ simulate: "hallucinate" });
    expect(r.result.source).toBe("template");
    expect(r.failure).toBe("guard_rejected");
    expect(JSON.stringify(r.result)).not.toContain("9,999,999");
    expect(logs.some((l) => l.includes("guard_rejected") && l.includes("9999999"))).toBe(true);
  });

  it("a reply that repeats the customer's own number is allowed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => completion({ ...goodModel, replyToCustomer: "תודה שפניתם. העסקה במחיר 5.2 מיליון שציינתם לא מופיעה בנתונים שלנו. נשמח לבדוק אותה." })));
    const r = await run({ complaint: "מכרתי דירה דומה ב-5.2 מיליון" });
    expect(r.result.source).toBe("llm");
  });

  it.each([
    ["jargon", "המחיר החציון בשכונה נמוך יותר. נשמח לעזור."],
    ["blame", "אתם טועים, המספר נכון."],
    ["promise", "אנחנו נתקן את זה בהקדם."],
    ["too long", "משפט אחד. משפט שני. משפט שלישי. משפט רביעי. משפט חמישי. משפט שישי. משפט שביעי."],
    ["invented number", "המחיר הנכון הוא 8,123,456 ₪."],
    ["calling the median an average", "המחיר הממוצע למ״ר הוא 48,138 ₪."],
    ["English word in Hebrew text", "המדגם קטן (small sample) ולכן הטווח מדויק פחות."],
  ])("reply with %s → rejected, template used", async (_name, reply) => {
    vi.stubGlobal("fetch", vi.fn(async () => completion({ ...goodModel, replyToCustomer: reply })));
    const r = await run();
    expect(r.result.source).toBe("template");
    expect(r.failure).toBe("guard_rejected");
  });

  it("REGRESSION (live run): a complaint with no details gets no causes, and the model is told so", async () => {
    const fn = vi.fn(async () => completion({ ...goodModel, causes: ["small_sample", "widened_area"] }));
    vi.stubGlobal("fetch", fn);
    const r = await run({ complaint: "אתם גרועים" });
    expect(r.result.causes).toEqual([]);
    const sent = JSON.parse((fn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.messages[1].content).toContain('"complaintHasDetails":false');
  });

  it("REGRESSION (live run): the model gets the real reason a deal was excluded, so it can't invent one", async () => {
    const fn = vi.fn(async () => completion(goodModel));
    vi.stubGlobal("fetch", fn);
    const plan = planFor({ areas: [{ city: "רמת גן", neighborhood: "מרכז העיר" }], propertyType: "דירה", rooms: 4, sizeSqm: 88 });
    await investigate({ receipt: `?r=${encodeReceipt(plan).token}`, complaint: "הדירה ברחוב ביאליק נמכרה ב-5,343,137" });
    const sent = JSON.parse((fn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).messages[1].content as string;
    expect(sent).toContain("exclusionExplanation");
    expect(sent).toContain("רשות המסים, אחריה בעל הנכס, אחריו מתווך");
    expect(sent).toContain("priceUsedInstead");
    expect(sent).toContain("5,141,000 ₪");
  });

  it("nothing explains the gap → escalate to R&D", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => completion({ ...goodModel, causes: ["no_issue_found"] })));
    // a large city-level query with plenty of recent tax-authority deals and no claims → no checks apply
    const plan = planFor({ intent: "area_stats", areas: [{ city: "כפר סבא", neighborhood: null }], propertyType: "דירה", rooms: 4, sizeSqm: null, askingPriceNis: null });
    const receipt = `?r=${encodeReceipt(plan).token}`;
    const r = (await investigate({ receipt, complaint: "אתם גרועים" })) as Investigated;
    if (r.checks.length === 0) expect(r.escalate).toBe(true);
    else expect(r.escalate).toBe(false);
  });

  it("a receipt for an answer without numbers (unsupported) can't be investigated", async () => {
    const plan = planFor({ intent: "unsupported", areas: [], unsupportedReason: "rent", propertyType: null, rooms: null, sizeSqm: null });
    const r = await investigate({ receipt: `?r=${encodeReceipt(plan).token}`, complaint: "x" });
    expect(r).toMatchObject({ ok: false });
  });
});

describe("POST /api/investigate", () => {
  const post = (body: unknown, url = "http://localhost/api/investigate") =>
    POST(new Request(url, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

  it("reads ?simulate= and returns the draft fallback", async () => {
    const res = await post({ receipt: link(), complaint: "המחיר לא נכון" }, "http://localhost/api/investigate?simulate=down");
    const json = (await res.json()) as Investigated;
    expect(res.status).toBe(200);
    expect(json.result.source).toBe("template");
  });

  it("bad body → 400, validation → 400", async () => {
    expect((await post("{nope")).status).toBe(400);
    expect((await post({ receipt: "", complaint: "" })).status).toBe(400);
  });
});
